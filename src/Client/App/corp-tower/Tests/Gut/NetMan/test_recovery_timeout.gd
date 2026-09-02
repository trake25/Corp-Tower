extends GutTest

const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

class FakeSocket:
	extends RefCounted

	var sent_messages: Array = []
	var ready_state := WebSocketPeer.STATE_OPEN

	func send_text(raw: String) -> Error:
		sent_messages.append(JSON.parse_string(raw))
		return OK

	func get_ready_state() -> int:
		return ready_state

	func close() -> Error:
		ready_state = WebSocketPeer.STATE_CLOSING
		return OK

func test_presentation_states_do_not_start_stale_stream_recovery() -> void:
	var last_game_state_msec := 1000
	var now_msec := last_game_state_msec + NetworkManagerScript.GAME_STATE_STALE_TIMEOUT_MS
	for state in ["finished", "failed", "game_over"]:
		var network = NetworkManagerScript.new()
		network.match_active = true
		network.is_conn_estab = true
		network.latest_match_state = state
		network.last_game_state_msec = last_game_state_msec

		network.check_stale_game_state(now_msec)

		assert_eq(network.recovery_state, "healthy", state + " must tolerate intentional presentation silence.")
		network.free()

func test_streaming_states_start_stale_stream_recovery() -> void:
	var last_game_state_msec := 1000
	var now_msec := last_game_state_msec + NetworkManagerScript.GAME_STATE_STALE_TIMEOUT_MS
	for state in ["starting", "playing"]:
		var network = NetworkManagerScript.new()
		network.match_active = true
		network.is_conn_estab = true
		network.latest_match_state = state
		network.last_game_state_msec = last_game_state_msec

		network.check_stale_game_state(now_msec)

		assert_ne(network.recovery_state, "healthy", "A missing " + state + " stream must enter recovery.")
		network.free()

func test_authoritative_progress_settles_recovery_without_transport_teardown() -> void:
	var network = NetworkManagerScript.new()
	var recovered_events := []
	network.recovery_recovered.connect(func(): recovered_events.append(true))
	network.recovery_state = "resyncing"
	network.recovery_request_id = "pending-request"
	network.recovery_start_revision = 11
	network.last_state_revision = 11
	network.recovery_deadline_msec = Time.get_ticks_msec() - 1
	network.recovery_expiry_msec = Time.get_ticks_msec() + 1000
	network.is_conn_estab = true

	var state := {"state": "playing", "stateRevision": 12}
	assert_true(network.accept_game_state(state), "A newer complete state must be accepted during recovery.")
	network.settle_recovery(state)
	network.check_recovery_deadlines(Time.get_ticks_msec())

	assert_eq(network.recovery_state, "healthy", "Authoritative progress must restore the match without reconnect churn.")
	assert_true(network.is_conn_estab, "Accepted progress must keep the live transport intact.")
	assert_eq(recovered_events.size(), 1, "Recovery completion must release the blocking shell state once.")
	network.free()

func test_manual_disconnect_releases_connection_flags_for_a_new_match() -> void:
	var network = NetworkManagerScript.new()
	network.is_conn_estab = true
	network.is_connecting = true
	network.last_state_revision = 8
	network.last_game_state_msec = Time.get_ticks_msec()
	network.latest_match_state = "playing"
	network.recovery_start_revision = 8

	network.disconnect_server()

	assert_false(network.is_conn_estab, "A cancelled connection must not block the next match request.")
	assert_false(network.is_connecting, "A cancelled connection must not keep matchmaking in its spinner.")
	assert_eq(network.last_state_revision, -1, "A new match must not inherit the previous room revision.")
	assert_eq(network.last_game_state_msec, -1, "A new match must not inherit the previous room liveness clock.")

