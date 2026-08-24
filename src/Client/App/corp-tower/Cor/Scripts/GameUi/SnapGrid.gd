extends RefCounted

const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

const DEFAULT_GRID_WIDTH := 14
const DEFAULT_PLACEABLE_COLUMN_MIN := 4
const DEFAULT_PLACEABLE_COLUMN_MAX := 9
const SETTLE_SPAWN_MARGIN := 8

static var grid_width: int = DEFAULT_GRID_WIDTH

static func grid_center_col() -> float:
	return (float(grid_width) - 1.0) * 0.5

static func set_grid_width(width: int) -> void:
	if width < 1:
		return

	grid_width = width

static var placeable_column_min: int = DEFAULT_PLACEABLE_COLUMN_MIN
static var placeable_column_max: int = DEFAULT_PLACEABLE_COLUMN_MAX

static func set_placeable_range(min_column: int, max_column: int) -> void:
	if min_column < 0 or max_column < min_column or max_column > grid_width - 1:
		return

	placeable_column_min = min_column
	placeable_column_max = max_column

static func reset_placeable_range() -> void:
	grid_width = DEFAULT_GRID_WIDTH
	placeable_column_min = DEFAULT_PLACEABLE_COLUMN_MIN
	placeable_column_max = DEFAULT_PLACEABLE_COLUMN_MAX

static func entry_block(entry: Dictionary) -> Dictionary:
	var block: Variant = entry.get("block", {})

	if typeof(block) == TYPE_DICTIONARY:
		return block

	var height: int = max(0, int(entry.get("height", block)))
	var cells: Array = []

	for y in range(height):
		cells.append([0, y])

	return {"shapeId": "LEGACY", "cells": cells, "height": height}

static func entry_origin(entry: Dictionary) -> Vector2i:
	return Vector2i(
		int(entry.get("originX", 0)),
		int(entry.get("originY", entry.get("baseHeight", 0)))
	)

static func entry_cells(entry: Dictionary) -> Array:
	var block: Dictionary = entry_block(entry)
	var cells: Array = block.get("cells", [])
	var origin: Vector2i = entry_origin(entry)
	var absolute: Array = []

	for cell in cells:
		absolute.append(Vector2i(origin.x + cell_x(cell), origin.y + cell_y(cell)))

	return absolute

static func occupied_cells(tower_blocks: Array) -> Dictionary:
	var occupied: Dictionary = {}

	for entry in tower_blocks:
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		for cell in entry_cells(entry):
			occupied[cell] = true

	return occupied

static func top_height(tower_blocks: Array) -> int:
	var top: int = 0

	for entry in tower_blocks:
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		for cell in entry_cells(entry):
			top = maxi(top, cell.y + 1)

	return top

static func settle_origin_y(
	tower_blocks: Array, cells: Array, origin_x: int, from_y: int = -1
) -> int:
	if cells.is_empty():
		return 0

	return _settle_from(occupied_cells(tower_blocks), cells, origin_x, (
		top_height(tower_blocks) + SETTLE_SPAWN_MARGIN if from_y < 0 else from_y
	))

static func _settle_from(
	occupied: Dictionary, cells: Array, origin_x: int, from_y: int
) -> int:
	var origin_y: int = maxi(0, from_y)

	while origin_y > 0 and not _collides(occupied, cells, origin_x, origin_y - 1):
		origin_y -= 1

	return origin_y

static func origin_range(cells: Array) -> Vector2i:
	if cells.is_empty():
		return Vector2i(placeable_column_min, placeable_column_min)

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var width: int = bounds.max_x - bounds.min_x + 1

	return Vector2i(
		placeable_column_min,
		maxi(placeable_column_min, placeable_column_max - width + 1)
	)

static func is_placement_legal(
	tower_blocks: Array, cells: Array, origin_x: int, origin_y: int
) -> bool:
	return _is_legal(occupied_cells(tower_blocks), cells, origin_x, origin_y)

static func _is_legal(
	occupied: Dictionary, cells: Array, origin_x: int, origin_y: int
) -> bool:
	if cells.is_empty():
		return false

	for cell in cells:
		var placed := Vector2i(origin_x + cell_x(cell), origin_y + cell_y(cell))

		if placed.y < 0 or occupied.has(placed):
			return false

	return true

