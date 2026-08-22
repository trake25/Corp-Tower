extends Control

const PlayerRailEntryScript = preload("res://Cor/Scripts/PlayerRailEntry.gd")

@onready var fill: TextureRect = %ImpactBarFill
@onready var track: Panel = $ImpactBarTrack
@onready var avatar_marker: Control = %ImpactAvatarMarker
@onready var avatar_ring: Panel = %ImpactAvatarRing
@onready var avatar_texture: TextureRect = %ImpactAvatarTexture

var gradient: Gradient
var gradient_texture: GradientTexture2D

func _ready() -> void:
	gradient = Gradient.new()
	gradient.offsets = PackedFloat32Array([0.0, 1.0])
	gradient.colors = PackedColorArray([Color.WHITE, Color.WHITE])

	gradient_texture = GradientTexture2D.new()
	gradient_texture.gradient = gradient
	gradient_texture.width = 8
	gradient_texture.height = 256
	gradient_texture.fill_from = Vector2(0, 0)
	gradient_texture.fill_to = Vector2(0, 1)

	fill.texture = gradient_texture

func set_bar(seat_color: Color, ratio: float, avatar_id: String = "") -> void:
	gradient.set_color(0, seat_color.lightened(0.32))
	gradient.set_color(1, seat_color.darkened(0.12))

	var safe_ratio: float = clampf(ratio, 0.0, 1.0)
	fill.anchor_top = 1.0 - safe_ratio

	var ring_style := avatar_ring.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	ring_style.bg_color = seat_color
	avatar_ring.add_theme_stylebox_override("panel", ring_style)
	avatar_texture.texture = PlayerRailEntryScript.load_avatar_texture(avatar_id)
	avatar_marker.visible = avatar_id != "" and safe_ratio > 0.0

	var marker_center_y: float = track.position.y + track.size.y * (1.0 - safe_ratio)
	avatar_marker.position.y = clampf(
		marker_center_y - avatar_marker.size.y * 0.5,
		-avatar_marker.size.y * 0.25,
		size.y - avatar_marker.size.y * 0.75
	)
