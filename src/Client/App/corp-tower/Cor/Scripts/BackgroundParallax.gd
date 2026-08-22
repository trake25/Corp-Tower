extends TextureRect

@export var parallax_ratio: float = 0.4
@export var ease_speed: float = 4.0
@export var instant: bool = false
@export var sync_revealed_background: bool = false

var target_offset: float = 0.0
var displayed_offset: float = 0.0
var _base_position_y: float = 0.0
var _background_panel: Panel
var _texture_image: Image

func _ready() -> void:
	_base_position_y = position.y
	if sync_revealed_background:
		_background_panel = get_parent().get_node_or_null("Background") as Panel
		resized.connect(_sync_revealed_sky)
		call_deferred("_sync_revealed_sky")

func _sync_revealed_sky() -> void:
	if _background_panel == null or texture == null or size.x <= 0.0 or size.y <= 0.0:
		return
	if _texture_image == null:
		_texture_image = texture.get_image()
	if _texture_image == null or _texture_image.is_empty():
		return

	var texture_size := Vector2(_texture_image.get_width(), _texture_image.get_height())
	var cover_scale: float = maxf(size.x / texture_size.x, size.y / texture_size.y)
	var visible_source_height: float = size.y / cover_scale
	var source_top: int = clampi(
		int(round((texture_size.y - visible_source_height) * 0.5)),
		0,
		_texture_image.get_height() - 1
	)
	var sky_color: Color = _texture_image.get_pixel(_texture_image.get_width() / 2, source_top)
	sky_color.a = 1.0
	var style := StyleBoxFlat.new()
	style.bg_color = sky_color
	_background_panel.add_theme_stylebox_override("panel", style)

func set_scroll_pixels(pixels: float) -> void:
	target_offset = pixels * parallax_ratio
	if instant:
		displayed_offset = target_offset
		position.y = _base_position_y + displayed_offset

func _process(delta: float) -> void:
	if absf(displayed_offset - target_offset) <= 0.01:
		return

	displayed_offset = lerpf(displayed_offset, target_offset, minf(1.0, ease_speed * delta))
	position.y = _base_position_y + displayed_offset
