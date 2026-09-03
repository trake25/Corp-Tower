extends GutTest

const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const TowerStackScript := preload("res://Cor/Scripts/TowerStack.gd")

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

func stacked_tower(block_count: int = 8) -> Array:
	var blocks: Array = []
	for index in range(block_count):
		var origin_y: int = index * 2
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

func collapsed_tower(block_count: int = 8, surviving_count: int = 1) -> Array:
	var blocks: Array = stacked_tower(block_count)
	for index in range(surviving_count, blocks.size()):
		blocks[index]["towerState"] = "fallen"
	return blocks

func begin_elevated_collapse(variant: int = TowerStackScript.COLLAPSE_VARIANT_HOLD_THEN_RECOVER):
	var tower := harness.find("TowerStack") as Control
	tower.clear_tower()
	tower.set_tower(stacked_tower(), 16, 30)
	tower.set_tower(collapsed_tower(), 2, 30)
	tower._collapse_variant = variant
	return tower

func begin_fall(tower: Control) -> void:
	tower._begin_collapse()
	assert_not_null(tower._collapse_sim)
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_FALL)

func settle_fall(tower: Control) -> void:
	tower._collapse_sim.settled = true
	tower._process(0.0)

func finish_recovery(tower: Control) -> void:
	var completion_delta: float = (
		absf(tower.scroll_state.displayed_offset_units - tower.scroll_state.normal_target_units)
		/ tower.collapse_return_pan_speed_units
		+ 0.01
	)
	tower._process(completion_delta)

func prepare_placement() -> void:
	harness.main.match_state.tutorial_mode = true
	harness.main.inventory.update_inventory_ui([INVENTORY_BLOCK], 3)

func test_collapse_start_cancels_active_drag_once_and_blocks_lean() -> void:
	var tower := harness.find("TowerStack") as Control
	tower.clear_tower()
	tower.set_tower(stacked_tower(), 16, 30)
	prepare_placement()
	harness.main.inventory.is_block_dragging = true
	var collapse_starts: Array = []
	tower.collapse_presentation_started.connect(func(): collapse_starts.append(true))

	tower.set_tower(collapsed_tower(), 2, 30)
	assert_eq(collapse_starts.size(), 1)
	assert_false(harness.main.inventory.is_block_dragging)
	assert_true(tower.is_collapse_input_blocked())
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_LEAN)
	assert_false(harness.main.inventory.can_place_block(0))

	harness.main.inventory.is_block_dragging = true
	tower.set_tower(collapsed_tower(), 2, 30, 0, {"collapsed": true})
	assert_eq(collapse_starts.size(), 1)
	assert_true(harness.main.inventory.is_block_dragging)
	assert_false(harness.main.inventory.can_place_block(0))
	harness.main.inventory.cancel_block_drag()

