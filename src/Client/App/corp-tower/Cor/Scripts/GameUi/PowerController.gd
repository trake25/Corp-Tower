extends Node

var players_ctx
var match_state
var network
var popovers
var roster
var score_popups
var shared_popover: Control
var position_shared_card: Callable = Callable()
var ghost_parent: Control
var power_buttons: Array = []
var power_trigger: TextureButton
var power_target_box: VBoxContainer
var power_target_buttons: Array = []
var selected_power_slot: int = -1
var power_dragging := false
var power_drag_ghost: Label
var power_feedback_tween: Tween
var last_power_inventory: Array = []
var seen_power_event_ids: Dictionary = {}

func bind_nodes(binder) -> void:
	power_buttons = [binder.optional_node("PowerButton1") as Button, binder.optional_node("PowerButton2") as Button, binder.optional_node("PowerButton3") as Button]
	power_trigger = binder.optional_node("PowerTrigger") as TextureButton
	power_target_box = binder.optional_node("PowerTargetBox") as VBoxContainer

func setup(players_ref, match_state_ref, network_ref, popovers_ref, roster_ref, score_popups_ref, shared_popover_ref: Control, position_shared_card_ref: Callable, ghost_parent_ref: Control) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	network = network_ref
	popovers = popovers_ref
	roster = roster_ref
	score_popups = score_popups_ref
	shared_popover = shared_popover_ref
	position_shared_card = position_shared_card_ref
	ghost_parent = ghost_parent_ref

	for i in range(power_buttons.size()):
		if power_buttons[i] != null:
			power_buttons[i].gui_input.connect(func(event):
				if event is InputEventMouseButton and event.pressed and !power_buttons[i].disabled:
					selected_power_slot = i
					power_dragging = true
					show_power_drag_ghost(power_buttons[i].text, event.global_position)
			)

func handle_input(event: InputEvent) -> void:
	if power_dragging and event is InputEventMouseButton and !event.pressed:
		for target in power_target_buttons:
			if target.get_global_rect().has_point(event.global_position):
				network.activate_power(selected_power_slot)
		power_dragging = false
		selected_power_slot = -1
		hide_power_drag_ghost()
	if power_dragging and event is InputEventMouseMotion:
		move_power_drag_ghost(event.global_position)
	if power_dragging and event is InputEventScreenDrag:
		move_power_drag_ghost(event.position)

func open_power_popover() -> void:
	if shared_popover == null:
		return

	if popovers.is_open(shared_popover, "power"):
		popovers.close_active()
		return

	shared_popover.call("set_title", "Power")
	shared_popover.call("clear_rows")

	if last_power_inventory.is_empty():
		shared_popover.call("add_row", "No power items")
	else:
		for i in range(last_power_inventory.size()):
			var index: int = i
			var entry: Variant = last_power_inventory[i]
			var power_id: String = str(entry.get("id", "")) if typeof(entry) == TYPE_DICTIONARY else str(entry)
			shared_popover.call(
				"add_action_row",
				get_power_row_label(power_id),
				func():
					network.activate_power(index)
					popovers.close_active()
			)

	popovers.present(shared_popover, "power")
	position_shared_card.call()

func get_power_row_label(power_id: String) -> String:
	if power_id == "refresh":
		return "Refresh team inventory"

	return power_id.replace("_", " ").capitalize()

func update_power_target_ui(players: Array) -> void:
	if power_target_box == null:
		return
	for child in power_target_box.get_children():
		child.queue_free()
	power_target_buttons = []
	for player in players:
		var player_id := str(player.get("id", ""))
		if player_id == "":
			continue
		var target := Button.new()
		target.text = player_id
		target.tooltip_text = "Drop a Power item here to target " + player_id
		target.add_theme_color_override("font_color", players_ctx.color_map.get(player_id, Color.WHITE))
		target.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
		target.add_theme_constant_override("outline_size", 3)
		target.custom_minimum_size = Vector2(72, 24)
		power_target_box.add_child(target)
		target.set_meta("player_id", player_id)
		power_target_buttons.append(target)
		target.gui_input.connect(func(event):
			if power_dragging and event is InputEventMouseButton and !event.pressed:
				network.activate_power(selected_power_slot)
				power_dragging = false
				selected_power_slot = -1
				hide_power_drag_ghost()
				get_viewport().set_input_as_handled()
			elif power_dragging and event is InputEventScreenTouch and !event.pressed:
				network.activate_power(selected_power_slot)
				power_dragging = false
				selected_power_slot = -1
				hide_power_drag_ghost()
				get_viewport().set_input_as_handled()
		)

func update_power_inventory_ui(items: Array) -> void:
	for i in range(power_buttons.size()):
		var button: Button = power_buttons[i]
		if button == null:
			continue
		if i < items.size() and typeof(items[i]) == TYPE_DICTIONARY:
			button.text = str(items[i].get("id", "Power")).replace("_", " ").capitalize()
			button.disabled = match_state.current_match_state != "playing"
		else:
			button.text = "Power"
			button.disabled = true

func show_power_drag_ghost(text: String, pointer_position: Vector2) -> void:
	if power_drag_ghost == null:
		power_drag_ghost = Label.new()
		power_drag_ghost.mouse_filter = Control.MOUSE_FILTER_IGNORE
		power_drag_ghost.z_index = 100
		power_drag_ghost.add_theme_font_size_override("font_size", 18)
		power_drag_ghost.add_theme_color_override("font_color", Color(1.0, 0.86, 0.3, 0.9))
		ghost_parent.add_child(power_drag_ghost)
	power_drag_ghost.text = text
	power_drag_ghost.visible = true
	move_power_drag_ghost(pointer_position)

func move_power_drag_ghost(pointer_position: Vector2) -> void:
	if power_drag_ghost != null:
		power_drag_ghost.global_position = pointer_position + Vector2(14, 14)

func hide_power_drag_ghost() -> void:
	if power_drag_ghost != null:
		power_drag_ghost.visible = false

func process_power_events(raw_events: Variant, players: Array) -> void:
	if typeof(raw_events) != TYPE_ARRAY:
		return
	for raw_event in raw_events:
		if typeof(raw_event) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = raw_event
		var event_id: String = str(event.get("id", ""))
		if event_id == "" or seen_power_event_ids.has(event_id):
			continue
		seen_power_event_ids[event_id] = true

		var meta: Variant = event.get("meta", {})
		if typeof(meta) != TYPE_DICTIONARY:
			meta = {}
		var caster_color: Color = players_ctx.color_map.get(str(event.get("playerId", "")), Color.WHITE)

		if bool(meta.get("tintAllScores", false)):
			var tint_until: int = Time.get_ticks_msec() + int(meta.get("tintDurationMs", 4000))
			for player in players:
				roster.score_tints[str(player.get("id", ""))] = { "color": caster_color, "until": tint_until }

		score_popups.show_score_event_popup({
			"type": "power_activated",
			"label": get_power_toast_text(str(event.get("powerId", "")), str(event.get("label", "Power")))
		}, players, 3.0)

func get_power_toast_text(power_id: String, catalog_label: String) -> String:
	if power_id == "refresh":
		return "All players inventory refreshed"

	return catalog_label + " activated for everyone"

func show_power_tint(control: Control, tint: Color) -> void:
	if control == null:
		return
	if power_feedback_tween != null:
		power_feedback_tween.kill()
	control.modulate = tint
	power_feedback_tween = create_tween()
	power_feedback_tween.tween_interval(4.0)
	power_feedback_tween.tween_property(control, "modulate", Color.WHITE, 0.2)
