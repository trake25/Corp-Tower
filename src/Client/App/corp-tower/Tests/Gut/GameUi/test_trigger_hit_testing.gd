extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func shared_popover() -> Control:
	return harness.find("TeamInventoryPopover") as Control

func test_mouse_press_on_quick_chat_trigger_opens_shared_popover() -> void:
	harness.main._input(HarnessScript.mouse_press(harness.center_of("QuickChatTrigger")))
	assert_true(shared_popover().visible, "A mouse press on the quick chat trigger should open the shared popover.")
	assert_eq(harness.main.shared_popover_mode, "quick_chat", "The shared popover should be in quick_chat mode.")

func test_repeat_mouse_press_on_same_trigger_toggles_closed() -> void:
	var press_position: Vector2 = harness.center_of("QuickChatTrigger")
	harness.main._input(HarnessScript.mouse_press(press_position))
	await get_tree().process_frame
	harness.main._input(HarnessScript.mouse_press(press_position))
	assert_false(shared_popover().visible, "A repeat press on the open popover's own trigger should toggle it closed.")

func test_switching_triggers_reuses_shared_popover_with_new_mode() -> void:
	harness.main._input(HarnessScript.mouse_press(harness.center_of("QuickChatTrigger")))
	await get_tree().process_frame
	harness.main._input(HarnessScript.mouse_press(harness.center_of("TeamInventoryButton")))
	assert_true(shared_popover().visible, "Switching triggers should keep the shared popover open in the new mode.")
	assert_eq(harness.main.shared_popover_mode, "team_inventory", "The shared popover should switch to team_inventory mode.")

func test_touch_then_emulated_mouse_same_frame_is_single_activation() -> void:
	var press_position: Vector2 = harness.center_of("QuickChatTrigger")
	harness.main._input(HarnessScript.touch_press(press_position))
	harness.main._input(HarnessScript.mouse_press(press_position))
	assert_true(shared_popover().visible, "Android delivers touch before the emulated mouse event; the pair must count as one activation, not an open-then-close toggle.")

func test_mouse_then_emulated_touch_same_frame_is_single_activation() -> void:
	var press_position: Vector2 = harness.center_of("QuickChatTrigger")
	harness.main._input(HarnessScript.mouse_press(press_position))
	harness.main._input(HarnessScript.touch_press(press_position))
	assert_true(shared_popover().visible, "Desktop delivers mouse before an emulated touch event; the pair must count as one activation.")

func test_touch_press_alone_opens_quest_popover() -> void:
	harness.main._input(HarnessScript.touch_press(harness.center_of("QuestChip")))
	var quest_popover: Control = harness.find("QuestPopover") as Control
	assert_true(quest_popover.visible, "A touch press on the quest chip should open the quest popover.")

func test_press_outside_all_triggers_opens_nothing() -> void:
	harness.main._input(HarnessScript.mouse_press(Vector2(206, 458)))
	assert_false(shared_popover().visible, "A press away from every trigger should not open the shared popover.")
	assert_false((harness.find("QuestPopover") as Control).visible, "A press away from every trigger should not open the quest popover.")

func test_trigger_ignored_while_debug_overlay_open() -> void:
	var debug_overlay: Control = harness.find("DebugOverlay") as Control
	debug_overlay.visible = true
	harness.main._input(HarnessScript.mouse_press(harness.center_of("QuickChatTrigger")))
	assert_false(shared_popover().visible, "Trigger taps must be ignored while the debug overlay is open.")

func test_trigger_ignored_while_level_summary_visible() -> void:
	var summary_overlay: Control = harness.find("LevelSummaryOverlay") as Control
	summary_overlay.visible = true
	harness.main._input(HarnessScript.mouse_press(harness.center_of("QuickChatTrigger")))
	assert_false(shared_popover().visible, "Trigger taps must be ignored while the level summary overlay is visible.")
