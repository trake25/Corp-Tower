extends Control

signal back_requested
signal name_change_requested(candidate: String)

var current_name := ""
var online := false
var submission_pending := false
var allowance_consumed := false
var allowed_name := RegEx.create_from_string("^[\\p{L}\\p{N} _-]+$")

@onready var name_input: LineEdit = %NameInput
@onready var save_button: Button = %SaveButton
@onready var error_label: Label = %ErrorLabel
@onready var confirm_modal: Control = %ConfirmModal

func _ready() -> void:
	%BackButton.pressed.connect(func(): back_requested.emit())
	name_input.text_changed.connect(func(_value): _refresh_save_state())
	name_input.text_submitted.connect(_on_text_submitted)
	name_input.editing_toggled.connect(_on_text_editing_toggled)
	name_input.focus_exited.connect(_on_text_focus_exited)
	save_button.pressed.connect(_on_save_pressed)
	confirm_modal.confirmed.connect(_on_confirmed)
	_refresh_save_state()

func configure(profile: Dictionary) -> void:
	current_name = str(profile.get("displayName", "")).strip_edges()
	allowance_consumed = bool(profile.get("nameChangeUsed", false))
	name_input.text = current_name
	name_input.editable = not allowance_consumed
	name_input.caret_column = name_input.text.length()
	error_label.text = ""
	_refresh_save_state()

func set_online(value: bool) -> void:
	online = value
	if not online and submission_pending:
		submission_pending = false
		name_input.editable = not allowance_consumed
		error_label.text = "Connection lost. Return and try again."
	_refresh_save_state()

func set_submission_pending(value: bool) -> void:
	submission_pending = value
	name_input.editable = not value and not allowance_consumed
	_refresh_save_state()

func show_rejection(reason: String) -> void:
	if reason == "already_used":
		allowance_consumed = true
	set_submission_pending(false)
	error_label.text = {
		"invalid_name": "Use 3–10 letters, numbers, spaces, _ or -.",
		"unchanged_name": "Enter a different name.",
		"name_taken": "That name is already taken.",
		"already_used": "Your one-time name change was already used.",
		"server_error": "Name change failed. Please try again."
	}.get(reason, "Name change failed. Please try again.")

func normalized_candidate() -> String:
	return name_input.text.strip_edges()

func is_candidate_valid() -> bool:
	var candidate := normalized_candidate()
	return (
		candidate.length() >= 3
		and candidate.length() <= 10
		and allowed_name.search(candidate) != null
		and candidate.nocasecmp_to(current_name) != 0
	)

func _refresh_save_state() -> void:
	if not is_node_ready():
		return
	save_button.disabled = (
		allowance_consumed
		or submission_pending
		or not online
		or not is_candidate_valid()
	)

func _on_save_pressed() -> void:
	if save_button.disabled:
		return
	error_label.text = ""
	confirm_modal.open_change_name()

func _on_confirmed() -> void:
	if not online or submission_pending or not is_candidate_valid():
		return
	set_submission_pending(true)
	name_change_requested.emit(normalized_candidate())

func _on_text_submitted(_value: String) -> void:
	name_input.caret_force_displayed = false
	name_input.release_focus()
	DisplayServer.virtual_keyboard_hide()

func _on_text_editing_toggled(editing: bool) -> void:
	name_input.caret_force_displayed = editing

func _on_text_focus_exited() -> void:
	name_input.caret_force_displayed = false
