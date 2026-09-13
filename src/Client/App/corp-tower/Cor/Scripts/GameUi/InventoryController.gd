extends Node

const MAX_INVENTORY_SLOTS := 3
const DRAG_PREVIEW_SIZE := Vector2(170, 170)
const DRAG_GRIP_OFFSET_FALLBACK := Vector2(0.0, -48.0)
const UNRESOLVED_SNAP := {
	"valid": true,
	"snapped": false,
	"exact": false,
	"column": -1,
	"origin_y": 0,
	"target_point": Vector2i.ZERO,
	"matched_vertex": Vector2i.ZERO,
	"aim_point": Vector2i.ZERO,
	"aim_origin_y": 0
}
const SITE_ONLY_SNAP := {
	"valid": true,
	"snapped": false,
	"show_ghost": false
}
const TAP_DEDUPE_MS := 60
const SELECTED_CARD_BORDER_WIDTH := 3
const SELECTED_CARD_TINT := 0.12
const UNSELECTED_CARD_ALPHA := 0.72
const SELECTION_RESPONSE_SECONDS := 0.16
const COOLING_FEEDBACK_THROTTLE_MS := 420
const COOLING_FEEDBACK_VISIBLE_MS := 700
const BlockPreviewScript = preload("res://Cor/Scripts/BlockPreview.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")

var players_ctx
var match_state
var tuning
var network
var popovers
var tutorial
var accessibility
var inventory_buttons: Array = []
var cooldown_overlays: Array = []
var block_previews: Array = []
var draw_pile_name_label: Label
var draw_pile_count_label: Label
var draw_pile_preview: Control
var cooling_feedback_label: Label
var tower_drop_zone: Control
var tower_stack_fallback: Control
var drag_preview: Control
var inventory_slot_blocks: Array = []
var active_inventory_slots: int = MAX_INVENTORY_SLOTS
var optimistic_placement_started_at_ms: int = 0
var authoritative_cooldown_deadline_ms: int = 0
var pending_placement_request_id := ""
var placement_request_sequence := 0
var is_block_dragging: bool = false
var drag_slot_index: int = -1
var drag_pointer_id: int = PointerEventsScript.POINTER_MOUSE
var drag_snap: Dictionary = {}
var last_draw_pile_count: int = 0
var last_next_draw_block: Variant = null
var parallel_placement: bool = false
var tap_to_drag: bool = false
var selected_slot_index: int = -1
var armed_snap: Dictionary = {}
var is_armed: bool = false
var last_tap_ms: int = 0
var selected_card_style: StyleBoxFlat = null
var spectator_mode := false
var ready_locked := false
var authoritative_state := ""
var authoritative_level := -1
var ready_lock_presentation: Callable = Callable()
var ready_rejection_feedback: Callable = Callable()
var clear_ready_rejection_feedback: Callable = Callable()
var cooling_feedback_deadline_ms := 0
var cooling_feedback_last_at_ms := -COOLING_FEEDBACK_THROTTLE_MS
var selection_response_tween: Tween
var finished_placement_inactive := false

func bind_nodes(binder) -> void:
	draw_pile_name_label = binder.require_node("DrawPileNameLabel") as Label
	draw_pile_count_label = binder.require_node("DrawPileCountLabel") as Label
	draw_pile_preview = binder.require_node("DrawPilePreview") as Control
	cooling_feedback_label = binder.require_node("CoolingFeedbackLabel") as Label
	tower_drop_zone = binder.require_node("TowerDropZone") as Control
	tower_stack_fallback = binder.optional_node("TowerStack") as Control
	drag_preview = binder.require_node("DragPreview") as Control

	inventory_buttons = [
		binder.require_node("PlaceBlockButton1") as Button,
		binder.require_node("PlaceBlockButton2") as Button,
		binder.require_node("PlaceBlockButton3") as Button
	]
	block_previews = [
		binder.require_node("BlockPreview1") as Control,
		binder.require_node("BlockPreview2") as Control,
		binder.require_node("BlockPreview3") as Control
	]
	cooldown_overlays = []
	for button in inventory_buttons:
		cooldown_overlays.append(button.get_node_or_null("CooldownOverlay") as Control)
	if cooling_feedback_label != null:
		cooling_feedback_label.visible = false
		cooling_feedback_label.mouse_filter = Control.MOUSE_FILTER_IGNORE

