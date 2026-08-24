extends GutTest

const PlacementProjection := preload("res://Cor/Scripts/GameUi/PlacementProjection.gd")
const StructuralPose := preload("res://Cor/Scripts/GameUi/StructuralPose.gd")
const SnapGridScript := preload("res://Cor/Scripts/GameUi/SnapGrid.gd")

const CELL := [[0, 0]]

func before_each() -> void:
	SnapGridScript.reset_placeable_range()
	SnapGridScript.set_grid_width(8)
	SnapGridScript.set_placeable_range(1, 6)

func after_each() -> void:
	SnapGridScript.reset_placeable_range()

func test_visual_contact_keeps_the_canonical_snap_origin() -> void:
	var pose := StructuralPose.new()
	pose.replace_targets([{
		"blockId": "support",
		"sectionId": "upper",
		"sectionOriginXUnits": 0.5,
		"sectionOriginYUnits": 0.0,
		"rotationDeg": 10.0,
		"failureWeight": 0.8
	}], true)
	var blocks := [{
		"block": {"id": "support", "cells": CELL},
		"originX": 3,
		"originY": 3
	}]
	var projection := PlacementProjection.new()
	var point := Vector2(3.0, 4.0)
	var transformed: Dictionary = pose.transform_grid_point("support", Vector2(3.5, 3.5), point)
	var unit := 34.0
	var target_local := Vector2(
		136.0 + ((transformed.point as Vector2).x - 4.0) * unit,
		600.0 - (transformed.point as Vector2).y * unit
	)
	var vertex_offset := Vector2(-0.5, 0.5) * unit
	var ghost_local := target_local - vertex_offset.rotated(deg_to_rad(10.0))
	var snap: Dictionary = projection.resolve(
		blocks,
		CELL,
		Vector2(3.5, 4.5),
		ghost_local,
		2.2,
		unit,
		136.0,
		600.0,
		0,
		pose
	)

	assert_true(bool(snap.exact), "A pointer at the rendered support should select an exact snap.")
	assert_eq(int(snap.column), 3)
	assert_eq(int(snap.aim_origin_y), 4)
	assert_eq(snap.visual_aim_point, Vector2i(3, 4))
	assert_almost_eq(float(snap.visual_rotation_deg), 10.0, 0.001)

func test_unposed_projection_returns_the_existing_snap_payload() -> void:
	var projection := PlacementProjection.new()
	var pose := StructuralPose.new()
	var direct: Dictionary = SnapGridScript.resolve([], CELL, Vector2(3.5, 0.5), 2.2)
	var projected: Dictionary = projection.resolve(
		[], CELL, Vector2(3.5, 0.5), Vector2(136.0, 583.0), 2.2, 34.0, 136.0, 600.0, 0, pose
	)

	assert_eq(projected, direct)
