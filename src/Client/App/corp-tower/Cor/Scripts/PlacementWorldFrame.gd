extends Control

@export var horizontal_padding: float = 10.0
@export var max_offset: float = 120.0
@export var ease_speed: float = 12.0

var _base_position := Vector2.ZERO

func _ready() -> void:
	_base_position = position

func _process(delta: float) -> void:
	var tower: Control = get_node_or_null("TowerStack") as Control
	var target_offset: float = 0.0

	if tower != null and tower.has_method("is_placement_frame_active") and bool(tower.call("is_placement_frame_active")):
		target_offset = _target_offset_for(tower)

	var target_x: float = _base_position.x + target_offset
	position.x = lerpf(position.x, target_x, minf(1.0, maxf(0.0, ease_speed) * delta))

func _target_offset_for(tower: Control) -> float:
	if !tower.has_method("placement_visual_bounds"):
		return 0.0

	var local_bounds: Rect2 = tower.call("placement_visual_bounds")
	var global_transform: Transform2D = tower.get_global_transform()
	var left: float = (global_transform * local_bounds.position).x
	var right: float = (global_transform * local_bounds.end).x
	var root: Control = get_parent() as Control

	if root == null:
		return 0.0

	var root_rect: Rect2 = root.get_global_rect()
	var safe_left: float = root_rect.position.x + horizontal_padding
	var safe_right: float = root_rect.end.x - horizontal_padding
	var correction: float = 0.0

	if local_bounds.size.x >= safe_right - safe_left:
		correction = (safe_left + safe_right) * 0.5 - (left + right) * 0.5
	elif left < safe_left:
		correction = safe_left - left
	elif right > safe_right:
		correction = safe_right - right

	var current_offset: float = position.x - _base_position.x
	return clampf(current_offset + correction, -max_offset, max_offset)
