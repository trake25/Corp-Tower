extends TextureRect

@export var parallax_ratio: float = 0.4
@export var ease_speed: float = 4.0
@export var instant: bool = false
@export var sync_revealed_background: bool = false
@export var ground_aligned_art_path: NodePath
@export var design_viewport_size := Vector2(412.0, 917.0)
@export var design_ground_anchor_y: float = -1.0

var target_offset: float = 0.0
var displayed_offset: float = 0.0
var _base_position_y: float = 0.0
var _background_panel: Panel
var _ground_aligned_art: TextureRect
var _texture_image: Image

func _ready() -> void:
	if not ground_aligned_art_path.is_empty():
		_ground_aligned_art = get_node_or_null(ground_aligned_art_path) as TextureRect
	if _ground_aligned_art != null and design_ground_anchor_y >= 0.0:
		resized.connect(_align_ground_art)
		_align_ground_art()
	_base_position_y = position.y
	if sync_revealed_background:
		_background_panel = get_parent().get_node_or_null("Background") as Panel
		resized.connect(_sync_revealed_sky)
		call_deferred("_sync_revealed_sky")

func _sync_revealed_sky() -> void:
	var art_rect: TextureRect = _ground_aligned_art if _ground_aligned_art != null else self
	if _background_panel == null or art_rect.texture == null or size.x <= 0.0 or size.y <= 0.0:
		return
	if _texture_image == null:
		_texture_image = art_rect.texture.get_image()
	if _texture_image == null or _texture_image.is_empty():
		return

	var texture_size := Vector2(_texture_image.get_width(), _texture_image.get_height())
	var cover_scale: float = maxf(art_rect.size.x / texture_size.x, art_rect.size.y / texture_size.y)
	var source_top: int
	if _ground_aligned_art != null:
		var draw_top: float = art_rect.position.y + (art_rect.size.y - texture_size.y * cover_scale) * 0.5
		source_top = clampi(int(round(-draw_top / cover_scale)), 0, _texture_image.get_height() - 1)
	else:
		var visible_source_height: float = size.y / cover_scale
		source_top = clampi(
			int(round((texture_size.y - visible_source_height) * 0.5)),
			0,
			_texture_image.get_height() - 1
		)
	var sky_color: Color = _texture_image.get_pixel(_texture_image.get_width() / 2, source_top)
	sky_color.a = 1.0
	var style := StyleBoxFlat.new()
	style.bg_color = sky_color
	_background_panel.add_theme_stylebox_override("panel", style)

func _align_ground_art() -> void:
	if _ground_aligned_art == null or _ground_aligned_art.texture == null:
		return
	var ground_shift: float = covered_anchor_shift(
		size,
		_ground_aligned_art.texture.get_size(),
		design_viewport_size,
		design_ground_anchor_y
	)
	_ground_aligned_art.offset_top = -ground_shift * 2.0
	_ground_aligned_art.offset_bottom = 0.0
	if sync_revealed_background:
		call_deferred("_sync_revealed_sky")

static func covered_anchor_shift(
	viewport_size: Vector2,
	texture_size: Vector2,
	design_size: Vector2,
	design_anchor_y: float
) -> float:
	if (
		viewport_size.x <= 0.0 or viewport_size.y <= 0.0 or
		texture_size.x <= 0.0 or texture_size.y <= 0.0 or
		design_size.x <= 0.0 or design_size.y <= 0.0
	):
		return 0.0
	var design_scale: float = maxf(design_size.x / texture_size.x, design_size.y / texture_size.y)
	var design_crop_y: float = (texture_size.y * design_scale - design_size.y) * 0.5
	var source_anchor_y: float = (design_anchor_y + design_crop_y) / design_scale
	var current_scale: float = maxf(viewport_size.x / texture_size.x, viewport_size.y / texture_size.y)
	var current_crop_y: float = (texture_size.y * current_scale - viewport_size.y) * 0.5
	var current_anchor_y: float = source_anchor_y * current_scale - current_crop_y
	return maxf(0.0, current_anchor_y - design_anchor_y)

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
