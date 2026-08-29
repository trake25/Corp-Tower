extends GutTest

const MainScene = preload("res://Cor/Scenes/Main.tscn")

var screen_manager

func before_each() -> void:
	screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

func test_terminal_room_close_routes_home() -> void:
	screen_manager.find_match_active = true
	screen_manager._on_room_closed({
		"reason": "failure_limit_reached",
		"destination": "home"
	})
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"),
		"Terminal Impact closes must return every build to Home."
	)
	assert_false(
		screen_manager.find_match_active,
		"A closed room must not leave stale matchmaking state behind."
	)

func test_ordinary_room_close_still_routes_join() -> void:
	screen_manager._on_room_closed({"reason": "reconnect_ttl_expired"})
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/JoinScreen.tscn"),
		"Non-terminal close reasons must retain the Join fallback."
	)

func test_terminal_recovery_returns_home_after_countdown() -> void:
	screen_manager._on_recovery_unavailable({"reason": "recovery_timed_out"})
	assert_true(
		screen_manager.auto_dismiss_modal.visible,
		"Terminal recovery must open the automatic Home-return modal."
	)

	screen_manager.auto_dismiss_modal.auto_dismiss_remaining = 0.0
	screen_manager.auto_dismiss_modal._process(0.0)

	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"),
		"A terminal recovery must return the player Home after its countdown."
	)
