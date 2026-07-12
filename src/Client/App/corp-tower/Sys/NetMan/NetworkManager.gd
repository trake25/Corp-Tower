##Network Manager.gd
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

const PLAYER_ID_FILE := "user://corp_tower_player_id.save"
const RECONNECT_TOKEN_FILE := "user://corp_tower_reconnect_token.save"
const AUTO_RECONNECT_DELAY_SECONDS := 1.0
const AUTO_RECONNECT_MAX_ATTEMPTS := 8
const SERVER_URL := "wss://corp-tower.duckdns.org"

signal status_changed(text)
signal room_joined(data)
signal room_closed(data)
signal game_state_updated(data)
signal client_status(status)
signal debug_config_updated(config)

func connect_server(is_auto_reconnect := false):
	var url = SERVER_URL
	
	if is_auto_reconnect:
		status_changed.emit("Reconnecting...")
	else:
		status_changed.emit("Connecting...")

	if is_conn_estab or is_connecting:
		print("Already connecting/connected. Ignoring.")
		return

	if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		ws = WebSocketPeer.new()

	manual_disconnect_requested = false
	is_connecting = true
	load_reconnect_identity()

	var error = ws.connect_to_url(url)

	if error == OK:
		if is_auto_reconnect:
			print("Auto reconnecting...")
		else:
			auto_reconnect_attempts = 0
			print("Connecting...")
	else:
		print("Failed to start connection")
		is_connecting = false
		if is_auto_reconnect:
			schedule_auto_reconnect()


func disconnect_server():
	
	status_changed.emit("Disconnecting...")
	manual_disconnect_requested = true
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		print("Disconnecting from server...")
		ws.close()
	else:
		print("Not connected, nothing to disconnect")

## On_connect_pressed
func toggle_connection():
	if is_conn_estab or is_connecting:
		disconnect_server()
	else:
		connect_server()

func place_block(block_index):

	if not is_conn_estab:
		print("Not connected")
		return

	var data = {
		"type":"place_block",
		"blockIndex": block_index
	}

	var json = JSON.stringify(data)

	ws.send_text(json)

	print("place_block sent")

func load_reconnect_identity():
	if FileAccess.file_exists(PLAYER_ID_FILE):
		player_id = FileAccess.get_file_as_string(PLAYER_ID_FILE).strip_edges()

	if FileAccess.file_exists(RECONNECT_TOKEN_FILE):
		reconnect_token = FileAccess.get_file_as_string(RECONNECT_TOKEN_FILE).strip_edges()

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
		"reconnectToken": reconnect_token
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

func refresh_blocks():

	if not is_conn_estab:
		print("Not connected")
		return

	var data = {
		"type":"refresh_blocks"
	}

	ws.send_text(
		JSON.stringify(data)
	)

	print("refresh_blocks sent")

func send_quick_chat(slot: int) -> void:
	if !is_conn_estab:
		return

	ws.send_text(JSON.stringify({
		"type": "send_quick_chat",
		"slot": slot
	}))

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
		print(data)
	
		match data.type:
			"room_created":
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				room_joined.emit(data)
				print("Player ID:", data.playerId)
				print("Room:", data.roomId)
				print("Blocks:", data.blocks)
			"room_resumed":
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				room_joined.emit(data)
				print("Player ID:", data.playerId)
				print("Room:", data.roomId)
				print("Blocks:", data.blocks)
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
			pass # optional debug

		WebSocketPeer.STATE_OPEN:
			if not is_conn_estab:
				is_conn_estab = true
				is_connecting = false
				manual_disconnect_requested = false
				print("CONNECTED TO SERVER")
				status_changed.emit("Connected")
				client_status.emit("[Disconnect]")
				send_reconnect_request()

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if is_conn_estab or is_connecting:
				print("DISCONNECTED FROM SERVER")
				if auto_reconnect_enabled and not manual_disconnect_requested:
					schedule_auto_reconnect()
				else:
					status_changed.emit("Disconnected")
					client_status.emit("[Connect]")
			is_conn_estab = false
			is_connecting = false

func update_config(
	key,
	value
):

	if not is_conn_estab:
		print("Not connected")
		return

	var data={

		"type":"update_config",

		"key":key,

		"value":value
	}

	ws.send_text(
		JSON.stringify(data)
	)

	print(
		"Config update:",
		key,
		value
	)
