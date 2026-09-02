extends Node

var placement_world_frame: Control
var tower_stack
var inventory

func bind_nodes(binder) -> void:
	placement_world_frame = binder.require_node("PlacementWorldFrame") as Control

func setup(new_tower_stack, new_inventory) -> void:
	tower_stack = new_tower_stack
	inventory = new_inventory
	var visibility_changed := Callable(self, "_on_placement_world_visibility_changed")
	if (
		tower_stack != null
		and tower_stack.has_signal("placement_world_visibility_changed")
		and !tower_stack.is_connected("placement_world_visibility_changed", visibility_changed)
	):
		tower_stack.connect("placement_world_visibility_changed", visibility_changed)
	reset()

func reset() -> void:
	if placement_world_frame == null:
		return
	placement_world_frame.visible = !(
		tower_stack != null
		and tower_stack.has_method("is_placement_world_hidden")
		and bool(tower_stack.call("is_placement_world_hidden"))
	)

func _on_placement_world_visibility_changed(visible: bool) -> void:
	if placement_world_frame != null:
		placement_world_frame.visible = visible
	if !visible and inventory != null:
		inventory.cancel_block_drag()