func setup(
	players_ref,
	match_state_ref,
	tuning_ref,
	network_ref,
	popovers_ref,
	tutorial_ref = null,
	accessibility_ref = null
) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref
	network = network_ref
	popovers = popovers_ref
	tutorial = tutorial_ref
	accessibility = accessibility_ref

	for preview in block_previews:
		preview.cell_color = players_ctx.local_color()

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		button.focus_mode = Control.FOCUS_NONE
		button.toggle_mode = false
		button.gui_input.connect(func(event: InputEvent): _on_inventory_card_gui_input(event, i))

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.mouse_filter = Control.MOUSE_FILTER_IGNORE
		drag_preview.custom_minimum_size = DRAG_PREVIEW_SIZE
		drag_preview.size = DRAG_PREVIEW_SIZE
		if drag_preview.has_method("set_preview_mode"):
			drag_preview.call(
				"set_preview_mode",
				BlockPreviewScript.PreviewMode.FLOATING_DRAG
			)

func set_ready_presentation_handlers(
	lock_presentation: Callable,
	rejection_feedback: Callable,
	clear_feedback: Callable
) -> void:
	ready_lock_presentation = lock_presentation
	ready_rejection_feedback = rejection_feedback
	clear_ready_rejection_feedback = clear_feedback
	_sync_ready_lock_presentation()

func apply_authoritative_state(state: String, level: int, force_round_cleanup: bool = false) -> void:
	var is_new_ready_round := state == "starting" and (
		force_round_cleanup
		or authoritative_state != "starting"
		or authoritative_level != level
	)
	if is_new_ready_round:
		clear_for_new_round()
	elif state == "finished" or state == "failed" or state == "game_over":
		clear_for_play_exit()
	elif state != "playing":
		clear_cooldown_reconciliation()

	var was_ready_locked := ready_locked
	ready_locked = state == "starting"
	authoritative_state = state
	authoritative_level = level
	if was_ready_locked and !ready_locked and clear_ready_rejection_feedback.is_valid():
		clear_ready_rejection_feedback.call()
	_apply_selection_visuals()
	_sync_ready_lock_presentation()

func clear_for_new_round() -> void:
	cancel_block_drag()
	clear_cooldown_reconciliation()
	finished_placement_inactive = false
	last_tap_ms = 0
	cooling_feedback_deadline_ms = 0
	cooling_feedback_last_at_ms = -COOLING_FEEDBACK_THROTTLE_MS
	if cooling_feedback_label != null:
		cooling_feedback_label.visible = false
	if clear_ready_rejection_feedback.is_valid():
		clear_ready_rejection_feedback.call()

func clear_for_play_exit() -> void:
	cancel_block_drag()
	clear_cooldown_reconciliation()
	finished_placement_inactive = true
	last_tap_ms = 0
	cooling_feedback_deadline_ms = 0
	cooling_feedback_last_at_ms = -COOLING_FEEDBACK_THROTTLE_MS
	if cooling_feedback_label != null:
		cooling_feedback_label.visible = false

func clear_cooldown_reconciliation() -> void:
	optimistic_placement_started_at_ms = 0
	authoritative_cooldown_deadline_ms = 0
	pending_placement_request_id = ""

func _tower_brick_unit_size() -> float:
	if tower_stack_fallback == null:
		return 0.0

	var unit_size: Variant = tower_stack_fallback.get("brick_unit_size")

	if typeof(unit_size) != TYPE_FLOAT and typeof(unit_size) != TYPE_INT:
		return 0.0

	return float(unit_size)

func _drag_grip_offset() -> Vector2:
	if tower_stack_fallback == null or !tower_stack_fallback.has_method("drag_grip_offset"):
		return DRAG_GRIP_OFFSET_FALLBACK

	return tower_stack_fallback.call("drag_grip_offset")

func handle_input(event: InputEvent) -> void:
	if spectator_mode:
		return

	PointerEventsScript.note_event(event)

	if is_block_dragging:
		_handle_block_drag_input(event)
		return

	if parallel_placement and selected_slot_index >= 0:
		_handle_selection_hover(event)

func tick() -> void:
	update_placement_cooldown_overlays()
	if cooling_feedback_deadline_ms > 0 and Time.get_ticks_msec() >= cooling_feedback_deadline_ms:
		cooling_feedback_deadline_ms = 0
		if cooling_feedback_label != null:
			cooling_feedback_label.visible = false

