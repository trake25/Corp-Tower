class_name UiPreferences
extends RefCounted

const PREFERENCES_FILE := "user://corp_tower_ui_preferences.save"
const CONTROL_MODE_HOLD_TO_DRAG := "hold_to_drag"
const CONTROL_MODE_TAP_TO_DRAG := "tap_to_drag"
const CONTROL_MODE_TAP_TO_PLACE := "tap_to_place"
const MOBILE_WEB_USER_AGENT_QUERY := "typeof navigator !== 'undefined' && (navigator.userAgentData ? navigator.userAgentData.mobile === true : /Android|webOS|iPhone|iPad|iPod|IEMobile|Opera Mini/i.test(navigator.userAgent || ''))"

static var mobile_controls_runtime: Variant = null

var background_music_enabled := false
var sound_effects_enabled := false
var controls_mode := CONTROL_MODE_HOLD_TO_DRAG
var storage_path := PREFERENCES_FILE

func _init(path := PREFERENCES_FILE) -> void:
	storage_path = path
	_load()

func set_background_music_enabled(enabled: bool) -> void:
	background_music_enabled = enabled
	_save()

func set_sound_effects_enabled(enabled: bool) -> void:
	sound_effects_enabled = enabled
	_save()

static func is_mobile_controls_runtime() -> bool:
	if mobile_controls_runtime != null:
		return bool(mobile_controls_runtime)
	if OS.get_name() == "Android":
		mobile_controls_runtime = true
	elif OS.has_feature("web") and Engine.has_singleton(&"JavaScriptBridge"):
		var javascript_bridge = Engine.get_singleton(&"JavaScriptBridge")
		mobile_controls_runtime = bool(
			javascript_bridge.call("eval", MOBILE_WEB_USER_AGENT_QUERY, true)
		) if javascript_bridge != null else false
	else:
		mobile_controls_runtime = false
	return bool(mobile_controls_runtime)

static func available_control_modes() -> Array[String]:
	return [
		CONTROL_MODE_HOLD_TO_DRAG,
		CONTROL_MODE_TAP_TO_PLACE if is_mobile_controls_runtime() else CONTROL_MODE_TAP_TO_DRAG
	]

static func control_mode_label(mode: String) -> String:
	match mode:
		CONTROL_MODE_TAP_TO_DRAG:
			return "Tap to Drag"
		CONTROL_MODE_TAP_TO_PLACE:
			return "Tap to Place"
		_:
			return "Hold to Drag"

func get_controls_mode() -> String:
	return _validated_controls_mode(controls_mode)

func set_controls_mode(mode: String) -> void:
	var validated_mode := _validated_controls_mode(mode)

	if controls_mode == validated_mode:
		return

	controls_mode = validated_mode
	_save()

func reload() -> void:
	background_music_enabled = false
	sound_effects_enabled = false
	controls_mode = CONTROL_MODE_HOLD_TO_DRAG
	_load()

func _validated_controls_mode(mode: String) -> String:
	return mode if mode in available_control_modes() else CONTROL_MODE_HOLD_TO_DRAG

func _save() -> void:
	var file := FileAccess.open(storage_path, FileAccess.WRITE)

	if file == null:
		return

	file.store_string(JSON.stringify({
		"background_music_enabled": background_music_enabled,
		"sound_effects_enabled": sound_effects_enabled,
		"controls_mode": controls_mode
	}))

func _load() -> void:
	if not FileAccess.file_exists(storage_path):
		return

	var parsed = JSON.parse_string(FileAccess.get_file_as_string(storage_path))

	if typeof(parsed) != TYPE_DICTIONARY:
		return

	background_music_enabled = bool(parsed.get("background_music_enabled", false))
	sound_effects_enabled = bool(parsed.get("sound_effects_enabled", false))
	controls_mode = _validated_controls_mode(str(parsed.get("controls_mode", CONTROL_MODE_HOLD_TO_DRAG)))
