extends Control

enum PreviewMode {
	INVENTORY,
	FLOATING_DRAG
}

const DEFAULT_CELL_COLOR := Color(0.2, 0.55, 0.95, 1.0)
const DEFAULT_DISABLED_COLOR := Color(0.26, 0.3, 0.34, 1.0)
const DEFAULT_BORDER_COLOR := Color(0.87, 0.92, 1.0, 1.0)
const FLOATING_DRAG_FILL_ALPHA := 0.88
const FLOATING_DRAG_BORDER_ALPHA := 0.95
const FLOATING_DRAG_SHADOW_ALPHA := 0.28
const FLOATING_DRAG_MIN_CELL_SIZE := 14.0
const FLOATING_DRAG_CELL_GAP := 5.0

var cells: Array = []
var is_available: bool = false
var cell_color: Color = DEFAULT_CELL_COLOR
var preview_mode: PreviewMode = PreviewMode.INVENTORY

func set_block(block: Dictionary) -> void:
	cells = block.get("cells", [])
	is_available = cells.size() > 0
	queue_redraw()

func clear_block() -> void:
	cells = []
	is_available = false
	queue_redraw()

func set_preview_mode(mode: PreviewMode) -> void:
	preview_mode = mode
	queue_redraw()

func _draw() -> void:
	if cells.is_empty():
		return

	match preview_mode:
		PreviewMode.INVENTORY:
			_draw_inventory_preview()
		PreviewMode.FLOATING_DRAG:
			_draw_floating_drag_preview()

func _draw_inventory_preview() -> void:
	var bounds: Dictionary = _get_cell_bounds()
	var columns: int = bounds.max_x - bounds.min_x + 1
	var rows: int = bounds.max_y - bounds.min_y + 1
	var gap: float = 4.0
	var available_size: Vector2 = size - Vector2(gap * 2.0, gap * 2.0)
	var cell_size: float = minf(
		available_size.x / float(columns),
		available_size.y / float(rows)
	)

	cell_size = maxf(8.0, cell_size - gap)

	var total_size: Vector2 = Vector2(
		float(columns) * cell_size + float(columns - 1) * gap,
		float(rows) * cell_size + float(rows - 1) * gap
	)
	var origin: Vector2 = (size - total_size) * 0.5
	var fill_color: Color = cell_color if is_available else DEFAULT_DISABLED_COLOR

	_draw_cells(bounds, origin, cell_size, gap, fill_color, DEFAULT_BORDER_COLOR, 2.0)

func _draw_floating_drag_preview() -> void:
	var bounds: Dictionary = _get_cell_bounds()
	var columns: int = bounds.max_x - bounds.min_x + 1
	var rows: int = bounds.max_y - bounds.min_y + 1
	var gap: float = FLOATING_DRAG_CELL_GAP
	var available_size: Vector2 = size - Vector2(gap * 2.0, gap * 2.0)
	var cell_size: float = minf(
		available_size.x / float(columns),
		available_size.y / float(rows)
	)

	cell_size = maxf(FLOATING_DRAG_MIN_CELL_SIZE, cell_size - gap)

	var total_size: Vector2 = Vector2(
		float(columns) * cell_size + float(columns - 1) * gap,
		float(rows) * cell_size + float(rows - 1) * gap
	)
	var origin: Vector2 = (size - total_size) * 0.5
	var fill_color: Color = Color(cell_color.r, cell_color.g, cell_color.b, FLOATING_DRAG_FILL_ALPHA)
	var border_color: Color = Color(
		DEFAULT_BORDER_COLOR.r,
		DEFAULT_BORDER_COLOR.g,
		DEFAULT_BORDER_COLOR.b,
		FLOATING_DRAG_BORDER_ALPHA
	)
	var shadow_color: Color = Color(0.0, 0.0, 0.0, FLOATING_DRAG_SHADOW_ALPHA)
	var shadow_offset: Vector2 = Vector2(0.0, 4.0)

	_draw_cells(
		bounds,
		origin + shadow_offset,
		cell_size,
		gap,
		shadow_color,
		Color(0.0, 0.0, 0.0, 0.0),
		0.0
	)
	_draw_cells(bounds, origin, cell_size, gap, fill_color, border_color, 2.5)

func _draw_cells(
	bounds: Dictionary,
	origin: Vector2,
	cell_size: float,
	gap: float,
	fill_color: Color,
	border_color: Color,
	border_width: float
) -> void:
	for cell in cells:
		var draw_cell_x: int = _cell_x(cell) - bounds.min_x
		var draw_cell_y: int = bounds.max_y - _cell_y(cell)
		var rect: Rect2 = Rect2(
			origin + Vector2(float(draw_cell_x) * (cell_size + gap), float(draw_cell_y) * (cell_size + gap)),
			Vector2(cell_size, cell_size)
		)

		draw_rect(rect, fill_color, true)

		if border_width > 0.0:
			draw_rect(rect, border_color, false, border_width)

func _get_cell_bounds() -> Dictionary:
	var min_x: int = 999999
	var min_y: int = 999999
	var max_x: int = -999999
	var max_y: int = -999999

	for cell in cells:
		var bounds_cell_x: int = _cell_x(cell)
		var bounds_cell_y: int = _cell_y(cell)
		min_x = mini(min_x, bounds_cell_x)
		min_y = mini(min_y, bounds_cell_y)
		max_x = maxi(max_x, bounds_cell_x)
		max_y = maxi(max_y, bounds_cell_y)

	return {
		"min_x": min_x,
		"min_y": min_y,
		"max_x": max_x,
		"max_y": max_y
	}

func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
