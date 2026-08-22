extends RefCounted

const BRICK_SHAPES := {
	"I": [[0, 0], [0, 1], [0, 2], [0, 3]],
	"O": [[0, 0], [1, 0], [0, 1], [1, 1]],
	"L": [[0, 0], [1, 0], [0, 1], [0, 2]],
	"T": [[1, 0], [0, 1], [1, 1], [2, 1]],
	"Z": [[1, 0], [2, 0], [0, 1], [1, 1]]
}

const BRICK_TEXTURE_PATHS := {
	"I": "res://Cor/Art/9-Play/brick_i.png",
	"O": "res://Cor/Art/9-Play/brick_o.png",
	"L": "res://Cor/Art/9-Play/brick_l.png",
	"T": "res://Cor/Art/9-Play/brick_t.png",
	"Z": "res://Cor/Art/9-Play/brick_z.png"
}

const EMOJI_TEXTURE_PATHS := {
	"positive": "res://Cor/Art/9-Play/emoji-smiley.png",
	"negative": "res://Cor/Art/9-Play/emoji-worried.png",
	"neutral": "res://Cor/Art/9-Play/emoji-disbelief.png"
}

const DEFAULT_EMOJI_MOOD := "neutral"
const DEFAULT_MOOD_THRESHOLD := 3
const BALANCE_DELTA_KEY := "balanceDelta"

const TOP_SHADE_MULTIPLIER := 1.28
const BOTTOM_SHADE_MULTIPLIER := 0.86

static var _texture_cache: Dictionary = {}
static var _emoji_cache: Dictionary = {}

static func normalize_block(raw_block, index: int) -> Dictionary:
	if typeof(raw_block) == TYPE_DICTIONARY:
		var dictionary_cells: Array = raw_block.get("cells", [])
		var block_height: int = int(raw_block.get("height", calculate_block_height(dictionary_cells)))
		return {
			"id": str(raw_block.get("id", "slot-" + str(index))),
			"shapeId": str(raw_block.get("shapeId", "BLOCK")),
			"cells": dictionary_cells,
			"height": block_height
		}

	var legacy_height: int = max(0, int(raw_block))
	var legacy_cells: Array = []

	for y in range(legacy_height):
		legacy_cells.append([0, y])

	return {
		"id": "legacy-" + str(index),
		"shapeId": "LEGACY",
		"cells": legacy_cells,
		"height": legacy_height
	}

static func calculate_block_height(cells: Array) -> int:
	if cells.is_empty():
		return 0

	var min_y: int = 999999
	var max_y: int = -999999

	for cell in cells:
		var y: int = 0

		if typeof(cell) == TYPE_DICTIONARY:
			y = int(cell.get("y", 0))
		else:
			y = int(cell[1])

		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	return max_y - min_y + 1

static func cell_bounds(cells: Array) -> Dictionary:
	var min_x: int = 999999
	var min_y: int = 999999
	var max_x: int = -999999
	var max_y: int = -999999

	for cell in cells:
		var x: int = _cell_x(cell)
		var y: int = _cell_y(cell)
		min_x = mini(min_x, x)
		min_y = mini(min_y, y)
		max_x = maxi(max_x, x)
		max_y = maxi(max_y, y)

	return {"min_x": min_x, "min_y": min_y, "max_x": max_x, "max_y": max_y}

static func outline_corners(cells: Array) -> Array:
	var counts: Dictionary = {}

	for cell in cells:
		var x: int = _cell_x(cell)
		var y: int = _cell_y(cell)

		for corner in [Vector2i(x, y), Vector2i(x + 1, y), Vector2i(x, y + 1), Vector2i(x + 1, y + 1)]:
			counts[corner] = counts.get(corner, 0) + 1

	var corners: Array = []

	for corner in counts:
		if counts[corner] % 2 == 1:
			corners.append(corner)

	return corners

static func brick_texture(shape_id: String) -> Texture2D:
	if not BRICK_TEXTURE_PATHS.has(shape_id):
		return null

	if not _texture_cache.has(shape_id):
		_texture_cache[shape_id] = load(BRICK_TEXTURE_PATHS[shape_id])

	return _texture_cache[shape_id]

static func emoji_mood_for_delta(delta: int, threshold: int) -> String:
	var band: int = maxi(1, threshold)

	if delta >= band:
		return "positive"

	if delta <= -band:
		return "negative"

	return "neutral"

