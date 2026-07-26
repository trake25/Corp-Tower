extends RefCounted

var pieces: Array = []
var settled: bool = true

var _gravity: float = 1400.0
var _air_drag: float = 0.55
var _restitution: float = 0.24
var _floor_friction: float = 0.5
var _flatten_seconds: float = 0.28
var _bounce_min_speed: float = 100.0
var _max_bounces: int = 1
var _floor_baseline: float = 0.0
var _span_left: float = 0.0
var _span_right: float = 0.0
var _bucket_width: float = 34.0
var _pile_layer_height: float = 0.0
var _pile_max_layers: int = 0
var _reservation_line: float = 0.0
var _bucket_fill: Dictionary = {}

func begin(seeds: Array, params: Dictionary) -> void:
	pieces = []
	_bucket_fill = {}

	_gravity = float(params.get("gravity", _gravity))
	_air_drag = clampf(float(params.get("air_drag", _air_drag)), 0.01, 1.0)
	_restitution = clampf(float(params.get("restitution", _restitution)), 0.0, 0.95)
	_floor_friction = clampf(float(params.get("floor_friction", _floor_friction)), 0.0, 1.0)
	_flatten_seconds = maxf(0.01, float(params.get("flatten_seconds", _flatten_seconds)))
	_bounce_min_speed = maxf(0.0, float(params.get("bounce_min_speed", _bounce_min_speed)))
	_max_bounces = maxi(0, int(params.get("max_bounces", _max_bounces)))
	_floor_baseline = float(params.get("floor_y", 0.0))
	_pile_max_layers = maxi(0, int(params.get("pile_max_layers", 0)))
	_pile_layer_height = maxf(0.0, float(params.get("pile_layer_height", 0.0)))
	_bucket_width = maxf(1.0, float(params.get("bucket_width", _bucket_width)))

	var span_center: float = float(params.get("span_center", 0.0))
	var span_half_width: float = maxf(1.0, float(params.get("span_half_width", 1.0)))
	_span_left = span_center - span_half_width
	_span_right = span_center + span_half_width
	_reservation_line = (
		_floor_baseline - float(_pile_max_layers) * _pile_layer_height - _bucket_width
	)

	var rng := RandomNumberGenerator.new()
	rng.seed = int(params.get("seed", 0))

	var lean_sign: float = signf(float(params.get("lean_sign", 1.0)))
	if is_zero_approx(lean_sign):
		lean_sign = 1.0

	var lean_push: float = float(params.get("lean_push", 0.0))
	var lateral_spread: float = float(params.get("lateral_spread", 0.0))
	var drop_kick: float = maxf(0.0, float(params.get("drop_kick", 0.0)))
	var spin_max: float = float(params.get("spin_max", 0.0))

	for seed_value in seeds:
		var seed_data: Dictionary = seed_value
		var height_ratio: float = clampf(float(seed_data.get("height_ratio", 0.0)), 0.0, 1.0)
		var footprint: Vector2 = seed_data.get("footprint", Vector2.ONE)
		var spin_scale: float = 0.35 + height_ratio

		pieces.append({
			"pos": Vector2(seed_data.get("pos", Vector2.ZERO)),
			"vel": Vector2(
				lean_sign * lean_push * height_ratio
					+ rng.randf_range(-lateral_spread, lateral_spread),
				rng.randf_range(0.0, drop_kick)
			),
			"spin": lean_sign * rng.randf_range(-spin_max * 0.35, spin_max) * spin_scale,
			"angle": float(seed_data.get("angle", 0.0)),
			"footprint": footprint,
			"half_extent": maxf(footprint.x, footprint.y) * 0.5,
			"quad_size": seed_data.get("quad_size", footprint),
			"rotation_steps": int(seed_data.get("rotation_steps", 0)),
			"texture": seed_data.get("texture", null),
			"color": seed_data.get("color", Color.WHITE),
			"emoji_texture": seed_data.get("emoji_texture", null),
			"emoji_offset": seed_data.get("emoji_offset", Vector2.ZERO),
			"resting": false,
			"reserved": false,
			"bounces": 0,
			"floor_y": _floor_baseline,
			"flatten_t": 1.0,
			"flatten_from": 0.0,
			"rest_angle": 0.0
		})

	settled = pieces.is_empty()

