extends Control

const DEFAULT_CELL_COLOR := Color(0.2, 0.55, 0.95, 1.0)
const DEFAULT_DISABLED_COLOR := Color(0.26, 0.3, 0.34, 1.0)
const DEFAULT_BORDER_COLOR := Color(0.87, 0.92, 1.0, 1.0)

var cells: Array = []
var is_available := false
var cell_color := DEFAULT_CELL_COLOR

func set_block(block: Dictionary) -> void:
	cells = block.get("cells", [])
	is_available = cells.size() > 0
	queue_redraw()

func clear_block() -> void:
	cells = []
	is_available = false
	queue_redraw()

func _draw() -> void:
	if cells.is_empty():
		return

	var min_x := 999999
	var min_y := 999999
	var max_x := -999999
	var max_y := -999999

	for cell in cells:
		var x := _cell_x(cell)
		var y := _cell_y(cell)
		min_x = mini(min_x, x)
		min_y = mini(min_y, y)
		max_x = maxi(max_x, x)
		max_y = maxi(max_y, y)

	var columns := max_x - min_x + 1
	var rows := max_y - min_y + 1
	var gap := 4.0
	var available_size := size - Vector2(gap * 2.0, gap * 2.0)
	var cell_size := minf(
		available_size.x / float(columns),
		available_size.y / float(rows)
	)

	cell_size = maxf(8.0, cell_size - gap)

	var total_size := Vector2(
		float(columns) * cell_size + float(columns - 1) * gap,
		float(rows) * cell_size + float(rows - 1) * gap
	)
	var origin := (size - total_size) * 0.5
	var fill_color := cell_color if is_available else DEFAULT_DISABLED_COLOR

	for cell in cells:
		var x := _cell_x(cell) - min_x
		var y := _cell_y(cell) - min_y
		var rect := Rect2(
			origin + Vector2(float(x) * (cell_size + gap), float(y) * (cell_size + gap)),
			Vector2(cell_size, cell_size)
		)

		draw_rect(rect, fill_color, true)
		draw_rect(rect, DEFAULT_BORDER_COLOR, false, 2.0)

func _cell_x(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("x", 0))

	return int(cell[0])

func _cell_y(cell) -> int:
	if typeof(cell) == TYPE_DICTIONARY:
		return int(cell.get("y", 0))

	return int(cell[1])
