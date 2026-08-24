extends GutTest

const StructuralPose := preload("res://Cor/Scripts/GameUi/StructuralPose.gd")
const TowerStackScript := preload("res://Cor/Scripts/TowerStack.gd")
const SnapGridScript := preload("res://Cor/Scripts/GameUi/SnapGrid.gd")

func _pose(block_id: String, offset_x: float, offset_y: float, rotation: float, failure: float) -> Dictionary:
	return {
		"blockId": block_id,
		"offsetXUnits": offset_x,
		"offsetYUnits": offset_y,
		"rotationDeg": rotation,
		"failureWeight": failure
	}

func _section_pose(block_id: String, section_id: String, origin: Vector2, rotation: float, failure: float) -> Dictionary:
	var pose: Dictionary = _pose(block_id, 0.0, 0.0, rotation, failure)
	pose["sectionId"] = section_id
	pose["sectionOriginXUnits"] = origin.x
	pose["sectionOriginYUnits"] = origin.y
	return pose

func _entry(block_id: String, origin_x: int, origin_y: int) -> Dictionary:
	return {
		"playerId": "P1",
		"block": {
			"id": block_id,
			"shapeId": "O",
			"cells": [[0, 0], [1, 0], [0, 1], [1, 1]],
			"height": 2
		},
		"originX": origin_x,
		"originY": origin_y
	}

func test_weighted_blend_keeps_supporter_order_out_of_the_result() -> void:
	var pose := StructuralPose.new()
	var first: Dictionary = _pose("A", 1.0, 0.0, 8.0, 0.4)
	var second: Dictionary = _pose("B", -1.0, -2.0, -4.0, 0.8)
	var blended: Dictionary = pose.weighted_blend([first, second], [0.25, 0.75])

	assert_almost_eq(float(blended.offsetXUnits), -0.5, 0.001)
	assert_almost_eq(float(blended.offsetYUnits), -1.5, 0.001)
	assert_almost_eq(float(blended.rotationDeg), -1.0, 0.001)
	assert_almost_eq(float(blended.failureWeight), 0.7, 0.001)

func test_nonconsecutive_snapshot_replaces_pose_directly() -> void:
	var pose := StructuralPose.new()
	pose.replace_targets([_pose("A", 0.0, 0.0, 0.0, 0.0)], true)
	pose.replace_targets([_pose("A", 2.0, -1.0, 12.0, 1.0)], false)
	pose.step(0.05, 2.0)
	assert_lt(float(pose.pose_for("A").rotationDeg), 12.0)

	pose.replace_targets([_pose("A", -3.0, 1.0, -8.0, 0.5)], true)
	assert_eq(pose.pose_for("A"), pose.target_for("A"))

func test_section_pose_preserves_rigid_contacts_while_smoothing_a_bend() -> void:
	var pose := StructuralPose.new()
	var lower := Vector2(3.0, 3.5)
	var upper := Vector2(3.0, 4.5)
	var initial: Array = [
		_section_pose("A", "upper", Vector2.ZERO, 0.0, 0.4),
		_section_pose("B", "upper", Vector2.ZERO, 0.0, 0.4)
	]
	var target: Array = [
		_section_pose("A", "upper", Vector2(0.4, -0.2), 12.0, 0.8),
		_section_pose("B", "upper", Vector2(0.4, -0.2), 12.0, 0.8)
	]
	pose.replace_targets(initial, true)
	pose.replace_targets(target, false)
	pose.step(0.05, 2.0)
	var lower_pose: Dictionary = pose.pose_for_grid("A", lower)
	var upper_pose: Dictionary = pose.pose_for_grid("B", upper)
	var lower_center := lower + Vector2(lower_pose.offsetXUnits, lower_pose.offsetYUnits)
	var upper_center := upper + Vector2(upper_pose.offsetXUnits, upper_pose.offsetYUnits)
	var expected_delta := (upper - lower).rotated(deg_to_rad(-float(lower_pose.rotationDeg)))

	assert_almost_eq(float(lower_pose.rotationDeg), float(upper_pose.rotationDeg), 0.001)
	assert_almost_eq((upper_center - lower_center).x, expected_delta.x, 0.001)
	assert_almost_eq((upper_center - lower_center).y, expected_delta.y, 0.001)

func test_coordinate_conversion_ignores_visible_structural_pose() -> void:
	SnapGridScript.reset_placeable_range()
	SnapGridScript.set_grid_width(8)
	SnapGridScript.set_placeable_range(1, 6)
	var tower: Control = TowerStackScript.new()
	tower.size = Vector2(320, 640)
	add_child_autofree(tower)
	var blocks: Array = [_entry("A", 3, 0)]
	tower.set_tower(blocks, 2, 24, 72, {}, [_pose("A", 1.5, -0.2, 10.0, 0.8)])
	var lattice := Vector2(4.5, 1.5)
	var pointer: Vector2 = tower.grid_to_local(lattice)
	var resolved: Vector2 = tower.local_to_grid(pointer)

	assert_almost_eq(resolved.x, lattice.x, 0.001)
	assert_almost_eq(resolved.y, lattice.y, 0.001)
	SnapGridScript.reset_placeable_range()