func on_block_pressed(index: int, column: int = -1, origin_y: int = -1) -> void:
	if _is_ready_locked_card(index):
		_reject_ready_placement(index)
		return
	if !can_place_block(index):
		return

	if match_state.tutorial_mode and tutorial != null:
		_begin_optimistic_cooldown(false)
		tutorial.on_tutorial_place(index, column, origin_y)
		return

	var placement_request_id := _begin_optimistic_cooldown(true)
	network.place_block(index, column, origin_y, placement_request_id)

func _on_inventory_card_gui_input(event: InputEvent, index: int) -> void:
	if _is_ready_locked_card(index) and _is_primary_press(event):
		_reject_ready_placement(index)
		get_viewport().set_input_as_handled()
		return
	if _is_cooling_card(index) and _is_primary_press(event):
		_reject_cooling_placement(index)
		get_viewport().set_input_as_handled()
		return

	if parallel_placement:
		_handle_card_tap(event, index)
		return

	if is_block_dragging:
		if (
			tap_to_drag and
			event is InputEventMouseButton and
			event.button_index == MOUSE_BUTTON_LEFT and
			event.pressed and
			drag_pointer_id == PointerEventsScript.POINTER_MOUSE
		):
			finish_block_drag(event.global_position)
			get_viewport().set_input_as_handled()
		return

	if event is InputEventMouseButton:
		var mouse_event: InputEventMouseButton = event

		if mouse_event.button_index != MOUSE_BUTTON_LEFT:
			return

		if mouse_event.pressed:
			if can_start_block_drag(index):
				begin_block_drag(index, mouse_event.global_position, PointerEventsScript.POINTER_MOUSE)
				get_viewport().set_input_as_handled()
		elif is_block_dragging and drag_slot_index == index:
			finish_block_drag(mouse_event.global_position)
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch:
		var touch_event: InputEventScreenTouch = event

		if touch_event.pressed:
			if can_start_block_drag(index):
				begin_block_drag(index, touch_event.position, touch_event.index)
				get_viewport().set_input_as_handled()
		elif is_block_dragging and drag_pointer_id == touch_event.index:
			finish_block_drag(touch_event.position)
			get_viewport().set_input_as_handled()

func _handle_block_drag_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and drag_pointer_id == PointerEventsScript.POINTER_MOUSE:
		update_block_drag(event.global_position)
		get_viewport().set_input_as_handled()
	elif event is InputEventScreenDrag and event.index == drag_pointer_id:
		update_block_drag(event.position)
		get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton:
		var mouse_event: InputEventMouseButton = event

		if tap_to_drag and drag_pointer_id == PointerEventsScript.POINTER_MOUSE:
			if mouse_event.button_index == MOUSE_BUTTON_LEFT and mouse_event.pressed:
				finish_block_drag(mouse_event.global_position)
				get_viewport().set_input_as_handled()
			return

		if (
			mouse_event.button_index == MOUSE_BUTTON_LEFT and
			!mouse_event.pressed and
			drag_pointer_id == PointerEventsScript.POINTER_MOUSE
		):
			finish_block_drag(mouse_event.global_position)
			get_viewport().set_input_as_handled()
	elif event is InputEventScreenTouch:
		var touch_event: InputEventScreenTouch = event

		if !touch_event.pressed and drag_pointer_id == touch_event.index:
			finish_block_drag(touch_event.position)
			get_viewport().set_input_as_handled()

func can_start_block_drag(index: int) -> bool:
	return can_place_block(index)

func can_place_block(index: int) -> bool:
	if index < 0 or index >= inventory_buttons.size():
		return false

	if inventory_buttons[index].disabled:
		return false

	if index >= active_inventory_slots:
		return false

	if index >= inventory_slot_blocks.size():
		return false

	if typeof(inventory_slot_blocks[index]) != TYPE_DICTIONARY:
		return false

	if inventory_slot_blocks[index].is_empty():
		return false

	return is_placement_input_allowed()

func is_placement_input_allowed() -> bool:
	if spectator_mode:
		return false
	if ready_locked:
		return false

	if (
		tower_stack_fallback != null
		and tower_stack_fallback.has_method("is_collapse_input_blocked")
		and bool(tower_stack_fallback.call("is_collapse_input_blocked"))
	):
		return false

	if !match_state.tutorial_mode:
		if !network.is_conn_estab:
			return false

		if match_state.current_match_state != "playing":
			return false

	if is_block_dragging:
		return true

	return get_placement_cooldown_remaining_ms() <= 0

