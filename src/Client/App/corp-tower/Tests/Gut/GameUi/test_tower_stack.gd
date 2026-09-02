extends GutTest

const TowerStackScript = preload("res://Cor/Scripts/TowerStack.gd")
const BlockData = preload("res://Cor/Scripts/GameUi/BlockData.gd")

func entry(block_id: String, state: String = "standing") -> Dictionary:
	return {
		"block": {"id": block_id, "shapeId": "O", "cells": [[0, 0]]},
		"originX": 0,
		"originY": 0,
		"towerState": state
	}

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
		"supportStability": 27
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

func mounted_stability_fixture() -> Control:
	var tower := TowerStackScript.new()
	tower.size = Vector2(272, 620)
	add_child_autofree(tower)
	tower.set_tower(stability_fixture(), 16, 30)
	return tower

func test_only_newly_fallen_bricks_enter_the_component_collapse_animation() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	tower.set_tower([entry("failed"), entry("survivor")], 1, 10)
	tower.set_tower([
		entry("failed", "fallen"),
		entry("survivor"),
		entry("placed", "fallen")
	], 1, 10)

	assert_true(tower._collapsing_block_ids.has("failed"))
	assert_true(tower._collapsing_block_ids.has("placed"))
	assert_false(tower._collapsing_block_ids.has("survivor"))
	assert_eq(tower._collapse_phase, tower.COLLAPSE_LEAN)

func test_reconnect_does_not_replay_persisted_fallen_bricks() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	tower.set_tower([entry("old", "fallen"), entry("survivor")], 1, 10)

	assert_true(tower._collapsing_block_ids.is_empty())
	assert_eq(tower._collapse_phase, tower.COLLAPSE_NONE)

func test_new_brick_uses_placement_mood_then_switches_to_live_support() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var placed: Dictionary = entry("placed")
	placed[BlockData.BALANCE_DELTA_KEY] = 10
	placed[BlockData.SUPPORT_STABILITY_KEY] = 20
	tower.set_tower([placed], 1, 10)

	assert_eq(tower._emoji_mood_for_entry(placed), "positive")
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(placed), "negative")

func test_standing_brick_face_updates_with_authoritative_support_state() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var standing: Dictionary = entry("standing")
	standing[BlockData.BALANCE_DELTA_KEY] = 10
	standing[BlockData.SUPPORT_STABILITY_KEY] = 90
	tower.set_tower([standing], 1, 10)
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(standing), "positive")

	standing[BlockData.SUPPORT_STABILITY_KEY] = 60
	tower.set_tower([standing], 1, 10)
	assert_eq(tower._emoji_mood_for_entry(standing), "neutral")

	standing[BlockData.SUPPORT_STABILITY_KEY] = 30
	tower.set_tower([standing], 1, 10)
	assert_eq(tower._emoji_mood_for_entry(standing), "negative")

func test_collapsing_faces_use_frozen_support_and_trigger_is_worried() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var prior: Dictionary = entry("prior")
	prior[BlockData.SUPPORT_STABILITY_KEY] = 60
	var trigger: Dictionary = entry("trigger")
	trigger[BlockData.BALANCE_DELTA_KEY] = 10
	trigger[BlockData.SUPPORT_STABILITY_KEY] = 0
	tower.set_tower([prior], 1, 10)
	tower._process(tower.drop_duration)
	prior.towerState = "fallen"
	trigger.towerState = "fallen"
	tower.set_tower([prior, trigger], 0, 10)

	assert_eq(tower._emoji_mood_for_entry(prior), "neutral")
	assert_eq(tower._emoji_mood_for_entry(trigger), "negative")

func test_support_threshold_updates_reclassify_standing_faces() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var standing: Dictionary = entry("standing")
	standing[BlockData.SUPPORT_STABILITY_KEY] = 70
	tower.set_tower([standing], 1, 10)
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(standing), "neutral")

	tower.set_support_stability_thresholds(60, 30)
	assert_eq(tower._emoji_mood_for_entry(standing), "positive")

func test_danger_outline_uses_authoritative_worried_band_only_for_standing_bricks() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var support: Dictionary = entry("support")
	support[BlockData.SUPPORT_STABILITY_KEY] = tower.support_critical_threshold
	assert_true(tower._has_danger_outline(support))

	support[BlockData.SUPPORT_STABILITY_KEY] = tower.support_critical_threshold + 1
	assert_false(tower._has_danger_outline(support))

	support[BlockData.SUPPORT_STABILITY_KEY] = 0
	support.towerState = "fallen"
	assert_false(tower._has_danger_outline(support))

