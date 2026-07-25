extends RefCounted

const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

const GRID_WIDTH := 14
const GRID_CENTER_COL := 6.5
const DEFAULT_PLACEABLE_COLUMN_MIN := 4
const DEFAULT_PLACEABLE_COLUMN_MAX := 9
const SETTLE_SPAWN_MARGIN := 8

# The placeable span is per-level: the server derives it from the level's target
# height and sends it in game_state, so a taller target gets a wider build site.
# Held as static state because it is genuinely global for the whole level -- the
# alternative, threading it through every static function below, is far more
# churn for the same value.
static var placeable_column_min: int = DEFAULT_PLACEABLE_COLUMN_MIN
static var placeable_column_max: int = DEFAULT_PLACEABLE_COLUMN_MAX

static func set_placeable_range(min_column: int, max_column: int) -> void:
	if min_column < 0 or max_column < min_column or max_column > GRID_WIDTH - 1:
		return

	placeable_column_min = min_column
	placeable_column_max = max_column

static func reset_placeable_range() -> void:
	placeable_column_min = DEFAULT_PLACEABLE_COLUMN_MIN
	placeable_column_max = DEFAULT_PLACEABLE_COLUMN_MAX

# All positions here are *lattice* coordinates, not cell-center coordinates:
# x is a column boundary index (column c spans x = c to c + 1) and y is a
# height in grid units measured up from the platform (y = 0). Every snap point
# and brick outline vertex lives on this lattice, which is what makes a snap
# point and a brick corner directly comparable.

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

# Mirror of server Tower_Stability.topHeight.
static func top_height(tower_blocks: Array) -> int:
	var top: int = 0

	for entry in tower_blocks:
		if typeof(entry) != TYPE_DICTIONARY:
			continue

		for cell in entry_cells(entry):
			top = maxi(top, cell.y + 1)

	return top

# Mirror of server Tower_Stability.settleBlock's drop-to-contact loop. If that
# function's semantics ever change, this must change with it or the client's
# landing preview silently disagrees with where the server actually places the
# brick.
static func settle_origin_y(tower_blocks: Array, cells: Array, origin_x: int) -> int:
	if cells.is_empty():
		return 0

	var occupied: Dictionary = occupied_cells(tower_blocks)
	var origin_y: int = top_height(tower_blocks) + SETTLE_SPAWN_MARGIN

	while origin_y > 0 and not _collides(occupied, cells, origin_x, origin_y - 1):
		origin_y -= 1

	return origin_y

# Mirror of server Game_Engine.getPlaceableOriginRange -- the brick's entire
# footprint must fit the placeable columns, with no overflow into the excluded
# outer columns.
static func origin_range(cells: Array) -> Vector2i:
	if cells.is_empty():
		return Vector2i(placeable_column_min, placeable_column_min)

	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var width: int = bounds.max_x - bounds.min_x + 1

	return Vector2i(
		placeable_column_min,
		maxi(placeable_column_min, placeable_column_max - width + 1)
	)

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

# Pairs every outline vertex of the dragged brick against every snap point on
# the platform and the placed tower, and keeps the pairing whose two points are
# closest in lattice space. That pairing fixes the target column; the landing
# row still comes from the gravity settle, so the brick keeps falling to first
# contact and overhangs stay possible.
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
			"column": placeable_column_min,
			"origin_y": 0,
			"target_point": Vector2i.ZERO,
			"matched_vertex": Vector2i.ZERO
		}

	var range_x: Vector2i = origin_range(cells)
	var centroid: Vector2 = footprint_centroid(cells)
	var points: Array = tower_snap_points(tower_blocks)

	var best_distance_sq: float = INF
	var best_column: int = range_x.x
	var best_point := Vector2i.ZERO
	var best_vertex := Vector2i.ZERO

	for vertex in ghost_snap_points(cells):
		var vertex_position: Vector2 = ghost_center + Vector2(vertex) - centroid

		for point in points:
			var column: int = point.x - vertex.x

			if column < range_x.x or column > range_x.y:
				continue

			var distance_sq: float = vertex_position.distance_squared_to(Vector2(point))

			if distance_sq < best_distance_sq:
				best_distance_sq = distance_sq
				best_column = column
				best_point = point
				best_vertex = vertex

	if best_distance_sq <= snap_radius_units * snap_radius_units:
		var settled_y: int = settle_origin_y(tower_blocks, cells, best_column)
		var contact: Dictionary = contact_pair(points, cells, best_column, settled_y)

		return {
			"valid": true,
			"snapped": true,
			"column": best_column,
			"origin_y": settled_y,
			"target_point": contact.get("point", best_point),
			"matched_vertex": contact.get("vertex", best_vertex)
		}

	var fallback_column: int = nearest_column(cells, ghost_center.x)

	return {
		"valid": true,
		"snapped": false,
		"column": fallback_column,
		"origin_y": settle_origin_y(tower_blocks, cells, fallback_column),
		"target_point": Vector2i.ZERO,
		"matched_vertex": Vector2i.ZERO
	}

# The pairing that decides the column is measured against the brick where the
# player is holding it, but gravity can drop it short of that point. The
# highlight has to mark the point the *settled* brick actually docks against,
# or it points at a spot the brick never reaches.
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