func get_placement_cooldown_remaining_ms() -> int:
	var now := Time.get_ticks_msec()
	var remaining := maxi(0, authoritative_cooldown_deadline_ms - now)
	if optimistic_placement_started_at_ms > 0:
		remaining = maxi(remaining, tuning.placement_cooldown_ms - (now - optimistic_placement_started_at_ms))
	if pending_placement_request_id != "":
		return maxi(1, remaining)
	return remaining

func _begin_optimistic_cooldown(awaits_authority: bool) -> String:
	optimistic_placement_started_at_ms = Time.get_ticks_msec()
	authoritative_cooldown_deadline_ms = 0
	if !awaits_authority:
		pending_placement_request_id = ""
		return ""
	placement_request_sequence += 1
	pending_placement_request_id = str(Time.get_ticks_usec()) + ":" + str(placement_request_sequence)
	return pending_placement_request_id

func reconcile_authoritative_cooldown(
	remaining_ms: int,
	request_id: String,
	is_snapshot: bool = false
) -> void:
	if is_snapshot:
		clear_cooldown_reconciliation()
	if spectator_mode or match_state.current_match_state != "playing":
		clear_cooldown_reconciliation()
		return
	var safe_remaining := maxi(0, remaining_ms)
	if pending_placement_request_id != "":
		if request_id != pending_placement_request_id:
			return
		pending_placement_request_id = ""
		optimistic_placement_started_at_ms = 0
		authoritative_cooldown_deadline_ms = Time.get_ticks_msec() + safe_remaining if safe_remaining > 0 else 0
		return
	if safe_remaining <= 0:
		authoritative_cooldown_deadline_ms = 0
		optimistic_placement_started_at_ms = 0
		return
	authoritative_cooldown_deadline_ms = maxi(
		authoritative_cooldown_deadline_ms,
		Time.get_ticks_msec() + safe_remaining
	)

func update_placement_cooldown_overlays() -> void:
	var ratio: float = 0.0
	if match_state.current_match_state == "playing" and tuning.placement_cooldown_ms > 0:
		ratio = float(get_placement_cooldown_remaining_ms()) / float(tuning.placement_cooldown_ms)
	for i in range(cooldown_overlays.size()):
		var overlay = cooldown_overlays[i]
		if overlay != null and overlay.has_method("set_remaining_ratio"):
			overlay.call("set_remaining_ratio", ratio if _is_filled_active_card(i) else 0.0)

func begin_block_drag(index: int, global_pos: Vector2, pointer_id: int) -> void:
	if drag_preview == null:
		return

	popovers.close_active()

	var block: Dictionary = inventory_slot_blocks[index]
	var local_color: Color = players_ctx.local_color()
	is_block_dragging = true
	drag_slot_index = index
	drag_pointer_id = pointer_id
	drag_snap = {}
	drag_preview.cell_color = local_color

	var unit_size: float = _tower_brick_unit_size()
	if unit_size > 0.0:
		drag_preview.cell_size_override = unit_size

	if drag_preview.has_method("set_preview_mode"):
		drag_preview.call(
			"set_preview_mode",
			BlockPreviewScript.PreviewMode.FLOATING_DRAG
		)

	drag_preview.set_block(block)
	drag_preview.visible = true
	drag_preview.z_index = 50

	if tower_stack_fallback != null and tower_stack_fallback.has_method("begin_snap_drag"):
		tower_stack_fallback.call("begin_snap_drag", block, local_color)

	update_block_drag(global_pos)

func update_block_drag(global_pos: Vector2) -> void:
	if drag_preview == null or !is_block_dragging:
		return

	var ghost_pos: Vector2 = global_pos + _drag_grip_offset()
	drag_preview.global_position = ghost_pos - drag_preview.size * 0.5
	drag_snap = _resolve_snap(ghost_pos)

	var docked: bool = (
		_can_dock() and is_pointer_in_tower_drop_zone(global_pos) and _is_snap_valid()
	)
	drag_preview.visible = !docked

	var matched_vertex: Vector2i = BlockPreviewScript.NO_MATCHED_VERTEX
	if bool(drag_snap.get("snapped", false)):
		matched_vertex = drag_snap.get("matched_vertex", matched_vertex)

	if drag_preview.has_method("set_matched_vertex"):
		drag_preview.call("set_matched_vertex", matched_vertex)

	if tower_stack_fallback == null:
		return

	if docked and tower_stack_fallback.has_method("set_snap_state"):
		tower_stack_fallback.call("set_snap_state", drag_snap)
	elif !docked and tower_stack_fallback.has_method("clear_snap_preview"):
		tower_stack_fallback.call("clear_snap_preview")

