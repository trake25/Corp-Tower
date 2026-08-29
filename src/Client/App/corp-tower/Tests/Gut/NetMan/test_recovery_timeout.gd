extends GutTest

const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

func test_total_recovery_deadline_is_ten_seconds() -> void:
	assert_eq(
		NetworkManagerScript.RECOVERY_TOTAL_TIMEOUT_MS,
		10000,
		"Background recovery must return Home after ten seconds."
	)

func test_manual_disconnect_releases_connection_flags_for_a_new_match() -> void:
	var network = NetworkManagerScript.new()
	network.is_conn_estab = true
	network.is_connecting = true

	network.disconnect_server()

	assert_false(network.is_conn_estab, "A cancelled connection must not block the next match request.")
	assert_false(network.is_connecting, "A cancelled connection must not keep matchmaking in its spinner.")
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
