extends Control

const PlayerRailEntryScript = preload("res://Cor/Scripts/PlayerRailEntry.gd")

@onready var fill: Panel = %ImpactBarFill
@onready var track: Panel = $ImpactBarTrack
@onready var avatar_marker: Control = %ImpactAvatarMarker
@onready var avatar_ring: Panel = %ImpactAvatarRing
@onready var avatar_texture: TextureRect = %ImpactAvatarTexture

func set_bar(seat_color: Color, ratio: float, avatar_id: String = "") -> void:
	var safe_ratio: float = clampf(ratio, 0.0, 1.0)
	var has_progress: bool = safe_ratio > 0.001
	var fill_style := fill.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	fill_style.bg_color = seat_color
	fill.add_theme_stylebox_override("panel", fill_style)
	fill.anchor_top = 1.0 - safe_ratio
	fill.offset_top = 0.0
	fill.offset_bottom = 0.0
	fill.visible = has_progress

	var ring_style := avatar_ring.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	ring_style.bg_color = seat_color
	avatar_ring.add_theme_stylebox_override("panel", ring_style)
	avatar_texture.texture = PlayerRailEntryScript.load_avatar_texture(avatar_id)
	avatar_marker.visible = has_progress and avatar_texture.texture != null

	var marker_center_y: float = track.position.y + track.size.y * (1.0 - safe_ratio)
	avatar_marker.position.y = clampf(
		marker_center_y - avatar_marker.size.y * 0.5,
		-avatar_marker.size.y * 0.25,
		size.y - avatar_marker.size.y * 0.75
	)
