extends Control

signal confirmed
signal dismissed

const OUTSIDE_TAP_GRACE_MS := 200
const TIME_EXPIRED_SECONDS := 3.0

var opened_at_ms: int = -OUTSIDE_TAP_GRACE_MS
var auto_dismiss_remaining: float = -1.0
var shown_seconds: int = -1

@onready var dim_layer: ColorRect = %ModalDimLayer
@onready var title_label: Label = %ModalTitleLabel
@onready var body_label: Label = %ModalBodyLabel
@onready var button_row: HBoxContainer = %ModalButtonRow

func _ready() -> void:
	visible = false
	dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	dim_layer.gui_input.connect(_on_dim_layer_gui_input)
	%ModalCloseButton.pressed.connect(close)
	%ModalContinueButton.pressed.connect(_on_continue_pressed)

func open_leave_lobby() -> void:
	title_label.text = "Leave lobby"
	body_label.text = "Do you want to leave this lobby?"
	button_row.visible = true
	auto_dismiss_remaining = -1.0
	_open()

func open_time_expired() -> void:
	title_label.text = "Time expired"
	button_row.visible = false
	auto_dismiss_remaining = TIME_EXPIRED_SECONDS
	shown_seconds = -1
	_refresh_time_expired_body()
	_open()

func close() -> void:
	if not visible:
		return

	visible = false
	auto_dismiss_remaining = -1.0

func _open() -> void:
	visible = true
	opened_at_ms = Time.get_ticks_msec()

func _on_continue_pressed() -> void:
	if not visible:
		return

	visible = false
	auto_dismiss_remaining = -1.0
	confirmed.emit()

func _finish_time_expired() -> void:
	auto_dismiss_remaining = -1.0
	visible = false
	dismissed.emit()

func _process(delta: float) -> void:
	if auto_dismiss_remaining < 0.0:
		return

	auto_dismiss_remaining -= delta
	_refresh_time_expired_body()

	if auto_dismiss_remaining <= 0.0:
		_finish_time_expired()

func _refresh_time_expired_body() -> void:
	var seconds := maxi(0, ceili(auto_dismiss_remaining))

	if seconds == shown_seconds:
		return

	shown_seconds = seconds
	body_label.text = "Lobby failed to continue. Returning to Home (%ds)." % seconds

func _on_dim_layer_gui_input(event: InputEvent) -> void:
	if Time.get_ticks_msec() - opened_at_ms < OUTSIDE_TAP_GRACE_MS:
		return

	var is_tap: bool = (
		(event is InputEventMouseButton and event.pressed)
		or (event is InputEventScreenTouch and event.pressed)
	)

	if not is_tap:
		return

	if auto_dismiss_remaining >= 0.0:
		_finish_time_expired()
	else:
		close()
