extends Control

signal back_requested

const RANK_ICONS := {
	1: preload("res://Cor/Art/11-Rankings/ic-rank-gold.png"),
	2: preload("res://Cor/Art/11-Rankings/ic-rank-silver.png"),
	3: preload("res://Cor/Art/11-Rankings/ic-rank-bronze.png"),
}

const LEADERBOARD := [
	{"rank": 1, "name": "Irina", "score": "99 999", "avatar": preload("res://Cor/Art/9-Play/avatar-duck.png")},
	{"rank": 2, "name": "Rhae", "score": "98 500", "avatar": preload("res://Cor/Art/9-Play/avatar-fox.png")},
	{"rank": 3, "name": "Vienna", "score": "94 500", "avatar": preload("res://Cor/Art/9-Play/avatar-elephant.png")},
	{"rank": 4, "name": "Miko", "score": "89 500", "avatar": preload("res://Cor/Art/9-Play/avatar-lion.png")},
	{"rank": 5, "name": "Nova", "score": "85 500", "avatar": preload("res://Cor/Art/9-Play/avatar-penguin.png")},
	{"rank": 6, "name": "Haliya", "score": "80 500", "avatar": preload("res://Cor/Art/9-Play/avatar-hippo.png")},
	{"rank": 7, "name": "Tala", "score": "78 808", "avatar": preload("res://Cor/Art/9-Play/avatar-duck.png")},
	{"rank": 8, "name": "Sora", "score": "75 400", "avatar": preload("res://Cor/Art/9-Play/avatar-fox.png")},
	{"rank": 9, "name": "Kai", "score": "71 250", "avatar": preload("res://Cor/Art/9-Play/avatar-elephant.png")},
	{"rank": 10, "name": "Luna", "score": "68 900", "avatar": preload("res://Cor/Art/9-Play/avatar-lion.png")},
]

@onready var back_button: TextureButton = %BackButton
@onready var leaderboard_scroll: ScrollContainer = %LeaderboardScroll
@onready var leaderboard_rows: VBoxContainer = %LeaderboardRows
@onready var your_rank_card: PanelContainer = %YourRankCard

func _ready() -> void:
	back_button.pressed.connect(func(): back_requested.emit())
	for player in LEADERBOARD:
		leaderboard_rows.add_child(_create_rank_row(player))

func _create_rank_row(player: Dictionary) -> PanelContainer:
	var rank := int(player.rank)
	var panel := PanelContainer.new()
	panel.custom_minimum_size = Vector2(0, 54)
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", _create_row_style(rank))

	var margin := MarginContainer.new()
	margin.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 4)
	panel.add_child(margin)

	var row := HBoxContainer.new()
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_theme_constant_override("separation", 8)
	margin.add_child(row)
	row.add_child(_create_rank_badge(rank))

	var avatar := TextureRect.new()
	avatar.custom_minimum_size = Vector2(42, 42)
	avatar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar.texture = player.avatar
	avatar.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	row.add_child(avatar)

	var name_label := Label.new()
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	name_label.add_theme_color_override("font_color", Color(0.078, 0.078, 0.094, 1))
	name_label.add_theme_font_size_override("font_size", 17)
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.text = str(player.name)
	row.add_child(name_label)

	var score_label := Label.new()
	score_label.custom_minimum_size = Vector2(82, 0)
	score_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	score_label.theme_type_variation = &"BoldLabel"
	score_label.add_theme_color_override("font_color", _score_color(rank))
	score_label.add_theme_color_override("font_outline_color", Color(0.08, 0.08, 0.09, 1))
	score_label.add_theme_constant_override("outline_size", 1)
	score_label.add_theme_font_size_override("font_size", 16)
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	score_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	score_label.text = str(player.score)
	row.add_child(score_label)
	return panel

func _create_rank_badge(rank: int) -> Control:
	var badge := Control.new()
	badge.custom_minimum_size = Vector2(42, 42)
	badge.mouse_filter = Control.MOUSE_FILTER_IGNORE

	if RANK_ICONS.has(rank):
		var icon := TextureRect.new()
		icon.mouse_filter = Control.MOUSE_FILTER_IGNORE
		icon.texture = RANK_ICONS[rank]
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		badge.add_child(icon)
		icon.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

	var label := Label.new()
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	label.theme_type_variation = &"BoldLabel"
	label.add_theme_color_override("font_color", Color(0.078, 0.078, 0.094, 1))
	label.add_theme_font_size_override("font_size", 17)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.text = str(rank)
	badge.add_child(label)
	label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	return badge

func _create_row_style(rank: int) -> StyleBoxFlat:
	var colors := {
		1: [Color(1, 0.985, 0.88, 1), Color(1, 0.84, 0, 1)],
		2: [Color(0.96, 0.96, 0.94, 1), Color(0.8, 0.8, 0.78, 1)],
		3: [Color(0.96, 0.88, 0.8, 1), Color(0.82, 0.48, 0.15, 1)],
	}
	var palette: Array = colors.get(rank, [Color(1, 1, 1, 0.96), Color(0.87, 0.87, 0.87, 1)])
	var style := StyleBoxFlat.new()
	style.bg_color = palette[0]
	style.border_color = palette[1]
	style.set_border_width_all(2)
	style.set_corner_radius_all(16)
	return style

func _score_color(rank: int) -> Color:
	return {
		1: Color(1, 0.84, 0, 1),
		2: Color(0.84, 0.84, 0.84, 1),
		3: Color(0.82, 0.48, 0.15, 1),
	}.get(rank, Color(1, 1, 1, 1))
