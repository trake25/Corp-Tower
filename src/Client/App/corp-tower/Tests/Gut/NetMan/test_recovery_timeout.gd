extends GutTest

const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

func test_presentation_states_do_not_start_stale_stream_recovery() -> void:
	for state in ["finished", "failed", "game_over"]:
		var network = NetworkManagerScript.new()
		network.match_active = true
		network.is_conn_estab = true
		network.latest_match_state = state
		network.last_game_state_msec = Time.get_ticks_msec() - NetworkManagerScript.GAME_STATE_STALE_TIMEOUT_MS

		network.check_stale_game_state(Time.get_ticks_msec())

		assert_eq(network.recovery_state, "healthy", state + " must tolerate intentional presentation silence.")
		network.free()

func test_streaming_states_start_stale_stream_recovery() -> void:
	for state in ["starting", "playing"]:
		var network = NetworkManagerScript.new()
		network.match_active = true
		network.is_conn_estab = true
		network.latest_match_state = state
		network.last_game_state_msec = Time.get_ticks_msec() - NetworkManagerScript.GAME_STATE_STALE_TIMEOUT_MS

		network.check_stale_game_state(Time.get_ticks_msec())

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
