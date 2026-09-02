extends GutTest

const MainScene = preload("res://Cor/Scenes/Main.tscn")
const MenuScreenScene = preload("res://Cor/Scenes/MenuScreen.tscn")
const UiPreferencesScript = preload("res://Cor/Scripts/UiPreferences.gd")

var screen_manager

func before_each() -> void:
	if FileAccess.file_exists(UiPreferencesScript.PREFERENCES_FILE):
		DirAccess.remove_absolute(UiPreferencesScript.PREFERENCES_FILE)
	screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

func after_each() -> void:
	if FileAccess.file_exists(UiPreferencesScript.PREFERENCES_FILE):
		DirAccess.remove_absolute(UiPreferencesScript.PREFERENCES_FILE)
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

func test_unavailable_resume_returns_to_matchmaking_after_countdown() -> void:
	screen_manager._on_recovery_unavailable({"resumeUnavailable": true})
	screen_manager.auto_dismiss_modal.auto_dismiss_remaining = 0.0
	screen_manager.auto_dismiss_modal._process(0.0)

	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/JoinScreen.tscn"),
		"An unavailable restored room must return to matchmaking rather than Home."
	)

func test_hamburger_opens_menu_over_the_same_play_instance_and_close_restores_input() -> void:
	screen_manager._enter_play_instance()
	await get_tree().process_frame
	var retained_play = screen_manager.play_instance
	var hamburger: TextureButton = retained_play.find_child("HamburgerButton", true, false)

	hamburger.pressed.emit()
	await get_tree().process_frame

	assert_eq(screen_manager.play_instance, retained_play)
	assert_eq(screen_manager.current_overlay.scene_file_path, MenuScreenScene.resource_path)
	assert_true(screen_manager.gameplay_input_blocked)
	assert_true(retained_play.external_overlay_input_blocked)
	assert_true(screen_manager.debug_button.disabled)

	screen_manager.current_overlay.close_button.pressed.emit()
	await get_tree().process_frame

	assert_null(screen_manager.current_overlay)
	assert_eq(screen_manager.play_instance, retained_play)
	assert_false(screen_manager.gameplay_input_blocked)
	assert_false(retained_play.external_overlay_input_blocked)

func test_menu_switches_are_local_ui_placeholders() -> void:
	var menu = MenuScreenScene.instantiate()
	add_child_autofree(menu)
	await get_tree().process_frame

	assert_false(menu.music_toggle.button_pressed)
	assert_false(menu.sound_toggle.button_pressed)

	menu.music_toggle.button_pressed = true
	menu.sound_toggle.button_pressed = true

	assert_true(menu.music_toggle.button_pressed)
	assert_true(menu.sound_toggle.button_pressed)
	assert_false(menu.leave_pending)

	var restored = MenuScreenScene.instantiate()
	add_child_autofree(restored)
	await get_tree().process_frame

	assert_true(restored.music_toggle.button_pressed)
	assert_true(restored.sound_toggle.button_pressed)

func test_home_settings_and_account_navigation_returns_through_the_stack() -> void:
	screen_manager.show_home_screen()
	var home = screen_manager.current_overlay
	home.settings_requested.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/SettingsScreen.tscn"))
	screen_manager.current_overlay.account_requested.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/AccountScreen.tscn"))
	screen_manager.current_overlay.back_requested.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/SettingsScreen.tscn"))
	screen_manager.current_overlay.back_requested.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"))

func test_home_rankings_navigation_and_pinned_rank_layout_return_home() -> void:
	screen_manager.show_home_screen()
	var home = screen_manager.current_overlay
	home.rankings_requested.emit()
	await get_tree().process_frame

	var rankings = screen_manager.current_overlay
	assert_true(rankings.scene_file_path.ends_with("/RankingsScreen.tscn"))
	assert_gt(rankings.leaderboard_rows.get_child_count(), 8)
	assert_eq(rankings.leaderboard_rows.get_parent().get_parent(), rankings.leaderboard_scroll)
	assert_false(rankings.leaderboard_scroll.is_ancestor_of(rankings.your_rank_card))
	var scroll_bar := rankings.leaderboard_scroll.get_v_scroll_bar()
	assert_gt(scroll_bar.max_value, scroll_bar.page)
	var pinned_rank_y: float = rankings.your_rank_card.global_position.y
	rankings.leaderboard_scroll.scroll_vertical = 100
	await get_tree().process_frame
	assert_gt(rankings.leaderboard_scroll.scroll_vertical, 0)
	assert_eq(rankings.your_rank_card.global_position.y, pinned_rank_y)

	rankings.back_requested.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"))

func test_settings_sign_out_requires_confirmation_then_routes_to_sign_in() -> void:
	AuthManager.current_provider = "facebook"
	AuthManager.display_name = "Player Name"
	AuthManager.is_anonymous = false
	AuthManager.access_token_value = "access"
	AuthManager.refresh_token_value = "refresh"
	AuthManager.expires_at_unix = int(Time.get_unix_time_from_system()) + 3600
	screen_manager.show_settings_screen()
	var settings = screen_manager.current_overlay

	settings.sign_out_button.pressed.emit()
	assert_true(settings.confirm_modal.visible)
	assert_eq(screen_manager.current_overlay, settings)
	assert_eq(AuthManager.current_provider, "facebook")

	settings.confirm_modal.continue_button.pressed.emit()
	await get_tree().process_frame

	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/SignInScreen.tscn"))
	assert_eq(AuthManager.current_provider, "")
	assert_eq(AuthManager.display_name, "")

func test_leave_game_confirms_once_and_waits_for_authoritative_acknowledgement() -> void:
	screen_manager._enter_play_instance()
	await get_tree().process_frame
	screen_manager._on_play_instance_menu_requested()
	var menu = screen_manager.current_overlay
	var leave_requests: Array[bool] = []
	menu.leave_game_requested.connect(func(): leave_requests.append(true))

	menu.leave_button.pressed.emit()
	assert_true(menu.confirm_modal.visible)
	assert_eq(menu.confirm_modal.title_label.text, "Leave game")

	menu.confirm_modal.continue_button.pressed.emit()
	menu.set_leave_pending(true)
	menu._on_leave_confirmed()

	assert_eq(leave_requests.size(), 1)
	assert_eq(screen_manager.current_overlay, menu)
	assert_not_null(screen_manager.play_instance)
	assert_true(menu.leave_pending)

	screen_manager._on_game_left({"type": "game_left", "destination": "home"})
	await get_tree().process_frame

	assert_null(screen_manager.play_instance)
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"))
