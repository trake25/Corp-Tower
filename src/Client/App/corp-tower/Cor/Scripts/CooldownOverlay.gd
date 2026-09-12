extends Control

const COOLING_VEIL := Color(0.18, 0.88, 0.88, 0.17)
const COOLING_EDGE := Color(0.32, 0.96, 0.94, 0.74)
const READY_EDGE := Color(0.48, 1.0, 0.98, 0.94)
const READY_CONFIRM_MS := 220
const ATTEMPT_PULSE_MS := 180

var remaining_ratio: float = 0.0
var ready_confirm_until_ms := 0
var attempt_pulse_until_ms := 0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 5
	visible = false

func set_remaining_ratio(value: float) -> void:
	var previous_ratio := remaining_ratio
	remaining_ratio = clampf(value, 0.0, 1.0)
	if previous_ratio > 0.0 and remaining_ratio <= 0.0:
		ready_confirm_until_ms = Time.get_ticks_msec() + READY_CONFIRM_MS
	visible = remaining_ratio > 0.0 or _has_transient_feedback()
	queue_redraw()

func pulse_cooling_attempt() -> void:
	attempt_pulse_until_ms = Time.get_ticks_msec() + ATTEMPT_PULSE_MS
	visible = true
	queue_redraw()

func _process(_delta: float) -> void:
	if remaining_ratio <= 0.0 and !_has_transient_feedback():
		visible = false
	queue_redraw()

func _has_transient_feedback() -> bool:
	var now := Time.get_ticks_msec()
	return now < ready_confirm_until_ms or now < attempt_pulse_until_ms

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func _draw() -> void:
	var card := Rect2(Vector2.ZERO, size)
	var now := Time.get_ticks_msec()
	if remaining_ratio > 0.0:
		draw_rect(card, COOLING_VEIL, true)
		draw_rect(card.grow(-1.0), COOLING_EDGE, false, 1.0, true)
		var rail := Rect2(7.0, maxf(0.0, size.y - 8.0), maxf(0.0, size.x - 14.0), 3.0)
		draw_rect(rail, Color(0.08, 0.34, 0.37, 0.34), true)
		var completed_width := rail.size.x * (1.0 - remaining_ratio)
		if completed_width > 0.0:
			draw_rect(Rect2(rail.position, Vector2(completed_width, rail.size.y)), COOLING_EDGE, true)

	if now < attempt_pulse_until_ms:
		var pulse := float(attempt_pulse_until_ms - now) / float(ATTEMPT_PULSE_MS)
		draw_rect(card.grow(-2.0), Color(COOLING_EDGE.r, COOLING_EDGE.g, COOLING_EDGE.b, pulse), false, 2.0, true)
	elif now < ready_confirm_until_ms:
		var ready_alpha := float(ready_confirm_until_ms - now) / float(READY_CONFIRM_MS)
		draw_rect(card.grow(-2.0), Color(READY_EDGE.r, READY_EDGE.g, READY_EDGE.b, ready_alpha), false, 2.0, true)
