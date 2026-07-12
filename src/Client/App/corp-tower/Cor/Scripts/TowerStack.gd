extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")

const GRID_COLOR := Color(0.9, 0.95, 1.0, 0.9)
const FALLBACK_COLOR := PlayerColors.FALLBACK_COLOR
const TARGET_MARKER_COLOR := Color(1.0, 0.82, 0.25, 1.0)
const MIN_UNIT_SIZE := 12.0
const MAX_UNIT_SIZE := 34.0
const TOP_PADDING := 14.0
const BOTTOM_PADDING := 12.0
const SCROLL_HEADROOM_UNITS := 2

var tower_blocks: Array = []
var current_height: int = 0
var target_height: int = 0
var player_color_map: Dictionary = {}
var tower_stability: int = 100

func _ready() -> void:
	clip_contents = true

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func set_tower(blocks: Array, new_current_height: int, new_target_height: int, new_stability: int = 100) -> void:
	tower_blocks = blocks
	current_height = max(0, new_current_height)
	target_height = max(0, new_target_height)
	tower_stability = clampi(new_stability, 0, 100)
	queue_redraw()

func set_player_color_map(new_player_color_map: Dictionary) -> void:
	player_color_map = new_player_color_map
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
	var wobble: float = sin(Time.get_ticks_msec() * 0.008) * float(100 - tower_stability) * 0.05
	var baseline: float = size.y - BOTTOM_PADDING
	var scroll_offset_units: int = _scroll_offset_units(unit)
	var tower_units: int = max(target_height, current_height, 1)

	for i in range(tower_blocks.size()):
		var entry: Dictionary = tower_blocks[i]
		var block: Dictionary = _normalize_block_entry(entry)
		var cells: Array = block.get("cells", [])
		var base_height: int = int(entry.get("originY", entry.get("baseHeight", 0)))
		var origin_x: int = int(entry.get("originX", 0))
		var color: Color = _player_color(entry)

		for cell in cells:
			var cell_x: int = _cell_x(cell)
			var cell_y: int = _cell_y(cell)
			var x: float = base_x + (float(origin_x + cell_x) - 3.0) * unit - unit * 0.5 + wobble
			var y_units: int = base_height + int(block.get("height", 0)) - cell_y - 1
			var y: float = baseline - float(y_units + 1 - scroll_offset_units) * unit
			var rect: Rect2 = Rect2(Vector2(x, y), Vector2(unit - 2.0, unit - 2.0))

			if !_is_rect_visible(rect):
				continue

			draw_rect(rect, color, true)
			draw_rect(rect.grow(-3.0), Color(color.r, color.g, color.b, 0.36), true)
			draw_rect(rect, GRID_COLOR, false, 1.5)

	if current_height > tower_units:
		_draw_fallback_stack()

func _draw_fallback_stack() -> void:
	if current_height <= 0:
		return

	var unit: float = _unit_size()
	var width: float = clamp(size.x * 0.24, unit * 1.5, unit * 3.5)
	var x: float = (size.x - width) * 0.5
	var baseline: float = size.y - BOTTOM_PADDING
	var scroll_offset_units: int = _scroll_offset_units(unit)

	for y in range(current_height):
		var rect: Rect2 = Rect2(
			Vector2(x, baseline - float(y + 1 - scroll_offset_units) * unit),
			Vector2(width, unit - 2.0)
		)

		if !_is_rect_visible(rect):
			continue

		draw_rect(rect, FALLBACK_COLOR, true)
		draw_rect(rect, GRID_COLOR, false, 1.0)

func _draw_target_marker() -> void:
	var unit: float = _unit_size()
	var baseline: float = size.y - BOTTOM_PADDING
	var scroll_offset_units: int = _scroll_offset_units(unit)
	var marker_y: float = baseline - float(target_height - scroll_offset_units) * unit

	if marker_y < 0.0 or marker_y > size.y:
		return

	draw_line(
		Vector2(size.x * 0.12, marker_y),
		Vector2(size.x * 0.88, marker_y),
		TARGET_MARKER_COLOR,
		2.0
	)

func _unit_size() -> float:
	var tower_units: int = max(target_height, current_height, 1)
	var available_height: float = max(1.0, size.y - TOP_PADDING - BOTTOM_PADDING)
	var fit_unit: float = available_height / float(tower_units)

	if fit_unit >= MIN_UNIT_SIZE:
		return min(fit_unit, MAX_UNIT_SIZE)

	return MIN_UNIT_SIZE

func _scroll_offset_units(unit: float) -> int:
	var visible_units: int = _visible_unit_capacity(unit)
	var focus_height: int = max(current_height, 1)

	if focus_height <= visible_units:
		return 0

	return focus_height - visible_units + SCROLL_HEADROOM_UNITS

func _visible_unit_capacity(unit: float) -> int:
	var available_height: float = max(1.0, size.y - TOP_PADDING - BOTTOM_PADDING)
	return max(1, int(floor(available_height / unit)))

func _is_rect_visible(rect: Rect2) -> bool:
	return (
		rect.position.y + rect.size.y >= 0.0 &&
		rect.position.y <= size.y &&
		rect.position.x + rect.size.x >= 0.0 &&
		rect.position.x <= size.x
	)

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

func _player_color(entry: Dictionary) -> Color:
	var player_id: String = str(entry.get("playerId", entry.get("player_id", "")))

	if player_color_map.has(player_id):
		return player_color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