func is_settled() -> bool:
	return settled

func step(delta: float) -> void:
	if settled or delta <= 0.0:
		return

	var drag: float = pow(_air_drag, delta)
	var still_moving: bool = false

	for piece_value in pieces:
		var piece: Dictionary = piece_value

		if bool(piece.resting):
			if float(piece.flatten_t) < 1.0:
				var flatten_t: float = minf(1.0, float(piece.flatten_t) + delta / _flatten_seconds)
				piece.flatten_t = flatten_t
				piece.angle = lerpf(
					float(piece.flatten_from), float(piece.rest_angle), _flatten_ease(flatten_t)
				)
				still_moving = true

			continue

		still_moving = true

		var vel: Vector2 = piece.vel
		var pos: Vector2 = piece.pos

		vel.y += _gravity * delta
		vel.x *= drag
		pos += vel * delta

		piece.vel = vel
		piece.pos = pos
		piece.angle = float(piece.angle) + float(piece.spin) * delta

		_apply_walls(piece)

		if not bool(piece.reserved) and float(piece.pos.y) >= _reservation_line:
			_reserve_floor(piece)

		if float(piece.pos.y) >= float(piece.floor_y):
			_resolve_landing(piece)

	settled = not still_moving

func _reserve_floor(piece: Dictionary) -> void:
	piece.reserved = true

	if _pile_max_layers <= 0 or _pile_layer_height <= 0.0:
		piece.floor_y = _floor_baseline
		return

	var bucket: int = int(floor((float(piece.pos.x) - _span_left) / _bucket_width))
	var fill: int = int(_bucket_fill.get(bucket, 0))

	piece.floor_y = _floor_baseline - float(mini(fill, _pile_max_layers)) * _pile_layer_height
	_bucket_fill[bucket] = fill + 1

func _apply_walls(piece: Dictionary) -> void:
	var half_extent: float = float(piece.half_extent)
	var left: float = _span_left + half_extent
	var right: float = _span_right - half_extent
	var pos: Vector2 = piece.pos
	var vel: Vector2 = piece.vel

	if left >= right:
		pos.x = (_span_left + _span_right) * 0.5
		vel.x = 0.0
	elif pos.x < left:
		pos.x = left
		vel.x = 0.0
	elif pos.x > right:
		pos.x = right
		vel.x = 0.0
	else:
		return

	piece.pos = pos
	piece.vel = vel

func _resolve_landing(piece: Dictionary) -> void:
	var pos: Vector2 = piece.pos
	var vel: Vector2 = piece.vel

	pos.y = float(piece.floor_y)
	piece.pos = pos

	if absf(vel.y) > _bounce_min_speed and int(piece.bounces) < _max_bounces:
		piece.bounces = int(piece.bounces) + 1
		piece.vel = Vector2(vel.x * _floor_friction, -absf(vel.y) * _restitution)
		piece.spin = float(piece.spin) * _floor_friction
		return

	piece.vel = Vector2.ZERO
	piece.spin = 0.0
	piece.resting = true
	piece.flatten_t = 0.0
	piece.flatten_from = float(piece.angle)
	piece.rest_angle = flat_rest_angle(float(piece.angle), piece.footprint)

static func flat_rest_angle(angle: float, footprint: Vector2) -> float:
	var best_delta: float = INF
	var best: float = angle

	for quarter_turn in range(4):
		var resting_size: Vector2 = (
			footprint if quarter_turn % 2 == 0 else Vector2(footprint.y, footprint.x)
		)

		if resting_size.x + 0.001 < resting_size.y:
			continue

		var delta: float = wrapf(float(quarter_turn) * PI * 0.5 - angle, -PI, PI)

		if absf(delta) < absf(best_delta):
			best_delta = delta
			best = angle + delta

	return best

func _flatten_ease(t: float) -> float:
	return 1.0 - pow(1.0 - clampf(t, 0.0, 1.0), 3.0)
