extends GutTest

const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")

const O_CELLS := [[0, 0], [1, 0], [0, 1], [1, 1]]
const I_HORIZONTAL_CELLS := [[0, 0], [1, 0], [2, 0], [3, 0]]
const T_CELLS := [[1, 0], [0, 1], [1, 1], [2, 1]]

# The placeable span is static state on SnapGrid, set per level from game_state,
# so every test starts from the default span rather than inheriting whatever the
# previous test left behind.
func before_each() -> void:
	SnapGridScript.reset_placeable_range()

func after_all() -> void:
	SnapGridScript.reset_placeable_range()

func entry(cells: Array, origin_x: int, origin_y: int) -> Dictionary:
	return {
		"playerId": "p1",
		"block": {"id": "b", "shapeId": "X", "cells": cells, "height": 1},
		"originX": origin_x,
		"originY": origin_y
	}

func test_settle_origin_y_lands_on_the_platform_of_an_empty_tower() -> void:
	assert_eq(
		SnapGridScript.settle_origin_y([], O_CELLS, 4), 0,
		"With nothing placed the brick must settle on the platform at row 0."
	)

func test_settle_origin_y_stacks_on_an_occupied_column() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	assert_eq(
		SnapGridScript.settle_origin_y(tower, O_CELLS, 4), 2,
		"A 2-tall O resting on another 2-tall O must settle at row 2."
	)

func test_settle_origin_y_falls_past_a_stack_it_does_not_overlap() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	assert_eq(
		SnapGridScript.settle_origin_y(tower, O_CELLS, 6), 0,
		"A brick in clear columns must fall to the platform, not rest at the neighbour's height."
	)

func test_settle_origin_y_supports_a_cantilever() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	assert_eq(
		SnapGridScript.settle_origin_y(tower, I_HORIZONTAL_CELLS, 5), 2,
		"A horizontal I overlapping the stack by one column must rest on it and overhang."
	)

func test_top_height_reports_the_global_peak() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0), entry(O_CELLS, 4, 2)]
	assert_eq(SnapGridScript.top_height(tower), 4, "Two stacked 2-tall bricks reach height 4.")
	assert_eq(SnapGridScript.top_height([]), 0, "An empty tower has height 0.")

func test_origin_range_keeps_the_whole_footprint_placeable() -> void:
	var wide: Vector2i = SnapGridScript.origin_range(I_HORIZONTAL_CELLS)
	assert_eq(wide.x, 4, "The minimum origin is always the first placeable column.")
	assert_eq(
		wide.y, 6,
		"A width-4 brick must not start past column 6, or its footprint leaves column 9."
	)
	var narrow: Vector2i = SnapGridScript.origin_range(O_CELLS)
	assert_eq(narrow.y, 8, "A width-2 brick may start as late as column 8.")

func test_tower_snap_points_expose_seven_platform_points() -> void:
	var points: Array = SnapGridScript.tower_snap_points([])
	assert_eq(points.size(), 7, "The empty platform exposes one point per placeable boundary.")
	assert_true(points.has(Vector2i(4, 0)), "The left placeable boundary is a snap point.")
	assert_true(points.has(Vector2i(10, 0)), "The right placeable boundary is a snap point.")

func test_tower_snap_points_add_placed_brick_corners_without_duplicates() -> void:
	var points: Array = SnapGridScript.tower_snap_points([entry(O_CELLS, 4, 0)])
	assert_true(points.has(Vector2i(4, 2)), "A placed brick's top-left corner is a snap point.")
	assert_true(points.has(Vector2i(6, 2)), "A placed brick's top-right corner is a snap point.")
	assert_eq(
		points.size(), 9,
		"The brick's two ground corners already exist as platform points and must not repeat."
	)

func test_tower_snap_points_exclude_unplaceable_columns() -> void:
	var points: Array = SnapGridScript.tower_snap_points([entry(O_CELLS, 0, 0)])
	for point in points:
		assert_between(
			point.x, 4, 10, "No snap point may sit outside the placeable boundary span."
		)

func test_resolve_lands_the_brick_exactly_where_its_corner_snapped() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	var ghost_center := Vector2(7.0, 3.0)
	var snap: Dictionary = SnapGridScript.resolve(tower, O_CELLS, ghost_center, 2.2)

	assert_true(snap.valid, "A dragged brick with cells always resolves.")
	assert_true(snap.snapped, "A ghost within the snap radius of a brick corner must snap.")
	assert_true(snap.exact, "A snapped resolution places at the aimed origin, not by gravity.")
	assert_eq(
		snap.column, 6,
		"Pairing the ghost's lower-left vertex with the stack's top-right corner yields column 6."
	)
	assert_eq(
		snap.origin_y, 2,
		"The brick stays at the row it snapped to instead of falling to the empty platform below."
	)
	assert_eq(
		snap.target_point, Vector2i(6, 2),
		"The highlighted point is the corner the brick actually docked against."
	)

func test_resolve_always_pairs_the_matched_vertex_with_the_target_point() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	var snap: Dictionary = SnapGridScript.resolve(tower, O_CELLS, Vector2(5.0, 5.0), 6.0)
	var landed_vertex := Vector2i(
		snap.column + snap.matched_vertex.x, snap.origin_y + snap.matched_vertex.y
	)

	assert_true(snap.snapped, "A generous snap radius must lock on.")
	assert_eq(
		landed_vertex, snap.target_point,
		"The highlighted point must be the point the placed brick's own corner reaches."
	)

