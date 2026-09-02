extends Node

var ws = WebSocketPeer.new()
var is_conn_estab : bool = false
var is_connecting := false
var manual_disconnect_requested := false
var auto_reconnect_enabled := false
var auto_reconnect_attempts := 0
var auto_reconnect_delay_remaining := -1.0
var connect_after_close := false
var recovery_state := "healthy"
var recovery_request_id := ""
var recovery_deadline_msec := -1
var recovery_expiry_msec := -1
var recovery_reconnect_pending := false
var recovery_sequence := 0
var recovery_start_revision := -1
var last_state_revision := -1
var last_game_state_msec := -1
var latest_match_state := ""
var last_latency_rtt_ms := -1
var match_active := false
var room_mode := "public"
var private_lobby_active := false
var private_lobby_is_host := false
var private_lobby_reconnect_deadline_msec := -1
var pending_entry_mode := "public"
var pending_private_display_name := ""
var pending_private_server_id := ""
var pending_private_password := ""
var private_entry_in_flight := false
var resume_only_request := false

var player_id := ""
var reconnect_token := ""
var profile_id := ""
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
const RECOVERY_TOTAL_TIMEOUT_MS := 10000
const PRIVATE_LOBBY_RECONNECT_WINDOW_MS := 20000
const LATENCY_PROBE_INTERVAL_SECONDS := 1.0
const LATENCY_PROBE_TIMEOUT_MS := 5000
const SERVER_URL := EndpointConfig.PRIMARY
const STREAMING_MATCH_STATES := ["starting", "playing"]

signal status_changed(text)
signal room_joined(data)
signal match_started(data)
signal lobby_updated(data)
signal room_closed(data)
signal game_left(data)
signal game_state_updated(data)
signal client_status(status)
signal debug_config_updated(config)
signal latency_rtt_updated(rtt_ms: int)
signal recovery_started
signal recovery_recovered
signal recovery_unavailable(data)
signal private_join_failed(data)
signal private_entry_failed(data)
signal resume_only_failed(data)

func connect_server(is_auto_reconnect := false, preserve_entry := false, resume_only := false):
	if not is_auto_reconnect and not preserve_entry:
		_clear_pending_private_entry()

	if resume_only:
		resume_only_request = true
	elif not is_auto_reconnect:
		resume_only_request = false
	elif match_active or private_lobby_active or recovery_state == "reconnecting":
		resume_only_request = true

	if is_auto_reconnect:
		status_changed.emit("Reconnecting...")
	else:
		status_changed.emit("Connecting...")

	if is_conn_estab or is_connecting:
		return

	if ws.get_ready_state() == WebSocketPeer.STATE_CLOSING:
		manual_disconnect_requested = false
		connect_after_close = true
		return

	if ws.get_ready_state() == WebSocketPeer.STATE_CLOSED:
		ws = WebSocketPeer.new()

	manual_disconnect_requested = false
	is_connecting = true
	load_reconnect_identity()

	var error = ws.connect_to_url(SERVER_URL)

	if error == OK:
		connect_attempt_elapsed = 0.0
		if not is_auto_reconnect:
			auto_reconnect_attempts = 0
	else:
		is_connecting = false
		if _has_private_entry_in_flight():
			_fail_private_entry("connection_failed")
			status_changed.emit("Disconnected")
			client_status.emit("[Connect]")
		elif is_auto_reconnect or resume_only_request:
			schedule_auto_reconnect()
		else:
			status_changed.emit("Disconnected")
			client_status.emit("[Connect]")

func disconnect_server(clear_private_entry := true):
	status_changed.emit("Disconnecting...")
	manual_disconnect_requested = true
	connect_after_close = false
	is_conn_estab = false
	is_connecting = false
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	resume_only_request = false
	_clear_private_lobby_tracking()
	reset_match_tracking()
	reset_latency_probe()
	if clear_private_entry:
		_clear_pending_private_entry()
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		ws.close()

func toggle_connection():
	if is_conn_estab or is_connecting:
		disconnect_server()
	else:
		connect_server()

func create_private_server(display_name: String, password: String) -> bool:
	return _begin_private_entry("private_create", display_name, "", password)

func join_private_server(display_name: String, server_id: String, password: String) -> bool:
	return _begin_private_entry("private_join", display_name, server_id, password)

func _begin_private_entry(mode: String, display_name: String, server_id: String, password: String) -> bool:
	if private_entry_in_flight:
		return false

	abandon_room_identity()
	_set_private_entry(mode, display_name, server_id, password)
	private_entry_in_flight = true
	_connect_with_private_entry()
	return true

func _connect_with_private_entry() -> void:
	if is_conn_estab or is_connecting:
		disconnect_server(false)
		if ws.get_ready_state() != WebSocketPeer.STATE_CLOSED:
			if ws.get_ready_state() != WebSocketPeer.STATE_CLOSING:
				ws.close()
			manual_disconnect_requested = false
			connect_after_close = true
			return

	connect_server(false, true)

