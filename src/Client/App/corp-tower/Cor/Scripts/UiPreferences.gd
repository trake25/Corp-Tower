class_name UiPreferences
extends RefCounted

const PREFERENCES_FILE := "user://corp_tower_ui_preferences.save"

var background_music_enabled := false
var sound_effects_enabled := false
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

func _save() -> void:
	var file := FileAccess.open(storage_path, FileAccess.WRITE)

	if file == null:
		return

	file.store_string(JSON.stringify({
		"background_music_enabled": background_music_enabled,
		"sound_effects_enabled": sound_effects_enabled
	}))

func _load() -> void:
	if not FileAccess.file_exists(storage_path):
		return

	var parsed = JSON.parse_string(FileAccess.get_file_as_string(storage_path))

	if typeof(parsed) != TYPE_DICTIONARY:
		return

	background_music_enabled = bool(parsed.get("background_music_enabled", false))
	sound_effects_enabled = bool(parsed.get("sound_effects_enabled", false))
