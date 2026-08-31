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
