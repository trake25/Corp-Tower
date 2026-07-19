extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")

const GRID_COLOR := Color(0.9, 0.95, 1.0, 0.9)
const FALLBACK_COLOR := PlayerColors.FALLBACK_COLOR
const MIN_UNIT_SIZE := 12.0
const MAX_UNIT_SIZE := 34.0
const TOP_PADDING := 14.0
const BOTTOM_PADDING := 12.0
const SCROLL_HEADROOM_UNITS := 2
const COLLAPSE_TILT_DEG := 70.0
const TILT_EASE_SPEED := 6.0

var tower_blocks: Array = []
var current_height: int = 0
var target_height: int = 0
var player_color_map: Dictionary = {}
var tower_stability: int = 100
var tower_tilt_deg: float = 0.0
var displayed_tilt_deg: float = 0.0
var tower_collapsed: bool = false

func _ready() -> void:
	clip_contents = true

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func set_tower(blocks: Array, new_current_height: int, new_target_height: int, new_stability: int = 100, diagnostics: Dictionary = {}) -> void:
	tower_blocks = blocks
	current_height = max(0, new_current_height)
	target_height = max(0, new_target_height)
	tower_stability = clampi(new_stability, 0, 100)

	tower_collapsed = bool(diagnostics.get("collapsed", false))
	var reported_tilt: float = float(diagnostics.get("tiltAngleDeg", 0.0))

	if tower_collapsed:
		var lean_sign: float = 1.0 if reported_tilt >= 0.0 else -1.0
		tower_tilt_deg = lean_sign * COLLAPSE_TILT_DEG
	else:
		tower_tilt_deg = reported_tilt

	queue_redraw()

func _process(delta: float) -> void:
	if absf(displayed_tilt_deg - tower_tilt_deg) > 0.01:
		displayed_tilt_deg = lerpf(displayed_tilt_deg, tower_tilt_deg, minf(1.0, TILT_EASE_SPEED * delta))
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
	if tower_blocks.is_empty():
		_draw_fallback_stack()
		return

	var unit: float = _unit_size()
	var base_x: float = size.x * 0.5
	var baseline: float = size.y - BOTTOM_PADDING
	var scroll_offset_units: int = _scroll_offset_units(unit)
	var tower_units: int = max(target_height, current_height, 1)

	var pivot: Vector2 = Vector2(base_x, baseline)
	draw_set_transform(pivot, deg_to_rad(displayed_tilt_deg), Vector2.ONE)

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
			var abs_x: float = base_x + (float(origin_x + cell_x) - 3.0) * unit - unit * 0.5
			var y_units: int = base_height + int(block.get("height", 0)) - cell_y - 1
			var abs_y: float = baseline - float(y_units + 1 - scroll_offset_units) * unit
			var abs_rect: Rect2 = Rect2(Vector2(abs_x, abs_y), Vector2(unit - 2.0, unit - 2.0))

			if !_is_rect_visible(abs_rect):
				continue

			var rect: Rect2 = Rect2(abs_rect.position - pivot, abs_rect.size)
			draw_rect(rect, color, true)
			draw_rect(rect.grow(-3.0), Color(color.r, color.g, color.b, 0.36), true)
			draw_rect(rect, GRID_COLOR, false, 1.5)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

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
