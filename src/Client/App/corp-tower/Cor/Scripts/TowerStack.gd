extends Control

const BLOCK_COLORS := [
	Color(0.23, 0.5, 0.88, 1.0),
	Color(0.24, 0.68, 0.52, 1.0),
	Color(0.86, 0.58, 0.22, 1.0),
	Color(0.69, 0.42, 0.86, 1.0),
	Color(0.86, 0.34, 0.38, 1.0)
]
const GRID_COLOR := Color(0.9, 0.95, 1.0, 0.9)
const FALLBACK_COLOR := Color(0.23, 0.5, 0.88, 0.82)
const TARGET_MARKER_COLOR := Color(1.0, 0.82, 0.25, 1.0)

var tower_blocks: Array = []
var current_height: int = 0
var target_height: int = 0

func set_tower(blocks: Array, new_current_height: int, new_target_height: int) -> void:
	tower_blocks = blocks
	current_height = max(0, new_current_height)
	target_height = max(0, new_target_height)
	queue_redraw()

func clear_tower() -> void:
	tower_blocks = []
	current_height = 0
	target_height = 0
	queue_redraw()

func _draw() -> void:
	if target_height > 0:
		_draw_target_marker()

	if tower_blocks.is_empty():
		_draw_fallback_stack()
		return

	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - 12.0
	var tower_units: int = max(target_height, current_height, 1)

	for i in range(tower_blocks.size()):
		var entry: Dictionary = tower_blocks[i]
		var block: Dictionary = _normalize_block_entry(entry)
		var cells: Array = block.get("cells", [])
		var base_height: int = int(entry.get("baseHeight", 0))
		var color: Color = BLOCK_COLORS[i % BLOCK_COLORS.size()]

		for cell in cells:
			var cell_x: int = _cell_x(cell)
			var cell_y: int = _cell_y(cell)
			var x: float = base_x + float(cell_x) * unit - unit * 0.5
			var y_units: int = base_height + int(block.get("height", 0)) - cell_y - 1
			var y: float = baseline - float(y_units + 1) * unit
			var rect: Rect2 = Rect2(Vector2(x, y), Vector2(unit - 2.0, unit - 2.0))
			draw_rect(rect, color, true)
			draw_rect(rect, GRID_COLOR, false, 1.5)

	if current_height > tower_units:
		_draw_fallback_stack()

func _draw_fallback_stack() -> void:
	if current_height <= 0:
		return

	var unit: float = _unit_size()
	var width: float = clamp(size.x * 0.24, unit * 1.5, unit * 3.5)
	var x: float = (size.x - width) * 0.5
	var baseline: float = size.y - 12.0

	for y in range(current_height):
		var rect: Rect2 = Rect2(
			Vector2(x, baseline - float(y + 1) * unit),
			Vector2(width, unit - 2.0)
		)
		draw_rect(rect, FALLBACK_COLOR, true)
		draw_rect(rect, GRID_COLOR, false, 1.0)

func _draw_target_marker() -> void:
	var unit: float = _unit_size()
	var baseline: float = size.y - 12.0
	var marker_y: float = baseline - float(target_height) * unit
	draw_line(
		Vector2(size.x * 0.12, marker_y),
		Vector2(size.x * 0.88, marker_y),
		TARGET_MARKER_COLOR,
		2.0
	)

func _unit_size() -> float:
	var tower_units: int = max(target_height, current_height, 1)
	return clamp((size.y - 28.0) / float(tower_units), 12.0, 34.0)

func _normalize_block_entry(entry: Dictionary) -> Dictionary:
	var block: Variant = entry.get("block", {})

	if typeof(block) == TYPE_DICTIONARY:
		return block

	var height: int = max(0, int(entry.get("height", block)))
	var cells: Array = []

	for y in range(height):
		cells.append([0, y])

	return {
		"shapeId": "LEGACY",
		"cells": cells,
		"height": height
	}

func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
