extends Node

const MAX_INVENTORY_SLOTS := 3
const DRAG_PREVIEW_SIZE := Vector2(96, 96)
const BlockPreviewScript = preload("res://Cor/Scripts/BlockPreview.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const PointerEventsScript = preload("res://Cor/Scripts/GameUi/PointerEvents.gd")

var players_ctx
var match_state
var tuning
var network
var popovers
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
var last_draw_pile_count: int = 0
var last_next_draw_block: Variant = null

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

func setup(players_ref, match_state_ref, tuning_ref, network_ref, popovers_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref
	network = network_ref
	popovers = popovers_ref

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

func handle_input(event: InputEvent) -> void:
	if is_block_dragging:
		_handle_block_drag_input(event)

func tick() -> void:
	update_placement_cooldown_overlays()

func on_block_pressed(index: int, lane := "center") -> void:
	if !can_place_block(index):
		return

	last_placement_sent_at_ms = Time.get_ticks_msec()
	network.place_block(index, lane)

func _on_inventory_card_gui_input(event: InputEvent, index: int) -> void:
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
	is_block_dragging = true
	drag_slot_index = index
	drag_pointer_id = pointer_id
	drag_preview.cell_color = players_ctx.local_color()

	if drag_preview.has_method("set_preview_mode"):
		drag_preview.call(
			"set_preview_mode",
			BlockPreviewScript.PreviewMode.FLOATING_DRAG
		)

	drag_preview.set_block(block)
	drag_preview.visible = true
	drag_preview.z_index = 40
	update_block_drag(global_pos)

func update_block_drag(global_pos: Vector2) -> void:
	if drag_preview == null or !is_block_dragging:
		return

	drag_preview.global_position = global_pos - drag_preview.size * 0.5
	update_tower_drop_zone_highlight(global_pos)
	set_tower_lane_guides(true, lane_for_global_pos(global_pos))

func set_tower_lane_guides(active: bool, lane: String = "") -> void:
	if tower_stack_fallback != null and tower_stack_fallback.has_method("set_lane_guides"):
		tower_stack_fallback.call("set_lane_guides", active, lane)

func finish_block_drag(global_pos: Vector2) -> void:
	if !is_block_dragging:
		return

	var slot_index: int = drag_slot_index
	var should_place: bool = (
		slot_index >= 0 and
		is_pointer_in_tower_drop_zone(global_pos) and
		can_place_block(slot_index)
	)
	var lane: String = lane_for_global_pos(global_pos)

	cancel_block_drag()

	if should_place:
		on_block_pressed(slot_index, lane)

func cancel_block_drag() -> void:
	is_block_dragging = false
	drag_slot_index = -1
	drag_pointer_id = PointerEventsScript.POINTER_MOUSE
	reset_tower_drop_zone_highlight()
	set_tower_lane_guides(false, "")

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

func lane_for_global_pos(global_pos: Vector2) -> String:
	var drop_zone: Control = tower_drop_zone if tower_drop_zone != null else tower_stack_fallback

	if drop_zone == null:
		return "center"

	var rect: Rect2 = drop_zone.get_global_rect()

	if rect.size.x <= 0.0:
		return "center"

	var ratio: float = clampf((global_pos.x - rect.position.x) / rect.size.x, 0.0, 0.999)

	match int(ratio * 3.0):
		0:
			return "left"
		2:
			return "right"
		_:
			return "center"

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