static func snap_point_owners(tower_blocks: Array) -> Dictionary:
	var owners: Dictionary = {}

	for column in range(placeable_column_min, placeable_column_max + 2):
		var platform_point := Vector2i(column, 0)
		owners[platform_point] = [{
			"block_id": "",
			"center": Vector2.ZERO,
			"outline_corner": Vector2i.ZERO
		}]

	for entry in tower_blocks:
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		var block: Dictionary = entry_block(entry)
		var origin: Vector2i = entry_origin(entry)
		var bounds: Dictionary = BlockDataScript.cell_bounds(block.get("cells", []))
		var center := Vector2(
			float(origin.x) + (float(bounds.min_x) + float(bounds.max_x) + 1.0) * 0.5,
			float(origin.y) + (float(bounds.min_y) + float(bounds.max_y) + 1.0) * 0.5
		)

		for corner in BlockDataScript.outline_corners(block.get("cells", [])):
			var point := Vector2i(origin.x + corner.x, origin.y + corner.y)

			if point.x < placeable_column_min or point.x > placeable_column_max + 1:
				continue

			if !owners.has(point):
				owners[point] = []

			var point_owners: Array = owners[point]
			point_owners.append({
				"block_id": str(block.get("id", "")),
				"center": center,
				"outline_corner": corner
			})
			point_owners.sort_custom(func(first: Dictionary, second: Dictionary) -> bool:
				return _owner_sort_key(first) < _owner_sort_key(second)
			)

	return owners

static func tower_snap_points(tower_blocks: Array) -> Array:
	var seen: Dictionary = {}
	var points: Array = []

	for column in range(placeable_column_min, placeable_column_max + 2):
		var platform_point := Vector2i(column, 0)
		seen[platform_point] = true
		points.append(platform_point)

	for entry in tower_blocks:
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		var block: Dictionary = entry_block(entry)
		var origin: Vector2i = entry_origin(entry)

		for corner in BlockDataScript.outline_corners(block.get("cells", [])):
			var point := Vector2i(origin.x + corner.x, origin.y + corner.y)

			if seen.has(point):
				continue

			if point.x < placeable_column_min or point.x > placeable_column_max + 1:
				continue

			seen[point] = true
			points.append(point)

	return points

static func _owner_sort_key(owner: Dictionary) -> String:
	var corner: Vector2i = owner.get("outline_corner", Vector2i.ZERO)
	return "%s:%06d:%06d" % [
		str(owner.get("block_id", "")),
		corner.x + 100000,
		corner.y + 100000
	]

static func ghost_snap_points(cells: Array) -> Array:
	return BlockDataScript.outline_corners(cells)

static func footprint_centroid(cells: Array) -> Vector2:
	if cells.is_empty():
		return Vector2.ZERO

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)

	return Vector2(
		(float(bounds.min_x) + float(bounds.max_x) + 1.0) * 0.5,
		(float(bounds.min_y) + float(bounds.max_y) + 1.0) * 0.5
	)

static func nearest_column(cells: Array, lattice_x: float) -> int:
	var range_x: Vector2i = origin_range(cells)

	if cells.is_empty():
		return range_x.x

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var width: int = bounds.max_x - bounds.min_x + 1
	var best_origin: int = range_x.x
	var best_distance: float = INF

	for origin_x in range(range_x.x, range_x.y + 1):
		var distance: float = minf(
			absf(lattice_x - float(origin_x)),
			absf(lattice_x - float(origin_x + width))
		)

		if distance < best_distance:
			best_distance = distance
			best_origin = origin_x

	return best_origin

