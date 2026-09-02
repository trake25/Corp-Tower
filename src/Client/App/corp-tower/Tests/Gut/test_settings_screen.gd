extends GutTest

const SettingsScreenScene = preload("res://Cor/Scenes/SettingsScreen.tscn")
const AccountScreenScene = preload("res://Cor/Scenes/AccountScreen.tscn")
const UiPreferencesScript = preload("res://Cor/Scripts/UiPreferences.gd")
const TEST_PREFERENCES_FILE := "user://corp_tower_ui_preferences_test.save"

func before_each() -> void:
	if FileAccess.file_exists(TEST_PREFERENCES_FILE):
		DirAccess.remove_absolute(TEST_PREFERENCES_FILE)

func after_each() -> void:
	if FileAccess.file_exists(TEST_PREFERENCES_FILE):
		DirAccess.remove_absolute(TEST_PREFERENCES_FILE)

func test_ui_preferences_persist_both_presentation_switches() -> void:
	var preferences = UiPreferencesScript.new(TEST_PREFERENCES_FILE)
	preferences.set_background_music_enabled(true)
	preferences.set_sound_effects_enabled(true)
	var restored = UiPreferencesScript.new(TEST_PREFERENCES_FILE)

	assert_true(restored.background_music_enabled)
	assert_true(restored.sound_effects_enabled)

func test_ui_preferences_have_no_audio_side_effect_dependency() -> void:
	var source := FileAccess.get_file_as_string("res://Cor/Scripts/UiPreferences.gd")
	assert_false(source.contains("AudioServer"))

func test_settings_account_row_switches_between_guest_and_linked_presentation() -> void:
	var settings = SettingsScreenScene.instantiate()
	add_child_autofree(settings)
	await get_tree().process_frame

	settings.apply_account_state(false, "")
	assert_eq(settings.account_status_label.text, "Not linked")
	assert_true(settings.account_icon.texture.resource_path.ends_with("/ic-colored-user.png"))

	settings.apply_account_state(true, "facebook")
	assert_eq(settings.account_status_label.text, "Signed in with Facebook")
	assert_true(settings.account_icon.texture.resource_path.ends_with("/avatar-placeholder.png"))

func test_account_screen_exposes_only_placeholder_link_controls_for_guests() -> void:
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame
	account.apply_account_state(false, "", "")

	assert_true(account.guest_content.visible)
	assert_false(account.linked_content.visible)
	assert_true(account.facebook_button.visible)
	assert_true(account.google_button.visible)
	assert_false(account.tiktok_button.visible)
	assert_true(account.facebook_button.pressed.get_connections().is_empty())
	assert_true(account.google_button.pressed.get_connections().is_empty())

func test_account_screen_uses_linked_name_and_fallbacks() -> void:
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame

	account.apply_account_state(true, "google", "Ada Player")
	assert_false(account.guest_content.visible)
	assert_true(account.linked_content.visible)
	assert_eq(account.profile_name_label.text, "Ada Player")
	assert_eq(account.provider_label.text, "You are signed in with Google.")

	account.apply_account_state(true, "", "")
	assert_eq(account.profile_name_label.text, "Player")
	assert_eq(account.provider_label.text, "Your account is linked.")
