extends Node

const LOBBY_CONTEXT := "lobby"

var ui_root: Control
var debug_layer: Node
var reset_presentation: Callable
var stored_visibility: Dictionary = {}
var gameplay_hidden := false

func setup(reset_callback: Callable) -> void:
	reset_presentation = reset_callback

func bind_nodes(binder) -> void:
	ui_root = binder.ui_root
	debug_layer = binder.require_node("DebugLayer")

func set_screen_context(context: String) -> void:
	if context == LOBBY_CONTEXT:
		hide_gameplay_presentation()
	else:
		show_gameplay_presentation()

func hide_gameplay_presentation() -> void:
	if gameplay_hidden or ui_root == null:
		return

	if reset_presentation.is_valid():
		reset_presentation.call()

	stored_visibility.clear()
	for child in ui_root.get_children():
		if child == debug_layer or not child is CanvasItem:
			continue
		if child.has_method("close"):
			child.call("close")
		var canvas_item := child as CanvasItem
		stored_visibility[canvas_item] = canvas_item.visible
		canvas_item.visible = false

	gameplay_hidden = true

func show_gameplay_presentation() -> void:
	if not gameplay_hidden:
		return

	for item in stored_visibility:
		if is_instance_valid(item):
			(item as CanvasItem).visible = bool(stored_visibility[item])

	stored_visibility.clear()
	gameplay_hidden = false
