extends RefCounted

const POINTER_MOUSE := -1

static func pointer_position(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return event.global_position

	return event.position

static func pointer_id(event: InputEvent) -> int:
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		return event.index

	return POINTER_MOUSE
