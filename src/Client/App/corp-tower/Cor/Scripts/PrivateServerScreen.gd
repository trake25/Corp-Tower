extends Control

signal back_requested
signal create_requested(display_name: String, password: String)

const PLAYER_COUNT := 3
const PASSWORD_MAX_LENGTH := 4
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/3-Private-server/ic-eye-close.png")
const TEXT_COLOR := Color(0.078, 0.078, 0.094, 1)

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_mask_label: Label = %PasswordMaskLabel
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton
@onready var player_count_button: OptionButton = %PlayerCountButton

var password_revealed := false
var transient_visible_index := -1
var previous_password := ""
var password_mask_timer: Timer

func _ready() -> void:
	%BackButton.pressed.connect(func(): back_requested.emit())
	%InfoButton.pressed.connect(_on_info_pressed)
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	password_edit.text_changed.connect(_on_password_text_changed)
	%PlayerNameEdit.text_submitted.connect(_on_text_submitted.bind(%PlayerNameEdit))
	password_edit.text_submitted.connect(_on_text_submitted.bind(password_edit))
	%CreateButton.pressed.connect(_on_create_pressed)
	_configure_text_input(%PlayerNameEdit)
	_configure_text_input(password_edit)
	password_mask_timer = Timer.new()
	password_mask_timer.one_shot = true
	password_mask_timer.wait_time = 1.0
	password_mask_timer.timeout.connect(_on_password_mask_timeout)
	add_child(password_mask_timer)
	player_count_button.clear()
	player_count_button.add_item(str(PLAYER_COUNT), PLAYER_COUNT)
	player_count_button.select(0)
	_refresh_password_presentation()

func _on_text_submitted(_value: String, field: LineEdit) -> void:
	field.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _input(event: InputEvent) -> void:
	if not _is_paste_shortcut(event):
		return
	var focused_control := get_viewport().gui_get_focus_owner()
	if focused_control == %PlayerNameEdit or focused_control == password_edit:
		get_viewport().set_input_as_handled()

func _on_info_pressed() -> void:
	%InputRulesModal.open_rules("Private Server rules", "Name is optional and typing-only. Private rooms have 3 players. Password is optional; when used it is numeric and four digits. Create pads 1–3 typed digits with trailing zeroes. The eye controls password masking.")

func _toggle_password_visibility() -> void:
	password_revealed = not password_revealed
	transient_visible_index = -1
	password_mask_timer.stop()
	_refresh_password_presentation()

func _on_create_pressed() -> void:
	var normalized_password := _normalized_password(password_edit.text)
	if not normalized_password.is_empty() and normalized_password.length() < PASSWORD_MAX_LENGTH:
		normalized_password = normalized_password.rpad(PASSWORD_MAX_LENGTH, "0")
	_set_password_text(normalized_password)
	create_requested.emit(%PlayerNameEdit.text.strip_edges(), normalized_password)

func _configure_text_input(field: LineEdit) -> void:
	field.context_menu_enabled = false
	field.shortcut_keys_enabled = true
	field.middle_mouse_paste_enabled = false

func _is_paste_shortcut(event: InputEvent) -> bool:
	if not (event is InputEventKey):
		return false
	var key_event := event as InputEventKey
	return key_event.pressed and not key_event.echo and key_event.keycode == KEY_V and (key_event.ctrl_pressed or key_event.meta_pressed)

func _on_password_text_changed(value: String) -> void:
	var normalized := _normalized_password(value)
	if value != normalized:
		password_edit.text = normalized
		password_edit.caret_column = normalized.length()
		return
	if not password_revealed and normalized.length() > previous_password.length():
		transient_visible_index = normalized.length() - 1
		password_mask_timer.start()
	elif normalized.length() <= transient_visible_index:
		transient_visible_index = -1
		password_mask_timer.stop()
	previous_password = normalized
	_refresh_password_presentation()

func _on_password_mask_timeout() -> void:
	transient_visible_index = -1
	_refresh_password_presentation()

func _set_password_text(value: String) -> void:
	if password_edit.text != value:
		password_edit.text = value
		password_edit.caret_column = value.length()
	else:
		previous_password = value
		_refresh_password_presentation()

func _refresh_password_presentation() -> void:
	var value := password_edit.text
	password_edit.secret = false
	password_edit.add_theme_color_override("font_color", Color.TRANSPARENT if not password_revealed else TEXT_COLOR)
	password_mask_label.visible = not password_revealed
	var masked := ""
	for index in value.length():
		masked += value[index] if index == transient_visible_index else "*"
	password_mask_label.text = masked
	password_visibility_button.texture_normal = EYE_CLOSED_TEXTURE if password_revealed else EYE_OPEN_TEXTURE

func _normalized_password(value: String) -> String:
	var digits := ""
	for character in value:
		if "0123456789".contains(character):
			digits += character
	return digits.left(PASSWORD_MAX_LENGTH)
