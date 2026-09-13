extends Node

const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")
const UiPreferencesScript = preload("res://Cor/Scripts/UiPreferences.gd")
const WHEEL_PAN_UNITS := 1.0
const KEYBOARD_TAP_PAN_UNITS := 0.35
const KEYBOARD_PAN_UNITS_PER_SECOND := 5.0
const WEAK_SUPPORT_ARROW_BOUNCE_PIXELS := 3.0
const WEAK_SUPPORT_ARROW_BOUNCE_SECONDS := 0.45

var tower_stack
var match_state
var inventory
var overlay_blocked: Callable = Callable()
var navigation_popup_available: bool = true
var trouble_button: Button
var back_button: Button
var weak_support_indicator: Control
var weak_support_indicator_arrows: TextureRect
var weak_support_arrow_tween: Tween
var tower_drop_zone: Control
var selected_block_id: String = ""
var was_playing: bool = false
var pan_active: bool = false
var pan_pointer_id: int = PointerEventsScript.POINTER_MOUSE
var keyboard_pan_up_pressed := false
var keyboard_pan_down_pressed := false

func bind_nodes(binder) -> void:
	trouble_button = binder.require_node("TroubleDownButton") as Button
	back_button = binder.require_node("BackToTopButton") as Button
	weak_support_indicator = binder.require_node("WeakSupportIndicator") as Control
	weak_support_indicator_arrows = binder.require_node("WeakSupportIndicatorArrows") as TextureRect
	tower_drop_zone = binder.require_node("TowerDropZone") as Control

func setup(
	new_tower_stack,
	new_match_state,
	new_inventory,
	new_overlay_blocked: Callable = Callable(),
	new_navigation_popup_available: bool = true
) -> void:
	tower_stack = new_tower_stack
	match_state = new_match_state
	inventory = new_inventory
	overlay_blocked = new_overlay_blocked
	navigation_popup_available = new_navigation_popup_available
	if trouble_button != null and !trouble_button.pressed.is_connected(_on_trouble_pressed):
		trouble_button.pressed.connect(_on_trouble_pressed)
	if back_button != null and !back_button.pressed.is_connected(_on_back_pressed):
		back_button.pressed.connect(_on_back_pressed)
	if tower_drop_zone != null and !tower_drop_zone.gui_input.is_connected(_on_tower_drop_zone_gui_input):
		tower_drop_zone.gui_input.connect(_on_tower_drop_zone_gui_input)
	refresh()

func _process(delta: float) -> void:
	refresh()
	_process_keyboard_pan(delta)

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
	if event is InputEventKey:
		_handle_keyboard_pan_input(event)
		return

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
		_set_visible(false, false, false)
		return

	var playing: bool = str(match_state.current_match_state) == "playing"
	if !playing:
		_cancel_pan()
		if was_playing and !tower_stack.is_collapse_input_blocked():
			tower_stack.reset_navigation()
		selected_block_id = ""
		was_playing = false
		_set_visible(false, false, false)
		return

	was_playing = true
	var presentation_blocked: bool = tower_stack.is_navigation_blocked_by_presentation()
	if overlay_blocked.is_valid():
		presentation_blocked = presentation_blocked or bool(overlay_blocked.call())
	if presentation_blocked:
		_cancel_pan()
		_set_visible(false, false, false)
		return

	if selected_block_id != "" and !tower_stack.is_scroll_navigating():
		selected_block_id = ""
	var trouble: Dictionary = tower_stack.trouble_target()
	var placement_blocked: bool = inventory != null and (
		bool(inventory.is_block_dragging) or bool(inventory.is_armed)
	)
	var show_trouble: bool = !trouble.is_empty() and selected_block_id == ""
	var show_back: bool = tower_stack.is_scroll_manually_displaced()
	var show_weak_support_indicator: bool = !trouble.is_empty()
	_set_visible(show_trouble, show_back, show_weak_support_indicator)
	if trouble_button != null:
		trouble_button.disabled = placement_blocked or !navigation_popup_available
	if back_button != null:
		back_button.disabled = placement_blocked or !navigation_popup_available

func reset() -> void:
	_cancel_pan()
	_clear_keyboard_pan()
	selected_block_id = ""
	was_playing = false
	if tower_stack != null:
		tower_stack.reset_navigation()
	_set_visible(false, false, false)

func _set_visible(show_trouble: bool, show_back: bool, show_weak_support_indicator: bool) -> void:
	if trouble_button != null:
		trouble_button.visible = navigation_popup_available and show_trouble
	if back_button != null:
		back_button.visible = navigation_popup_available and show_back
	_set_weak_support_indicator_visible(show_weak_support_indicator)

