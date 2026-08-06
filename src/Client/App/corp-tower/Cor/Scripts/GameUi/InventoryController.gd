extends Node

const MAX_INVENTORY_SLOTS := 3
const DRAG_PREVIEW_SIZE := Vector2(170, 170)
# Fallback for the lift that keeps the dragged brick clear of the finger, used
# only when TowerStack isn't available to supply its own brick-unit-relative
# value. The lift is applied to the snap resolution too, so the docked ghost
# lands where the lifted brick is pointing rather than where the thumb is.
const DRAG_GRIP_OFFSET_FALLBACK := Vector2(0.0, -48.0)
# TowerStack is an optional bound node, so placement has to keep working without
# it. Column -1 is the same "let the server clamp it" value the pre-snap drag
# code sent, so a missing tower view degrades to server-side resolution rather
# than refusing to place.
const UNRESOLVED_SNAP := {
	"valid": true,
	"snapped": false,
	"exact": false,
	"column": -1,
	"origin_y": 0,
	"target_point": Vector2i.ZERO,
	"matched_vertex": Vector2i.ZERO,
	"aim_point": Vector2i.ZERO
}
# Only the build site and its snap points -- the state a selected-but-not-yet-
# aimed brick is in, before the player has picked a spot for it.
const SITE_ONLY_SNAP := {
	"valid": true,
	"snapped": false,
	"show_ghost": false
}
# Two pointer events land per tap on any platform that emulates a mouse from
# touch, and either one may arrive first. Whichever wins, its partner is inside
# this window and must not arm and then immediately confirm the same tap.
const TAP_DEDUPE_MS := 60
const SELECTION_PULSE_SPEED := 4.5
const SELECTED_CARD_BORDER_WIDTH := 3
const SELECTED_CARD_TINT := 0.12
const UNSELECTED_CARD_ALPHA := 0.72
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
var block_height_labels: Array = []
var block_name_labels: Array = []
var block_label: Label
var draw_pile_name_label: Label
var draw_pile_count_label: Label
var draw_pile_preview: Control
var tower_drop_zone: Control
var tower_stack_fallback: Control
var tower_fill: Panel
var drag_preview: Control
var inventory_slot_blocks: Array = []
var active_inventory_slots: int = MAX_INVENTORY_SLOTS
var last_placement_sent_at_ms: int = 0
var is_block_dragging: bool = false
var drag_slot_index: int = -1
var drag_pointer_id: int = PointerEventsScript.POINTER_MOUSE
var drag_snap: Dictionary = {}
var last_draw_pile_count: int = 0
var last_next_draw_block: Variant = null
var parallel_placement: bool = false
var selected_slot_index: int = -1
var armed_snap: Dictionary = {}
var is_armed: bool = false
var last_tap_ms: int = 0
var selected_card_style: StyleBoxFlat = null

func bind_nodes(binder) -> void:
	block_label = binder.require_node("BlockLabel") as Label
	draw_pile_name_label = binder.require_node("DrawPileNameLabel") as Label
	draw_pile_count_label = binder.require_node("DrawPileCountLabel") as Label
	draw_pile_preview = binder.require_node("DrawPilePreview") as Control
	tower_drop_zone = binder.require_node("TowerDropZone") as Control
	tower_stack_fallback = binder.optional_node("TowerStack") as Control
	tower_fill = binder.optional_node("TowerFill") as Panel
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
	block_height_labels = [
		binder.require_node("BlockHeightLabel1") as Label,
		binder.require_node("BlockHeightLabel2") as Label,
		binder.require_node("BlockHeightLabel3") as Label
	]
	block_name_labels = [
		binder.require_node("BlockNameLabel1") as Label,
		binder.require_node("BlockNameLabel2") as Label,
		binder.require_node("BlockNameLabel3") as Label
	]
	cooldown_overlays = []
	for button in inventory_buttons:
		cooldown_overlays.append(button.get_node_or_null("CooldownOverlay") as Control)

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
	PointerEventsScript.note_event(event)

	if is_block_dragging:
		_handle_block_drag_input(event)
		return

	if parallel_placement and selected_slot_index >= 0:
		_handle_selection_hover(event)

func tick() -> void:
	update_placement_cooldown_overlays()
	_tick_selection_pulse()

func on_block_pressed(index: int, column: int = -1, origin_y: int = -1) -> void:
	if !can_place_block(index):
		return

	last_placement_sent_at_ms = Time.get_ticks_msec()

	if match_state.tutorial_mode and tutorial != null:
		tutorial.on_tutorial_place(index, column, origin_y)
		return

	network.place_block(index, column, origin_y)

