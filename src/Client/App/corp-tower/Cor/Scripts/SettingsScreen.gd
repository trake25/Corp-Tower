extends Control

const UiPreferencesScript = preload("res://Cor/Scripts/UiPreferences.gd")

signal back_requested
signal account_requested
signal sign_out_requested

var preferences = UiPreferencesScript.new()

@onready var back_button: TextureButton = %BackButton
@onready var account_button: Button = %AccountButton
@onready var account_icon: TextureRect = %AccountIcon
@onready var account_status_label: Label = %AccountStatusLabel
@onready var music_toggle: TextureButton = %MusicToggle
@onready var sound_toggle: TextureButton = %SoundToggle
@onready var controls_dropdown: OptionButton = %ControlsDropdown
@onready var sign_out_button: Button = %SignOutButton
@onready var version_label: Label = %VersionLabel
@onready var confirm_modal: Control = %ConfirmModal

func _ready() -> void:
	back_button.pressed.connect(func(): back_requested.emit())
	account_button.pressed.connect(func(): account_requested.emit())
	music_toggle.toggled.connect(preferences.set_background_music_enabled)
	sound_toggle.toggled.connect(preferences.set_sound_effects_enabled)
	controls_dropdown.item_selected.connect(_on_controls_selected)
	sign_out_button.pressed.connect(func(): confirm_modal.call("open_sign_out"))
	confirm_modal.confirmed.connect(func(): sign_out_requested.emit())
	music_toggle.set_pressed_no_signal(preferences.background_music_enabled)
	sound_toggle.set_pressed_no_signal(preferences.sound_effects_enabled)
	_populate_controls_dropdown()
	version_label.text = "Version %s" % str(ProjectSettings.get_setting("application/config/version", "0.0.1"))
	refresh_account_state()

func _populate_controls_dropdown() -> void:
	controls_dropdown.clear()
	var selected_mode := preferences.get_controls_mode()
	for mode in UiPreferencesScript.available_control_modes():
		var index := controls_dropdown.item_count
		controls_dropdown.add_item(UiPreferencesScript.control_mode_label(mode))
		controls_dropdown.set_item_metadata(index, mode)
		if mode == selected_mode:
			controls_dropdown.select(index)

func _on_controls_selected(index: int) -> void:
	preferences.set_controls_mode(str(controls_dropdown.get_item_metadata(index)))

func refresh_account_state() -> void:
	apply_account_state(
		AuthManager.has_accepted_provider(),
		AuthManager.current_provider
	)

func apply_account_state(linked: bool, provider: String) -> void:
	account_icon.texture = load(
		"res://Cor/Art/13-Settings/avatar-placeholder.png"
		if linked
		else "res://Cor/Art/13-Settings/ic-colored-user.png"
	)

	if not linked:
		account_status_label.text = "Not linked"
		return

	var normalized_provider := provider.strip_edges()
	account_status_label.text = (
		"Signed in with %s" % normalized_provider.capitalize()
		if normalized_provider != ""
		else "Account linked"
	)
