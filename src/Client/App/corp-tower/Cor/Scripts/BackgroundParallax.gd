extends TextureRect

@export var parallax_ratio: float = 0.4
@export var ease_speed: float = 4.0

var target_offset: float = 0.0
var displayed_offset: float = 0.0
var _base_position_y: float = 0.0

func _ready() -> void:
	_base_position_y = position.y

func set_scroll_pixels(pixels: float) -> void:
	target_offset = pixels * parallax_ratio

func _process(delta: float) -> void:
	if absf(displayed_offset - target_offset) <= 0.01:
		return

	displayed_offset = lerpf(displayed_offset, target_offset, minf(1.0, ease_speed * delta))
	position.y = _base_position_y + displayed_offset