func _on_inventory_card_gui_input(event: InputEvent, index: int) -> void:
	if parallel_placement:
		_handle_card_tap(event, index)
		return

	if is_block_dragging:
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
	if !match_state.tutorial_mode:
		if !network.is_conn_estab:
			return false

		if match_state.current_match_state != "playing":
			return false

	if is_block_dragging:
		return true

	return get_placement_cooldown_remaining_ms() <= 0

func get_placement_cooldown_remaining_ms() -> int:
	if last_placement_sent_at_ms <= 0:
		return 0

	var elapsed_ms: int = Time.get_ticks_msec() - last_placement_sent_at_ms
	return maxi(0, tuning.placement_cooldown_ms - elapsed_ms)

func update_placement_cooldown_overlays() -> void:
	var ratio: float = 0.0
	if tuning.placement_cooldown_ms > 0:
		ratio = float(get_placement_cooldown_remaining_ms()) / float(tuning.placement_cooldown_ms)
	for overlay in cooldown_overlays:
		if overlay != null and overlay.has_method("set_remaining_ratio"):
			overlay.call("set_remaining_ratio", ratio)

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
	drag_preview.z_index = 40

	if tower_stack_fallback != null and tower_stack_fallback.has_method("begin_snap_drag"):
		tower_stack_fallback.call("begin_snap_drag", block, local_color)

	update_block_drag(global_pos)

func update_block_drag(global_pos: Vector2) -> void:
	if drag_preview == null or !is_block_dragging:
		return

	var ghost_pos: Vector2 = global_pos + _drag_grip_offset()
	drag_preview.global_position = ghost_pos - drag_preview.size * 0.5
	update_tower_drop_zone_highlight(global_pos)
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

# Pairs the dragged brick's own corners against the tower's snap points and
# returns the full resolution (target column, settled landing row, matched
# point/vertex) -- not just a column, so the ghost can dock exactly where the
# brick will come to rest.
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

# A resolution that came off a snap point carries the exact row the brick was
# aimed at; anything else leaves the row to the server's gravity settle, which
# -1 asks for.
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
	reset_tower_drop_zone_highlight()

	if tower_stack_fallback != null and tower_stack_fallback.has_method("end_snap_drag"):
		tower_stack_fallback.call("end_snap_drag")

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

		if drag_preview.has_method("clear_matched_vertex"):
			drag_preview.call("clear_matched_vertex")

# --- Parallel placement (accessibility option 1): select, aim, confirm ---

# The two input styles are exclusive. Drag placement keeps working through
# _input, which runs ahead of the GUI pass; parallel placement instead makes the
# drop zone itself pickable so Godot's own hit-testing decides overlaps -- the
# Quest chip overhangs the drop zone's rect and has to keep winning its own taps.
func set_parallel_placement(enabled: bool) -> void:
	if enabled == parallel_placement:
		return

	parallel_placement = enabled
	cancel_block_drag()

	if tower_drop_zone == null:
		return

	tower_drop_zone.mouse_filter = (
		Control.MOUSE_FILTER_STOP if enabled else Control.MOUSE_FILTER_IGNORE
	)

	var handler := Callable(self, "_on_tower_drop_zone_gui_input")

	if enabled and !tower_drop_zone.gui_input.is_connected(handler):
		tower_drop_zone.gui_input.connect(handler)
	elif !enabled and tower_drop_zone.gui_input.is_connected(handler):
		tower_drop_zone.gui_input.disconnect(handler)

func _handle_card_tap(event: InputEvent, index: int) -> void:
	if !_is_primary_press(event) or !_accept_tap():
		return

	get_viewport().set_input_as_handled()

	if selected_slot_index == index:
		deselect_block()
		return

	select_block(index)

func select_block(index: int) -> void:
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
	if selected_slot_index < 0:
		return

	selected_slot_index = -1
	is_armed = false
	armed_snap = {}
	_apply_selection_visuals()

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

		if drag_preview.has_method("clear_matched_vertex"):
			drag_preview.call("clear_matched_vertex")

# On a device with a pointer the ghost rides the cursor, which is the whole
# preview before the first tap. On touch there is nothing to ride and the finger
# would cover it anyway, so it stays hidden until a tap arms it on the tower.
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
	drag_preview.z_index = 40
	_update_cursor_ghost(drag_preview.get_global_mouse_position())

func _handle_selection_hover(event: InputEvent) -> void:
	if is_armed or !(event is InputEventMouseMotion) or PointerEventsScript.is_emulated(event):
		return

	if drag_preview == null or !PointerEventsScript.has_mouse():
		return

	_update_cursor_ghost(event.global_position)

func _update_cursor_ghost(global_pos: Vector2) -> void:
	# No grip lift here, unlike a drag: the brick is anchored to the cursor, and
	# offsetting it would aim the snap somewhere the player is not pointing.
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
	if selected_slot_index < 0 or !_is_primary_press(event) or !_accept_tap():
		return

	tower_drop_zone.accept_event()
	_aim_or_place(_drop_zone_global_position(event))