static func resolve(
	tower_blocks: Array,
	cells: Array,
	ghost_center: Vector2,
	snap_radius_units: float
) -> Dictionary:
	if cells.is_empty():
		return {
			"valid": false,
			"snapped": false,
			"exact": false,
			"column": placeable_column_min,
			"origin_y": 0,
			"target_point": Vector2i.ZERO,
			"matched_vertex": Vector2i.ZERO,
			"aim_point": Vector2i.ZERO,
			"aim_origin_y": 0
		}

	var best_distance_sq: float = INF
	var best_candidate: Dictionary = {}

	for candidate in exact_candidates(tower_blocks, cells, ghost_center):
		var distance_sq: float = float(candidate.get("distance_sq", INF))

		if distance_sq >= best_distance_sq:
			continue

		best_distance_sq = distance_sq
		best_candidate = candidate

	if best_distance_sq <= snap_radius_units * snap_radius_units:
		return resolve_exact_candidate(tower_blocks, cells, best_candidate)

	return resolve_fallback(tower_blocks, cells, ghost_center)

static func exact_candidates(tower_blocks: Array, cells: Array, ghost_center: Vector2) -> Array:
	var range_x: Vector2i = origin_range(cells)
	var centroid: Vector2 = footprint_centroid(cells)
	var points: Array = tower_snap_points(tower_blocks)
	var owners: Dictionary = snap_point_owners(tower_blocks)
	var occupied: Dictionary = occupied_cells(tower_blocks)
	var candidates: Array = []

	for vertex in ghost_snap_points(cells):
		var vertex_position: Vector2 = ghost_center + Vector2(vertex) - centroid

		for point in points:
			var column: int = point.x - vertex.x

			if column < range_x.x or column > range_x.y:
				continue

			var origin_y: int = point.y - vertex.y

			if !_is_legal(occupied, cells, column, origin_y):
				continue

			candidates.append({
				"column": column,
				"aim_origin_y": origin_y,
				"point": point,
				"vertex": vertex,
				"distance_sq": vertex_position.distance_squared_to(Vector2(point)),
				"owners": owners.get(point, [])
			})

	return candidates

static func resolve_exact_candidate(tower_blocks: Array, cells: Array, candidate: Dictionary) -> Dictionary:
	var column: int = int(candidate.get("column", placeable_column_min))
	var aim_origin_y: int = int(candidate.get("aim_origin_y", 0))
	var point: Vector2i = candidate.get("point", Vector2i.ZERO)
	var vertex: Vector2i = candidate.get("vertex", Vector2i.ZERO)
	var settled_y: int = settle_origin_y(tower_blocks, cells, column, aim_origin_y)
	var contact: Dictionary = contact_pair(tower_snap_points(tower_blocks), cells, column, settled_y)

	return {
		"valid": true,
		"snapped": true,
		"exact": true,
		"column": column,
		"origin_y": settled_y,
		"target_point": contact.get("point", point),
		"matched_vertex": contact.get("vertex", vertex),
		"aim_point": point,
		"aim_origin_y": aim_origin_y
	}

static func resolve_fallback(tower_blocks: Array, cells: Array, ghost_center: Vector2) -> Dictionary:
	var fallback_column: int = nearest_column(cells, ghost_center.x)
	var fallback_origin_y: int = settle_origin_y(tower_blocks, cells, fallback_column)

	return {
		"valid": true,
		"snapped": false,
		"exact": false,
		"column": fallback_column,
		"origin_y": fallback_origin_y,
		"target_point": Vector2i.ZERO,
		"matched_vertex": Vector2i.ZERO,
		"aim_point": Vector2i.ZERO,
		"aim_origin_y": fallback_origin_y
	}

static func contact_pair(points: Array, cells: Array, origin_x: int, origin_y: int) -> Dictionary:
	var best_distance_sq: float = INF
	var best_point := Vector2i.ZERO
	var best_vertex := Vector2i.ZERO

	for vertex in ghost_snap_points(cells):
		var landed := Vector2i(origin_x + vertex.x, origin_y + vertex.y)

		for point in points:
			var distance_sq: float = Vector2(landed).distance_squared_to(Vector2(point))

			if distance_sq < best_distance_sq:
				best_distance_sq = distance_sq
				best_point = point
				best_vertex = vertex

	return {"point": best_point, "vertex": best_vertex, "distance_sq": best_distance_sq}

static func _collides(occupied: Dictionary, cells: Array, origin_x: int, origin_y: int) -> bool:
	for cell in cells:
		if occupied.has(Vector2i(origin_x + cell_x(cell), origin_y + cell_y(cell))):
			return true

	return false

static func cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

static func cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