static func emoji_texture(mood: String) -> Texture2D:
	var resolved: String = mood if EMOJI_TEXTURE_PATHS.has(mood) else DEFAULT_EMOJI_MOOD

	if not _emoji_cache.has(resolved):
		_emoji_cache[resolved] = load(EMOJI_TEXTURE_PATHS[resolved])

	return _emoji_cache[resolved]

static func emoji_anchor(cells: Array) -> Vector2:
	if cells.is_empty():
		return Vector2.ZERO

	var centers: Array[Vector2] = []
	var centroid := Vector2.ZERO

	for cell in cells:
		var center := Vector2(float(_cell_x(cell)) + 0.5, float(_cell_y(cell)) + 0.5)
		centers.append(center)
		centroid += center

	centroid /= float(centers.size())

	var nearest_distance: float = INF

	for center in centers:
		nearest_distance = minf(nearest_distance, centroid.distance_squared_to(center))

	var anchor := Vector2.ZERO
	var tied: int = 0

	for center in centers:
		if centroid.distance_squared_to(center) <= nearest_distance + 0.0001:
			anchor += center
			tied += 1

	return anchor / float(tied)

static func detect_orientation(shape_id: String, cells: Array) -> Dictionary:
	if not BRICK_SHAPES.has(shape_id):
		return {"steps": 0, "flipped": false}

	var target_key: String = _cell_key(_normalize_cells(cells))
	var canonical: Array = _normalize_cells(BRICK_SHAPES[shape_id])

	for flipped in [false, true]:
		var current: Array = _reflect_cells_x(canonical) if flipped else canonical

		for step in range(4):
			if _cell_key(current) == target_key:
				return {"steps": step, "flipped": flipped}

			current = _rotate_cells_cw(current)

	return {"steps": 0, "flipped": false}

static func brick_quad_uvs() -> PackedVector2Array:
	return PackedVector2Array([
		Vector2(0.0, 0.0), Vector2(1.0, 0.0), Vector2(1.0, 1.0), Vector2(0.0, 1.0)
	])

static func brick_quad_points(
	center: Vector2, local_size: Vector2, rotation_steps: int, flipped: bool = false
) -> PackedVector2Array:
	var half: Vector2 = local_size * 0.5
	var flip_x: float = -1.0 if flipped else 1.0
	var corners: Array[Vector2] = [
		Vector2(-half.x * flip_x, -half.y),
		Vector2(half.x * flip_x, -half.y),
		Vector2(half.x * flip_x, half.y),
		Vector2(-half.x * flip_x, half.y)
	]
	var angle: float = float(rotation_steps) * (PI * 0.5)
	var points := PackedVector2Array()

	for corner in corners:
		points.append(center + corner.rotated(angle))

	return points

static func brick_quad_colors(
	base_color: Color,
	points: PackedVector2Array,
	top_multiplier: float = TOP_SHADE_MULTIPLIER,
	bottom_multiplier: float = BOTTOM_SHADE_MULTIPLIER
) -> PackedColorArray:
	var min_y: float = INF
	var max_y: float = -INF

	for point in points:
		min_y = minf(min_y, point.y)
		max_y = maxf(max_y, point.y)

	var span: float = max_y - min_y
	var colors := PackedColorArray()

	for point in points:
		var t: float = (point.y - min_y) / span if span > 0.0001 else 0.0
		var shade: float = lerpf(top_multiplier, bottom_multiplier, t)

		colors.append(Color(base_color.r * shade, base_color.g * shade, base_color.b * shade, base_color.a))

	return colors

static func _normalize_cells(cells: Array) -> Array:
	var min_x: int = 999999
	var min_y: int = 999999

	for cell in cells:
		min_x = mini(min_x, _cell_x(cell))
		min_y = mini(min_y, _cell_y(cell))

	var normalized: Array = []

	for cell in cells:
		normalized.append([_cell_x(cell) - min_x, _cell_y(cell) - min_y])

	return normalized

static func _rotate_cells_cw(cells: Array) -> Array:
	var rotated: Array = []

	for cell in cells:
		rotated.append([_cell_y(cell), -_cell_x(cell)])

	return _normalize_cells(rotated)

static func _reflect_cells_x(cells: Array) -> Array:
	var reflected: Array = []

	for cell in cells:
		reflected.append([-_cell_x(cell), _cell_y(cell)])

	return _normalize_cells(reflected)

static func _cell_key(cells: Array) -> String:
	var parts: Array = []

	for cell in cells:
		parts.append("%d,%d" % [_cell_x(cell), _cell_y(cell)])

	parts.sort()
	return "|".join(parts)

static func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

static func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
