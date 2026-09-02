extends Control

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const FALLBACK_AVATAR_ID := "avatar_0"
const DISCONNECTED_COLOR := Color("#d92d20")
const LEFT_COLOR := Color("#667085")
const STRIKE_MARK := "\u0336"
const AVATAR_TEXTURE_PATHS := {
	"avatar_0": "res://Cor/Art/9-Play/avatar-lion.png",
	"avatar_1": "res://Cor/Art/9-Play/avatar-duck.png",
	"avatar_2": "res://Cor/Art/9-Play/avatar-hippo.png",
	"avatar_3": "res://Cor/Art/9-Play/avatar-fox.png",
	"avatar_4": "res://Cor/Art/9-Play/avatar-penguin.png",
	"avatar_5": "res://Cor/Art/9-Play/avatar-elephant.png",
	"duck": "res://Cor/Art/9-Play/avatar-duck.png",
	"elephant": "res://Cor/Art/9-Play/avatar-elephant.png",
	"fox": "res://Cor/Art/9-Play/avatar-fox.png",
	"hippo": "res://Cor/Art/9-Play/avatar-hippo.png",
	"lion": "res://Cor/Art/9-Play/avatar-lion.png",
	"penguin": "res://Cor/Art/9-Play/avatar-penguin.png"
}

@onready var avatar_ring: Panel = %AvatarRing
@onready var avatar_texture: TextureRect = %AvatarTexture
@onready var name_label: Label = %NameLabel
@onready var score_label: Label = %ScoreLabel

func set_entry(
	display_name: String,
	score: int,
	seat_index: int,
	avatar_id: String,
	presence: String = "connected"
) -> void:
	_apply_presence(display_name, score, presence)

	var seat_color := PlayerColors.color_for_player_index(seat_index)
	var ring_style := avatar_ring.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	ring_style.bg_color = seat_color
	avatar_ring.add_theme_stylebox_override("panel", ring_style)

	avatar_texture.texture = load_avatar_texture(avatar_id)

func _apply_presence(display_name: String, score: int, presence: String) -> void:
	match presence:
		"disconnected":
			name_label.text = _strikethrough(display_name)
			name_label.add_theme_color_override("font_color", DISCONNECTED_COLOR)
			avatar_texture.modulate = DISCONNECTED_COLOR
			score_label.text = format_score(score)
		"left":
			name_label.text = display_name
			name_label.add_theme_color_override("font_color", LEFT_COLOR)
			avatar_texture.modulate = LEFT_COLOR
			score_label.text = "LEFT"
		_:
			name_label.text = display_name
			name_label.remove_theme_color_override("font_color")
			avatar_texture.modulate = Color.WHITE
			score_label.text = format_score(score)

func _strikethrough(value: String) -> String:
	var result := ""

	for character in value:
		result += character + STRIKE_MARK

	return result

func format_score(score: int) -> String:
	var digits := str(absi(score))
	var grouped := ""

	for i in range(digits.length()):
		if i > 0 and (digits.length() - i) % 3 == 0:
			grouped += ","

		grouped += digits[i]

	return ("-" + grouped) if score < 0 else grouped

static func load_avatar_texture(avatar_id: String) -> Texture2D:
	var clean_id := avatar_id if avatar_id != "" else FALLBACK_AVATAR_ID
	var texture_path: String = str(AVATAR_TEXTURE_PATHS.get(
		clean_id,
		AVATAR_TEXTURE_PATHS[FALLBACK_AVATAR_ID]
	))

	if not ResourceLoader.exists(texture_path):
		texture_path = str(AVATAR_TEXTURE_PATHS[FALLBACK_AVATAR_ID])

	return load(texture_path) as Texture2D
