extends Control

signal find_match_requested
signal back_requested
signal private_join_requested(display_name: String, server_id: String, password: String)

const PASSWORD_MAX_LENGTH := 4
const SERVER_ID_MAX_LENGTH := 8
const SERVER_ID_ALPHABET := "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const EYE_OPEN_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-open.png")
const EYE_CLOSED_TEXTURE := preload("res://Cor/Art/6-Join-server/ic-eye-close.png")
const STATUS_COLOR := Color(0.078, 0.078, 0.094, 1)
const ERROR_COLOR := Color(0.86, 0.16, 0.18, 1)
const SERVER_ID_LONG_PRESS_WAIT_TIME := 0.5
const NO_TOUCH_INDEX := -1

@onready var password_edit: LineEdit = %PasswordEdit
@onready var password_mask_label: Label = %PasswordMaskLabel
@onready var password_visibility_button: TextureButton = %PasswordVisibilityButton
@onready var server_id_edit: LineEdit = %ServerIdEdit

var private_join_pending := false
var password_revealed := false
var transient_visible_index := -1
var previous_password := ""
var password_mask_timer: Timer
var server_id_touch_index := NO_TOUCH_INDEX
var server_id_long_press_timer: Timer
var server_id_native_paste_pending := false
var server_id_before_native_paste := ""

func _ready() -> void:
	%FindMatchButton.pressed.connect(_on_find_match_pressed)
	%BackButton.pressed.connect(_on_back_pressed)
	%JoinButton.pressed.connect(_on_join_pressed)
	%InfoButton.pressed.connect(_on_info_pressed)
	password_visibility_button.pressed.connect(_toggle_password_visibility)
	password_edit.text_changed.connect(_on_password_text_changed)
	server_id_edit.text_changed.connect(_on_server_id_text_changed)
	%PlayerNameEdit.text_submitted.connect(_on_text_submitted.bind(%PlayerNameEdit))
	server_id_edit.text_submitted.connect(_on_text_submitted.bind(server_id_edit))
	server_id_edit.gui_input.connect(_on_server_id_gui_input)
	password_edit.text_submitted.connect(_on_text_submitted.bind(password_edit))
	_configure_text_input(%PlayerNameEdit)
	_configure_text_input(server_id_edit)
	_configure_text_input(password_edit)
	password_mask_timer = Timer.new()
	password_mask_timer.one_shot = true
	password_mask_timer.wait_time = 1.0
	password_mask_timer.timeout.connect(_on_password_mask_timeout)
	add_child(password_mask_timer)
	server_id_long_press_timer = Timer.new()
	server_id_long_press_timer.one_shot = true
	server_id_long_press_timer.wait_time = SERVER_ID_LONG_PRESS_WAIT_TIME
	server_id_long_press_timer.timeout.connect(_on_server_id_long_press_timeout)
	add_child(server_id_long_press_timer)
	%PrivateJoinError.visible = false
	_refresh_password_presentation()

func show_private_pending() -> void:
	private_join_pending = true
	_set_private_join_interaction_enabled(false)
	%PrivateJoinError.text = "Connecting..."
	%PrivateJoinError.add_theme_color_override("font_color", STATUS_COLOR)
	%PrivateJoinError.visible = true

func clear_private_pending() -> void:
	var was_pending := private_join_pending
	private_join_pending = false
	_set_private_join_interaction_enabled(true)
	if was_pending:
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
	_set_password_text(normalized_password)
	private_join_requested.emit(%PlayerNameEdit.text.strip_edges(), _normalized_server_id(server_id_edit.text), normalized_password)

func _on_info_pressed() -> void:
	%InputRulesModal.open_rules("Join Server rules", "Name is optional and typing-only. Use an 8-character Server ID; hold that field to paste. Password is optional, numeric, and four digits for protected rooms. Password paste is disabled; the eye controls visibility.")

func _toggle_password_visibility() -> void:
	if private_join_pending:
		return
	password_revealed = not password_revealed
	transient_visible_index = -1
	password_mask_timer.stop()
	_refresh_password_presentation()

func _on_find_match_pressed() -> void:
	if not private_join_pending:
		find_match_requested.emit()

