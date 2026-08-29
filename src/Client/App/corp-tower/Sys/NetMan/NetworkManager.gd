extends Node

var ws = WebSocketPeer.new()
var is_conn_estab : bool = false
var is_connecting := false
var manual_disconnect_requested := false
var auto_reconnect_enabled := false
var auto_reconnect_attempts := 0
var auto_reconnect_delay_remaining := -1.0
var recovery_state := "healthy"
var recovery_request_id := ""
var recovery_deadline_msec := -1
var recovery_expiry_msec := -1
var recovery_reconnect_pending := false
var recovery_sequence := 0
var last_state_revision := -1
var last_game_state_msec := -1
var last_latency_rtt_ms := -1
var match_active := false

var player_id := ""
var reconnect_token := ""
var profile_id := ""
var current_url := ""
var tried_failover := false
var connect_attempt_elapsed := 0.0
var background_since_msec := -1
var latency_probe_enabled := false
var latency_probe_elapsed := 0.0
var latency_probe_nonce := ""
var latency_probe_sent_at_msec := -1
var latency_probe_sequence := 0

const PLAYER_ID_FILE := "user://corp_tower_player_id.save"
const RECONNECT_TOKEN_FILE := "user://corp_tower_reconnect_token.save"
const PROFILE_ID_FILE := "user://corp_tower_profile_id.save"
const AUTO_RECONNECT_DELAY_SECONDS := 1.0
const AUTO_RECONNECT_MAX_ATTEMPTS := 8
const CONNECT_TIMEOUT_SECONDS := 5.0
const BACKGROUND_STALE_THRESHOLD_SECONDS := 5.0
const GAME_STATE_STALE_TIMEOUT_MS := 8000
const RECOVERY_TIMEOUT_MIN_MS := 2500
const RECOVERY_TIMEOUT_MAX_MS := 8000
const RECOVERY_TOTAL_TIMEOUT_MS := 20000
const LATENCY_PROBE_INTERVAL_SECONDS := 1.0
const LATENCY_PROBE_TIMEOUT_MS := 5000
const SERVER_URL := EndpointConfig.PRIMARY
const FAILOVER_SERVER_URL := EndpointConfig.FAILOVER

signal status_changed(text)
signal room_joined(data)
signal match_started(data)
signal lobby_updated(data)
signal room_closed(data)
signal game_state_updated(data)
signal client_status(status)
signal debug_config_updated(config)
signal latency_rtt_updated(rtt_ms: int)
signal recovery_started
signal recovery_recovered
signal recovery_unavailable(data)

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
		elif not tried_failover and FAILOVER_SERVER_URL != "":
			tried_failover = true
			current_url = FAILOVER_SERVER_URL
			connect_server(false, true)

func disconnect_server():
	status_changed.emit("Disconnecting...")
	manual_disconnect_requested = true
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	match_active = false
	reset_recovery_state()
	reset_latency_probe()
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.close()

func toggle_connection():
	if is_conn_estab or is_connecting:
		disconnect_server()
	else:
		connect_server()

func place_block(block_index, column := -1, origin_y := -1):
	if not is_conn_estab or is_recovering():
		return

	var data = {
		"type": "place_block",
		"blockIndex": block_index,
		"column": column
	}

	if origin_y >= 0:
		data["originY"] = origin_y

	ws.send_text(JSON.stringify(data))

func send_ready():
	if not is_conn_estab or is_recovering():
		return

	ws.send_text(JSON.stringify({"type": "ready"}))

func leave_lobby():
	if not is_conn_estab or is_recovering():
		return

	ws.send_text(JSON.stringify({"type": "leave_lobby"}))

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
		"profileId": profile_id,
		"accessToken": AuthManager.connection_access_token(),
		"authProvider": AuthManager.connection_auth_provider()
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
	if not auto_reconnect_enabled and recovery_state != "reconnecting":
		return

	if manual_disconnect_requested:
		return

	if auto_reconnect_attempts >= AUTO_RECONNECT_MAX_ATTEMPTS:
		if recovery_state == "reconnecting":
			mark_recovery_unavailable("reconnect_failed")
		else:
			status_changed.emit("Disconnected")
			client_status.emit("[Connect]")
		return

	auto_reconnect_attempts += 1
	auto_reconnect_delay_remaining = AUTO_RECONNECT_DELAY_SECONDS
	status_changed.emit(
		"Reconnecting " + str(auto_reconnect_attempts) + "/" + str(AUTO_RECONNECT_MAX_ATTEMPTS)
	)

