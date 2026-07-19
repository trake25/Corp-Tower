extends Control

const JoinScreenScene := preload("res://Cor/Scenes/JoinScreen.tscn")
const FindMatchScreenScene := preload("res://Cor/Scenes/FindMatchScreen.tscn")
const PlayScreenScene := preload("res://Cor/Scenes/GameUI.tscn")

const DEBUG_BUTTON_DRAG_THRESHOLD := 6.0
const DEBUG_BUTTON_MARGIN := 12.0
const DRAG_POINTER_MOUSE := -1
const DRAG_POINTER_NONE := -2

@onready var screen_container: Control = $ScreenContainer
@onready var debug_button: Button = $DebugButton

var current_overlay: Node = null
var play_instance: Node = null
var debug_button_dragging := false
var debug_button_pointer_id := DRAG_POINTER_NONE
var debug_button_drag_distance := 0.0

func _ready() -> void:
	NetworkManager.room_joined.connect(_on_room_joined)
	NetworkManager.room_closed.connect(_on_room_closed)
	NetworkManager.status_changed.connect(_on_status_changed)
	debug_button.gui_input.connect(_on_debug_button_gui_input)
	reset_debug_button_position()
	show_join_screen()

func _on_status_changed(_text: String) -> void:
	update_debug_button_availability()

func _on_room_joined(_data) -> void:
	_ensure_play_instance()
	_clear_overlay()
	reset_debug_button_position()
	update_debug_button_availability()

func _on_room_closed(_data) -> void:
	show_join_screen()

func show_join_screen() -> void:
	_teardown_play_instance()
	var screen := JoinScreenScene.instantiate()
	screen.find_match_requested.connect(_on_find_match_requested)
	_set_overlay(screen)

func show_find_match_screen() -> void:
	_ensure_play_instance()

	var screen := FindMatchScreenScene.instantiate()
	screen.cancel_requested.connect(_on_cancel_requested)
	_set_overlay(screen)

func _on_find_match_requested() -> void:
	NetworkManager.connect_server()
	show_find_match_screen()

func _on_cancel_requested() -> void:
	NetworkManager.leave_queue()
	NetworkManager.disconnect_server()
	show_join_screen()

func _ensure_play_instance() -> void:
	if play_instance != null and is_instance_valid(play_instance):
		return

	play_instance = PlayScreenScene.instantiate()
	screen_container.add_child(play_instance)
	update_debug_button_availability()

func _teardown_play_instance() -> void:
	if play_instance != null and is_instance_valid(play_instance):
		play_instance.queue_free()

	play_instance = null
	update_debug_button_availability()

func _set_overlay(screen: Node) -> void:
	_clear_overlay()
	current_overlay = screen
	screen_container.add_child(screen)

func _clear_overlay() -> void:
	if current_overlay != null and is_instance_valid(current_overlay):
		current_overlay.queue_free()

	current_overlay = null

func update_debug_button_availability() -> void:
	var has_play_instance: bool = (
		play_instance != null
		and is_instance_valid(play_instance)
		and play_instance.has_method("toggle_debug_overlay")
	)
	debug_button.disabled = !has_play_instance or !NetworkManager.is_conn_estab

func reset_debug_button_position() -> void:
	debug_button.position = Vector2(
		size.x - debug_button.size.x - DEBUG_BUTTON_MARGIN,
		DEBUG_BUTTON_MARGIN
	)

func _on_debug_button_gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_begin_debug_button_gesture(touch.index)
		elif touch.index == debug_button_pointer_id:
			_end_debug_button_gesture()
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.button_index != MOUSE_BUTTON_LEFT:
			return
		if mouse.pressed:
			_begin_debug_button_gesture(DRAG_POINTER_MOUSE)
		elif debug_button_pointer_id == DRAG_POINTER_MOUSE:
			_end_debug_button_gesture()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if drag.index != debug_button_pointer_id:
			return
		_move_debug_button(drag.relative)
	elif event is InputEventMouseMotion:
		if debug_button_pointer_id != DRAG_POINTER_MOUSE:
			return
		_move_debug_button((event as InputEventMouseMotion).relative)

func _begin_debug_button_gesture(pointer_id: int) -> void:
	debug_button_pointer_id = pointer_id
	debug_button_dragging = false
	debug_button_drag_distance = 0.0

func _end_debug_button_gesture() -> void:
	debug_button_pointer_id = DRAG_POINTER_NONE

	if debug_button_drag_distance < DEBUG_BUTTON_DRAG_THRESHOLD:
		_on_debug_button_tapped()

	debug_button_dragging = false

func _move_debug_button(relative: Vector2) -> void:
	debug_button_drag_distance += relative.length()
	debug_button_dragging = true

	var target_position: Vector2 = debug_button.position + relative
	debug_button.position = Vector2(
		clamp(target_position.x, 0.0, size.x - debug_button.size.x),
		clamp(target_position.y, 0.0, size.y - debug_button.size.y)
	)

func _on_debug_button_tapped() -> void:
	if debug_button.disabled:
		return

	if play_instance != null and is_instance_valid(play_instance) and play_instance.has_method("toggle_debug_overlay"):
		play_instance.call("toggle_debug_overlay")
