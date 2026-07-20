extends RefCounted

const POINTER_MOUSE := -1

static func is_primary_press(event: InputEvent) -> bool:
	if event is InputEventMouseButton:
		return event.pressed and event.button_index == MOUSE_BUTTON_LEFT

	if event is InputEventScreenTouch:
		return event.pressed

	return false

static func pointer_position(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return event.global_position

	return event.position

static func pointer_id(event: InputEvent) -> int:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		return event.index

	return POINTER_MOUSE