func test_private_lobby_foreground_does_not_enter_play_resync() -> void:
	var network = NetworkManagerScript.new()
	var socket = FakeSocket.new()
	network.ws = socket
	network.is_conn_estab = true
	network.private_lobby_active = true
	network.match_active = false

	network._notification(NOTIFICATION_APPLICATION_FOCUS_OUT)
	network._notification(NOTIFICATION_APPLICATION_FOCUS_IN)

	assert_eq(network.recovery_state, "healthy")
	assert_true(socket.sent_messages.is_empty(), "Private-lobby foregrounding never sends Play resync_state.")
	network.free()

func test_resume_only_transport_exhaustion_is_bounded_and_reported() -> void:
	var network = NetworkManagerScript.new()
	var failures: Array = []
	network.resume_only_failed.connect(func(data): failures.append(data))
	network.resume_only_request = true
	network.auto_reconnect_attempts = NetworkManagerScript.AUTO_RECONNECT_MAX_ATTEMPTS

	network.schedule_auto_reconnect()

	assert_false(network.resume_only_request)
	assert_eq(failures, [{"reason": "reconnect_failed"}])
	assert_lt(network.auto_reconnect_delay_remaining, 0.0)
	network.free()

func test_game_left_clears_resumable_identity_before_shell_teardown() -> void:
	var network = NetworkManagerScript.new()
	add_child_autofree(network)
	var game_left_events: Array = []
	network.game_left.connect(func(data): game_left_events.append(data))
	network.player_id = "intentional-leaver"
	network.reconnect_token = "intentional-token"
	network.match_active = true
	network.auto_reconnect_enabled = true
	var player_file = FileAccess.open(NetworkManagerScript.PLAYER_ID_FILE, FileAccess.WRITE)
	player_file.store_string(network.player_id)
	var token_file = FileAccess.open(NetworkManagerScript.RECONNECT_TOKEN_FILE, FileAccess.WRITE)
	token_file.store_string(network.reconnect_token)

	network.accept_game_left({"type": "game_left", "destination": "home"})

	assert_eq(network.player_id, "")
	assert_eq(network.reconnect_token, "")
	assert_false(network.match_active)
	assert_false(network.auto_reconnect_enabled)
	assert_false(FileAccess.file_exists(NetworkManagerScript.PLAYER_ID_FILE))
	assert_false(FileAccess.file_exists(NetworkManagerScript.RECONNECT_TOKEN_FILE))
	assert_eq(game_left_events, [{"type": "game_left", "destination": "home"}])
	assert_eq(network.latest_match_state, "", "A new match must not inherit the previous room lifecycle state.")
	assert_eq(network.recovery_start_revision, -1, "A new match must not inherit recovery progress markers.")
	network.free()

func test_total_recovery_expiry_stops_reconnect_and_reports_terminal_reason() -> void:
	var network = NetworkManagerScript.new()
	var reasons: Array[String] = []
	network.recovery_unavailable.connect(func(data): reasons.append(str(data.get("reason", ""))))
	network.match_active = true
	network.recovery_state = "reconnecting"
	network.recovery_expiry_msec = Time.get_ticks_msec() - 1

	network._process(0.0)

	assert_eq(network.recovery_state, "unavailable", "A recovery past its total deadline must become terminal.")
	assert_true(network.is_recovering(), "A terminal recovery must continue blocking player actions until the shell exits Play.")
	assert_false(network.match_active, "A terminal recovery must release the stale match state.")
	assert_eq(reasons, ["recovery_timed_out"], "Expiry must report the reason that drives the Home-return UX.")
	network.free()

func test_late_snapshot_cannot_revive_terminal_recovery() -> void:
	var network = NetworkManagerScript.new()
	network.recovery_state = "unavailable"
	network.last_state_revision = 7

	assert_false(network.accept_game_state({"stateRevision": 8, "snapshot": true}), "Late state must be ignored after recovery becomes terminal.")
	network.settle_recovery({"snapshot": true})

	assert_eq(network.recovery_state, "unavailable", "A late snapshot must not clear the terminal recovery state.")
	assert_eq(network.last_state_revision, 7, "Ignoring late state must preserve the accepted revision.")
	network.free()
