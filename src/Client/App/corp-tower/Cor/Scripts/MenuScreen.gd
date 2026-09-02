extends Control

const UiPreferencesScript = preload("res://Cor/Scripts/UiPreferences.gd")

signal close_requested
signal leave_game_requested

var leave_pending := false
var preferences = UiPreferencesScript.new()

@onready var close_button: TextureButton = %CloseButton
@onready var leave_button: Button = %LeaveGameButton
@onready var music_toggle: TextureButton = %MusicToggle
@onready var sound_toggle: TextureButton = %SoundToggle
@onready var confirm_modal: Control = %ConfirmModal

func _ready() -> void:
	close_button.pressed.connect(_on_close_pressed)
	leave_button.pressed.connect(_on_leave_pressed)
	music_toggle.toggled.connect(preferences.set_background_music_enabled)
	sound_toggle.toggled.connect(preferences.set_sound_effects_enabled)
	confirm_modal.confirmed.connect(_on_leave_confirmed)
	music_toggle.set_pressed_no_signal(preferences.background_music_enabled)
	sound_toggle.set_pressed_no_signal(preferences.sound_effects_enabled)

func set_leave_pending(pending: bool) -> void:
	leave_pending = pending
	close_button.disabled = pending
	leave_button.disabled = pending
	music_toggle.disabled = pending
	sound_toggle.disabled = pending

func _on_close_pressed() -> void:
	if leave_pending:
		return

	close_requested.emit()

func _on_leave_pressed() -> void:
	if leave_pending:
		return

	confirm_modal.call("open_leave_game")

func _on_leave_confirmed() -> void:
	if leave_pending:
		return

	set_leave_pending(true)
	leave_game_requested.emit()