func test_hold_then_recover_keeps_camera_fixed_until_settlement_then_lingers() -> void:
	var tower: Control = begin_elevated_collapse()
	var placement_world := harness.find("PlacementWorldFrame") as Control
	var platform := harness.find("PlatformArt") as Control
	var emitted_pixels: Array = []
	tower.scroll_offset_changed.connect(func(pixels: float): emitted_pixels.append(pixels))
	var collapse_offset: float = tower.scroll_state.displayed_offset_units

	begin_fall(tower)
	var initial_piece_position: Vector2 = tower._collapse_sim.pieces[0].pos
	tower._process(0.05)
	assert_true(tower.scroll_state.frozen)
	assert_false(tower.is_collapse_recovery_active())
	assert_almost_eq(tower.scroll_state.displayed_offset_units, collapse_offset, 0.001)
	assert_ne(tower._collapse_sim.pieces[0].pos, initial_piece_position)
	assert_true(placement_world.visible)

	settle_fall(tower)
	assert_true(tower.is_collapse_recovery_active())
	assert_false(tower.scroll_state.frozen)
	assert_true(tower.is_navigation_blocked_by_presentation())
	assert_false(tower._collapse_debris_linger_active)

	var recovery_distance: float = collapse_offset - tower.scroll_state.normal_target_units
	tower._process(recovery_distance / tower.collapse_return_pan_speed_units * 0.5)
	assert_true(tower.is_collapse_recovery_active())
	assert_between(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units + 0.001,
		collapse_offset - 0.001
	)
	assert_eq(emitted_pixels.size(), 1)
	assert_almost_eq(platform.target_offset, float(emitted_pixels[-1]), 0.001)
	assert_false(tower._collapse_debris_linger_active)

	finish_recovery(tower)
	assert_false(tower.is_collapse_recovery_active())
	assert_false(tower.is_navigation_blocked_by_presentation())
	assert_true(tower._collapse_debris_linger_active)
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_NONE)
	assert_not_null(tower._collapse_sim)
	assert_almost_eq(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units,
		0.001
	)
	assert_almost_eq(platform.target_offset, 0.0, 0.001)

	var linger_seconds: float = tower._collapse_debris_linger_seconds()
	tower._process(linger_seconds * 0.5)
	assert_true(tower._collapse_debris_linger_active)
	assert_not_null(tower._collapse_sim)
	assert_false(tower.is_navigation_blocked_by_presentation())

func test_fall_follow_moves_camera_and_debris_concurrently() -> void:
	var tower: Control = begin_elevated_collapse(TowerStackScript.COLLAPSE_VARIANT_FALL_FOLLOW)
	var collapse_offset: float = tower.scroll_state.displayed_offset_units

	begin_fall(tower)
	assert_true(tower.is_collapse_recovery_active())
	assert_false(tower.scroll_state.frozen)
	assert_lt(tower.scroll_state.normal_target_units, collapse_offset)
	var initial_piece_position: Vector2 = tower._collapse_sim.pieces[0].pos

	tower._process(0.05)
	assert_lt(tower.scroll_state.displayed_offset_units, collapse_offset)
	assert_ne(tower._collapse_sim.pieces[0].pos, initial_piece_position)
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_FALL)
	assert_true(tower.is_navigation_blocked_by_presentation())

func test_fall_follow_camera_completion_waits_for_settlement() -> void:
	var tower: Control = begin_elevated_collapse(TowerStackScript.COLLAPSE_VARIANT_FALL_FOLLOW)
	prepare_placement()
	assert_false(harness.main.inventory.can_place_block(0))
	begin_fall(tower)

	tower.scroll_state.snap_to_normal()
	tower._process(0.0)
	assert_false(tower.is_collapse_recovery_active())
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_FALL)
	assert_true(tower.is_navigation_blocked_by_presentation())
	assert_false(tower._collapse_debris_linger_active)
	assert_not_null(tower._collapse_sim)
	assert_false(harness.main.inventory.can_place_block(0))

	settle_fall(tower)
	assert_true(tower._collapse_debris_linger_active)
	assert_false(tower.is_navigation_blocked_by_presentation())
	assert_not_null(tower._collapse_sim)
	assert_true(harness.main.inventory.can_place_block(0))

func test_fall_follow_settlement_waits_for_camera_completion() -> void:
	var tower: Control = begin_elevated_collapse(TowerStackScript.COLLAPSE_VARIANT_FALL_FOLLOW)
	prepare_placement()
	begin_fall(tower)
	settle_fall(tower)

	assert_true(tower.is_collapse_recovery_active())
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_SETTLED)
	assert_true(tower.is_navigation_blocked_by_presentation())
	assert_false(tower._collapse_debris_linger_active)
	assert_false(harness.main.inventory.can_place_block(0))

	finish_recovery(tower)
	assert_false(tower.is_collapse_recovery_active())
	assert_false(tower.is_navigation_blocked_by_presentation())
	assert_true(tower._collapse_debris_linger_active)
	assert_not_null(tower._collapse_sim)
	assert_true(harness.main.inventory.can_place_block(0))

