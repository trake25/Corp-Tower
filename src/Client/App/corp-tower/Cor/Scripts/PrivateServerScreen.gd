extends Control

signal back_requested

const PLAYER_COUNT := 3
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-close.png")

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton
@onready var player_count_button: OptionButton = %PlayerCountButton

func _ready() -> void:
	%BackButton.pressed.connect(func(): back_requested.emit())
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	%CreateButton.pressed.connect(_on_create_pressed)
	player_count_button.clear()
	player_count_button.add_item(str(PLAYER_COUNT), PLAYER_COUNT)
	player_count_button.select(0)
	_update_password_visibility_icon()

func _toggle_password_visibility() -> void:
	password_edit.secret = not password_edit.secret
	_update_password_visibility_icon()

func _update_password_visibility_icon() -> void:
	password_visibility_button.texture_normal = EYE_OPEN_TEXTURE if password_edit.secret else EYE_CLOSED_TEXTURE

func _on_create_pressed() -> void:
	pass
