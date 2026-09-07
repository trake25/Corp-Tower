extends GutTest

const SettingsScreenScene = preload("res://Cor/Scenes/SettingsScreen.tscn")
const AccountScreenScene = preload("res://Cor/Scenes/AccountScreen.tscn")
const AccountScreenScript = preload("res://Cor/Scripts/AccountScreen.gd")
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

func test_account_screen_exposes_configured_guest_link_controls_and_emits_requests() -> void:
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame
	account._apply_provider_availability(true)
	account.apply_account_state(false, "", "")

	assert_true(account.guest_content.visible)
	assert_false(account.linked_content.visible)
	assert_eq(account.available_providers(true), ["google", "facebook"])
	assert_false(account.tiktok_button.visible)

	var requests: Array[String] = []
	account.provider_link_requested.connect(func(provider): requests.append(provider))
	account.google_button.pressed.emit()
	account.facebook_button.pressed.emit()
	assert_eq(requests, ["google", "facebook"])

func test_account_screen_uses_provider_identity_without_using_the_profile_name() -> void:
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame

	account.apply_account_state(true, "google", "Ada Provider", "enriqueta@gmail.com")
	assert_false(account.guest_content.visible)
	assert_true(account.linked_content.visible)
	assert_eq(account.provider_identity_label.text, "Ada Provider")
	assert_eq(account.google_email_label.text, "enri•••@gmail.com")
	assert_true(account.google_email_label.visible)
	assert_eq(account.provider_label.text, "You are signed in with Google.")

	account.apply_account_state(true, "facebook", "Profile Name Must Not Appear", "secret@example.com")
	assert_eq(account.provider_identity_label.text, "Facebook account")
	assert_false(account.google_email_label.visible)

func test_account_screen_masks_google_email_without_exposing_short_or_malformed_values() -> void:
	assert_eq(AccountScreenScript.mask_google_email("enriqueta@gmail.com"), "enri•••@gmail.com")
	assert_eq(AccountScreenScript.mask_google_email("abcd@gmail.com"), "")
	assert_eq(AccountScreenScript.mask_google_email("not-an-email"), "")
	assert_eq(AccountScreenScript.mask_google_email("alice@localhost"), "")
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame
	account.apply_account_state(true, "google", "", "abcd@gmail.com")
	assert_eq(account.provider_identity_label.text, "Google account")
	assert_false(account.google_email_label.visible)

func test_account_busy_and_conflict_feedback_restore_link_controls() -> void:
	var account = AccountScreenScene.instantiate()
	add_child_autofree(account)
	await get_tree().process_frame
	account._apply_provider_availability(true)
	account.set_busy(true)
	assert_true(account.google_button.disabled)
	assert_true(account.facebook_button.disabled)
	account.set_busy(false)
	assert_false(account.google_button.disabled)
	assert_false(account.facebook_button.disabled)
	account.show_error("identity_conflict")
	assert_eq(
		account.error_label.text,
		"This account is already linked. Sign out and sign in with it instead."
	)
	assert_true(account.error_label.visible)