func test_tall_survivor_recovery_stops_at_normal_elevated_framing() -> void:
	var tower := harness.find("TowerStack") as Control
	var standing: Array = stacked_tower(16)
	var fallen: Array = collapsed_tower(16, 14)
	tower.set_tower(standing, 32, 40)
	tower.set_tower(fallen, 28, 40)
	tower._collapse_variant = TowerStackScript.COLLAPSE_VARIANT_HOLD_THEN_RECOVER
	begin_fall(tower)
	settle_fall(tower)

	assert_gt(tower.scroll_state.normal_target_units, 0.0)
	finish_recovery(tower)
	assert_almost_eq(
		tower.scroll_state.displayed_offset_units,
		tower.scroll_state.normal_target_units,
		0.001
	)
	assert_true(tower._collapse_debris_linger_active)
	assert_false(tower.is_navigation_blocked_by_presentation())

func test_hold_then_recover_blocks_placement_until_linger() -> void:
	var tower: Control = begin_elevated_collapse()
	prepare_placement()
	assert_false(harness.main.inventory.can_place_block(0))

	begin_fall(tower)
	assert_false(tower.is_collapse_recovery_active())
	assert_false(harness.main.inventory.can_place_block(0))
	settle_fall(tower)
	assert_true(tower.is_collapse_recovery_active())
	assert_false(harness.main.inventory.can_place_block(0))

	finish_recovery(tower)
	assert_true(tower._collapse_debris_linger_active)
	assert_true(harness.main.inventory.can_place_block(0))

func test_variation_is_deterministic_supports_both_branches_and_does_not_reroll() -> void:
	var tower: Control = begin_elevated_collapse()
	var variants: Dictionary = {}
	for index in range(32):
		var key: String = "controlled-collapse-%d" % index
		var first: int = tower._collapse_variant_for_key(key)
		var second: int = tower._collapse_variant_for_key(key)
		assert_eq(first, second)
		variants[first] = true
	assert_true(variants.has(TowerStackScript.COLLAPSE_VARIANT_HOLD_THEN_RECOVER))
	assert_true(variants.has(TowerStackScript.COLLAPSE_VARIANT_FALL_FOLLOW))

	var chosen_variant: int = tower._collapse_variant
	tower.set_tower(collapsed_tower(), 2, 30, 0, {"collapsed": true})
	assert_eq(tower._collapse_variant, chosen_variant)
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_LEAN)

func test_reset_snapshot_and_new_collapse_retire_lingering_debris() -> void:
	var tower: Control = begin_elevated_collapse()
	begin_fall(tower)
	settle_fall(tower)
	finish_recovery(tower)
	assert_true(tower._collapse_debris_linger_active)

	tower.reset_collapse_presentation()
	assert_false(tower._collapse_debris_linger_active)
	assert_null(tower._collapse_sim)
	assert_false(tower.is_navigation_blocked_by_presentation())

	tower = begin_elevated_collapse()
	begin_fall(tower)
	settle_fall(tower)
	finish_recovery(tower)
	harness.main.update_game_state({
		"snapshot": true,
		"state": "playing",
		"currentHeight": 2,
		"targetHeight": 30,
		"level": harness.main.match_state.current_level,
		"players": [],
		"towerBlocks": collapsed_tower()
	})
	assert_false(tower._collapse_debris_linger_active)
	assert_null(tower._collapse_sim)
	assert_false(tower.is_navigation_blocked_by_presentation())

	tower = begin_elevated_collapse()
	begin_fall(tower)
	settle_fall(tower)
	finish_recovery(tower)
	var next_collapse: Array = collapsed_tower()
	next_collapse[0]["towerState"] = "fallen"
	tower.set_tower(next_collapse, 0, 30, 0, {"collapsed": true})
	assert_false(tower._collapse_debris_linger_active)
	assert_null(tower._collapse_sim)
	assert_eq(tower._collapse_phase, TowerStackScript.COLLAPSE_LEAN)
