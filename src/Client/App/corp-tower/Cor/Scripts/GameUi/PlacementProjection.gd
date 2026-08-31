extends RefCounted

const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")

func resolve(
	tower_blocks: Array,
	cells: Array,
	ghost_grid: Vector2,
	ghost_local: Vector2,
	snap_radius_units: float,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float,
	structural_pose
) -> Dictionary:
	var canonical: Dictionary = SnapGridScript.resolve(
		tower_blocks, cells, ghost_grid, snap_radius_units
	)

	if !structural_pose.has_targets():
		return canonical

	var best_distance_sq: float = INF
	var best_candidate: Dictionary = {}
	var best_owner: Dictionary = {}
	var best_target_local := Vector2.ZERO
	var best_ghost_center := Vector2.ZERO
	var best_rotation: float = 0.0

	for candidate_value in SnapGridScript.exact_candidates(tower_blocks, cells, ghost_grid):
		var candidate: Dictionary = candidate_value
		var point: Vector2i = candidate.get("point", Vector2i.ZERO)
		var vertex: Vector2i = candidate.get("vertex", Vector2i.ZERO)

		for owner_value in candidate.get("owners", []):
			if typeof(owner_value) != TYPE_DICTIONARY:
				continue

			var owner: Dictionary = owner_value
			var projected: Dictionary = project_point(owner, Vector2(point), structural_pose)
			var target_local := _lattice_to_local(
				Vector2(projected.get("point", Vector2(point))),
				unit,
				base_x,
				baseline,
				scroll_offset_units
			)
			var rotation: float = float(projected.get("rotationDeg", 0.0))
			var expected_ghost_center := _ghost_center_for_contact(
				target_local, vertex, cells, unit, rotation
			)
			var distance_sq: float = ghost_local.distance_squared_to(expected_ghost_center)

			if distance_sq >= best_distance_sq:
				continue

			best_distance_sq = distance_sq
			best_candidate = candidate
			best_owner = owner
			best_target_local = target_local
			best_ghost_center = expected_ghost_center
			best_rotation = rotation

	if best_distance_sq > snap_radius_units * unit * snap_radius_units * unit:
		return SnapGridScript.resolve_fallback(tower_blocks, cells, ghost_grid)

	if best_candidate.is_empty():
		return SnapGridScript.resolve_fallback(tower_blocks, cells, ghost_grid)

	var snap: Dictionary = SnapGridScript.resolve_exact_candidate(tower_blocks, cells, best_candidate)
	snap["visual_aim_point"] = best_candidate.get("point", Vector2i.ZERO)
	snap["visual_target_local"] = best_target_local
	snap["visual_ghost_center_local"] = best_ghost_center
	snap["visual_rotation_deg"] = best_rotation
	snap["visual_owner_block_id"] = str(best_owner.get("block_id", ""))
	return snap

func project_point(owner: Dictionary, point: Vector2, structural_pose) -> Dictionary:
	var block_id: String = str(owner.get("block_id", ""))

	if block_id == "":
		return {"point": point, "rotationDeg": 0.0}

	return structural_pose.transform_grid_point(
		block_id,
		owner.get("center", point),
		point
	)

func _ghost_center_for_contact(
	target_local: Vector2,
	vertex: Vector2i,
	cells: Array,
	unit: float,
	rotation: float
) -> Vector2:
	var centroid: Vector2 = SnapGridScript.footprint_centroid(cells)
	var vertex_offset := Vector2(
		float(vertex.x) - centroid.x,
		-float(vertex.y) + centroid.y
	) * unit
	return target_local - vertex_offset.rotated(deg_to_rad(rotation))

func _lattice_to_local(
	lattice: Vector2,
	unit: float,
	base_x: float,
	baseline: float,
	scroll_offset_units: float
) -> Vector2:
	return Vector2(
		base_x + (lattice.x - SnapGridScript.grid_center_col() - 0.5) * unit,
		baseline - (lattice.y - float(scroll_offset_units)) * unit
	)
