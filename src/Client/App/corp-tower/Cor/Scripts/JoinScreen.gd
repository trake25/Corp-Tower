extends Control

signal find_match_requested
signal back_requested
signal private_join_requested(display_name: String, server_id: String, password: String)

const PASSWORD_MAX_LENGTH := 12
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-close.png")

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton

func _ready() -> void:
	%FindMatchButton.pressed.connect(func(): find_match_requested.emit())
	%BackButton.pressed.connect(func(): back_requested.emit())
	%JoinButton.pressed.connect(_on_join_pressed)
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	password_edit.text_changed.connect(_on_password_text_changed)
	%PrivateJoinError.visible = false
	_update_password_visibility_icon()

func show_private_error(message: String) -> void:
	%PrivateJoinError.text = message
	%PrivateJoinError.visible = true

func _on_join_pressed() -> void:
	%PrivateJoinError.visible = false
	var normalized_password := _normalized_password(password_edit.text)
	if password_edit.text != normalized_password:
		password_edit.text = normalized_password
		password_edit.caret_column = normalized_password.length()
	private_join_requested.emit(
		%PlayerNameEdit.text.strip_edges(),
		%ServerIdEdit.text.strip_edges().to_upper(),
		normalized_password
	)

func _toggle_password_visibility() -> void:
	password_edit.secret = not password_edit.secret
	_update_password_visibility_icon()

func _update_password_visibility_icon() -> void:
	password_visibility_button.texture_normal = EYE_OPEN_TEXTURE if password_edit.secret else EYE_CLOSED_TEXTURE

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
