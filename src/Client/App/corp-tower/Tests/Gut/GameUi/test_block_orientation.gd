extends GutTest

const BlockData := preload("res://Cor/Scripts/GameUi/BlockData.gd")

# Exhaustively derives every orientation (cells) a dealt block can actually
# reach for a shape -- the 4 rotations of the canonical shape plus the 4
# rotations of its mirror, deduped -- independently of BlockData/Block_Supply,
# so this suite cross-checks rather than assumes the same math.
func _orientations_for(shape_id: String) -> Array:
	var orientations: Array = []
	var seen: Dictionary = {}

	for start in [BlockData.BRICK_SHAPES[shape_id], _reflect_x(BlockData.BRICK_SHAPES[shape_id])]:
		var current: Array = _normalize(start)

		for i in range(4):
			var k: String = _key(current)

			if not seen.has(k):
				seen[k] = true
				orientations.append(current)

			current = _rotate_cw(current)

	return orientations

func test_detect_orientation_reproduces_every_reachable_orientation() -> void:
	for shape_id in BlockData.BRICK_SHAPES:
		for cells in _orientations_for(shape_id):
			var orientation: Dictionary = BlockData.detect_orientation(shape_id, cells)
			var reproduced: Array = _reflect_x(BlockData.BRICK_SHAPES[shape_id]) if orientation.flipped else _normalize(BlockData.BRICK_SHAPES[shape_id])

			for i in range(int(orientation.steps)):
				reproduced = _rotate_cw(reproduced)

			assert_eq(
				_key(reproduced),
				_key(cells),
				"%s steps=%s flipped=%s should reproduce %s" % [shape_id, orientation.steps, orientation.flipped, cells]
			)

func test_quad_bounding_box_matches_the_real_footprint_for_every_orientation() -> void:
	for shape_id in BlockData.BRICK_SHAPES:
		var canonical_bounds: Dictionary = BlockData.cell_bounds(BlockData.BRICK_SHAPES[shape_id])
		var canonical_size := Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1),
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1)
		)

		for cells in _orientations_for(shape_id):
			var real_bounds: Dictionary = BlockData.cell_bounds(cells)
			var real_w: float = float(real_bounds.max_x - real_bounds.min_x + 1)
			var real_h: float = float(real_bounds.max_y - real_bounds.min_y + 1)

			var orientation: Dictionary = BlockData.detect_orientation(shape_id, cells)
			var points: PackedVector2Array = BlockData.brick_quad_points(
				Vector2.ZERO, canonical_size, int(orientation.steps), bool(orientation.flipped)
			)

			var min_x: float = INF
			var max_x: float = -INF
			var min_y: float = INF
			var max_y: float = -INF

			for point in points:
				min_x = minf(min_x, point.x)
				max_x = maxf(max_x, point.x)
				min_y = minf(min_y, point.y)
				max_y = maxf(max_y, point.y)

			assert_almost_eq(
				max_x - min_x, real_w, 0.01,
				"%s %s rendered quad width should match its real footprint width." % [shape_id, cells]
			)
			assert_almost_eq(
				max_y - min_y, real_h, 0.01,
				"%s %s rendered quad height should match its real footprint height." % [shape_id, cells]
			)

func test_quad_colors_always_shade_the_screen_top_brighter_than_the_bottom() -> void:
	var color := Color(0.5, 0.5, 0.5, 1.0)

	for shape_id in BlockData.BRICK_SHAPES:
		var canonical_bounds: Dictionary = BlockData.cell_bounds(BlockData.BRICK_SHAPES[shape_id])
		var canonical_size := Vector2(
			float(canonical_bounds.max_x - canonical_bounds.min_x + 1),
			float(canonical_bounds.max_y - canonical_bounds.min_y + 1)
		)

		for steps in range(4):
			for flipped in [false, true]:
				var points: PackedVector2Array = BlockData.brick_quad_points(
					Vector2.ZERO, canonical_size, steps, flipped
				)
				var colors: PackedColorArray = BlockData.brick_quad_colors(color, points)

				for i in range(points.size()):
					for j in range(points.size()):
						if points[i].y < points[j].y - 0.001:
							assert_true(
								colors[i].r > colors[j].r,
								"%s steps=%d flipped=%s: a higher-on-screen vertex must be brighter, regardless of rotation." % [shape_id, steps, flipped]
							)

func _normalize(cells: Array) -> Array:
	var min_x: int = 999999
	var min_y: int = 999999

	for cell in cells:
		min_x = mini(min_x, int(cell[0]))
		min_y = mini(min_y, int(cell[1]))

	var normalized: Array = []

	for cell in cells:
		normalized.append([int(cell[0]) - min_x, int(cell[1]) - min_y])

	return normalized

func _rotate_cw(cells: Array) -> Array:
	var rotated: Array = []

	for cell in cells:
		rotated.append([int(cell[1]), -int(cell[0])])

	return _normalize(rotated)

func _reflect_x(cells: Array) -> Array:
	var reflected: Array = []

	for cell in cells:
		reflected.append([-int(cell[0]), int(cell[1])])

	return _normalize(reflected)

func _key(cells: Array) -> String:
	var parts: Array = []

	for cell in cells:
		parts.append("%d,%d" % [int(cell[0]), int(cell[1])])

	parts.sort()
	return "|".join(parts)
