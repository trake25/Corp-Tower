extends Control

@onready var dim_layer = %DebugDimLayer
@onready var debug_panel = %DebugPanel

var is_open := false
var spectator_calibration := false

func _ready() -> void:
	set_open(false)

func set_open(open: bool) -> void:
	is_open = open
	visible = open
	if dim_layer:
		dim_layer.visible = open
	if debug_panel:
		debug_panel.visible = open
	_apply_input_mode()

func set_spectator_calibration(enabled: bool) -> void:
	spectator_calibration = enabled
	_apply_input_mode()

func _apply_input_mode() -> void:
	var mouse_filter_mode := (
		Control.MOUSE_FILTER_IGNORE
		if spectator_calibration
		else Control.MOUSE_FILTER_STOP
	)
	mouse_filter = mouse_filter_mode
	if dim_layer:
		dim_layer.mouse_filter = mouse_filter_mode

func toggle() -> void:
	set_open(!is_open)