# gui_input hands mouse events in viewport space but touch events in the
# control's own space, and the snap resolver only speaks global.
func _drop_zone_global_position(event: InputEvent) -> Vector2:
	if event is InputEventMouse:
		return event.global_position

	return tower_drop_zone.get_global_transform() * event.position

# First tap aims: the ghost docks at the resolved spot and nothing is sent.
# Tapping that same spot again is the confirmation; tapping anywhere else just
# re-aims, so a player correcting their aim can never place by accident.
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

# A teammate can fill the aimed spot between the aim tap and the confirm tap, so
# the armed ghost is re-checked against every broadcast instead of trusting the
# tower it was aimed at. Losing the spot drops back to selected, not deselected --
# the brick is still in hand and only needs re-aiming.
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

		if i == selected_slot_index and selected_card_style != null:
			button.add_theme_stylebox_override("normal", selected_card_style)
			button.add_theme_stylebox_override("hover", selected_card_style)
			button.add_theme_stylebox_override("pressed", selected_card_style)
			button.modulate = Color.WHITE
			continue

		button.remove_theme_stylebox_override("normal")
		button.remove_theme_stylebox_override("hover")
		button.remove_theme_stylebox_override("pressed")
		button.modulate = (
			Color(1.0, 1.0, 1.0, UNSELECTED_CARD_ALPHA)
			if selected_slot_index >= 0
			else Color.WHITE
		)

# Built from the theme variation's own box rather than the button's current one,
# so re-selecting a card never stacks a border on top of a previous selection.
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

func _tick_selection_pulse() -> void:
	if selected_card_style == null:
		return

	var local_color: Color = players_ctx.local_color()
	var phase: float = float(Time.get_ticks_msec()) * 0.001 * SELECTION_PULSE_SPEED
	var alpha: float = 0.6 + 0.4 * sin(phase)

	selected_card_style.border_color = Color(
		local_color.r, local_color.g, local_color.b, alpha
	)

func is_pointer_in_tower_drop_zone(global_pos: Vector2) -> bool:
	var drop_zone: Control = tower_drop_zone if tower_drop_zone != null else tower_stack_fallback

	if drop_zone == null:
		return false

	return drop_zone.get_global_rect().has_point(global_pos)

func update_tower_drop_zone_highlight(global_pos: Vector2) -> void:
	if tower_fill == null:
		return

	var in_drop_zone: bool = is_pointer_in_tower_drop_zone(global_pos)
	tower_fill.modulate = Color(1.18, 1.18, 1.18, 1.0) if in_drop_zone else Color.WHITE

func reset_tower_drop_zone_highlight() -> void:
	if tower_fill != null:
		tower_fill.modulate = Color.WHITE

func update_inventory_ui(blocks: Array, active_slots: int = MAX_INVENTORY_SLOTS) -> void:
	var clean_blocks: Array = []
	var local_player_color: Color = players_ctx.local_color()
	var selected_block_id: String = _selected_block_id()
	active_inventory_slots = clampi(active_slots, 1, MAX_INVENTORY_SLOTS)
	inventory_slot_blocks = [{}, {}, {}]

	for i in range(blocks.size()):
		clean_blocks.append(BlockDataScript.normalize_block(blocks[i], i))

	block_label.text = "Inventory " + str(clean_blocks.size()) + "/" + str(active_inventory_slots)

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		var preview: Control = block_previews[i]
		var slot_height_label: Label = block_height_labels[i]
		var name_label: Label = block_name_labels[i]
		preview.cell_color = local_player_color

		if i >= active_inventory_slots:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			slot_height_label.text = "Locked"
			name_label.text = "Level " + str(get_slot_unlock_level(i))
			inventory_slot_blocks[i] = {}
		elif i < clean_blocks.size():
			var block: Dictionary = clean_blocks[i]
			button.disabled = false
			button.text = ""
			preview.set_block(block)
			slot_height_label.text = "Height " + str(int(block.get("height", 0)))
			name_label.text = str(block.get("shapeId", "BLOCK"))
			inventory_slot_blocks[i] = block
		else:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			slot_height_label.text = "Empty"
			name_label.text = "Slot " + str(i + 1)
			inventory_slot_blocks[i] = {}

	# A refill swaps a different brick into the same slot, so a selection that
	# outlived its brick would aim the wrong shape.
	if selected_slot_index >= 0 and _selected_block_id() != selected_block_id:
		deselect_block()

func _selected_block_id() -> String:
	if selected_slot_index < 0 or selected_slot_index >= inventory_slot_blocks.size():
		return ""

	return str(inventory_slot_blocks[selected_slot_index].get("id", ""))

func get_slot_unlock_level(slot_index: int) -> int:
	if slot_index <= 0:
		return 1
	if slot_index == 1:
		return 2

	return 4

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