func _resolve_snap(ghost_global_pos: Vector2) -> Dictionary:
	if tower_stack_fallback == null or !tower_stack_fallback.has_method("resolve_snap"):
		return UNRESOLVED_SNAP.duplicate()

	var slot_index: int = drag_slot_index if is_block_dragging else selected_slot_index
	var cells: Array = []

	if slot_index >= 0 and slot_index < inventory_slot_blocks.size():
		cells = inventory_slot_blocks[slot_index].get("cells", [])

	return tower_stack_fallback.call("resolve_snap", cells, ghost_global_pos)

func _is_snap_valid() -> bool:
	return bool(drag_snap.get("valid", false))

func _can_dock() -> bool:
	return tower_stack_fallback != null and tower_stack_fallback.has_method("set_snap_state")

func finish_block_drag(global_pos: Vector2) -> void:
	if !is_block_dragging:
		return

	var slot_index: int = drag_slot_index
	drag_snap = _resolve_snap(global_pos + _drag_grip_offset())

	var should_place: bool = (
		slot_index >= 0 and
		_is_snap_valid() and
		is_pointer_in_tower_drop_zone(global_pos) and
		can_place_block(slot_index)
	)
	var column: int = int(drag_snap.get("column", -1))
	var origin_y: int = _snap_origin_y(drag_snap)

	cancel_block_drag()

	if should_place:
		on_block_pressed(slot_index, column, origin_y)

func _snap_origin_y(snap: Dictionary) -> int:
	if !bool(snap.get("exact", false)):
		return -1

	return maxi(-1, int(snap.get("origin_y", -1)))

func cancel_block_drag() -> void:
	is_block_dragging = false
	drag_slot_index = -1
	drag_pointer_id = PointerEventsScript.POINTER_MOUSE
	drag_snap = {}
	_clear_selection_state()

	if tower_stack_fallback != null and tower_stack_fallback.has_method("end_snap_drag"):
		tower_stack_fallback.call("end_snap_drag")

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

		if drag_preview.has_method("clear_matched_vertex"):
			drag_preview.call("clear_matched_vertex")

func set_parallel_placement(enabled: bool) -> void:
	if enabled == parallel_placement:
		return

	parallel_placement = enabled
	if enabled:
		tap_to_drag = false
	cancel_block_drag()

	if tower_drop_zone == null:
		return

	tower_drop_zone.mouse_filter = (
		Control.MOUSE_FILTER_STOP if enabled else Control.MOUSE_FILTER_PASS
	)

	var handler := Callable(self, "_on_tower_drop_zone_gui_input")

	if enabled and !tower_drop_zone.gui_input.is_connected(handler):
		tower_drop_zone.gui_input.connect(handler)
	elif !enabled and tower_drop_zone.gui_input.is_connected(handler):
		tower_drop_zone.gui_input.disconnect(handler)

func set_tap_to_drag(enabled: bool) -> void:
	if enabled == tap_to_drag:
		return

	if enabled:
		set_parallel_placement(false)

	tap_to_drag = enabled
	cancel_block_drag()

func set_spectator_mode(enabled: bool) -> void:
	if spectator_mode == enabled:
		return

	spectator_mode = enabled
	cancel_block_drag()
	if enabled:
		clear_cooldown_reconciliation()

	for button in inventory_buttons:
		if button != null:
			button.visible = not spectator_mode
			if spectator_mode:
				button.disabled = true

	if tower_drop_zone != null:
		tower_drop_zone.mouse_filter = (
			Control.MOUSE_FILTER_STOP if parallel_placement else Control.MOUSE_FILTER_PASS
		)

func _handle_card_tap(event: InputEvent, index: int) -> void:
	if _is_ready_locked_card(index) and _is_primary_press(event):
		_reject_ready_placement(index)
		return
	if !_is_primary_press(event) or !_accept_tap():
		return

	get_viewport().set_input_as_handled()

	if selected_slot_index == index:
		deselect_block()
		return

	select_block(index)

func select_block(index: int) -> void:
	if _is_ready_locked_card(index):
		_reject_ready_placement(index)
		return
	if !can_place_block(index):
		return

	popovers.close_active()

	var block: Dictionary = inventory_slot_blocks[index]
	var local_color: Color = players_ctx.local_color()

	selected_slot_index = index
	is_armed = false
	armed_snap = {}
	drag_snap = {}
	_apply_selection_visuals()
	_play_selection_response(index)

	if tower_stack_fallback != null and tower_stack_fallback.has_method("begin_snap_drag"):
		tower_stack_fallback.call("begin_snap_drag", block, local_color)

	_show_site_overlay()
	_prepare_cursor_ghost(block, local_color)

