extends RefCounted

var guards: Array[Callable] = []
var triggers: Array = []

func add_guard(guard: Callable) -> void:
	guards.append(guard)

func add_trigger(get_rect: Callable, activate: Callable) -> void:
	triggers.append({"get_rect": get_rect, "activate": activate})

func process(event: InputEvent) -> bool:
	if not (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		return false

	return try_activate(event.global_position)

func try_activate(global_pos: Vector2) -> bool:
	for guard in guards:
		if bool(guard.call()):
			return false

	for trigger in triggers:
		var rect: Variant = trigger["get_rect"].call()

		if rect is Rect2 and (rect as Rect2).has_point(global_pos):
			trigger["activate"].call()
			return true

	return false
