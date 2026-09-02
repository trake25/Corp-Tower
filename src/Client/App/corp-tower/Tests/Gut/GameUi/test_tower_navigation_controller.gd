extends GutTest

const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func stability_fixture() -> Array:
	var blocks: Array = [{
		"block": {
			"id": "base-i",
			"shapeId": "I",
			"cells": [[0, 0], [0, 1], [0, 2], [0, 3]]
		},
		"originX": 3,
		"originY": 0,
		"towerState": "standing",
		"supportStability": 37
	}]
	for origin_y in [4, 6, 8, 10, 12, 14]:
		blocks.append({
			"block": {
				"id": "stack-o-%d" % origin_y,
				"shapeId": "O",
				"cells": [[0, 0], [1, 0], [0, 1], [1, 1]]
			},
			"originX": 3,
			"originY": origin_y,
			"towerState": "standing",
			"supportStability": 90
		})
	return blocks

func prepare_playing_tower() -> Control:
	var tower := harness.find("TowerStack") as Control
	harness.main.match_state.current_match_state = "playing"
	tower.set_tower(stability_fixture(), 16, 30)
	harness.main.tower_navigation.refresh()
	return tower

func pan_touch(tower: Control, relative_y: float, pointer_id: int = 1) -> void:
	var position: Vector2 = tower.get_global_rect().get_center()
	var press := InputEventScreenTouch.new()
	press.index = pointer_id
	press.position = position
	press.pressed = true
	harness.main.tower_navigation.handle_input(press)

	var drag := InputEventScreenDrag.new()
	drag.index = pointer_id
	drag.position = position + Vector2(0.0, relative_y)
	drag.relative = Vector2(0.0, relative_y)
	harness.main.tower_navigation.handle_input(drag)

	var release := InputEventScreenTouch.new()
	release.index = pointer_id
	release.position = drag.position
	release.pressed = false
	harness.main.tower_navigation.handle_input(release)

func dispatch_touch_pan(tower: Control, relative_y: float, pointer_id: int = 1) -> void:
	var position: Vector2 = tower.global_position + Vector2(tower.size.x * 0.5, 50.0)
	var press := InputEventScreenTouch.new()
	press.index = pointer_id
	press.position = position
	press.pressed = true
	harness.main.get_viewport().push_input(press, true)

	var drag := InputEventScreenDrag.new()
	drag.index = pointer_id
	drag.position = position + Vector2(0.0, relative_y)
	drag.relative = Vector2(0.0, relative_y)
	harness.main.get_viewport().push_input(drag, true)

	var release := InputEventScreenTouch.new()
	release.index = pointer_id
	release.position = drag.position
	release.pressed = false
	harness.main.get_viewport().push_input(release, true)

func dispatch_mouse_pan(tower: Control, relative_y: float) -> void:
	var position: Vector2 = tower.get_global_rect().get_center()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_LEFT
	press.position = position
	press.global_position = position
	press.pressed = true
	harness.main.get_viewport().push_input(press, true)

	var motion := InputEventMouseMotion.new()
	motion.position = position + Vector2(0.0, relative_y)
	motion.global_position = motion.position
	motion.relative = Vector2(0.0, relative_y)
	motion.button_mask = MOUSE_BUTTON_MASK_LEFT
	harness.main.get_viewport().push_input(motion, true)

	var release := InputEventMouseButton.new()
	release.button_index = MOUSE_BUTTON_LEFT
	release.position = motion.position
	release.global_position = motion.global_position
	release.pressed = false
	harness.main.get_viewport().push_input(release, true)

func test_playing_offscreen_critical_support_exposes_deliberate_navigation() -> void:
	var tower: Control = prepare_playing_tower()
	var trouble := harness.find("TroubleDownButton") as Button
	var back := harness.find("BackToTopButton") as Button

	assert_true(trouble.visible)
	assert_false(back.visible)
	trouble.pressed.emit()

	assert_true(tower.is_scroll_navigating())
	assert_false(trouble.visible)
	assert_true(back.visible)
	assert_eq(harness.main.tower_navigation.selected_block_id, "base-i")

func test_auto_follow_catching_up_does_not_expose_top_navigation() -> void:
	var tower: Control = prepare_playing_tower()
	var back := harness.find("BackToTopButton") as Button
	tower.scroll_state.displayed_offset_units = 0.0
	tower.scroll_state.normal_target_units = 5.0
	harness.main.tower_navigation.refresh()

	assert_false(back.visible)

func test_touch_pan_moves_only_below_auto_framing_and_holds_until_top() -> void:
	var tower: Control = prepare_playing_tower()
	var normal_target: float = tower.scroll_state.normal_target_units
	pan_touch(tower, -tower.brick_unit_size * 1.5)

	assert_almost_eq(tower.scroll_state.displayed_offset_units, normal_target - 1.5, 0.001)
	assert_true(tower.is_scroll_manually_displaced())
	var held_offset: float = tower.scroll_state.displayed_offset_units
	tower._process(1.0)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, held_offset, 0.001)

	var grown_blocks: Array = stability_fixture()
	grown_blocks.append({
		"block": {"id": "growth", "shapeId": "O", "cells": [[0, 0], [1, 0], [0, 1], [1, 1]]},
		"originX": 3,
		"originY": 16,
		"towerState": "standing",
		"supportStability": 90
	})
	tower.set_tower(grown_blocks, 18, 30)
	assert_gt(tower.scroll_state.normal_target_units, normal_target)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, held_offset, 0.001)

	pan_touch(tower, tower.brick_unit_size * 100.0)
	assert_almost_eq(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units,
		0.001
	)
	pan_touch(tower, tower.brick_unit_size)
	assert_lte(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units
	)

	(harness.find("BackToTopButton") as Button).pressed.emit()
	tower._process(0.01)
	assert_false(tower.is_scroll_manually_displaced())