func test_resolve_fills_a_gap_under_an_overhang() -> void:
	# A 1x1 hole at (5, 0): two ground bricks either side and a lid across the top.
	var tower: Array = [
		entry([[0, 0]], 4, 0), entry([[0, 0]], 6, 0), entry([[0, 0], [1, 0], [2, 0]], 4, 1)
	]
	var snap: Dictionary = SnapGridScript.resolve(tower, [[0, 0]], Vector2(5.5, 0.5), 2.2)

	assert_true(snap.snapped, "The hole's own corners are snap points like any other.")
	assert_eq(snap.column, 5, "The brick must resolve into the hole's column.")
	assert_eq(
		snap.origin_y, 0,
		"A void that could never be filled from above is reachable now that aim decides the row."
	)

func test_resolve_skips_an_overlapping_pairing_for_the_next_legal_one() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]
	# Dead centre of the placed brick: the closest pairings all overlap it.
	var snap: Dictionary = SnapGridScript.resolve(tower, O_CELLS, Vector2(5.0, 1.0), 6.0)

	assert_true(snap.snapped, "A generous radius still finds a legal pairing further out.")
	assert_false(
		SnapGridScript.occupied_cells(tower).has(Vector2i(snap.column, snap.origin_y)),
		"A resolution may never drop the brick on top of a cell that is already occupied."
	)

func test_is_placement_legal_accepts_ground_stacked_and_corner_contact() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]

	assert_true(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 6, 0),
		"A brick resting on the platform beside the tower is legal."
	)
	assert_true(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 4, 2),
		"A brick stacked squarely on the tower is legal."
	)
	assert_true(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 6, 2),
		"Corner contact counts as attached -- stability charges for it, legality does not block it."
	)

func test_is_placement_legal_rejects_overlaps_floaters_and_underground() -> void:
	var tower: Array = [entry(O_CELLS, 4, 0)]

	assert_false(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 5, 1),
		"A footprint overlapping a placed cell is never legal."
	)
	assert_false(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 8, 4),
		"A brick touching nothing at all would hang in mid-air."
	)
	assert_false(
		SnapGridScript.is_placement_legal(tower, O_CELLS, 4, -1),
		"Nothing may be placed below the platform."
	)

func test_resolve_falls_back_to_the_nearest_column_beyond_the_snap_radius() -> void:
	var snap: Dictionary = SnapGridScript.resolve([], O_CELLS, Vector2(7.0, 40.0), 2.2)

	assert_true(snap.valid, "A far-away drag still resolves to something placeable.")
	assert_false(snap.snapped, "Nothing is within the snap radius, so this is the fallback path.")
	assert_between(
		snap.column, 4, 8, "The fallback column must still be a legal origin for a width-2 brick."
	)

func test_resolve_never_returns_a_column_that_leaves_the_placeable_range() -> void:
	for ghost_x in [0.0, 4.0, 7.0, 10.0, 14.0]:
		var snap: Dictionary = SnapGridScript.resolve(
			[], I_HORIZONTAL_CELLS, Vector2(ghost_x, 0.5), 2.2
		)
		assert_between(
			snap.column, 4, 6,
			"A width-4 brick dragged to x=%s must stay within origins 4-6." % ghost_x
		)

func test_a_wider_site_widens_the_snap_points_and_origin_range() -> void:
	SnapGridScript.set_placeable_range(2, 11)

	var points: Array = SnapGridScript.tower_snap_points([])
	assert_eq(points.size(), 11, "A 10-wide site exposes one point per column boundary.")
	assert_true(points.has(Vector2i(2, 0)), "The widened left boundary is a snap point.")
	assert_true(points.has(Vector2i(12, 0)), "The widened right boundary is a snap point.")

	var wide: Vector2i = SnapGridScript.origin_range(I_HORIZONTAL_CELLS)
	assert_eq(wide.x, 2, "The minimum origin follows the widened site.")
	assert_eq(wide.y, 8, "A width-4 brick may start as late as column 8 on a 2-11 site.")

func test_a_wider_site_still_never_lets_a_footprint_escape_it() -> void:
	SnapGridScript.set_placeable_range(2, 11)

	for ghost_x in [0.0, 2.0, 7.0, 11.0, 14.0]:
		var snap: Dictionary = SnapGridScript.resolve(
			[], I_HORIZONTAL_CELLS, Vector2(ghost_x, 0.5), 2.2
		)
		assert_between(
			snap.column, 2, 8,
			"A width-4 brick dragged to x=%s must stay within origins 2-8." % ghost_x
		)

func test_set_placeable_range_rejects_an_impossible_span() -> void:
	SnapGridScript.set_placeable_range(9, 4)
	assert_eq(
		SnapGridScript.placeable_column_min, 4,
		"An inverted span must be ignored rather than corrupting the grid."
	)

	SnapGridScript.set_placeable_range(0, 99)
	assert_eq(
		SnapGridScript.placeable_column_max, 9,
		"A span past the grid edge must be ignored."
	)

func test_resolve_uses_true_outline_vertices_for_a_t_brick() -> void:
	var vertices: Array = SnapGridScript.ghost_snap_points(T_CELLS)
	assert_false(
		vertices.has(Vector2i(0, 0)),
		"A T's bounding-box corner is not part of its silhouette and must not be a snap vertex."
	)
	assert_true(vertices.has(Vector2i(0, 1)), "The T's real lower-left outline vertex is a snap vertex.")

func test_resolve_rejects_an_empty_block() -> void:
	var snap: Dictionary = SnapGridScript.resolve([], [], Vector2(7.0, 1.0), 2.2)
	assert_false(snap.valid, "An empty block cannot resolve to a placement.")