func is_recovering() -> bool:
	return recovery_state != "healthy"

func reset_recovery_state() -> void:
	recovery_state = "healthy"
	recovery_request_id = ""
	recovery_deadline_msec = -1
	recovery_expiry_msec = -1
	recovery_reconnect_pending = false

func recovery_timeout_ms() -> int:
	if last_latency_rtt_ms < 0:
		return RECOVERY_TIMEOUT_MIN_MS

	return clamp(
		last_latency_rtt_ms * 3,
		RECOVERY_TIMEOUT_MIN_MS,
		RECOVERY_TIMEOUT_MAX_MS
	)

func begin_recovery(force_reconnect := false) -> void:
	if manual_disconnect_requested or not match_active or recovery_state != "healthy":
		return

	recovery_state = "resyncing"
	recovery_started.emit()
	var now_msec := Time.get_ticks_msec()
	recovery_expiry_msec = now_msec + RECOVERY_TOTAL_TIMEOUT_MS

	if force_reconnect or not is_conn_estab or ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		begin_controlled_reconnect()
		return

	recovery_sequence += 1
	recovery_request_id = str(Time.get_ticks_usec()) + ":" + str(recovery_sequence)
	var result := ws.send_text(JSON.stringify({
		"type": "resync_state",
		"requestId": recovery_request_id,
		"stateRevision": last_state_revision
	}))

	if result != OK:
		begin_controlled_reconnect()
		return

	recovery_deadline_msec = now_msec + recovery_timeout_ms()

func begin_controlled_reconnect() -> void:
	if manual_disconnect_requested or recovery_state == "unavailable":
		return

	recovery_state = "reconnecting"
	recovery_request_id = ""
	recovery_deadline_msec = -1
	recovery_reconnect_pending = true
	auto_reconnect_attempts = 0
	is_conn_estab = false
	is_connecting = false
	reset_latency_probe()

	if ws.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		ws.close()

func start_pending_recovery_reconnect() -> void:
	if not recovery_reconnect_pending or ws.get_ready_state() != WebSocketPeer.STATE_CLOSED:
		return

	recovery_reconnect_pending = false
	ws = WebSocketPeer.new()
	connect_server(true)

func settle_recovery(data) -> void:
	if recovery_state == "healthy" or recovery_state == "unavailable":
		return

	if not bool(data.get("snapshot", false)):
		return

	if recovery_request_id != "" and str(data.get("resyncRequestId", "")) != recovery_request_id:
		return

	reset_recovery_state()
	recovery_recovered.emit()

func mark_recovery_unavailable(reason: String) -> void:
	if recovery_state == "unavailable":
		return

	recovery_state = "unavailable"
	recovery_request_id = ""
	recovery_deadline_msec = -1
	recovery_expiry_msec = -1
	recovery_reconnect_pending = false
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	match_active = false
	status_changed.emit("Match unavailable")
	recovery_unavailable.emit({"reason": reason})

func send_quick_chat(slot: int) -> void:
	if !is_conn_estab or is_recovering():
		return

	ws.send_text(JSON.stringify({
		"type": "send_quick_chat",
		"slot": slot
	}))

func activate_power(slot: int) -> void:
	if is_conn_estab and not is_recovering():
		ws.send_text(JSON.stringify({"type": "activate_power", "slot": slot}))

func _notification(what: int) -> void:
	match what:
		NOTIFICATION_APPLICATION_FOCUS_OUT, NOTIFICATION_APPLICATION_PAUSED:
			if background_since_msec < 0:
				background_since_msec = Time.get_ticks_msec()
		NOTIFICATION_APPLICATION_FOCUS_IN, NOTIFICATION_APPLICATION_RESUMED:
			if background_since_msec < 0:
				return
			var backgrounded_seconds = (Time.get_ticks_msec() - background_since_msec) / 1000.0
			background_since_msec = -1
			if not match_active:
				return
			begin_recovery(backgrounded_seconds >= BACKGROUND_STALE_THRESHOLD_SECONDS)

func force_reconnect_after_background():
	begin_recovery(true)

func accept_game_state(data) -> bool:
	if recovery_state == "unavailable":
		return false

	var revision := int(data.get("stateRevision", -1))

	if revision >= 0:
		if last_state_revision >= 0 and revision < last_state_revision:
			return false
		last_state_revision = revision

	last_game_state_msec = Time.get_ticks_msec()
	match_active = true
	return true