func _set_private_entry(mode: String, display_name: String, server_id: String, password: String) -> void:
	pending_entry_mode = mode
	pending_private_display_name = display_name.strip_edges()
	pending_private_server_id = server_id.strip_edges().to_upper()
	pending_private_password = password

func _clear_pending_private_entry() -> void:
	private_entry_in_flight = false
	pending_entry_mode = "public"
	pending_private_display_name = ""
	pending_private_server_id = ""
	pending_private_password = ""

func _has_private_entry_in_flight() -> bool:
	return private_entry_in_flight and pending_entry_mode.begins_with("private_")

func _fail_private_entry(reason: String) -> void:
	if not _has_private_entry_in_flight():
		return

	private_entry_failed.emit({
		"reason": reason,
		"entryMode": pending_entry_mode
	})
	_clear_pending_private_entry()

func _clear_private_lobby_tracking() -> void:
	private_lobby_active = false
	private_lobby_is_host = false
	private_lobby_reconnect_deadline_msec = -1

func _update_private_lobby_tracking(data) -> void:
	room_mode = str(data.get("roomMode", room_mode))
	private_lobby_active = room_mode == "private" and not bool(data.get("matchStarted", false))

	if not private_lobby_active:
		private_lobby_is_host = false
		private_lobby_reconnect_deadline_msec = -1
		return

	var private_lobby: Dictionary = data.get("privateLobby", {})
	private_lobby_is_host = str(private_lobby.get("hostPlayerId", "")) == player_id
	private_lobby_reconnect_deadline_msec = -1

func is_private_lobby_active() -> bool:
	return private_lobby_active

func kick_private_player(target_player_id: String) -> void:
	if not is_conn_estab or is_recovering():
		return

	ws.send_text(JSON.stringify({
		"type": "kick_private_player",
		"targetPlayerId": target_player_id
	}))

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

func leave_game() -> bool:
	if not is_conn_estab or is_recovering():
		return false

	return ws.send_text(JSON.stringify({"type": "leave_game"})) == OK

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

func has_saved_room_identity() -> bool:
	load_reconnect_identity()
	return player_id != "" and reconnect_token != ""

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
		"authProvider": AuthManager.connection_auth_provider(),
		"entryMode": pending_entry_mode,
		"resumeOnly": resume_only_request
	}

	if pending_entry_mode != "public":
		data["privateDisplayName"] = pending_private_display_name
		data["privateServerId"] = pending_private_server_id
		data["privatePassword"] = pending_private_password

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
	if not auto_reconnect_enabled and recovery_state != "reconnecting" and not resume_only_request:
		return

	if manual_disconnect_requested:
		return

	if auto_reconnect_attempts >= AUTO_RECONNECT_MAX_ATTEMPTS:
		if recovery_state == "reconnecting":
			mark_recovery_unavailable("reconnect_failed")
		elif resume_only_request:
			resume_only_request = false
			status_changed.emit("Disconnected")
			client_status.emit("[Connect]")
			resume_only_failed.emit({"reason": "reconnect_failed"})
		else:
			status_changed.emit("Disconnected")
			client_status.emit("[Connect]")
		return

	auto_reconnect_attempts += 1
	auto_reconnect_delay_remaining = AUTO_RECONNECT_DELAY_SECONDS
	status_changed.emit(
		"Reconnecting " + str(auto_reconnect_attempts) + "/" + str(AUTO_RECONNECT_MAX_ATTEMPTS)
	)

func schedule_private_lobby_reconnect() -> void:
	if manual_disconnect_requested or not private_lobby_active:
		return

	var now_msec := Time.get_ticks_msec()

	if private_lobby_reconnect_deadline_msec < 0:
		private_lobby_reconnect_deadline_msec = now_msec + PRIVATE_LOBBY_RECONNECT_WINDOW_MS

	if now_msec >= private_lobby_reconnect_deadline_msec:
		status_changed.emit("Waiting for private lobby state")
	else:
		status_changed.emit("Reconnecting private lobby")

	auto_reconnect_attempts += 1
	auto_reconnect_delay_remaining = AUTO_RECONNECT_DELAY_SECONDS

func is_recovering() -> bool:
	return recovery_state != "healthy"

func reset_match_tracking() -> void:
	match_active = false
	last_state_revision = -1
	last_game_state_msec = -1
	latest_match_state = ""
	reset_recovery_state()

func _clear_room_identity() -> void:
	player_id = ""
	reconnect_token = ""

	if FileAccess.file_exists(PLAYER_ID_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PLAYER_ID_FILE))

	if FileAccess.file_exists(RECONNECT_TOKEN_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(RECONNECT_TOKEN_FILE))

func abandon_room_identity() -> void:
	resume_only_request = false
	_clear_room_identity()

