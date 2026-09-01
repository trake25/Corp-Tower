extends Control

signal back_requested
signal create_requested(display_name: String, password: String)

const PLAYER_COUNT := 3
const PASSWORD_MAX_LENGTH := 12
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-close.png")

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton
@onready var player_count_button: OptionButton = %PlayerCountButton

func _ready() -> void:
	%BackButton.pressed.connect(func(): back_requested.emit())
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	password_edit.text_changed.connect(_on_password_text_changed)
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
	var normalized_password := _normalized_password(password_edit.text)
	if password_edit.text != normalized_password:
		password_edit.text = normalized_password
		password_edit.caret_column = normalized_password.length()
	create_requested.emit(%PlayerNameEdit.text.strip_edges(), normalized_password)

func _on_password_text_changed(value: String) -> void:
	var limited := _normalized_password(value)

	if password_edit.text != limited:
		password_edit.text = limited
		password_edit.caret_column = limited.length()

func _normalized_password(value: String) -> String:
	var digits := ""

	for character in value:
		if "0123456789".contains(character):
			digits += character

	return digits.left(PASSWORD_MAX_LENGTH)