func _on_back_pressed() -> void:
	if not private_join_pending:
		back_requested.emit()

func _on_text_submitted(_value: String, field: LineEdit) -> void:
	field.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _input(event: InputEvent) -> void:
	if not _is_paste_shortcut(event):
		return
	var focused_control := get_viewport().gui_get_focus_owner()
	if focused_control == server_id_edit and not private_join_pending and server_id_edit.editable:
		server_id_before_native_paste = server_id_edit.text
		server_id_native_paste_pending = true
		server_id_edit.select_all()
		call_deferred("_complete_native_server_id_paste")
	elif focused_control == %PlayerNameEdit or focused_control == password_edit:
		get_viewport().set_input_as_handled()

func _on_server_id_gui_input(event: InputEvent) -> void:
	if private_join_pending or not server_id_edit.editable:
		return
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			server_id_touch_index = touch.index
			server_id_long_press_timer.start()
		elif touch.index == server_id_touch_index:
			_cancel_server_id_long_press()
	elif event is InputEventScreenDrag and event.index == server_id_touch_index:
		_cancel_server_id_long_press()

func _on_server_id_long_press_timeout() -> void:
	if server_id_touch_index == NO_TOUCH_INDEX or private_join_pending or not server_id_edit.editable:
		return
	server_id_touch_index = NO_TOUCH_INDEX
	_paste_server_id_from_clipboard()

func _paste_server_id_from_clipboard() -> void:
	_apply_server_id_paste(DisplayServer.clipboard_get())

func _complete_native_server_id_paste() -> void:
	if not server_id_native_paste_pending:
		return
	server_id_native_paste_pending = false
	if private_join_pending:
		return
	var normalized := _normalized_server_id(server_id_edit.text)
	if normalized.is_empty():
		server_id_edit.text = server_id_before_native_paste
		server_id_edit.caret_column = server_id_before_native_paste.length()
	else:
		server_id_edit.text = normalized
		server_id_edit.caret_column = normalized.length()
	server_id_edit.unedit()
	server_id_edit.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _apply_server_id_paste(clipboard_text: String) -> bool:
	if private_join_pending:
		return false
	var normalized := _normalized_server_id(clipboard_text.strip_edges().to_upper())
	if normalized.is_empty():
		return false
	server_id_edit.text = normalized
	server_id_edit.caret_column = normalized.length()
	server_id_edit.unedit()
	server_id_edit.release_focus()
	DisplayServer.virtual_keyboard_hide()
	return true

func _cancel_server_id_long_press() -> void:
	server_id_touch_index = NO_TOUCH_INDEX
	server_id_long_press_timer.stop()

func _on_server_id_text_changed(value: String) -> void:
	var normalized := _normalized_server_id(value)
	if value != normalized:
		server_id_edit.text = normalized
		server_id_edit.caret_column = normalized.length()

func _set_private_join_interaction_enabled(enabled: bool) -> void:
	%JoinButton.disabled = not enabled
	%BackButton.disabled = not enabled
	%FindMatchButton.disabled = not enabled
	%PlayerNameEdit.editable = enabled
	server_id_edit.editable = enabled
	password_edit.editable = enabled
	password_visibility_button.disabled = not enabled
	%InfoButton.disabled = not enabled

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
	password_edit.add_theme_color_override("font_color", Color.TRANSPARENT if not password_revealed else STATUS_COLOR)
	password_mask_label.visible = not password_revealed
	var masked := ""
	for index in value.length():
		masked += value[index] if index == transient_visible_index else "*"
	password_mask_label.text = masked
	password_visibility_button.texture_normal = EYE_CLOSED_TEXTURE if password_revealed else EYE_OPEN_TEXTURE

func _normalized_server_id(value: String) -> String:
	var result := ""
	for character in value.to_upper():
		if SERVER_ID_ALPHABET.contains(character):
			result += character
	return result.left(SERVER_ID_MAX_LENGTH)

func _normalized_password(value: String) -> String:
	var digits := ""
	for character in value:
		if "0123456789".contains(character):
			digits += character
	return digits.left(PASSWORD_MAX_LENGTH)
