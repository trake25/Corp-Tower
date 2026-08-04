extends RefCounted

const POINTER_MOUSE := -1
const DEVICE_ID_EMULATION := -1

static var touch_mode: bool = false

static func pointer_position(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return event.global_position

	return event.position

static func pointer_id(event: InputEvent) -> int:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		return event.index

	return POINTER_MOUSE

# Godot mirrors every touch into a matching mouse event
# (input_devices/pointing/emulate_mouse_from_touch, on by default), so the event
# stream alone cannot answer "does this player have a pointer?". The emulated
# partner carries device -1, which is what separates a real mouse from a thumb;
# a real touch latches touch mode until a real mouse event arrives, so a hybrid
# device follows whichever input the player actually used last.
static func is_emulated(event: InputEvent) -> bool:
	return event.device == DEVICE_ID_EMULATION

static func note_event(event: InputEvent) -> void:
	if is_emulated(event):
		return

	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		touch_mode = true
	elif event is InputEventMouseButton or event is InputEventMouseMotion:
		touch_mode = false

static func is_touch_mode() -> bool:
	return touch_mode

static func has_mouse() -> bool:
	return !touch_mode and DisplayServer.has_feature(DisplayServer.FEATURE_MOUSE)
