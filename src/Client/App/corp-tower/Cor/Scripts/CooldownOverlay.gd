extends Control

var remaining_ratio: float = 0.0

func set_remaining_ratio(value: float) -> void:
	remaining_ratio = clampf(value, 0.0, 1.0)
	visible = remaining_ratio > 0.0
	queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED:
		queue_redraw()

func _draw() -> void:
	if remaining_ratio <= 0.0:
		return

	var radius: float = minf(size.x, size.y) * 0.24
	var center: Vector2 = Vector2(size.x - radius - 8.0, radius + 8.0)
	var start_angle: float = -PI * 0.5
	var end_angle: float = start_angle + TAU * remaining_ratio

	draw_circle(center, radius + 3.0, Color(0.03, 0.06, 0.12, 0.78))
	draw_arc(center, radius, start_angle, end_angle, 28, Color(1.0, 0.78, 0.2, 1.0), 4.0, true)
	draw_arc(center, radius + 4.0, 0.0, TAU, 28, Color(1.0, 1.0, 1.0, 0.3), 1.0, true)
