extends GutTest

const SignInDebugOverlayScript = preload("res://Cor/Scripts/SignInDebugOverlay.gd")

var overlay

func before_each() -> void:
	overlay = SignInDebugOverlayScript.new()
	add_child(overlay)
	await get_tree().process_frame

func after_each() -> void:
	overlay.queue_free()

func test_sign_in_is_the_only_enabled_category() -> void:
	var dropdown := overlay.find_child("DebugCategoryDropdown", true, false) as OptionButton
	var sign_in_index := dropdown.item_count - 1

	assert_true(dropdown.is_item_disabled(0), "Gameplay categories must be disabled on Sign In.")
	assert_false(dropdown.is_item_disabled(sign_in_index), "Sign In must be selectable on Sign In.")
	assert_eq(dropdown.selected, sign_in_index, "Sign In must be the selected category.")

func test_native_google_toggle_matches_the_platform() -> void:
	var native_google_toggle := overlay.find_child("NativeGoogleToggle", true, false) as CheckButton

	assert_eq(
		native_google_toggle.disabled,
		OS.get_name() != "Android",
		"The native Google preference is only interactive on Android."
	)

func test_native_facebook_toggle_matches_the_platform() -> void:
	var native_facebook_toggle := overlay.find_child("NativeFacebookToggle", true, false) as CheckButton

	assert_eq(
		native_facebook_toggle.disabled,
		OS.get_name() != "Android",
		"The native Facebook preference is only interactive on Android."
	)
