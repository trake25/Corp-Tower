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

# Hollow corner-point placeholders marking the dragged ghost's own snap
# points (the filled-dot counterparts, marking the platform/placed bricks,
# are drawn by TowerStack).
const SNAP_DOT_HOLLOW_COLOR := Color(1.0, 0.0, 0.0, 0.7)
const SNAP_DOT_RADIUS := 4.0

var cells: Array = []
var shape_id: String = ""
var is_available: bool = false
var cell_color: Color = DEFAULT_CELL_COLOR
var preview_mode: PreviewMode = PreviewMode.INVENTORY

func _ready() -> void:
	material = BlockDataScript.brick_shader_material()

func set_block(block: Dictionary) -> void:
	cells = block.get("cells", [])
	shape_id = str(block.get("shapeId", ""))
	is_available = cells.size() > 0
	queue_redraw()

func clear_block() -> void:
	cells = []
	shape_id = ""
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
			_draw_brick(texture, cell_color if is_available else DEFAULT_DISABLED_COLOR, Vector2.ZERO, false)
		PreviewMode.FLOATING_DRAG:
			_draw_brick(texture, Color(0.0, 0.0, 0.0, FLOATING_DRAG_SHADOW_ALPHA), FLOATING_DRAG_SHADOW_OFFSET, false)
			_draw_brick(texture, Color(cell_color.r, cell_color.g, cell_color.b, FLOATING_DRAG_FILL_ALPHA), Vector2.ZERO, true)

func _draw_brick(texture: Texture2D, color: Color, offset: Vector2, draw_snap_dots: bool = false) -> void:
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

	if draw_snap_dots:
		# The rendered quad is canonical_size rotated by rotation_steps, whose
		# axis-aligned footprint always equals the current (already-rotated)
		# cell bounds -- so the dot layout can be derived directly from
		# `bounds`/`columns`/`rows` without re-deriving the rotation.
		var origin: Vector2 = center - Vector2(float(columns), float(rows)) * cell_size * 0.5
		_draw_corner_dots(bounds, origin, cell_size, 0.0)

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
	_draw_corner_dots(bounds, origin, cell_size, gap)

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

# Draws a hollow dot at each true outline vertex of the brick's own shape --
# not its bounding box, which for L/T/Z would put dots on empty corners the
# brick doesn't actually occupy. These are the ghost's own snap points, which
# the player aligns against the filled dots TowerStack draws on the
# platform/placed bricks.
#
# Cells can be drawn with a visible `gap` between them (the fallback path),
# so a lattice vertex shared by two cells doesn't have one exact pixel
# position -- each cell's own rect corner differs by the gap. We derive every
# candidate corner from its actual source cell's rect (same math as
# `_draw_cells`) and only draw each lattice vertex once.
func _draw_corner_dots(bounds: Dictionary, origin: Vector2, cell_size: float, gap: float) -> void:
	if !is_available or cells.is_empty():
		return

	var outline: Array = BlockDataScript.outline_corners(cells)
	var drawn: Dictionary = {}

	for cell in cells:
		var cx: int = _cell_x(cell)
		var cy: int = _cell_y(cell)
		var cell_origin: Vector2 = origin + Vector2(
			float(cx - bounds.min_x) * (cell_size + gap),
			float(bounds.max_y - cy) * (cell_size + gap)
		)
		var local_corners: Dictionary = {
			Vector2i(cx, cy + 1): cell_origin,
			Vector2i(cx + 1, cy + 1): cell_origin + Vector2(cell_size, 0.0),
			Vector2i(cx, cy): cell_origin + Vector2(0.0, cell_size),
			Vector2i(cx + 1, cy): cell_origin + Vector2(cell_size, cell_size)
		}

		for lattice_point in local_corners:
			if drawn.has(lattice_point) or !(lattice_point in outline):
				continue

			drawn[lattice_point] = true
			draw_arc(local_corners[lattice_point], SNAP_DOT_RADIUS, 0.0, TAU, 16, SNAP_DOT_HOLLOW_COLOR, 1.5, true)

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
