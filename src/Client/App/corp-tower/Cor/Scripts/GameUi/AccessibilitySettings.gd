extends RefCounted

const SETTINGS_FILE := "user://accessibility.cfg"
const SECTION := "accessibility"
const PARALLEL_PLACEMENT := "parallelPlacement"

signal changed

var server_defaults: Dictionary = {}
var overrides: Dictionary = {}

func _init() -> void:
	_load()

func _load() -> void:
	overrides = {}
	var config := ConfigFile.new()

	if config.load(SETTINGS_FILE) != OK:
		return

	if not config.has_section(SECTION):
		return

	for key in config.get_section_keys(SECTION):
		overrides[key] = bool(config.get_value(SECTION, key, false))

# The room broadcasts Game_Config.accessibility every tick; a player's own choice
# always wins over it, so the future options menu only has to write an override.
func apply_server_defaults(defaults: Dictionary) -> void:
	if defaults == server_defaults:
		return

	server_defaults = defaults.duplicate()
	changed.emit()

func is_enabled(key: String) -> bool:
	if overrides.has(key):
		return bool(overrides[key])

	return bool(server_defaults.get(key, false))

func has_override(key: String) -> bool:
	return overrides.has(key)

func set_override(key: String, value: bool) -> void:
	overrides[key] = value
	_save()
	changed.emit()

func clear_override(key: String) -> void:
	if !overrides.has(key):
		return

	overrides.erase(key)
	_save()
	changed.emit()

func toggle(key: String) -> bool:
	var value: bool = !is_enabled(key)
	set_override(key, value)

	return value

func _save() -> void:
	var config := ConfigFile.new()

	for key in overrides.keys():
		config.set_value(SECTION, key, bool(overrides[key]))

	config.save(SETTINGS_FILE)
