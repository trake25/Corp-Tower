extends GutTest

const MainScene = preload("res://Cor/Scenes/Main.tscn")

var screen_manager

func before_each() -> void:
	screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

func test_terminal_room_close_routes_home() -> void:
	screen_manager._on_room_closed({
		"reason": "failure_limit_reached",
		"destination": "home"
	})
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"),
		"Terminal Impact closes must return every build to Home."
	)

func test_ordinary_room_close_still_routes_join() -> void:
	screen_manager._on_room_closed({"reason": "reconnect_ttl_expired"})
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/JoinScreen.tscn"),
		"Non-terminal close reasons must retain the Join fallback."
	)
