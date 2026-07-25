extends Control

signal dismissed

const OUTSIDE_TAP_GRACE_MS := 200

var opened_at_ms: int = -OUTSIDE_TAP_GRACE_MS

@onready var dim_layer: Control = %TooltipDimLayer
@onready var title_label: Label = %TooltipTitleLabel
@onready var body_label: Label = %TooltipBodyLabel

func _ready() -> void:
	visible = false
	dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
	dim_layer.gui_input.connect(_on_dim_layer_gui_input)

func open(title: String, body: String) -> void:
	title_label.text = title
	body_label.text = body
	visible = true
	opened_at_ms = Time.get_ticks_msec()

func close() -> void:
	if not visible:
		return
	visible = false
	dismissed.emit()

func _on_dim_layer_gui_input(event: InputEvent) -> void:
	if Time.get_ticks_msec() - opened_at_ms < OUTSIDE_TAP_GRACE_MS:
		return
	if event is InputEventMouseButton and event.pressed:
		close()
	elif event is InputEventScreenTouch and event.pressed:
		close()