func _process(delta: float) -> void:
	if (
		recovery_state != "healthy"
		and recovery_state != "unavailable"
		and recovery_expiry_msec >= 0
		and Time.get_ticks_msec() >= recovery_expiry_msec
	):
		mark_recovery_unavailable("recovery_timed_out")
	elif (
		recovery_state == "resyncing"
		and recovery_deadline_msec >= 0
		and Time.get_ticks_msec() >= recovery_deadline_msec
	):
		begin_controlled_reconnect()

	if (
		match_active
		and recovery_state == "healthy"
		and background_since_msec < 0
		and is_conn_estab
		and last_game_state_msec >= 0
		and Time.get_ticks_msec() - last_game_state_msec >= GAME_STATE_STALE_TIMEOUT_MS
	):
		begin_recovery(false)

	if auto_reconnect_delay_remaining >= 0.0:
		auto_reconnect_delay_remaining -= delta
		if auto_reconnect_delay_remaining <= 0.0:
			auto_reconnect_delay_remaining = -1.0
			connect_server(true)

	process_latency_probe(delta)
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
				match_active = bool(data.get("matchStarted", false))
				room_joined.emit(data)
			"room_resumed":
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				match_active = bool(data.get("matchStarted", false))
				room_joined.emit(data)
			"match_started":
				match_active = true
				match_started.emit(data)
			"lobby_update":
				lobby_updated.emit(data)
			"game_state":
				if accept_game_state(data):
					update_auto_reconnect_state(data)
					game_state_updated.emit(data)
					settle_recovery(data)
			"debug_config":
				debug_config_updated.emit(data.config)
			"latency_pong":
				accept_latency_pong(data)
			"resume_unavailable":
				match_active = false
				mark_recovery_unavailable(str(data.get("reason", "room_unavailable")))
			"room_closed":
				match_active = false
				reset_recovery_state()
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
			var was_connecting := is_conn_estab or is_connecting
			is_conn_estab = false
			is_connecting = false
			reset_latency_probe()

			if recovery_reconnect_pending:
				start_pending_recovery_reconnect()
			elif was_connecting:
				if match_active and recovery_state == "healthy" and not manual_disconnect_requested:
					begin_recovery(true)
				elif (auto_reconnect_enabled or recovery_state == "reconnecting") and not manual_disconnect_requested:
					schedule_auto_reconnect()
				elif is_connecting and not is_conn_estab and not tried_failover and not manual_disconnect_requested and FAILOVER_SERVER_URL != "":
					tried_failover = true
					current_url = FAILOVER_SERVER_URL
					is_connecting = false
					connect_server(false, true)
				else:
					status_changed.emit("Disconnected")
					client_status.emit("[Connect]")

func update_config(key, value):
	if not is_conn_estab or is_recovering():
		return

	var data = {
		"type": "update_config",
		"key": key,
		"value": value
	}

	ws.send_text(JSON.stringify(data))

func set_latency_probe_enabled(enabled: bool) -> void:
	latency_probe_enabled = enabled
	reset_latency_probe()

func reset_latency_probe() -> void:
	latency_probe_elapsed = 0.0
	latency_probe_nonce = ""
	latency_probe_sent_at_msec = -1

func process_latency_probe(delta: float) -> void:
	if not latency_probe_enabled or not is_conn_estab:
		return
	if latency_probe_nonce != "":
		if Time.get_ticks_msec() - latency_probe_sent_at_msec >= LATENCY_PROBE_TIMEOUT_MS:
			reset_latency_probe()
		else:
			return

	latency_probe_elapsed += delta
	if latency_probe_elapsed < LATENCY_PROBE_INTERVAL_SECONDS:
		return

	latency_probe_elapsed = 0.0
	latency_probe_sequence += 1
	var nonce := str(Time.get_ticks_usec()) + ":" + str(latency_probe_sequence)
	if ws.send_text(JSON.stringify({"type": "latency_ping", "nonce": nonce})) != OK:
		return

	latency_probe_nonce = nonce
	latency_probe_sent_at_msec = Time.get_ticks_msec()

func accept_latency_pong(data, received_at_msec: int = -1) -> void:
	if not latency_probe_enabled or latency_probe_nonce == "":
		return

	var nonce = data.get("nonce", null)
	if typeof(nonce) != TYPE_STRING or nonce != latency_probe_nonce:
		return
	if received_at_msec < 0:
		received_at_msec = Time.get_ticks_msec()

	var rtt_ms: int = max(0, received_at_msec - latency_probe_sent_at_msec)
	reset_latency_probe()
	last_latency_rtt_ms = rtt_ms
	latency_rtt_updated.emit(rtt_ms)
