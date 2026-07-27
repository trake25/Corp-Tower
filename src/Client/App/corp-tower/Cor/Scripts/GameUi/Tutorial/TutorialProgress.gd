extends RefCounted

const PROGRESS_FILE := "user://tutorial_progress.cfg"
const SECTION := "progress"

var _complete: Dictionary = {}

func _init() -> void:
	_load()

func _load() -> void:
	_complete = {}
	var config := ConfigFile.new()

	if config.load(PROGRESS_FILE) != OK:
		return

	if not config.has_section(SECTION):
		return

	for key in config.get_section_keys(SECTION):
		if bool(config.get_value(SECTION, key, false)):
			_complete[key] = true

func is_complete(lesson_id: StringName) -> bool:
	return bool(_complete.get(str(lesson_id), false))

func mark_complete(lesson_id: StringName) -> void:
	_complete[str(lesson_id)] = true
	_save()

func reset(lesson_id: StringName) -> void:
	_complete.erase(str(lesson_id))
	_save()

func reset_all() -> void:
	_complete = {}
	_save()

func completed_ids() -> Array:
	return _complete.keys()

func _save() -> void:
	var config := ConfigFile.new()
	for key in _complete.keys():
		config.set_value(SECTION, key, true)
	config.save(PROGRESS_FILE)
