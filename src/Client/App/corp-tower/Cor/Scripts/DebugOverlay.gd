extends Control

@onready var dim_layer = %DebugDimLayer
@onready var debug_panel = %DebugPanel

var is_open := false

func _ready() -> void:
	set_open(false)

func set_open(open: bool) -> void:
	is_open = open
	visible = open
	if dim_layer:
		dim_layer.visible = open
	if debug_panel:
		debug_panel.visible = open

func toggle() -> void:
	set_open(!is_open)
