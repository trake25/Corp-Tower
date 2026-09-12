extends Control

@onready var dim_layer = %DebugDimLayer
@onready var debug_panel = %DebugPanel

var is_open := false
var spectator_calibration := false
var spectator_panel_mouse_filters: Dictionary = {}

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
	if debug_panel:
		_apply_spectator_panel_input_mode(debug_panel)

func _apply_spectator_panel_input_mode(control: Control) -> void:
	var control_id := control.get_instance_id()
	if spectator_calibration and not _preserves_mouse_input(control):
		if not spectator_panel_mouse_filters.has(control_id):
			spectator_panel_mouse_filters[control_id] = control.mouse_filter
		control.mouse_filter = (
			Control.MOUSE_FILTER_PASS if control == debug_panel
			else Control.MOUSE_FILTER_IGNORE
		)
	elif spectator_panel_mouse_filters.has(control_id):
		control.mouse_filter = spectator_panel_mouse_filters[control_id]
		spectator_panel_mouse_filters.erase(control_id)

	for child in control.get_children():
		if child is Control:
			_apply_spectator_panel_input_mode(child)

func _preserves_mouse_input(control: Control) -> bool:
	return (
		control is BaseButton
		or control is Range
		or control is ScrollContainer
		or control is LineEdit
		or control is TextEdit
	)

func toggle() -> void:
	set_open(!is_open)
