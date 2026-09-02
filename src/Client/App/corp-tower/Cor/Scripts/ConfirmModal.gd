extends Control

signal confirmed
signal dismissed

const OUTSIDE_TAP_GRACE_MS := 200
const COUNTDOWN_SECONDS := 3.0
const TIME_EXPIRED_BODY := "Lobby failed to continue. Returning to Home (%ds)."
const DISCONNECTED_BODY := "You are disconnected. Returning to Home (%ds)."
const RECOVERY_FAILED_BODY := "We could not restore this match. Returning to Home (%ds)."

var opened_at_ms: int = -OUTSIDE_TAP_GRACE_MS
var auto_dismiss_remaining: float = -1.0
var shown_seconds: int = -1
var countdown_body_format := ""
var recovery_locked := false

@onready var dim_layer: ColorRect = %ModalDimLayer
@onready var title_label: Label = %ModalTitleLabel
@onready var body_label: Label = %ModalBodyLabel
@onready var button_row: HBoxContainer = %ModalButtonRow
@onready var close_button: Button = %ModalCloseButton
@onready var continue_button: Button = %ModalContinueButton

func _ready() -> void:
	visible = false
	dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	dim_layer.gui_input.connect(_on_dim_layer_gui_input)
	close_button.pressed.connect(close)
	continue_button.pressed.connect(_on_continue_pressed)

func open_leave_lobby() -> void:
	recovery_locked = false
	title_label.text = "Leave lobby"
	body_label.text = "Do you want to leave this lobby?"
	button_row.visible = true
	close_button.visible = true
	continue_button.visible = true
	continue_button.text = "Continue"
	auto_dismiss_remaining = -1.0
	_open()

func open_leave_game() -> void:
	recovery_locked = false
	title_label.text = "Leave game"
	body_label.text = "Do you want to leave this game?"
	button_row.visible = true
	close_button.visible = true
	continue_button.visible = true
	continue_button.text = "Continue"
	auto_dismiss_remaining = -1.0
	_open()

func open_kick_player() -> void:
	recovery_locked = false
	title_label.text = "Kick player"
	body_label.text = "Do you want to kick this player from lobby?"
	button_row.visible = true
	close_button.visible = true
	continue_button.visible = true
	continue_button.text = "Continue"
	auto_dismiss_remaining = -1.0
	_open()

func open_time_expired() -> void:
	recovery_locked = false
	title_label.text = "Time expired"
	button_row.visible = false
	countdown_body_format = TIME_EXPIRED_BODY
	_start_countdown()

func open_disconnected() -> void:
	recovery_locked = false
	title_label.text = "Disconnected"
	button_row.visible = false
	countdown_body_format = DISCONNECTED_BODY
	_start_countdown()

func open_recovering() -> void:
	recovery_locked = true
	title_label.text = "Reconnecting"
	body_label.text = "Syncing the latest game state…"
	button_row.visible = false
	auto_dismiss_remaining = -1.0
	_open()

func open_recovery_failed() -> void:
	recovery_locked = false
	title_label.text = "Connection lost"
	button_row.visible = false
	countdown_body_format = RECOVERY_FAILED_BODY
	_start_countdown()

func close() -> void:
	if not visible or recovery_locked:
		return

	visible = false
	auto_dismiss_remaining = -1.0

func dismiss_recovery() -> void:
	recovery_locked = false
	close()

func _start_countdown() -> void:
	recovery_locked = false
	auto_dismiss_remaining = COUNTDOWN_SECONDS
	shown_seconds = -1
	_refresh_countdown_body()
	_open()

func _open() -> void:
	visible = true
	opened_at_ms = Time.get_ticks_msec()

func _on_continue_pressed() -> void:
	if not visible or recovery_locked:
		return

	visible = false
	auto_dismiss_remaining = -1.0
	confirmed.emit()

func _finish_countdown() -> void:
	recovery_locked = false
	auto_dismiss_remaining = -1.0
	visible = false
	dismissed.emit()

func _process(delta: float) -> void:
	if auto_dismiss_remaining < 0.0:
		return

	auto_dismiss_remaining -= delta
	_refresh_countdown_body()

	if auto_dismiss_remaining <= 0.0:
		_finish_countdown()

func _refresh_countdown_body() -> void:
	var seconds := maxi(0, ceili(auto_dismiss_remaining))

	if seconds == shown_seconds:
		return

	shown_seconds = seconds
	body_label.text = countdown_body_format % seconds

func _on_dim_layer_gui_input(event: InputEvent) -> void:
	if recovery_locked:
		return
	if Time.get_ticks_msec() - opened_at_ms < OUTSIDE_TAP_GRACE_MS:
		return

	var is_tap: bool = (
		(event is InputEventMouseButton and event.pressed)
		or (event is InputEventScreenTouch and event.pressed)
	)

	if not is_tap:
		return

	if auto_dismiss_remaining >= 0.0:
		_finish_countdown()
	else:
		close()
