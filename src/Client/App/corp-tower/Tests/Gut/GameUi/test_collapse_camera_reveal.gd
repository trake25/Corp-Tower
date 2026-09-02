extends GutTest

const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const INVENTORY_BLOCK := {
	"id": "inventory-o",
	"shapeId": "O",
	"cells": [[0, 0], [1, 0], [0, 1], [1, 1]],
	"height": 2
}

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func stacked_tower() -> Array:
	var blocks: Array = []
	for origin_y in range(0, 16, 2):
		blocks.append({
			"block": {
				"id": "stack-%d" % origin_y,
				"shapeId": "O",
				"cells": [[0, 0], [1, 0], [0, 1], [1, 1]]
			},
			"originX": 3,
			"originY": origin_y,
			"towerState": "standing",
			"supportStability": 90
		})
	return blocks

func collapsed_tower() -> Array:
	var blocks: Array = stacked_tower()
	for index in range(1, blocks.size()):
		blocks[index]["towerState"] = "fallen"
	return blocks

func begin_elevated_collapse():
	var tower := harness.find("TowerStack") as Control
	tower.set_tower(stacked_tower(), 16, 30)
	tower.set_tower(collapsed_tower(), 2, 30)
	return tower

func expire_collapse(tower: Control) -> void:
	tower._collapse_elapsed = tower._collapse_debris_lifetime_seconds()
	tower._process(0.0)

func test_elevated_collapse_hides_the_grouped_world_until_normal_framing() -> void:
	var tower: Control = begin_elevated_collapse()
	var placement_world := harness.find("PlacementWorldFrame") as Control
	var platform := harness.find("PlatformArt") as Control
	var emitted_pixels: Array = []
	tower.scroll_offset_changed.connect(func(pixels: float): emitted_pixels.append(pixels))
	var collapse_offset: float = tower.scroll_state.displayed_offset_units

	tower._process(0.05)
	assert_true(tower.scroll_state.frozen)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, collapse_offset, 0.001)
	assert_true(placement_world.visible)

	expire_collapse(tower)
	assert_true(tower.is_placement_world_hidden())
	assert_false(placement_world.visible)
	assert_true(tower.is_navigation_blocked_by_presentation())
	assert_almost_eq(tower.scroll_state.displayed_offset_units, collapse_offset, 0.001)

	tower._process(0.1)
	assert_true(tower.is_placement_world_hidden())
	assert_false(placement_world.visible)
	assert_between(tower.scroll_state.displayed_offset_units, 0.001, collapse_offset - 0.001)
	assert_eq(emitted_pixels.size(), 1)
	assert_almost_eq(platform.target_offset, float(emitted_pixels[-1]), 0.001)

	tower._process(1.0)
	assert_false(tower.is_placement_world_hidden())
	assert_true(placement_world.visible)
	assert_false(tower.is_navigation_blocked_by_presentation())
	assert_almost_eq(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units,
		0.001
	)
	assert_almost_eq(platform.target_offset, 0.0, 0.001)

func test_hidden_return_cancels_and_blocks_placement_input() -> void:
	var tower: Control = begin_elevated_collapse()
	harness.main.match_state.tutorial_mode = true
	harness.main.inventory.update_inventory_ui([INVENTORY_BLOCK], 3)
	harness.main.inventory.is_block_dragging = true
	assert_true(harness.main.inventory.can_place_block(0))

	expire_collapse(tower)
	assert_false(harness.main.inventory.is_block_dragging)
	assert_false(harness.main.inventory.can_place_block(0))

func test_collapse_at_normal_framing_does_not_create_a_hidden_interval() -> void:
	var tower := harness.find("TowerStack") as Control
	var placement_world := harness.find("PlacementWorldFrame") as Control
	var visibility_changes: Array = []
	tower.placement_world_visibility_changed.connect(
		func(visible: bool): visibility_changes.append(visible)
	)
	var short_tower: Array = stacked_tower().slice(0, 2)
	var short_collapse: Array = short_tower.duplicate(true)
	short_collapse[1]["towerState"] = "fallen"
	tower.set_tower(short_tower, 4, 30)
	tower.set_tower(short_collapse, 2, 30)

	expire_collapse(tower)
	assert_false(tower.is_placement_world_hidden())
	assert_true(placement_world.visible)
	assert_false(visibility_changes.has(false))

func test_reset_and_snapshot_cleanup_cannot_strand_the_world_hidden() -> void:
	var tower: Control = begin_elevated_collapse()
	var placement_world := harness.find("PlacementWorldFrame") as Control
	expire_collapse(tower)
	assert_false(placement_world.visible)

	tower.clear_tower()
	assert_false(tower.is_placement_world_hidden())
	assert_true(placement_world.visible)

	tower = begin_elevated_collapse()
	expire_collapse(tower)
	assert_false(placement_world.visible)
	harness.main.update_game_state({
		"snapshot": true,
		"state": "playing",
		"currentHeight": 2,
		"targetHeight": 30,
		"level": harness.main.match_state.current_level,
		"players": [],
		"towerBlocks": collapsed_tower()
	})
	assert_false(tower.is_placement_world_hidden())
	assert_true(placement_world.visible)
