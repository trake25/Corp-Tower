extends RefCounted

enum Mode {
	AUTO,
	NAVIGATING_TO_TROUBLE,
	MANUAL_HOLD,
	RETURNING_TO_AUTO,
}

const EPSILON := 0.001

var mode: int = Mode.AUTO
var displayed_offset_units: float = 0.0
var normal_target_units: float = 0.0
var navigation_target_units: float = 0.0
var maximum_offset_units: float = 0.0
var pan_speed_units: float = 9.0
var frozen: bool = false

static func calculate_normal_target(
	current_height: int,
	target_height: int,
	visible_units: int,
	scroll_start_ratio: float,
	scroll_ease_power: float,
	top_clearance_units: int
) -> float:
	var start_units: int = maxi(1, int(floor(float(visible_units) * scroll_start_ratio)))
	var flush_units: int = maxi(start_units, visible_units - top_clearance_units)

	if target_height > 0 and target_height <= flush_units:
		return 0.0

	var focus_height: int = maxi(current_height, 1)
	if target_height > 0:
		focus_height = mini(focus_height, target_height)
	if focus_height <= start_units:
		return 0.0

	var linear_t: float = 1.0
	if target_height > start_units:
		linear_t = clampf(
			float(focus_height - start_units) / float(target_height - start_units),
			0.0,
			1.0
		)
	var ramp_t: float = pow(linear_t, scroll_ease_power)
	var top_row: float = lerpf(float(start_units), float(flush_units), ramp_t)
	return round(float(focus_height) - top_row)

func configure(
	current_height: int,
	target_height: int,
	standing_height: int,
	visible_units: int,
	scroll_start_ratio: float,
	scroll_ease_power: float,
	top_clearance_units: int
) -> void:
	normal_target_units = calculate_normal_target(
		current_height,
		target_height,
		visible_units,
		scroll_start_ratio,
		scroll_ease_power,
		top_clearance_units
	)
	maximum_offset_units = maxf(
		normal_target_units,
		maxf(0.0, float(standing_height - visible_units + top_clearance_units))
	)
	displayed_offset_units = clampf(displayed_offset_units, 0.0, maximum_offset_units)
	navigation_target_units = clampf(navigation_target_units, 0.0, maximum_offset_units)

func snap_to_normal() -> bool:
	var changed: bool = !is_equal_approx(displayed_offset_units, normal_target_units)
	displayed_offset_units = normal_target_units
	navigation_target_units = normal_target_units
	mode = Mode.AUTO
	return changed

func navigate_to_row(origin_y: float, context_below_units: float = 2.0) -> bool:
	var target: float = clampf(
		origin_y - maxf(0.0, context_below_units),
		0.0,
		maximum_offset_units
	)
	if target >= displayed_offset_units - EPSILON:
		return false
	navigation_target_units = target
	mode = Mode.NAVIGATING_TO_TROUBLE
	return true

func return_to_auto() -> bool:
	if mode == Mode.AUTO and !is_displaced():
		return false
	navigation_target_units = normal_target_units
	mode = Mode.RETURNING_TO_AUTO
	return true

func hold_current() -> void:
	navigation_target_units = displayed_offset_units
	mode = Mode.MANUAL_HOLD

func reset() -> void:
	mode = Mode.AUTO
	displayed_offset_units = 0.0
	normal_target_units = 0.0
	navigation_target_units = 0.0
	maximum_offset_units = 0.0
	frozen = false

func step(delta: float) -> bool:
	if frozen:
		return false

	var target: float = normal_target_units if mode == Mode.AUTO else navigation_target_units
	var next: float = move_toward(
		displayed_offset_units,
		target,
		maxf(0.0, pan_speed_units) * maxf(0.0, delta)
	)
	var changed: bool = !is_equal_approx(next, displayed_offset_units)
	displayed_offset_units = next

	if absf(displayed_offset_units - target) <= EPSILON:
		displayed_offset_units = target
		if mode == Mode.NAVIGATING_TO_TROUBLE:
			mode = Mode.MANUAL_HOLD
		elif mode == Mode.RETURNING_TO_AUTO:
			mode = Mode.AUTO

	return changed

func is_displaced() -> bool:
	return absf(displayed_offset_units - normal_target_units) > EPSILON or mode != Mode.AUTO

func is_manually_displaced() -> bool:
	return mode != Mode.AUTO

func is_navigating() -> bool:
	return mode == Mode.NAVIGATING_TO_TROUBLE or mode == Mode.RETURNING_TO_AUTO
