extends GutTest

const RouterScript = preload("res://Cor/Scripts/GameUi/PointerTriggerRouter.gd")
const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")
const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const TRIGGER_RECT := Rect2(100, 100, 40, 40)

var router
var activations: Array = []

func before_each() -> void:
	router = RouterScript.new()
	activations = []

func add_named_trigger(trigger_name: String, rect: Rect2) -> void:
	router.add_trigger(func(): return rect, func(): activations.append(trigger_name))

func test_mouse_press_inside_trigger_rect_activates_and_consumes() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	var handled: bool = router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	assert_true(handled, "A mouse press inside a trigger rect should be consumed.")
	assert_eq(activations, ["chat"], "The trigger inside the pressed rect should activate.")

func test_mouse_press_outside_every_rect_is_not_consumed() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	var handled: bool = router.process(HarnessScript.mouse_press(Vector2(10, 10)))
	assert_false(handled, "A miss should not be consumed so gameplay input continues.")
	assert_eq(activations.size(), 0, "A miss should activate nothing.")

func test_touch_events_are_ignored_so_emulation_cannot_double_fire() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	var handled: bool = router.process(HarnessScript.touch_press(TRIGGER_RECT.get_center()))
	assert_false(handled, "The router must ignore touch events; the platform's emulated mouse event is the single activation path, so a touch plus its emulated mouse can never toggle a popover open then closed.")
	assert_eq(activations.size(), 0, "A raw touch event must not activate a trigger.")

func test_each_mouse_press_activates_once() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	assert_eq(activations, ["chat", "chat"], "Each physical tap yields one mouse press and one activation.")

func test_guard_blocks_activation() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	router.add_guard(func(): return true)
	var handled: bool = router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	assert_false(handled, "An active guard should block trigger activation.")
	assert_eq(activations.size(), 0, "An active guard should keep every trigger inert.")

func test_first_registered_trigger_wins_on_overlap() -> void:
	add_named_trigger("first", TRIGGER_RECT)
	add_named_trigger("second", TRIGGER_RECT)
	router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	assert_eq(activations, ["first"], "Overlapping trigger rects should resolve in registration order.")

func test_null_rect_trigger_is_skipped() -> void:
	router.add_trigger(func(): return null, func(): activations.append("ghost"))
	add_named_trigger("chat", TRIGGER_RECT)
	router.process(HarnessScript.mouse_press(TRIGGER_RECT.get_center()))
	assert_eq(activations, ["chat"], "A trigger whose rect is unavailable should be skipped.")

func test_non_press_events_are_ignored() -> void:
	add_named_trigger("chat", TRIGGER_RECT)
	var motion := InputEventMouseMotion.new()
	motion.global_position = TRIGGER_RECT.get_center()
	assert_false(router.process(motion), "Motion events should never activate triggers.")
	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.pressed = false
	release.global_position = TRIGGER_RECT.get_center()
	assert_false(router.process(release), "Release events should never activate triggers.")

func test_pointer_events_normalize_position_and_id() -> void:
	var touch := HarnessScript.touch_press(Vector2(5, 6), 3)
	assert_eq(PointerEventsScript.pointer_position(touch), Vector2(5, 6), "Touch events should expose their position.")
	assert_eq(PointerEventsScript.pointer_id(touch), 3, "Touch events should expose their finger index.")
	var mouse := HarnessScript.mouse_press(Vector2(7, 8))
	assert_eq(PointerEventsScript.pointer_position(mouse), Vector2(7, 8), "Mouse events should expose their global position.")
	assert_eq(PointerEventsScript.pointer_id(mouse), PointerEventsScript.POINTER_MOUSE, "Mouse events should use the mouse pointer id.")
