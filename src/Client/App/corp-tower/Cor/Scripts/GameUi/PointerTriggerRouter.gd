extends RefCounted

const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")

var last_pointer_trigger_frame: int = -1
var guards: Array[Callable] = []
var triggers: Array = []

func add_guard(guard: Callable) -> void:
	guards.append(guard)

func add_trigger(get_rect: Callable, activate: Callable) -> void:
	triggers.append({"get_rect": get_rect, "activate": activate})

func process(event: InputEvent, frame: int) -> bool:
	if !PointerEventsScript.is_primary_press(event):
		return false

	if frame == last_pointer_trigger_frame:
		return false

	last_pointer_trigger_frame = frame

	return try_activate(PointerEventsScript.pointer_position(event))

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
