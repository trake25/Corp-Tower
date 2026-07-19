extends RefCounted

const GameUiScene = preload("res://Cor/Scenes/GameUI.tscn")

var container: Control
var main: Control

func mount(test, root_size: Vector2) -> void:
	container = Control.new()
	container.size = root_size
	test.add_child_autofree(container)
	main = GameUiScene.instantiate()
	container.add_child(main)
	await test.get_tree().process_frame
	await test.get_tree().process_frame

func resize(root_size: Vector2) -> void:
	container.size = root_size

func find(node_name: String) -> Node:
	return main.find_child(node_name, true, false)

func center_of(node_name: String) -> Vector2:
	var control: Control = find(node_name) as Control
	return control.get_global_rect().get_center()

static func mouse_press(pos: Vector2) -> InputEventMouseButton:
	var event := InputEventMouseButton.new()
	event.button_index = MOUSE_BUTTON_LEFT
	event.pressed = true
	event.position = pos
	event.global_position = pos
	return event

static func touch_press(pos: Vector2, finger_index: int = 0) -> InputEventScreenTouch:
	var event := InputEventScreenTouch.new()
	event.pressed = true
	event.position = pos
	event.index = finger_index
	return event
