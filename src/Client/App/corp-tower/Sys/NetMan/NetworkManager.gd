extends Node

var ws = WebSocketPeer.new()
var is_conn_estab : bool = false
var is_connecting := false
var manual_disconnect_requested := false
var auto_reconnect_enabled := false
var auto_reconnect_attempts := 0
var auto_reconnect_delay_remaining := -1.0

var player_id := ""
var reconnect_token := ""
var profile_id := ""
var current_url := ""
var tried_failover := false
var connect_attempt_elapsed := 0.0

const PLAYER_ID_FILE := "user://corp_tower_player_id.save"
const RECONNECT_TOKEN_FILE := "user://corp_tower_reconnect_token.save"
const PROFILE_ID_FILE := "user://corp_tower_profile_id.save"
const AUTO_RECONNECT_DELAY_SECONDS := 1.0
const AUTO_RECONNECT_MAX_ATTEMPTS := 8
const CONNECT_TIMEOUT_SECONDS := 5.0
const SERVER_URL := "wss://ws.tod.galaxxigames.com"
const FAILOVER_SERVER_URL := "wss://devtod.galaxxigames.com"

signal status_changed(text)
signal room_joined(data)
signal room_closed(data)
signal game_state_updated(data)
signal client_status(status)
signal debug_config_updated(config)

func connect_server(is_auto_reconnect := false, is_failover_retry := false):
	if is_auto_reconnect:
		status_changed.emit("Reconnecting...")
	elif is_failover_retry:
		status_changed.emit("Primary server unreachable, trying backup...")
	else:
		current_url = SERVER_URL
		tried_failover = false
		status_changed.emit("Connecting...")

	if is_conn_estab or is_connecting:
		return

	if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		ws = WebSocketPeer.new()

	manual_disconnect_requested = false
	is_connecting = true
	load_reconnect_identity()

	var error = ws.connect_to_url(current_url)

	if error == OK:
		connect_attempt_elapsed = 0.0
		if not is_auto_reconnect:
			auto_reconnect_attempts = 0
	else:
		is_connecting = false
		if is_auto_reconnect:
			schedule_auto_reconnect()
		elif not tried_failover:
			tried_failover = true
			current_url = FAILOVER_SERVER_URL
			connect_server(false, true)

func disconnect_server():
	status_changed.emit("Disconnecting...")
	manual_disconnect_requested = true
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.close()

func toggle_connection():
	if is_conn_estab or is_connecting:
		disconnect_server()
	else:
		connect_server()

func place_block(block_index, lane := "center"):
	if not is_conn_estab:
		return

	var data = {
		"type": "place_block",
		"blockIndex": block_index,
		"lane": lane
	}

	ws.send_text(JSON.stringify(data))

func leave_queue():
	if not is_conn_estab:
		return

	ws.send_text(JSON.stringify({"type": "leave_queue"}))

func load_reconnect_identity():
	if FileAccess.file_exists(PLAYER_ID_FILE):
		player_id = FileAccess.get_file_as_string(PLAYER_ID_FILE).strip_edges()

	if FileAccess.file_exists(RECONNECT_TOKEN_FILE):
		reconnect_token = FileAccess.get_file_as_string(RECONNECT_TOKEN_FILE).strip_edges()

	if FileAccess.file_exists(PROFILE_ID_FILE):
		profile_id = FileAccess.get_file_as_string(PROFILE_ID_FILE).strip_edges()

	if profile_id == "":
		profile_id = generate_uuid_v4()
		var profile_file = FileAccess.open(PROFILE_ID_FILE, FileAccess.WRITE)
		profile_file.store_string(profile_id)

func generate_uuid_v4() -> String:
	var bytes := Crypto.new().generate_random_bytes(16)
	bytes[6] = (bytes[6] & 0x0F) | 0x40
	bytes[8] = (bytes[8] & 0x3F) | 0x80
	var hex := bytes.hex_encode()
	return "%s-%s-%s-%s-%s" % [
		hex.substr(0, 8), hex.substr(8, 4), hex.substr(12, 4),
		hex.substr(16, 4), hex.substr(20, 12)
	]

