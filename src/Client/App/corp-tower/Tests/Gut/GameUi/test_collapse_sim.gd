extends GutTest

const CollapseSimScript = preload("res://Cor/Scripts/GameUi/CollapseSim.gd")

const UNIT := 34.0
const FLOOR_Y := 608.0
const SPAN_CENTER := 136.0
const SPAN_HALF := 111.0
const STEP := 1.0 / 60.0
const MAX_STEPS := 600
const EPSILON := 0.001

const I_FOOTPRINT := Vector2(UNIT, UNIT * 4.0)
const O_FOOTPRINT := Vector2(UNIT * 2.0, UNIT * 2.0)
const T_FOOTPRINT := Vector2(UNIT * 3.0, UNIT * 2.0)

func params(overrides: Dictionary = {}) -> Dictionary:
	var resolved: Dictionary = {
		"seed": 20260726,
		"gravity": 42.0 * UNIT,
		"lean_sign": 1.0,
		"lean_push": 6.0 * UNIT,
		"lateral_spread": 2.2 * UNIT,
		"drop_kick": 1.5 * UNIT,
		"spin_max": deg_to_rad(260.0),
		"air_drag": 0.55,
		"restitution": 0.24,
		"floor_friction": 0.5,
		"bounce_min_speed": 3.0 * UNIT,
		"max_bounces": 1,
		"flatten_seconds": 0.28,
		"floor_y": FLOOR_Y,
		"span_center": SPAN_CENTER,
		"span_half_width": SPAN_HALF,
		"bucket_width": UNIT,
		"pile_max_layers": 2,
		"pile_layer_height": 0.55 * UNIT
	}

	for key in overrides:
		resolved[key] = overrides[key]

	return resolved

func seeds() -> Array:
	var footprints: Array = [I_FOOTPRINT, O_FOOTPRINT, T_FOOTPRINT]
	var built: Array = []

	for index in range(9):
		var footprint: Vector2 = footprints[index % footprints.size()]

		built.append({
			"pos": Vector2(
				SPAN_CENTER + float(index % 3 - 1) * UNIT,
				FLOOR_Y - float(index + 1) * UNIT * 2.0
			),
			"angle": deg_to_rad(20.0),
			"height_ratio": float(index) / 8.0,
			"footprint": footprint,
			"quad_size": footprint,
			"rotation_steps": 0
		})

	return built

func started_sim(overrides: Dictionary = {}):
	var sim = CollapseSimScript.new()
	sim.begin(seeds(), params(overrides))
	return sim

func run_to_settled(sim) -> int:
	var steps: int = 0

	while not sim.is_settled() and steps < MAX_STEPS:
		sim.step(STEP)
		steps += 1

	return steps

func resting_footprint(piece: Dictionary) -> Vector2:
	var footprint: Vector2 = piece.footprint
	var quarter_turns: int = absi(int(round(float(piece.angle) / (PI * 0.5))))

	if quarter_turns % 2 == 0:
		return footprint

	return Vector2(footprint.y, footprint.x)

func test_no_piece_starts_moving_upward() -> void:
	var sim = started_sim()

	for piece_value in sim.pieces:
		var piece: Dictionary = piece_value
		assert_true(
			float(piece.vel.y) >= 0.0,
			"A collapsing brick must only ever be kicked downward, never up: got %f." % piece.vel.y
		)

func test_every_piece_settles_inside_the_transition_window() -> void:
	var sim = started_sim()
	var steps: int = run_to_settled(sim)

	assert_true(sim.is_settled(), "The collapse must reach a settled state, not bounce forever.")
	assert_true(
		float(steps) * STEP <= 3.0,
		"The collapse must finish well inside the server's post-level window: took %fs." % (float(steps) * STEP)
	)

func test_no_piece_settles_below_the_platform() -> void:
	var sim = started_sim()
	run_to_settled(sim)

	for piece_value in sim.pieces:
		var piece: Dictionary = piece_value
		assert_true(
			float(piece.pos.y) <= FLOOR_Y + EPSILON,
			"Debris must come to rest on the platform, never through it: got y %f." % piece.pos.y
		)

func test_every_piece_settles_inside_the_platform_span() -> void:
	var sim = started_sim()
	run_to_settled(sim)

	for piece_value in sim.pieces:
		var piece: Dictionary = piece_value
		var half_extent: float = float(piece.half_extent)
		var left: float = SPAN_CENTER - SPAN_HALF + half_extent
		var right: float = SPAN_CENTER + SPAN_HALF - half_extent

		assert_true(
			float(piece.pos.x) >= left - EPSILON and float(piece.pos.x) <= right + EPSILON,
			"Debris must land on the platform, not past its rim: x %f outside [%f, %f]." % [piece.pos.x, left, right]
		)

func test_every_piece_lands_flat() -> void:
	var sim = started_sim()
	run_to_settled(sim)

	for piece_value in sim.pieces:
		var piece: Dictionary = piece_value
		var quarter_turns: float = float(piece.angle) / (PI * 0.5)

		assert_almost_eq(
			quarter_turns, round(quarter_turns), 0.0001,
			"A settled brick must sit on a quarter turn, not at an arbitrary angle."
		)

		var footprint: Vector2 = resting_footprint(piece)

		assert_true(
			footprint.x + EPSILON >= footprint.y,
			"A settled brick must lie flat -- wider than tall: got %s." % str(footprint)
		)

func test_flat_rest_angle_lays_a_tall_brick_on_its_side() -> void:
	assert_almost_eq(
		CollapseSimScript.flat_rest_angle(0.0, I_FOOTPRINT), PI * 0.5, 0.0001,
		"An upright 1x4 I has to turn a quarter to land flat."
	)

func test_flat_rest_angle_leaves_an_already_flat_brick_alone() -> void:
	assert_almost_eq(
		CollapseSimScript.flat_rest_angle(0.0, T_FOOTPRINT), 0.0, 0.0001,
		"A 3x2 T is already wider than it is tall, so it must not be turned."
	)

func test_flat_rest_angle_never_unwinds_the_turns_a_brick_made() -> void:
	var spun: float = deg_to_rad(700.0)
	var rest_angle: float = CollapseSimScript.flat_rest_angle(spun, O_FOOTPRINT)

	assert_true(
		absf(rest_angle - spun) <= PI * 0.5 + EPSILON,
		"Flattening must ease to the nearest quarter turn, not spin back through every turn taken."
	)

func test_the_same_seed_produces_the_same_collapse() -> void:
	var first = started_sim()
	var second = started_sim()

	run_to_settled(first)
	run_to_settled(second)

	for index in range(first.pieces.size()):
		var left: Dictionary = first.pieces[index]
		var right: Dictionary = second.pieces[index]

		assert_almost_eq(
			float(left.pos.x), float(right.pos.x), EPSILON,
			"One seed must give every client the identical collapse."
		)
		assert_almost_eq(
			float(left.angle), float(right.angle), EPSILON,
			"One seed must give every client the identical collapse."
		)

func test_a_different_seed_produces_a_different_collapse() -> void:
	var first = started_sim()
	var second = started_sim({"seed": 987654})

	run_to_settled(first)
	run_to_settled(second)

	var differences: int = 0

	for index in range(first.pieces.size()):
		var left: Dictionary = first.pieces[index]
		var right: Dictionary = second.pieces[index]

		if absf(float(left.pos.x) - float(right.pos.x)) > EPSILON:
			differences += 1

	assert_true(
		differences > 0,
		"Different seeds must actually scatter the debris differently."
	)
