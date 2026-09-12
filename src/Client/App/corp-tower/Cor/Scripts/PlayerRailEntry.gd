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

var current_presence := "connected"
var score_confirmation_tween: Tween

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
	current_presence = presence
	if presence != "connected":
		_cancel_score_confirmation()

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

func score_confirmation_target() -> Vector2:
	if score_label == null or !score_label.is_visible_in_tree() or current_presence != "connected":
		return Vector2(-1.0, -1.0)
	return score_label.get_global_rect().get_center()

func confirm_score_impact(accent_color: Color) -> void:
	if score_label == null or current_presence != "connected":
		return
	_cancel_score_confirmation()
	score_label.pivot_offset = score_label.size * 0.5
	score_label.add_theme_color_override("font_color", accent_color)
	score_label.modulate = Color(1.0, 1.0, 1.0, 0.86)
	score_label.scale = Vector2(0.90, 0.90)
	score_confirmation_tween = create_tween()
	score_confirmation_tween.set_parallel(true)
	score_confirmation_tween.tween_property(score_label, "modulate", Color.WHITE, 0.12)
	score_confirmation_tween.tween_property(score_label, "scale", Vector2(1.10, 1.10), 0.12).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	score_confirmation_tween.set_parallel(false)
	score_confirmation_tween.tween_property(score_label, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	score_confirmation_tween.tween_callback(_finish_score_confirmation)

func _cancel_score_confirmation() -> void:
	if score_confirmation_tween != null and is_instance_valid(score_confirmation_tween):
		score_confirmation_tween.kill()
	if score_label != null:
		score_label.modulate = Color.WHITE
		score_label.scale = Vector2.ONE
		score_label.remove_theme_color_override("font_color")

func _finish_score_confirmation() -> void:
	if current_presence != "connected":
		return
	if score_label != null:
		score_label.modulate = Color.WHITE
		score_label.scale = Vector2.ONE
		score_label.remove_theme_color_override("font_color")

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