func save_reconnect_identity(data):
	player_id = str(data.get("playerId", player_id))
	reconnect_token = str(data.get("reconnectToken", reconnect_token))

	if player_id != "":
		var player_file = FileAccess.open(PLAYER_ID_FILE, FileAccess.WRITE)
		player_file.store_string(player_id)

	if reconnect_token != "":
		var token_file = FileAccess.open(RECONNECT_TOKEN_FILE, FileAccess.WRITE)
		token_file.store_string(reconnect_token)

func send_reconnect_request():
	var data = {
		"type": "reconnect",
		"playerId": player_id,
		"reconnectToken": reconnect_token,
		"profileId": profile_id
	}

	ws.send_text(JSON.stringify(data))

func update_auto_reconnect_state(data):
	var players = data.get("players", [])
	var has_bot = false

	for player in players:
		if bool(player.get("isBot", false)):
			has_bot = true
			break

	auto_reconnect_enabled = players.size() >= 3 and not has_bot

func schedule_auto_reconnect():
	if not auto_reconnect_enabled:
		return

	if manual_disconnect_requested:
		return

	if auto_reconnect_attempts >= AUTO_RECONNECT_MAX_ATTEMPTS:
		status_changed.emit("Disconnected")
		client_status.emit("[Connect]")
		return

	auto_reconnect_attempts += 1
	auto_reconnect_delay_remaining = AUTO_RECONNECT_DELAY_SECONDS
	status_changed.emit(
		"Reconnecting " + str(auto_reconnect_attempts) + "/" + str(AUTO_RECONNECT_MAX_ATTEMPTS)
	)

func send_quick_chat(slot: int) -> void:
	if !is_conn_estab:
		return

	ws.send_text(JSON.stringify({
		"type": "send_quick_chat",
		"slot": slot
	}))

func activate_power(slot: int) -> void:
	if is_conn_estab:
		ws.send_text(JSON.stringify({"type": "activate_power", "slot": slot}))

func _process(delta: float) -> void:
	if auto_reconnect_delay_remaining >= 0.0:
		auto_reconnect_delay_remaining -= delta
		if auto_reconnect_delay_remaining <= 0.0:
			auto_reconnect_delay_remaining = -1.0
			connect_server(true)

	ws.poll()

	while ws.get_available_packet_count():
		var packet = ws.get_packet()
		var message = packet.get_string_from_utf8()
		var json = JSON.new()
		var result = json.parse(message)
		if result != OK:
			continue
		var data = json.data

		match data.type:
			"room_created":
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				room_joined.emit(data)
			"room_resumed":
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				room_joined.emit(data)
			"game_state":
				update_auto_reconnect_state(data)
				game_state_updated.emit(data)
			"debug_config":
				debug_config_updated.emit(data.config)
			"room_closed":
				auto_reconnect_enabled = false
				auto_reconnect_delay_remaining = -1.0
				room_closed.emit(data)

	var state = ws.get_ready_state()

	match state:

		WebSocketPeer.STATE_CONNECTING:
			if is_connecting:
				connect_attempt_elapsed += delta
				if connect_attempt_elapsed >= CONNECT_TIMEOUT_SECONDS:
					ws.close()

		WebSocketPeer.STATE_OPEN:
			if not is_conn_estab:
				is_conn_estab = true
				is_connecting = false
				manual_disconnect_requested = false
				status_changed.emit("Connected")
				client_status.emit("[Disconnect]")
				send_reconnect_request()

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if is_conn_estab or is_connecting:
				if auto_reconnect_enabled and not manual_disconnect_requested:
					schedule_auto_reconnect()
				elif is_connecting and not is_conn_estab and not tried_failover and not manual_disconnect_requested:
					tried_failover = true
					current_url = FAILOVER_SERVER_URL
					is_connecting = false
					connect_server(false, true)
				else:
					status_changed.emit("Disconnected")
					client_status.emit("[Connect]")
			is_conn_estab = false
			is_connecting = false

func update_config(key, value):
	if not is_conn_estab:
		return

	var data = {
		"type": "update_config",
		"key": key,
		"value": value
	}

	ws.send_text(JSON.stringify(data))
