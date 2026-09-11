extends Control

const VEIL_COLOR := Color(0.83, 0.94, 0.98, 0.30)
const BADGE_COLOR := Color(0.05, 0.31, 0.42, 0.90)
const BADGE_TEXT_COLOR := Color(0.92, 0.99, 1.0, 1.0)

var ready_locked := false
var pulse_tween: Tween

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE

func set_ready_locked(enabled: bool) -> void:
	ready_locked = enabled
	visible = enabled
	if !enabled:
		_stop_pulse()
	queue_redraw()

func pulse() -> void:
	if !ready_locked:
		return

	_stop_pulse()
	var card := get_parent() as Control
	if card == null:
		return

	card.pivot_offset = card.size * 0.5
	card.scale = Vector2.ONE
	modulate = Color.WHITE
	pulse_tween = create_tween()
	pulse_tween.set_parallel(true)
	pulse_tween.tween_property(card, "scale", Vector2(1.025, 1.025), 0.08).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	pulse_tween.tween_property(self, "modulate", Color(1.0, 1.0, 1.0, 0.72), 0.08)
	pulse_tween.chain().tween_property(card, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	pulse_tween.chain().tween_property(self, "modulate", Color.WHITE, 0.16)

func _stop_pulse() -> void:
	if pulse_tween != null and is_instance_valid(pulse_tween):
		pulse_tween.kill()
	pulse_tween = null
	modulate = Color.WHITE
	var card := get_parent() as Control
	if card != null:
		card.scale = Vector2.ONE

func _draw() -> void:
	if !ready_locked:
		return

	draw_rect(Rect2(Vector2.ZERO, size), VEIL_COLOR, true)
	var badge_size := Vector2(60.0, 22.0)
	var badge_rect := Rect2(size - badge_size - Vector2(5.0, 5.0), badge_size)
	draw_style_box(_badge_style(), badge_rect)

	var lock_center := badge_rect.position + Vector2(10.0, 10.5)
	draw_arc(lock_center + Vector2(0.0, 2.0), 4.0, PI, TAU, 12, BADGE_TEXT_COLOR, 1.5, true)
	draw_rect(Rect2(lock_center + Vector2(-4.5, 2.0), Vector2(9.0, 7.0)), BADGE_TEXT_COLOR, true)
	draw_circle(lock_center + Vector2(0.0, 5.0), 1.0, BADGE_COLOR)
	draw_string(
		ThemeDB.fallback_font,
		badge_rect.position + Vector2(19.0, 15.0),
		"READY",
		HORIZONTAL_ALIGNMENT_LEFT,
		-1.0,
		9,
		BADGE_TEXT_COLOR
	)

func _badge_style() -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = BADGE_COLOR
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	return style