func accept_game_left(data) -> void:
	reset_match_tracking()
	_clear_private_lobby_tracking()
	_clear_room_identity()
	resume_only_request = false
	auto_reconnect_enabled = false
	auto_reconnect_delay_remaining = -1.0
	game_left.emit(data)

func reset_recovery_state() -> void:
	recovery_state = "healthy"
	recovery_request_id = ""
	recovery_deadline_msec = -1
	recovery_expiry_msec = -1
	recovery_reconnect_pending = false
	recovery_start_revision = -1

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
	recovery_start_revision = last_state_revision
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

	var correlated_snapshot := (
		bool(data.get("snapshot", false))
		and (
			recovery_request_id == ""
			or str(data.get("resyncRequestId", "")) == recovery_request_id
		)
	)
	var revision := int(data.get("stateRevision", -1))
	var authoritative_progress := (
		recovery_start_revision < 0
		or revision > recovery_start_revision
	)

	if not correlated_snapshot and not authoritative_progress:
		return

	reset_recovery_state()
	recovery_recovered.emit()

func mark_recovery_unavailable(reason: String, resume_unavailable := false) -> void:
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
	recovery_unavailable.emit({
		"reason": reason,
		"resumeUnavailable": resume_unavailable
	})

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

	if data.has("state"):
		latest_match_state = str(data.get("state", ""))

	last_game_state_msec = Time.get_ticks_msec()
	match_active = true
	return true

func check_stale_game_state(now_msec: int) -> void:
	if (
		match_active
		and recovery_state == "healthy"
		and background_since_msec < 0
		and is_conn_estab
		and latest_match_state in STREAMING_MATCH_STATES
		and last_game_state_msec >= 0
		and now_msec - last_game_state_msec >= GAME_STATE_STALE_TIMEOUT_MS
	):
		begin_recovery(false)

func check_recovery_deadlines(now_msec: int) -> void:
	if (
		recovery_state != "healthy"
		and recovery_state != "unavailable"
		and recovery_expiry_msec >= 0
		and now_msec >= recovery_expiry_msec
	):
		mark_recovery_unavailable("recovery_timed_out")
	elif (
		recovery_state == "resyncing"
		and recovery_deadline_msec >= 0
		and now_msec >= recovery_deadline_msec
	):
		begin_controlled_reconnect()

func _process(delta: float) -> void:
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
				resume_only_request = false
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				match_active = bool(data.get("matchStarted", false))
				_update_private_lobby_tracking(data)
				_clear_pending_private_entry()
				room_joined.emit(data)
			"room_resumed":
				resume_only_request = false
				save_reconnect_identity(data)
				auto_reconnect_attempts = 0
				match_active = bool(data.get("matchStarted", false))
				_update_private_lobby_tracking(data)
				_clear_pending_private_entry()
				room_joined.emit(data)
			"match_started":
				match_active = true
				_clear_private_lobby_tracking()
				match_started.emit(data)
			"lobby_update":
				_update_private_lobby_tracking(data)
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
				resume_only_request = false
				if str(data.get("destination", "")) != "":
					match_active = false
					_clear_private_lobby_tracking()
					_clear_room_identity()
					room_closed.emit({
						"type": "room_closed",
						"reason": str(data.get("reason", "room_unavailable")),
						"destination": str(data.get("destination", ""))
					})
				else:
					match_active = false
					mark_recovery_unavailable(
						str(data.get("reason", "room_unavailable")),
						true
					)
			"room_closed":
				resume_only_request = false
				var destination_by_player: Dictionary = data.get("destinationByPlayerId", {})
				if destination_by_player.has(player_id):
					data["destination"] = str(destination_by_player[player_id])
				reset_match_tracking()
				_clear_private_lobby_tracking()
				_clear_room_identity()
				auto_reconnect_enabled = false
				auto_reconnect_delay_remaining = -1.0
				room_closed.emit(data)
			"game_left":
				accept_game_left(data)
			"private_join_rejected":
				private_join_failed.emit(data)
				_clear_pending_private_entry()

	var now_msec := Time.get_ticks_msec()
	check_recovery_deadlines(now_msec)
	check_stale_game_state(now_msec)

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
			elif connect_after_close:
				connect_after_close = false
				ws = WebSocketPeer.new()
				connect_server(false, pending_entry_mode != "public")
			elif was_connecting:
				if _has_private_entry_in_flight() and not manual_disconnect_requested:
					_fail_private_entry("transport_closed")
					status_changed.emit("Disconnected")
					client_status.emit("[Connect]")
				elif private_lobby_active and not manual_disconnect_requested:
					schedule_private_lobby_reconnect()
				elif match_active and recovery_state == "healthy" and not manual_disconnect_requested:
					begin_recovery(true)
				elif resume_only_request and not manual_disconnect_requested:
					schedule_auto_reconnect()
				elif (auto_reconnect_enabled or recovery_state == "reconnecting") and not manual_disconnect_requested:
					schedule_auto_reconnect()
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
