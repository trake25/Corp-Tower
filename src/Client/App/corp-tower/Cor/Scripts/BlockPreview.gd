extends Control

const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

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
const FLOATING_DRAG_SHADOW_OFFSET := Vector2(0.0, 4.0)
const FLOATING_DRAG_MIN_CELL_SIZE := 14.0
const PREVIEW_GAP := 6.0

# Placeholder anchor-cell indicator: no anchor emoji assets exist yet
# (only reference/guide-only-brick-emoji.png, a design mockup, not an
# importable asset) -- swap this drawn marker out once real art lands.
const ANCHOR_MARKER_FILL := Color(1.0, 0.85, 0.15, 1.0)
const ANCHOR_MARKER_LINE := Color(0.35, 0.24, 0.0, 1.0)

var cells: Array = []
var shape_id: String = ""
var anchor_x: int = 0
var is_available: bool = false
var cell_color: Color = DEFAULT_CELL_COLOR
var preview_mode: PreviewMode = PreviewMode.INVENTORY

func _ready() -> void:
	material = BlockDataScript.brick_shader_material()

func set_block(block: Dictionary) -> void:
	cells = block.get("cells", [])
	shape_id = str(block.get("shapeId", ""))
	anchor_x = int(block.get("anchorX", 0))
	is_available = cells.size() > 0
	queue_redraw()

func clear_block() -> void:
	cells = []
	shape_id = ""
	anchor_x = 0
	is_available = false
	queue_redraw()

func set_preview_mode(mode: PreviewMode) -> void:
	preview_mode = mode
	queue_redraw()

func _draw() -> void:
	if cells.is_empty():
		return

	var texture: Texture2D = BlockDataScript.brick_texture(shape_id)

	if texture == null:
		_draw_fallback_cells()
		return

	match preview_mode:
		PreviewMode.INVENTORY:
			_draw_brick(texture, cell_color if is_available else DEFAULT_DISABLED_COLOR, Vector2.ZERO, true)
		PreviewMode.FLOATING_DRAG:
			_draw_brick(texture, Color(0.0, 0.0, 0.0, FLOATING_DRAG_SHADOW_ALPHA), FLOATING_DRAG_SHADOW_OFFSET, false)
			_draw_brick(texture, Color(cell_color.r, cell_color.g, cell_color.b, FLOATING_DRAG_FILL_ALPHA), Vector2.ZERO, true)

func _draw_brick(texture: Texture2D, color: Color, offset: Vector2, draw_anchor: bool = false) -> void:
	var bounds: Dictionary = BlockDataScript.cell_bounds(cells)
	var columns: int = bounds.max_x - bounds.min_x + 1
	var rows: int = bounds.max_y - bounds.min_y + 1
	var available_size: Vector2 = size - Vector2(PREVIEW_GAP, PREVIEW_GAP) * 2.0
	var cell_size: float = minf(
		available_size.x / float(columns),
		available_size.y / float(rows)
	)

	cell_size = maxf(FLOATING_DRAG_MIN_CELL_SIZE, cell_size)

	var rotation_steps: int = BlockDataScript.detect_rotation_steps(shape_id, cells)
	var canonical_bounds: Dictionary = BlockDataScript.cell_bounds(BlockDataScript.BRICK_SHAPES.get(shape_id, cells))
	var canonical_columns: int = canonical_bounds.max_x - canonical_bounds.min_x + 1
	var canonical_rows: int = canonical_bounds.max_y - canonical_bounds.min_y + 1
	var canonical_size: Vector2 = Vector2(float(canonical_columns), float(canonical_rows)) * cell_size

	var center: Vector2 = size * 0.5 + offset
	var points: PackedVector2Array = BlockDataScript.brick_quad_points(center, canonical_size, rotation_steps)
	var colors := PackedColorArray([color, color, color, color])

	draw_primitive(points, colors, BlockDataScript.brick_quad_uvs(), texture)

	if draw_anchor:
		# The rendered quad is canonical_size rotated by rotation_steps, whose
		# axis-aligned footprint always equals the current (already-rotated)
		# cell bounds -- so the marker grid can be laid out directly from
		# `bounds`/`columns`/`rows` without re-deriving the rotation.
		var origin: Vector2 = center - Vector2(float(columns), float(rows)) * cell_size * 0.5
		_draw_anchor_marker(bounds, origin, cell_size, 0.0)

func _draw_fallback_cells() -> void:
	match preview_mode:
		PreviewMode.INVENTORY:
			_draw_inventory_fallback()
		PreviewMode.FLOATING_DRAG:
			_draw_floating_drag_fallback()

func _draw_inventory_fallback() -> void:
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
	_draw_anchor_marker(bounds, origin, cell_size, gap)

func _draw_floating_drag_fallback() -> void:
	var bounds: Dictionary = _get_cell_bounds()
	var columns: int = bounds.max_x - bounds.min_x + 1
	var rows: int = bounds.max_y - bounds.min_y + 1
	var gap: float = 5.0
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

	_draw_cells(
		bounds,
		origin + FLOATING_DRAG_SHADOW_OFFSET,
		cell_size,
		gap,
		shadow_color,
		Color(0.0, 0.0, 0.0, 0.0),
		0.0
	)
	_draw_cells(bounds, origin, cell_size, gap, fill_color, border_color, 2.5)
	_draw_anchor_marker(bounds, origin, cell_size, gap)

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

# Marks the brick's anchor column -- the cell that lands on whichever lane
# guide the player picks -- with a placeholder smiley. `anchor_x` is a
# column index, and shapes like O/L/T can stack multiple cells in that
# column, so the marker centers on the middle of that column's cell span.
func _draw_anchor_marker(bounds: Dictionary, origin: Vector2, cell_size: float, gap: float) -> void:
	if !is_available or cells.is_empty():
		return

	var draw_rows: Array = []

	for cell in cells:
		if _cell_x(cell) == anchor_x:
			draw_rows.append(bounds.max_y - _cell_y(cell))

	if draw_rows.is_empty():
		return

	draw_rows.sort()
	var mid_row: float = (float(draw_rows[0]) + float(draw_rows[draw_rows.size() - 1])) * 0.5
	var draw_col: int = anchor_x - bounds.min_x
	var marker_center: Vector2 = origin + Vector2(
		float(draw_col) * (cell_size + gap) + cell_size * 0.5,
		mid_row * (cell_size + gap) + cell_size * 0.5
	)

	_draw_smiley(marker_center, cell_size)

func _draw_smiley(center: Vector2, cell_size: float) -> void:
	var radius: float = cell_size * 0.28

	draw_circle(center, radius, ANCHOR_MARKER_FILL)
	draw_arc(center, radius, 0.0, TAU, 24, ANCHOR_MARKER_LINE, 1.5, true)

	var eye_dx: float = radius * 0.35
	var eye_dy: float = -radius * 0.22
	var eye_radius: float = maxf(1.0, radius * 0.14)

	draw_circle(center + Vector2(-eye_dx, eye_dy), eye_radius, ANCHOR_MARKER_LINE)
	draw_circle(center + Vector2(eye_dx, eye_dy), eye_radius, ANCHOR_MARKER_LINE)
	draw_arc(
		center + Vector2(0.0, radius * 0.05),
		radius * 0.5,
		deg_to_rad(20.0),
		deg_to_rad(160.0),
		12,
		ANCHOR_MARKER_LINE,
		1.5,
		true
	)

func _get_cell_bounds() -> Dictionary:
	return BlockDataScript.cell_bounds(cells)

func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