func test_danger_outline_geometry_tracks_the_rendered_structural_pose() -> void:
	var tower = TowerStackScript.new()
	tower.size = Vector2(272, 620)
	add_child_autofree(tower)
	var support := {
		"block": {
			"id": "posed-support",
			"shapeId": "O",
			"cells": [[0, 0], [1, 0], [0, 1], [1, 1]]
		},
		"originX": 3,
		"originY": 2,
		"towerState": "standing",
		"supportStability": 20
	}
	tower.set_tower([support], 4, 10, 20, {}, [{
		"blockId": "posed-support",
		"offsetXUnits": 0.5,
		"offsetYUnits": 0.75,
		"rotationDeg": 12.0,
		"failureWeight": 1.0
	}])

	var posed: PackedVector2Array = tower._danger_outline_geometry(support)
	tower.structural_pose.clear()
	var unposed: PackedVector2Array = tower._danger_outline_geometry(support)
	var posed_center := Vector2.ZERO
	var unposed_center := Vector2.ZERO
	for point in posed:
		posed_center += point
	for point in unposed:
		unposed_center += point
	posed_center /= float(posed.size())
	unposed_center /= float(unposed.size())

	assert_gt(posed.size(), 4)
	assert_almost_eq(posed_center.x - unposed_center.x, tower.brick_unit_size * 0.5, 0.001)
	assert_almost_eq(posed_center.y - unposed_center.y, -tower.brick_unit_size * 0.75, 0.001)
	assert_almost_eq(
		rad_to_deg((posed[1] - posed[0]).angle()) - rad_to_deg((unposed[1] - unposed[0]).angle()),
		12.0,
		0.001
	)

func test_thin_base_fixture_selects_the_offscreen_critical_support() -> void:
	var tower: Control = mounted_stability_fixture()
	var target: Dictionary = tower.trouble_target()

	assert_eq(tower.scroll_state.displayed_offset_units, 5.0)
	assert_eq(str(target.get("block_id", "")), "base-i")
	assert_eq(int(target.get("support_stability", 100)), 27)

func test_trouble_selection_uses_stability_then_origin_and_stable_id() -> void:
	var tower: Control = mounted_stability_fixture()
	var blocks: Array = stability_fixture()
	blocks.append({
		"block": {"id": "weaker-b", "shapeId": "O", "cells": [[0, 0]]},
		"originX": 4,
		"originY": 0,
		"towerState": "standing",
		"supportStability": 20
	})
	blocks.append({
		"block": {"id": "weaker-a", "shapeId": "O", "cells": [[0, 0]]},
		"originX": 5,
		"originY": 0,
		"towerState": "standing",
		"supportStability": 20
	})
	tower.set_tower(blocks, 16, 30)

	assert_eq(str(tower.trouble_target().get("block_id", "")), "weaker-a")

func test_partially_visible_posed_support_is_not_offscreen_trouble() -> void:
	var tower: Control = mounted_stability_fixture()
	tower.set_tower(stability_fixture(), 16, 30, 100, {}, [{
		"blockId": "base-i",
		"offsetXUnits": 0.0,
		"offsetYUnits": 1.2,
		"rotationDeg": 10.0,
		"failureWeight": 1.0
	}])

	assert_true(tower.trouble_target().is_empty())

func test_fractional_navigation_drives_rendering_grid_conversion_and_parallax() -> void:
	var tower: Control = mounted_stability_fixture()
	var emitted_pixels: Array = []
	tower.scroll_offset_changed.connect(func(pixels: float): emitted_pixels.append(pixels))

	assert_true(tower.navigate_to_trouble("base-i"))
	tower._process(0.05)

	assert_almost_eq(tower.scroll_state.displayed_offset_units, 4.55, 0.001)
	assert_eq(emitted_pixels.size(), 1)
	assert_almost_eq(float(emitted_pixels[0]), 4.55 * tower.brick_unit_size, 0.001)
	var lattice := Vector2(3.5, 2.25)
	assert_almost_eq(tower.local_to_grid(tower.grid_to_local(lattice)).x, lattice.x, 0.001)
	assert_almost_eq(tower.local_to_grid(tower.grid_to_local(lattice)).y, lattice.y, 0.001)

func test_fractional_manual_pan_drives_the_shared_scroll_offset() -> void:
	var tower: Control = mounted_stability_fixture()
	var emitted_pixels: Array = []
	tower.scroll_offset_changed.connect(func(pixels: float): emitted_pixels.append(pixels))

	assert_true(tower.pan_scroll_pixels(-tower.brick_unit_size * 0.45))
	assert_almost_eq(tower.scroll_state.displayed_offset_units, 4.55, 0.001)
	assert_eq(emitted_pixels.size(), 1)
	assert_almost_eq(float(emitted_pixels[0]), 4.55 * tower.brick_unit_size, 0.001)
	var lattice := Vector2(3.5, 2.25)
	assert_almost_eq(tower.local_to_grid(tower.grid_to_local(lattice)).x, lattice.x, 0.001)
	assert_almost_eq(tower.local_to_grid(tower.grid_to_local(lattice)).y, lattice.y, 0.001)

func test_collapse_freezes_fractional_navigation_at_its_current_position() -> void:
	var tower: Control = mounted_stability_fixture()
	tower.navigate_to_trouble("base-i")
	tower._process(0.05)
	var before_collapse: float = tower.scroll_state.displayed_offset_units
	var fallen: Array = stability_fixture()
	fallen[0]["towerState"] = "fallen"
	tower.set_tower(fallen, 16, 30)
	tower._process(0.05)

	assert_true(tower.scroll_state.frozen)
	assert_almost_eq(tower.scroll_state.displayed_offset_units, before_collapse, 0.001)
