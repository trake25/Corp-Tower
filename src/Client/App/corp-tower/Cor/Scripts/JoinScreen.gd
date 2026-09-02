extends Control

signal find_match_requested
signal back_requested
signal private_join_requested(display_name: String, server_id: String, password: String)

const PASSWORD_MAX_LENGTH := 12
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-close.png")
const STATUS_COLOR := Color(0.078, 0.078, 0.094, 1)
const ERROR_COLOR := Color(0.86, 0.16, 0.18, 1)

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton

var private_join_pending := false

func _ready() -> void:
	%FindMatchButton.pressed.connect(_on_find_match_pressed)
	%BackButton.pressed.connect(_on_back_pressed)
	%JoinButton.pressed.connect(_on_join_pressed)
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	password_edit.text_changed.connect(_on_password_text_changed)
	%PlayerNameEdit.text_submitted.connect(_on_text_submitted.bind(%PlayerNameEdit))
	%ServerIdEdit.text_submitted.connect(_on_text_submitted.bind(%ServerIdEdit))
	password_edit.text_submitted.connect(_on_text_submitted.bind(password_edit))
	%PrivateJoinError.visible = false
	_update_password_visibility_icon()

func show_private_pending() -> void:
	private_join_pending = true
	_set_private_join_interaction_enabled(false)
	%PrivateJoinError.text = "Connecting..."
	%PrivateJoinError.add_theme_color_override("font_color", STATUS_COLOR)
	%PrivateJoinError.visible = true

func clear_private_pending() -> void:
	private_join_pending = false
	_set_private_join_interaction_enabled(true)

	if %PrivateJoinError.text == "Connecting...":
		%PrivateJoinError.visible = false

func show_private_error(message: String) -> void:
	private_join_pending = false
	_set_private_join_interaction_enabled(true)
	%PrivateJoinError.text = message
	%PrivateJoinError.add_theme_color_override("font_color", ERROR_COLOR)
	%PrivateJoinError.visible = true

func _on_join_pressed() -> void:
	if private_join_pending:
		return

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
	if private_join_pending:
		return

	password_edit.secret = not password_edit.secret
	_update_password_visibility_icon()

func _on_find_match_pressed() -> void:
	if not private_join_pending:
		find_match_requested.emit()

func _on_back_pressed() -> void:
	if not private_join_pending:
		back_requested.emit()

func _on_text_submitted(_value: String, field: LineEdit) -> void:
	field.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _set_private_join_interaction_enabled(enabled: bool) -> void:
	%JoinButton.disabled = not enabled
	%BackButton.disabled = not enabled
	%FindMatchButton.disabled = not enabled
	%PlayerNameEdit.editable = enabled
	%ServerIdEdit.editable = enabled
	password_edit.editable = enabled
	password_visibility_button.disabled = not enabled

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
