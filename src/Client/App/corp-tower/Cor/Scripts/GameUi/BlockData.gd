extends RefCounted

const BRICK_SHAPES := {
	"I": [[0, 0], [0, 1], [0, 2], [0, 3]],
	"O": [[0, 0], [1, 0], [0, 1], [1, 1]],
	"L": [[0, 0], [1, 0], [0, 1], [0, 2]],
	"T": [[1, 0], [0, 1], [1, 1], [2, 1]],
	"Z": [[1, 0], [2, 0], [0, 1], [1, 1]]
}

const BRICK_TEXTURE_PATHS := {
	"I": "res://Cor/Art/Bricks/brick_i.png",
	"O": "res://Cor/Art/Bricks/brick_o.png",
	"L": "res://Cor/Art/Bricks/brick_l.png",
	"T": "res://Cor/Art/Bricks/brick_t.png",
	"Z": "res://Cor/Art/Bricks/brick_z.png"
}

const BRICK_SHADER_PATH := "res://Cor/Shaders/BrickShade.gdshader"

static var _texture_cache: Dictionary = {}
static var _shader: Shader = null

static func normalize_block(raw_block, index: int) -> Dictionary:
	if typeof(raw_block) == TYPE_DICTIONARY:
		var dictionary_cells: Array = raw_block.get("cells", [])
		var block_height: int = int(raw_block.get("height", calculate_block_height(dictionary_cells)))
		return {
			"id": str(raw_block.get("id", "slot-" + str(index))),
			"shapeId": str(raw_block.get("shapeId", "BLOCK")),
			"cells": dictionary_cells,
			"anchorX": int(raw_block.get("anchorX", 0)),
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

static func brick_texture(shape_id: String) -> Texture2D:
	if not BRICK_TEXTURE_PATHS.has(shape_id):
		return null

	if not _texture_cache.has(shape_id):
		_texture_cache[shape_id] = load(BRICK_TEXTURE_PATHS[shape_id])

	return _texture_cache[shape_id]

static func brick_shader_material() -> ShaderMaterial:
	if _shader == null:
		_shader = load(BRICK_SHADER_PATH)

	var material := ShaderMaterial.new()
	material.shader = _shader
	return material

# Detects how many 90-degree clockwise turns separate `cells` from the
# canonical BRICK_SHAPES entry for `shape_id`, replicating the server's
# Block_Supply.getRotations/rotateCellsCW so the client can rotate the
# pre-rendered brick texture to match a randomly-rotated placed block.
static func detect_rotation_steps(shape_id: String, cells: Array) -> int:
	if not BRICK_SHAPES.has(shape_id):
		return 0

	var target_key: String = _cell_key(_normalize_cells(cells))
	var current: Array = _normalize_cells(BRICK_SHAPES[shape_id])

	for step in range(4):
		if _cell_key(current) == target_key:
			return step

		current = _rotate_cells_cw(current)

	return 0

static func brick_quad_uvs() -> PackedVector2Array:
	return PackedVector2Array([
		Vector2(0.0, 0.0), Vector2(1.0, 0.0), Vector2(1.0, 1.0), Vector2(0.0, 1.0)
	])

static func brick_quad_points(center: Vector2, local_size: Vector2, rotation_steps: int) -> PackedVector2Array:
	var half: Vector2 = local_size * 0.5
	var corners: Array[Vector2] = [
		Vector2(-half.x, -half.y),
		Vector2(half.x, -half.y),
		Vector2(half.x, half.y),
		Vector2(-half.x, half.y)
	]
	var angle: float = float(rotation_steps) * (PI * 0.5)
	var points := PackedVector2Array()

	for corner in corners:
		points.append(center + corner.rotated(angle))

	return points

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
