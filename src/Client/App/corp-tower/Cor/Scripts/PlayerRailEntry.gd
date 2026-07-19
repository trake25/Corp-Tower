extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const AVATAR_BASE_PATH := "res://Cor/Art/Cosmetics/avatar/"
const FALLBACK_AVATAR_ID := "avatar_0"

@onready var avatar_ring: Panel = %AvatarRing
@onready var avatar_texture: TextureRect = %AvatarTexture
@onready var name_label: Label = %NameLabel
@onready var score_label: Label = %ScoreLabel

func set_entry(display_name: String, score: int, seat_index: int, avatar_id: String) -> void:
	name_label.text = display_name
	score_label.text = format_score(score)

	var seat_color := PlayerColors.color_for_player_index(seat_index)
	var ring_style := avatar_ring.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	ring_style.bg_color = seat_color
	avatar_ring.add_theme_stylebox_override("panel", ring_style)

	avatar_texture.texture = load_avatar_texture(avatar_id)

func format_score(score: int) -> String:
	var digits := str(absi(score))
	var grouped := ""

	for i in range(digits.length()):
		if i > 0 and (digits.length() - i) % 3 == 0:
			grouped += ","

		grouped += digits[i]

	return ("-" + grouped) if score < 0 else grouped

func load_avatar_texture(avatar_id: String) -> Texture2D:
	var clean_id := avatar_id if avatar_id != "" else FALLBACK_AVATAR_ID
	var texture_path := AVATAR_BASE_PATH + clean_id + "/avatar.png"

	if not ResourceLoader.exists(texture_path):
		texture_path = AVATAR_BASE_PATH + FALLBACK_AVATAR_ID + "/avatar.png"

	return load(texture_path) as Texture2D