func deselect_block() -> void:
	if selected_slot_index < 0:
		return

	_clear_selection_state()

	if tower_stack_fallback != null and tower_stack_fallback.has_method("end_snap_drag"):
		tower_stack_fallback.call("end_snap_drag")

func _clear_selection_state() -> void:
	var had_selection := selected_slot_index >= 0 or is_armed or !armed_snap.is_empty()
	selected_slot_index = -1
	is_armed = false
	armed_snap = {}
	if had_selection:
		_apply_selection_visuals()
	_stop_selection_response()

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

		if drag_preview.has_method("clear_matched_vertex"):
			drag_preview.call("clear_matched_vertex")

func _prepare_cursor_ghost(block: Dictionary, local_color: Color) -> void:
	if drag_preview == null or !PointerEventsScript.has_mouse():
		return

	var unit_size: float = _tower_brick_unit_size()

	if unit_size > 0.0:
		drag_preview.cell_size_override = unit_size

	if drag_preview.has_method("set_preview_mode"):
		drag_preview.call(
			"set_preview_mode",
			BlockPreviewScript.PreviewMode.FLOATING_DRAG
		)

	drag_preview.cell_color = local_color
	drag_preview.set_block(block)
	drag_preview.z_index = 50
	_update_cursor_ghost(drag_preview.get_global_mouse_position())

func _handle_selection_hover(event: InputEvent) -> void:
	if is_armed or !(event is InputEventMouseMotion) or PointerEventsScript.is_emulated(event):
		return

	if drag_preview == null or !PointerEventsScript.has_mouse():
		return

	_update_cursor_ghost(event.global_position)

func _update_cursor_ghost(global_pos: Vector2) -> void:
	drag_preview.global_position = global_pos - drag_preview.size * 0.5
	drag_snap = _resolve_snap(global_pos)

	var docked: bool = (
		_can_dock() and is_pointer_in_tower_drop_zone(global_pos) and _is_snap_valid()
	)
	drag_preview.visible = !docked

	var matched_vertex: Vector2i = BlockPreviewScript.NO_MATCHED_VERTEX
	if bool(drag_snap.get("snapped", false)):
		matched_vertex = drag_snap.get("matched_vertex", matched_vertex)

	if drag_preview.has_method("set_matched_vertex"):
		drag_preview.call("set_matched_vertex", matched_vertex)

	if !_can_dock():
		return

	if docked:
		tower_stack_fallback.call("set_snap_state", drag_snap)
	else:
		_show_site_overlay()

func _show_site_overlay() -> void:
	if _can_dock():
		tower_stack_fallback.call("set_snap_state", SITE_ONLY_SNAP.duplicate())

func _on_tower_drop_zone_gui_input(event: InputEvent) -> void:
	if spectator_mode:
		return
	if ready_locked:
		if selected_slot_index >= 0 and _is_primary_press(event):
			_reject_ready_placement(selected_slot_index)
		return
	if selected_slot_index < 0 or !_is_primary_press(event) or !_accept_tap():
		return

	tower_drop_zone.accept_event()
	_aim_or_place(_drop_zone_global_position(event))

