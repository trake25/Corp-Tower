extends Node

const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")
const WHEEL_PAN_UNITS := 1.0

var tower_stack
var match_state
var inventory
var overlay_blocked: Callable = Callable()
var trouble_button: Button
var back_button: Button
var tower_drop_zone: Control
var selected_block_id: String = ""
var was_playing: bool = false
var pan_active: bool = false
var pan_pointer_id: int = PointerEventsScript.POINTER_MOUSE

func bind_nodes(binder) -> void:
	trouble_button = binder.require_node("TroubleDownButton") as Button
	back_button = binder.require_node("BackToTopButton") as Button
	tower_drop_zone = binder.require_node("TowerDropZone") as Control

func setup(
	new_tower_stack,
	new_match_state,
	new_inventory,
	new_overlay_blocked: Callable = Callable()
) -> void:
	tower_stack = new_tower_stack
	match_state = new_match_state
	inventory = new_inventory
	overlay_blocked = new_overlay_blocked
	if trouble_button != null and !trouble_button.pressed.is_connected(_on_trouble_pressed):
		trouble_button.pressed.connect(_on_trouble_pressed)
	if back_button != null and !back_button.pressed.is_connected(_on_back_pressed):
		back_button.pressed.connect(_on_back_pressed)
	if tower_drop_zone != null and !tower_drop_zone.gui_input.is_connected(_on_tower_drop_zone_gui_input):
		tower_drop_zone.gui_input.connect(_on_tower_drop_zone_gui_input)
	refresh()

func _process(_delta: float) -> void:
	refresh()

func _unhandled_input(event: InputEvent) -> void:
	handle_input(event)

func _on_tower_drop_zone_gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event.duplicate() as InputEventScreenTouch
		touch.position = tower_drop_zone.get_global_transform() * event.position
		handle_input(touch)
		return
	if event is InputEventScreenDrag:
		var drag := event.duplicate() as InputEventScreenDrag
		drag.position = tower_drop_zone.get_global_transform() * event.position
		handle_input(drag)
		return
	handle_input(event)

func handle_input(event: InputEvent) -> void:
	if PointerEventsScript.is_emulated(event):
		return
	PointerEventsScript.note_event(event)

	if event is InputEventScreenTouch:
		if event.pressed:
			_start_pan(event.index, event.position)
		elif pan_active and event.index == pan_pointer_id:
			_cancel_pan()
		return

	if event is InputEventScreenDrag:
		if pan_active and event.index == pan_pointer_id:
			_apply_pan_pixels(event.relative.y)
		return

	if event is InputEventMouseButton:
		if event.pressed and event.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			if _can_pan() and _tower_contains(event.global_position):
				var direction: float = 1.0 if event.button_index == MOUSE_BUTTON_WHEEL_UP else -1.0
				_apply_pan_units(direction * WHEEL_PAN_UNITS * maxf(0.1, event.factor))
			return
		if event.button_index != MOUSE_BUTTON_LEFT:
			return
		if event.pressed:
			_start_pan(PointerEventsScript.POINTER_MOUSE, event.global_position)
		elif pan_active and pan_pointer_id == PointerEventsScript.POINTER_MOUSE:
			_cancel_pan()
		return

	if event is InputEventMouseMotion and pan_active and pan_pointer_id == PointerEventsScript.POINTER_MOUSE:
		if event.button_mask & MOUSE_BUTTON_MASK_LEFT:
			_apply_pan_pixels(event.relative.y)
		else:
			_cancel_pan()

func refresh() -> void:
	if tower_stack == null or match_state == null:
		_set_visible(false, false)
		return

	var playing: bool = str(match_state.current_match_state) == "playing"
	if !playing:
		_cancel_pan()
		if was_playing:
			tower_stack.reset_navigation()
		selected_block_id = ""
		was_playing = false
		_set_visible(false, false)
		return

	was_playing = true
	var presentation_blocked: bool = tower_stack.is_navigation_blocked_by_presentation()
	if overlay_blocked.is_valid():
		presentation_blocked = presentation_blocked or bool(overlay_blocked.call())
	if presentation_blocked:
		_cancel_pan()
		_set_visible(false, false)
		return

	if selected_block_id != "" and !tower_stack.is_scroll_navigating():
		selected_block_id = ""
	var trouble: Dictionary = tower_stack.trouble_target()
	var placement_blocked: bool = inventory != null and (
		bool(inventory.is_block_dragging) or bool(inventory.is_armed)
	)
	var show_trouble: bool = !trouble.is_empty() and selected_block_id == ""
	var show_back: bool = tower_stack.is_scroll_manually_displaced()
	_set_visible(show_trouble, show_back)
	if trouble_button != null:
		trouble_button.disabled = placement_blocked
	if back_button != null:
		back_button.disabled = placement_blocked

func reset() -> void:
	_cancel_pan()
	selected_block_id = ""
	was_playing = false
	if tower_stack != null:
		tower_stack.reset_navigation()
	_set_visible(false, false)

func _set_visible(show_trouble: bool, show_back: bool) -> void:
	if trouble_button != null:
		trouble_button.visible = show_trouble
	if back_button != null:
		back_button.visible = show_back

func _on_trouble_pressed() -> void:
	if trouble_button == null or trouble_button.disabled:
		return
	var target: Dictionary = tower_stack.trouble_target()
	if target.is_empty():
		return
	var block_id: String = str(target.get("block_id", ""))
	if block_id != "" and tower_stack.navigate_to_trouble(block_id):
		selected_block_id = block_id
	refresh()

func _on_back_pressed() -> void:
	if back_button == null or back_button.disabled:
		return
	selected_block_id = ""
	tower_stack.return_to_auto_scroll()
	refresh()

func _start_pan(pointer_id: int, global_position: Vector2) -> void:
	if !_can_pan() or !_tower_contains(global_position):
		return
	pan_active = true
	pan_pointer_id = pointer_id

func _apply_pan_pixels(delta_pixels: float) -> void:
	if !_can_pan():
		_cancel_pan()
		return
	if tower_stack.pan_scroll_pixels(delta_pixels):
		selected_block_id = ""
		get_viewport().set_input_as_handled()
		refresh()

func _apply_pan_units(delta_units: float) -> void:
	if tower_stack.pan_scroll_units(delta_units):
		selected_block_id = ""
		get_viewport().set_input_as_handled()
		refresh()

func _can_pan() -> bool:
	if tower_stack == null or match_state == null:
		return false
	if str(match_state.current_match_state) != "playing":
		return false
	if inventory != null and (bool(inventory.is_block_dragging) or bool(inventory.is_armed)):
		return false
	if tower_stack.is_navigation_blocked_by_presentation():
		return false
	return !overlay_blocked.is_valid() or !bool(overlay_blocked.call())

func _tower_contains(global_position: Vector2) -> bool:
	return tower_stack is Control and tower_stack.get_global_rect().has_point(global_position)

func _cancel_pan() -> void:
	pan_active = false
	pan_pointer_id = PointerEventsScript.POINTER_MOUSE
