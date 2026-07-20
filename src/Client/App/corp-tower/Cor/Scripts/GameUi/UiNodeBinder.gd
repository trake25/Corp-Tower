extends RefCounted

var ui_root: Control
var missing: Array[String] = []

func _init(root: Control) -> void:
	ui_root = root

func require_node(node_name: String) -> Node:
	var node: Node = optional_node(node_name)

	if node == null:
		missing.append(node_name)

	return node

func optional_node(node_name: String) -> Node:
	if ui_root == null:
		return null

	return ui_root.find_child(node_name, true, false)