func _drop_zone_global_position(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return event.global_position

	return tower_drop_zone.get_global_transform() * event.position

func _aim_or_place(global_pos: Vector2) -> void:
	var snap: Dictionary = _resolve_snap(global_pos)

	if !bool(snap.get("valid", false)):
		return

	if is_armed and _is_same_placement(snap, armed_snap):
		_commit_armed_placement()
		return

	_arm_placement(snap)

func _arm_placement(snap: Dictionary) -> void:
	armed_snap = snap.duplicate()
	armed_snap["armed"] = true
	armed_snap["show_ghost"] = true
	is_armed = true
	drag_snap = armed_snap

	if drag_preview != null:
		drag_preview.visible = false

	if _can_dock():
		tower_stack_fallback.call("set_snap_state", armed_snap)

func _commit_armed_placement() -> void:
	var slot_index: int = selected_slot_index
	var column: int = int(armed_snap.get("column", -1))
	var origin_y: int = _snap_origin_y(armed_snap)

	deselect_block()

	if slot_index >= 0:
		on_block_pressed(slot_index, column, origin_y)

func revalidate_armed_placement() -> void:
	if !is_armed or selected_slot_index < 0:
		return

	if !bool(armed_snap.get("exact", false)):
		return

	if tower_stack_fallback == null or !tower_stack_fallback.has_method("is_placement_still_legal"):
		return

	var cells: Array = inventory_slot_blocks[selected_slot_index].get("cells", [])
	var still_legal: bool = tower_stack_fallback.call(
		"is_placement_still_legal",
		cells,
		int(armed_snap.get("column", -1)),
		int(armed_snap.get("origin_y", -1))
	)

	if still_legal:
		return

	is_armed = false
	armed_snap = {}
	_show_site_overlay()

func _is_same_placement(a: Dictionary, b: Dictionary) -> bool:
	return (
		int(a.get("column", -1)) == int(b.get("column", -2)) and
		int(a.get("origin_y", -1)) == int(b.get("origin_y", -2))
	)

func _is_primary_press(event: InputEvent) -> bool:
	if event is InputEventMouseButton:
		return event.button_index == MOUSE_BUTTON_LEFT and event.pressed

	if event is InputEventScreenTouch:
		return event.pressed

	return false

func _accept_tap() -> bool:
	var now: int = Time.get_ticks_msec()

	if now - last_tap_ms < TAP_DEDUPE_MS:
		return false

	last_tap_ms = now

	return true

func _apply_selection_visuals() -> void:
	var local_color: Color = players_ctx.local_color()

	if selected_slot_index < 0:
		selected_card_style = null
	else:
		selected_card_style = _build_selected_card_style(local_color)

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		button.remove_theme_stylebox_override("normal")
		button.remove_theme_stylebox_override("hover")
		button.remove_theme_stylebox_override("pressed")

		if _is_ready_locked_card(i):
			var normal_style: StyleBox = button.get_theme_stylebox("normal", "WhiteCardButton")
			if normal_style != null:
				button.add_theme_stylebox_override("hover", normal_style)
				button.add_theme_stylebox_override("pressed", normal_style)
			button.modulate = Color.WHITE
			continue

		if finished_placement_inactive:
			button.modulate = Color(1.0, 1.0, 1.0, UNSELECTED_CARD_ALPHA)
			continue

		if i == selected_slot_index and selected_card_style != null:
			button.add_theme_stylebox_override("normal", selected_card_style)
			button.add_theme_stylebox_override("hover", selected_card_style)
			button.add_theme_stylebox_override("pressed", selected_card_style)
			button.modulate = Color.WHITE
			continue

		button.modulate = (
			Color(1.0, 1.0, 1.0, UNSELECTED_CARD_ALPHA)
			if selected_slot_index >= 0
			else Color.WHITE
		)

func _build_selected_card_style(local_color: Color) -> StyleBoxFlat:
	var base: StyleBox = inventory_buttons[selected_slot_index].get_theme_stylebox(
		"normal", "WhiteCardButton"
	)

	if !(base is StyleBoxFlat):
		return null

	var style: StyleBoxFlat = base.duplicate()
	style.bg_color = style.bg_color.lerp(local_color, SELECTED_CARD_TINT)
	style.border_color = local_color
	style.set_border_width_all(SELECTED_CARD_BORDER_WIDTH)
	style.shadow_color = Color(local_color.r, local_color.g, local_color.b, 0.35)

	return style

func _play_selection_response(index: int) -> void:
	_stop_selection_response()
	if index < 0 or index >= inventory_buttons.size():
		return
	var button: Button = inventory_buttons[index]
	button.pivot_offset = button.size * 0.5
	button.scale = Vector2(0.94, 0.94)
	selection_response_tween = create_tween()
	selection_response_tween.tween_property(button, "scale", Vector2.ONE, SELECTION_RESPONSE_SECONDS).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

func _stop_selection_response() -> void:
	if selection_response_tween != null and is_instance_valid(selection_response_tween):
		selection_response_tween.kill()
	selection_response_tween = null
	for button in inventory_buttons:
		if button != null:
			button.scale = Vector2.ONE

func is_pointer_in_tower_drop_zone(global_pos: Vector2) -> bool:
	var drop_zone: Control = tower_drop_zone if tower_drop_zone != null else tower_stack_fallback

	if drop_zone == null:
		return false

	return drop_zone.get_global_rect().has_point(global_pos)

func update_inventory_ui(blocks: Array, active_slots: int = MAX_INVENTORY_SLOTS) -> void:
	var clean_blocks: Array = []
	var local_player_color: Color = players_ctx.local_color()
	var selected_block_id: String = _selected_block_id()
	active_inventory_slots = clampi(active_slots, 1, MAX_INVENTORY_SLOTS)
	inventory_slot_blocks = [{}, {}, {}]

	for i in range(blocks.size()):
		clean_blocks.append(BlockDataScript.normalize_block(blocks[i], i))

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		var preview: Control = block_previews[i]
		preview.cell_color = local_player_color

		button.visible = not spectator_mode
		if spectator_mode or i >= active_inventory_slots:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			inventory_slot_blocks[i] = {}
		elif i < clean_blocks.size():
			var block: Dictionary = clean_blocks[i]
			button.disabled = false
			button.text = ""
			preview.set_block(block)
			inventory_slot_blocks[i] = block
		else:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			inventory_slot_blocks[i] = {}

	if selected_slot_index >= 0 and _selected_block_id() != selected_block_id:
		deselect_block()
	_apply_selection_visuals()
	_sync_ready_lock_presentation()

func _is_ready_locked_card(index: int) -> bool:
	if !ready_locked or index < 0 or index >= active_inventory_slots:
		return false
	if index >= inventory_slot_blocks.size() or index >= inventory_buttons.size():
		return false
	if inventory_buttons[index].disabled:
		return false
	if typeof(inventory_slot_blocks[index]) != TYPE_DICTIONARY:
		return false
	return !inventory_slot_blocks[index].is_empty()

func _is_filled_active_card(index: int) -> bool:
	if index < 0 or index >= active_inventory_slots:
		return false
	if index >= inventory_slot_blocks.size() or index >= inventory_buttons.size():
		return false
	if inventory_buttons[index].disabled:
		return false
	if typeof(inventory_slot_blocks[index]) != TYPE_DICTIONARY:
		return false
	return !inventory_slot_blocks[index].is_empty()

func _is_cooling_card(index: int) -> bool:
	return (
		!ready_locked and
		match_state.current_match_state == "playing" and
		_is_filled_active_card(index) and
		get_placement_cooldown_remaining_ms() > 0
	)

func _reject_cooling_placement(index: int) -> void:
	var now := Time.get_ticks_msec()
	if now - cooling_feedback_last_at_ms < COOLING_FEEDBACK_THROTTLE_MS:
		return
	cooling_feedback_last_at_ms = now
	cooling_feedback_deadline_ms = now + COOLING_FEEDBACK_VISIBLE_MS
	if index < cooldown_overlays.size() and cooldown_overlays[index] != null and cooldown_overlays[index].has_method("pulse_cooling_attempt"):
		cooldown_overlays[index].call("pulse_cooling_attempt")
	if cooling_feedback_label != null:
		cooling_feedback_label.text = "COOLING…"
		cooling_feedback_label.visible = true

func _reject_ready_placement(index: int) -> void:
	_clear_selection_state()
	if ready_rejection_feedback.is_valid():
		ready_rejection_feedback.call(index)

func _sync_ready_lock_presentation() -> void:
	if !ready_lock_presentation.is_valid():
		return
	var filled_ready_slots: Array = []
	for i in range(inventory_buttons.size()):
		filled_ready_slots.append(_is_ready_locked_card(i))
	ready_lock_presentation.call(filled_ready_slots)

func _selected_block_id() -> String:
	if selected_slot_index < 0 or selected_slot_index >= inventory_slot_blocks.size():
		return ""

	return str(inventory_slot_blocks[selected_slot_index].get("id", ""))

func update_draw_pile_ui(draw_pile_count: int, raw_next_block: Variant) -> void:
	last_draw_pile_count = draw_pile_count
	last_next_draw_block = raw_next_block

	if draw_pile_preview == null:
		return

	draw_pile_preview.cell_color = players_ctx.local_color()

	if draw_pile_count <= 0 or raw_next_block == null:
		draw_pile_name_label.text = "Next Draw"
		draw_pile_count_label.text = "0 Remaining Bricks"
		draw_pile_preview.clear_block()
		return

	var next_block: Dictionary = BlockDataScript.normalize_block(raw_next_block, 0)
	draw_pile_name_label.text = "Next Draw"
	draw_pile_count_label.text = str(draw_pile_count) + " Remaining Bricks"
	draw_pile_preview.set_block(next_block)