func _set_weak_support_indicator_visible(should_show: bool) -> void:
	if weak_support_indicator == null or weak_support_indicator.visible == should_show:
		return

	weak_support_indicator.visible = should_show
	if should_show:
		_start_weak_support_indicator_animation()
	else:
		_stop_weak_support_indicator_animation()

func _start_weak_support_indicator_animation() -> void:
	if weak_support_indicator_arrows == null:
		return

	_stop_weak_support_indicator_animation()
	weak_support_arrow_tween = create_tween()
	weak_support_arrow_tween.set_loops()
	weak_support_arrow_tween.tween_property(
		weak_support_indicator_arrows,
		"position:y",
		WEAK_SUPPORT_ARROW_BOUNCE_PIXELS,
		WEAK_SUPPORT_ARROW_BOUNCE_SECONDS
	).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	weak_support_arrow_tween.tween_property(
		weak_support_indicator_arrows,
		"position:y",
		0.0,
		WEAK_SUPPORT_ARROW_BOUNCE_SECONDS
	).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)

func _stop_weak_support_indicator_animation() -> void:
	if weak_support_arrow_tween != null and is_instance_valid(weak_support_arrow_tween):
		weak_support_arrow_tween.kill()
	weak_support_arrow_tween = null

	if weak_support_indicator_arrows != null:
		weak_support_indicator_arrows.position = Vector2.ZERO

func _on_trouble_pressed() -> void:
	if !navigation_popup_available or trouble_button == null or trouble_button.disabled:
		return
	var target: Dictionary = tower_stack.trouble_target()
	if target.is_empty():
		return
	var block_id: String = str(target.get("block_id", ""))
	if block_id != "" and tower_stack.navigate_to_trouble(block_id):
		selected_block_id = block_id
	refresh()

func _on_back_pressed() -> void:
	if !navigation_popup_available or back_button == null or back_button.disabled:
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
	if !_can_pan():
		return
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

func _handle_keyboard_pan_input(event: InputEventKey) -> void:
	if !UiPreferencesScript.is_mobile_controls_runtime():
		var direction := _keyboard_event_direction(event)
		if direction == 0:
			return

		if event.pressed:
			if event.echo:
				return
			_set_keyboard_direction_pressed(direction, true)
			if _keyboard_pan_direction() == direction and _can_keyboard_pan():
				_apply_pan_units(direction * KEYBOARD_TAP_PAN_UNITS)
		else:
			_set_keyboard_direction_pressed(direction, false)

func _process_keyboard_pan(delta: float) -> void:
	if UiPreferencesScript.is_mobile_controls_runtime():
		_clear_keyboard_pan()
		return
	if !_can_keyboard_pan():
		_clear_keyboard_pan()
		return

	var direction := _keyboard_pan_direction()
	if direction != 0:
		_apply_pan_units(direction * KEYBOARD_PAN_UNITS_PER_SECOND * delta)

func _can_keyboard_pan() -> bool:
	if !_can_pan():
		return false

	var focus_owner := get_viewport().gui_get_focus_owner()
	if focus_owner is LineEdit:
		return !focus_owner.editable
	if focus_owner is TextEdit:
		return !focus_owner.editable
	return true

func _keyboard_event_direction(event: InputEventKey) -> int:
	if event.keycode in [KEY_W, KEY_UP] or event.physical_keycode in [KEY_W, KEY_UP]:
		return 1
	if event.keycode in [KEY_S, KEY_DOWN] or event.physical_keycode in [KEY_S, KEY_DOWN]:
		return -1
	return 0

func _set_keyboard_direction_pressed(direction: int, pressed: bool) -> void:
	if direction > 0:
		keyboard_pan_up_pressed = pressed
	else:
		keyboard_pan_down_pressed = pressed

func _keyboard_pan_direction() -> int:
	if keyboard_pan_up_pressed == keyboard_pan_down_pressed:
		return 0
	return 1 if keyboard_pan_up_pressed else -1

func _clear_keyboard_pan() -> void:
	keyboard_pan_up_pressed = false
	keyboard_pan_down_pressed = false

func _tower_contains(global_position: Vector2) -> bool:
	return tower_stack is Control and tower_stack.get_global_rect().has_point(global_position)

func _cancel_pan() -> void:
	pan_active = false
	pan_pointer_id = PointerEventsScript.POINTER_MOUSE