func test_tower_drop_zone_gui_dispatch_routes_touch_and_mouse_pan_without_unhandled_input() -> void:
	var tower: Control = prepare_playing_tower()
	var tower_drop_zone := harness.find("TowerDropZone") as Control
	var received_events: Array = []
	tower_drop_zone.gui_input.connect(func(event: InputEvent): received_events.append(event))
	harness.main.tower_navigation.set_process_unhandled_input(false)
	var normal_target: float = tower.scroll_state.normal_target_units

	assert_eq(tower_drop_zone.mouse_filter, Control.MOUSE_FILTER_PASS)
	dispatch_touch_pan(tower, -tower.brick_unit_size)
	assert_gt(received_events.filter(func(event): return event is InputEventScreenTouch).size(), 0)
	assert_gt(received_events.filter(func(event): return event is InputEventScreenDrag).size(), 0)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, normal_target - 1.0, 0.001)

	dispatch_mouse_pan(tower, -tower.brick_unit_size)
	assert_gt(received_events.filter(func(event): return event is InputEventMouseButton).size(), 0)
	assert_gt(received_events.filter(func(event): return event is InputEventMouseMotion).size(), 0)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, normal_target - 2.0, 0.001)

func test_manual_pan_respects_placement_overlay_and_presentation_blockers() -> void:
	var tower: Control = prepare_playing_tower()
	var original_offset: float = tower.scroll_state.displayed_offset_units

	harness.main.inventory.is_block_dragging = true
	pan_touch(tower, -tower.brick_unit_size)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, original_offset, 0.001)

	harness.main.inventory.is_block_dragging = false
	harness.main.inventory.is_armed = true
	pan_touch(tower, -tower.brick_unit_size)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, original_offset, 0.001)

	harness.main.inventory.is_armed = false
	harness.main.debug_panel.set_open(true)
	pan_touch(tower, -tower.brick_unit_size)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, original_offset, 0.001)

	harness.main.debug_panel.set_open(false)
	tower._collapse_phase = tower.COLLAPSE_LEAN
	pan_touch(tower, -tower.brick_unit_size)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, original_offset, 0.001)

func test_drag_and_armed_placement_disable_both_navigation_actions() -> void:
	var tower: Control = prepare_playing_tower()
	var trouble := harness.find("TroubleDownButton") as Button
	harness.main.inventory.is_block_dragging = true
	harness.main.tower_navigation.refresh()

	assert_true(trouble.visible)
	assert_true(trouble.disabled)
	trouble.pressed.emit()
	assert_false(tower.is_scroll_displaced())

	harness.main.inventory.is_block_dragging = false
	harness.main.inventory.is_armed = true
	harness.main.tower_navigation.refresh()
	assert_true(trouble.disabled)

func test_leaving_play_resets_the_manual_view_and_hides_controls() -> void:
	var tower: Control = prepare_playing_tower()
	var trouble := harness.find("TroubleDownButton") as Button
	trouble.pressed.emit()
	tower._process(0.1)
	assert_true(tower.is_scroll_displaced())

	harness.main.match_state.current_match_state = "finished"
	harness.main.tower_navigation.refresh()

	assert_false((harness.find("TroubleDownButton") as Button).visible)
	assert_false((harness.find("BackToTopButton") as Button).visible)
	assert_false(tower.is_scroll_displaced())

func test_overlay_presentation_hides_navigation_without_moving_the_camera() -> void:
	var tower: Control = prepare_playing_tower()
	var original_offset: float = tower.scroll_state.displayed_offset_units
	harness.main.debug_panel.set_open(true)
	harness.main.tower_navigation.refresh()

	assert_false((harness.find("TroubleDownButton") as Button).visible)
	assert_false((harness.find("BackToTopButton") as Button).visible)
	assert_eq(tower.scroll_state.displayed_offset_units, original_offset)

func test_navigation_controls_are_touch_sized_and_clear_of_action_hud() -> void:
	var trouble := harness.find("TroubleDownButton") as Button
	var trouble_rect: Rect2 = trouble.get_global_rect()

	assert_gte(trouble_rect.size.x, 48.0)
	assert_gte(trouble_rect.size.y, 48.0)
	for node_name in [
		"ActionRow",
		"TeamInventoryPanel",
		"QuickChatTrigger",
		"PowerTrigger",
		"QuestChip",
		"PlayerRailBox",
		"ImpactTrack"
	]:
		var control := harness.find(node_name) as Control
		assert_false(
			trouble_rect.intersects(control.get_global_rect()),
			"Navigation must not overlap %s." % node_name
		)
