extends Control

const MAX_INVENTORY_SLOTS := 3
const DRAW_PILE_COLOR := Color(0.95, 0.72, 0.25, 1.0)
const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const UiNodeBinderScript = preload("res://Cor/Scripts/GameUi/UiNodeBinder.gd")
const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const DebugPanelControllerScript = preload("res://Cor/Scripts/GameUi/DebugPanelController.gd")
const PointerTriggerRouterScript = preload("res://Cor/Scripts/GameUi/PointerTriggerRouter.gd")
const PlayerContextScript = preload("res://Cor/Scripts/GameUi/PlayerContext.gd")
const MatchStateScript = preload("res://Cor/Scripts/GameUi/MatchState.gd")
const ScorePopupControllerScript = preload("res://Cor/Scripts/GameUi/ScorePopupController.gd")
const LevelSummaryControllerScript = preload("res://Cor/Scripts/GameUi/LevelSummaryController.gd")
const RosterViewControllerScript = preload("res://Cor/Scripts/GameUi/RosterViewController.gd")
const PopoverCoordinatorScript = preload("res://Cor/Scripts/GameUi/PopoverCoordinator.gd")
const QuestControllerScript = preload("res://Cor/Scripts/GameUi/QuestController.gd")
const QuickChatControllerScript = preload("res://Cor/Scripts/GameUi/QuickChatController.gd")
const PowerControllerScript = preload("res://Cor/Scripts/GameUi/PowerController.gd")
const BlockPreviewScript = preload("res://Cor/Scripts/BlockPreview.gd")
const LevelBadgeNormalTexture = preload("res://Cor/Art/Static/level.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/Static/safe.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/Static/timer-round-time.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/Static/timer-freeze-time.png")
const DRAG_PREVIEW_SIZE := Vector2(96, 96)
const DRAG_POINTER_MOUSE := -1

@onready var ui_root: Control = self

var inventory_buttons: Array = []
var cooldown_overlays: Array = []
var timer_deadline_ms: int = 0
var timer_shown_seconds: int = -1
var team_inventory_button: TextureButton
var team_inventory_popover: Control
var last_draw_pile_count: int = 0
var last_next_draw_block: Variant = null
var block_previews: Array = []
var block_height_labels: Array = []
var block_name_labels: Array = []
var missing_required_nodes: Array[String] = []
var tuning
var debug_panel
var trigger_router
var players_ctx
var match_state
var score_popups
var summary
var roster
var popovers
var quest
var chat
var power
var active_inventory_slots: int = MAX_INVENTORY_SLOTS
var last_placement_sent_at_ms: int = 0
var is_block_dragging: bool = false
var drag_slot_index: int = -1
var drag_pointer_id: int = DRAG_POINTER_MOUSE
var inventory_slot_blocks: Array = []

var status_label: Label
var player_label: Label
var room_label: Label
var level_label: Label
var timer_label: Label
var level_badge_texture: TextureRect
var round_time_texture: TextureRect
var top_indicator_fill: TextureRect
var score_label: Label
var tower_stability_label: Label
var height_label: Label
var tower_value_label: Label
var tower_status_label: Label
var tower_fill: Panel
var tower_stack: Control
var tower_drop_zone: Control
var drag_preview: Control
var block_label: Label
var draw_pile_name_label: Label
var draw_pile_count_label: Label
var draw_pile_preview: Control
var connect_button: Button

func _ready() -> void:
	tuning = UiTuningScript.new()
	players_ctx = PlayerContextScript.new()
	players_ctx.get_local_id = func(): return str(NetworkManager.player_id)
	match_state = MatchStateScript.new()
	debug_panel = DebugPanelControllerScript.new()
	add_child(debug_panel)
	score_popups = ScorePopupControllerScript.new()
	add_child(score_popups)
	summary = LevelSummaryControllerScript.new()
	add_child(summary)
	roster = RosterViewControllerScript.new()
	add_child(roster)
	popovers = PopoverCoordinatorScript.new()
	quest = QuestControllerScript.new()
	add_child(quest)
	chat = QuickChatControllerScript.new()
	add_child(chat)
	power = PowerControllerScript.new()
	add_child(power)

	if !prepare_ui():
		return

	setup_inventory_controls()
	debug_panel.setup(tuning, NetworkManager)
	score_popups.setup(players_ctx, match_state, tuning)
	summary.setup(players_ctx, match_state, tuning)
	roster.setup(players_ctx, match_state)
	quest.setup(players_ctx, match_state, popovers)
	chat.setup(match_state, NetworkManager, popovers, roster, score_popups, team_inventory_popover, position_shared_popover_card)
	power.setup(players_ctx, match_state, NetworkManager, popovers, roster, score_popups, team_inventory_popover, position_shared_popover_card, ui_root)
	setup_popover_controls()
	setup_trigger_router()
	reset_ui()
	connect_network_signals()

func setup_trigger_router() -> void:
	trigger_router = PointerTriggerRouterScript.new()
	trigger_router.add_guard(func(): return debug_panel.is_open())
	trigger_router.add_guard(func(): return summary.is_overlay_visible())
	trigger_router.add_trigger(
		func(): return quest.quest_chip.get_global_rect() if quest.quest_chip != null else null,
		quest.on_quest_chip_pressed
	)
	trigger_router.add_trigger(
		func(): return chat.quick_chat_trigger.get_global_rect() if chat.quick_chat_trigger != null else null,
		chat.open_quick_chat_popover
	)
	trigger_router.add_trigger(
		func(): return team_inventory_button.get_global_rect() if team_inventory_button != null else null,
		open_team_inventory_popover
	)
	trigger_router.add_trigger(
		func(): return power.power_trigger.get_global_rect() if power.power_trigger != null else null,
		power.open_power_popover
	)

func prepare_ui() -> bool:
	bind_ui_nodes()

	if !missing_required_nodes.is_empty():
		push_error("UI is missing required nodes: " + ", ".join(missing_required_nodes))
		return false

	return true

func bind_ui_nodes() -> void:
	var binder = UiNodeBinderScript.new(ui_root)
	status_label = binder.require_node("StatusLabel") as Label
	player_label = binder.require_node("PlayerLabel") as Label
	room_label = binder.require_node("RoomLabel") as Label
	level_label = binder.require_node("LevelLabel") as Label
	timer_label = binder.require_node("TimerLabel") as Label
	level_badge_texture = binder.optional_node("LevelBadgeTexture") as TextureRect
	round_time_texture = binder.optional_node("RoundTimeTexture") as TextureRect
	top_indicator_fill = binder.optional_node("TopIndicatorFill") as TextureRect
	score_label = binder.require_node("ScoreLabel") as Label
	team_inventory_button = binder.optional_node("TeamInventoryButton") as TextureButton
	team_inventory_popover = binder.optional_node("TeamInventoryPopover") as Control
	tower_stability_label = binder.optional_node("TowerStabilityLabel") as Label
	height_label = binder.require_node("HeightLabel") as Label
	tower_value_label = binder.require_node("TowerValueLabel") as Label
	tower_status_label = binder.require_node("TowerStatusLabel") as Label
	tower_fill = binder.require_node("TowerFill") as Panel
	tower_stack = binder.require_node("TowerStack") as Control
	tower_drop_zone = binder.require_node("TowerDropZone") as Control
	drag_preview = binder.require_node("DragPreview") as Control
	block_label = binder.require_node("BlockLabel") as Label
	draw_pile_name_label = binder.require_node("DrawPileNameLabel") as Label
	draw_pile_count_label = binder.require_node("DrawPileCountLabel") as Label
	draw_pile_preview = binder.require_node("DrawPilePreview") as Control
	connect_button = binder.require_node("ConnectButton") as Button

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

	debug_panel.bind_nodes(binder)
	score_popups.bind_nodes(binder)
	summary.bind_nodes(binder)
	roster.bind_nodes(binder)
	quest.bind_nodes(binder)
	chat.bind_nodes(binder)
	power.bind_nodes(binder)
	missing_required_nodes = binder.missing

func setup_inventory_controls() -> void:
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

func setup_popover_controls() -> void:
	connect_button.pressed.connect(on_connect_pressed)

func open_team_inventory_popover() -> void:
	if team_inventory_popover == null:
		return

	if popovers.is_open(team_inventory_popover, "team_inventory"):
		popovers.close_active()
		return

	team_inventory_popover.call("set_title", "Team Inventory")
	team_inventory_popover.call("clear_rows")

	if last_draw_pile_count > 0 and last_next_draw_block != null:
		var next_block: Dictionary = normalize_block(last_next_draw_block, 0)
		var icon := Control.new()
		icon.set_script(BlockPreviewScript)
		icon.custom_minimum_size = Vector2(32.0, 32.0)
		icon.set("cell_color", DRAW_PILE_COLOR)
		icon.call("set_block", next_block)
		team_inventory_popover.call("add_icon_row", icon, "Next brick")

	var remaining_label: Label = team_inventory_popover.call(
		"add_row",
		str(last_draw_pile_count) + " Remaining bricks"
	)
	if remaining_label != null:
		remaining_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER

	popovers.present(team_inventory_popover, "team_inventory")
	position_shared_popover_card()

func position_shared_popover_card() -> void:
	if team_inventory_popover == null:
		return
	var row_anchor: Control = power.power_trigger
	if row_anchor == null:
		row_anchor = chat.quick_chat_trigger
	if row_anchor == null:
		row_anchor = team_inventory_button
	if row_anchor == null:
		return
	var anchor_rect: Rect2 = row_anchor.get_global_rect()
	var card_size: Vector2 = team_inventory_popover.call("get_card_size")
	team_inventory_popover.call("set_card_global_position", Vector2(
		anchor_rect.position.x + anchor_rect.size.x + 2.0 - card_size.x,
		anchor_rect.position.y - 13.0 - card_size.y
	))

func reset_ui() -> void:
	connect_button.text = "Connect"
	status_label.text = "Disconnected"
	player_label.text = "Player -"
	room_label.text = "Room -"
	level_label.text = "-"
	timer_label.text = "-"
	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeNormalTexture
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeNormalTexture
	score_label.text = "Waiting for players"
	match_state.current_match_state = ""
	last_placement_sent_at_ms = 0
	cancel_block_drag()
	roster.update_impact_status_ui({})
	height_label.text = "Height 0/0"
	tower_value_label.text = "0 / 0"
	tower_status_label.text = "Connect to start"
	block_label.text = "Inventory"
	set_tower_progress(0, 0)
	set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	cancel_block_drag()
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	match_state.current_level = 0

func connect_network_signals() -> void:
	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.room_closed.connect(update_room_closed)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)
	NetworkManager.debug_config_updated.connect(update_debug_config)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and debug_panel.is_open():
		debug_panel.set_open(false)

func _input(event: InputEvent) -> void:
	if is_block_dragging:
		_handle_block_drag_input(event)
	power.handle_input(event)

	if trigger_router.process(event, Engine.get_process_frames()):
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	update_placement_cooldown_overlays()
	tick_round_timer()

func tick_round_timer() -> void:
	if timer_label == null or timer_deadline_ms <= 0:
		return

	var remaining: int = int(ceil(
		float(timer_deadline_ms - Time.get_ticks_msec()) / 1000.0
	))
	remaining = maxi(0, remaining)

	if remaining == timer_shown_seconds:
		return

	timer_shown_seconds = remaining
	timer_label.text = format_clock(remaining)

func format_clock(total_seconds: int) -> String:
	var safe_seconds: int = maxi(0, total_seconds)

	return "%02d:%02d" % [safe_seconds / 60, safe_seconds % 60]

func on_connect_pressed() -> void:
	NetworkManager.toggle_connection()

func on_block_pressed(index: int) -> void:
	if !can_place_block(index):
		return

	last_placement_sent_at_ms = Time.get_ticks_msec()
	NetworkManager.place_block(index)

func _on_inventory_card_gui_input(event: InputEvent, index: int) -> void:
	if is_block_dragging:
		return

	if event is InputEventMouseButton:
		var mouse_event: InputEventMouseButton = event

		if mouse_event.button_index != MOUSE_BUTTON_LEFT:
			return

		if mouse_event.pressed:
			if can_start_block_drag(index):
				begin_block_drag(index, mouse_event.global_position, DRAG_POINTER_MOUSE)
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
	if event is InputEventMouseMotion and drag_pointer_id == DRAG_POINTER_MOUSE:
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
			drag_pointer_id == DRAG_POINTER_MOUSE
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
	if !NetworkManager.is_conn_estab:
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

func finish_block_drag(global_pos: Vector2) -> void:
	if !is_block_dragging:
		return

	var slot_index: int = drag_slot_index
	var should_place: bool = (
		slot_index >= 0 and
		is_pointer_in_tower_drop_zone(global_pos) and
		can_place_block(slot_index)
	)

	cancel_block_drag()

	if should_place:
		on_block_pressed(slot_index)

func cancel_block_drag() -> void:
	is_block_dragging = false
	drag_slot_index = -1
	drag_pointer_id = DRAG_POINTER_MOUSE
	reset_tower_drop_zone_highlight()

	if drag_preview != null:
		drag_preview.visible = false
		drag_preview.clear_block()

func is_pointer_in_tower_drop_zone(global_pos: Vector2) -> bool:
	var drop_zone: Control = tower_drop_zone if tower_drop_zone != null else tower_stack

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

func toggle_debug_overlay() -> void:
	debug_panel.toggle()

func update_status(text: String) -> void:
	status_label.text = text

func update_connect_button(status: String) -> void:
	if status == "[Connect]":
		connect_button.text = "Connect"
	elif status == "[Disconnect]":
		connect_button.text = "Disconnect"
	else:
		connect_button.text = status.replace("[", "").replace("]", "").strip_edges()

func update_room(data) -> void:
	connect_button.disabled = true
	players_ctx.roster = data.get("roster", [])
	player_label.text = PlayerContextScript.LOCAL_PLAYER_MARKER + " " + str(data.playerId)
	room_label.text = "Room " + str(int(data.roomId))
	update_top_bar_display(int(data.get("level", 0)), int(data.get("level", 0)), "starting", 0)
	match_state.current_level = int(data.get("level", 0))
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	tower_status_label.text = "Match starting"
	set_tower_progress(0, int(data.get("targetHeight", 0)))
	set_top_indicator_progress(0, int(data.get("targetHeight", 0)))
	tower_stack.clear_tower()
	update_inventory_ui(
		data.get("blocks", []),
		int(data.get("activeInventorySlots", MAX_INVENTORY_SLOTS))
	)
	update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)
	roster.update_impact_status_ui(data.get("impactScoreStatus", {}))
	update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))

func update_room_closed(data) -> void:
	match_state.current_match_state = ""
	players_ctx.roster = []
	last_placement_sent_at_ms = 0
	cancel_block_drag()
	room_label.text = "Room closed"
	level_label.text = "-"
	timer_label.text = "-"
	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeNormalTexture
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeNormalTexture
	height_label.text = "Height -"
	score_label.text = "Room closed: " + str(data.get("reason", "unknown"))
	roster.update_impact_status_ui({})
	tower_status_label.text = "Room closed"
	block_label.text = "Inventory"
	set_tower_progress(0, 0)
	set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	debug_panel.set_open(false)
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	match_state.current_level = 0

func update_game_state(data) -> void:
	var state: String = str(data.get("state", "playing"))
	match_state.current_match_state = state

	if state != "playing" and is_block_dragging:
		cancel_block_drag()

	var seconds_remaining: int = int(data.get("secondsRemaining", 0))
	var current_height: int = int(data.get("currentHeight", 0))
	var target_height: int = int(data.get("targetHeight", 0))
	var incoming_level: int = int(data.get("level", 0))
	var impact_level: int = int(data.get("impactLevel", 0))
	match_state.impact_interval = maxi(1, int(data.get("impactInterval", match_state.impact_interval)))
	var players: Array = data.get("players", [])
	var fallback_popup_duration_ms: int = int(data.get("scorePopupDurationMs", UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS))
	tuning.placement_score_popup_duration_ms = int(data.get(
		"placementScorePopupDurationMs",
		fallback_popup_duration_ms
	))
	tuning.finish_score_popup_duration_ms = int(data.get(
		"finishScorePopupDurationMs",
		fallback_popup_duration_ms
	))
	tuning.level_summary_delay_ms = int(data.get("levelSummaryDelayMs", tuning.level_summary_delay_ms))

	if incoming_level != match_state.current_level:
		match_state.current_level = incoming_level
		score_popups.seen_score_event_ids.clear()
		summary.last_level_summary_key = ""
		score_popups.clear_score_popups()
		chat.seen_quick_chat_event_ids.clear()
		power.seen_power_event_ids.clear()
		summary.cancel_pending_level_summary()
		if state != "finished" and state != "failed":
			summary.hide_level_summary()

	players_ctx.update_from_players(players)
	power.update_power_target_ui(players)
	quest.update_quest_chip(data.get("sideQuest", {}))
	if tower_stack.has_method("set_player_color_map"):
		tower_stack.call("set_player_color_map", players_ctx.color_map)

	update_top_bar_display(incoming_level, impact_level, state, seconds_remaining)
	set_top_indicator_progress(current_height, target_height)
	height_label.text = "Height " + str(current_height) + "/" + str(target_height)
	update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))
	tower_value_label.text = str(current_height) + " / " + str(target_height)
	tower_status_label.text = get_tower_status(state, current_height, target_height)
	if str(data.get("towerStabilityFeedbackMode", "warnings_only")) == "meter_only":
		tower_status_label.text += " | Stability " + str(int(data.get("towerStability", 100))) + "%"
	set_tower_progress(current_height, target_height)
	tower_stack.set_tower(
		data.get("towerBlocks", []), current_height, target_height,
		int(data.get("towerStability", 100)),
		data.get("towerStabilityDiagnostics", {})
	)
	update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)

	var _scores_text :String = ""
	var my_blocks: Array = []
	var my_power: Array = []
	
	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", "P?"))
		var prefix: String = PlayerContextScript.LOCAL_PLAYER_MARKER if players_ctx.is_local(player_id) else player_id
		_scores_text += prefix + ": " + str(int(player.get("score", 0))) + " total / " + str(int(player.get("levelScore", 0))) + " level"

		if players_ctx.is_local(player_id):
			my_blocks = player.get("blocks", [])
			my_power = player.get("powerInventory", [])

		if i < players.size() - 1:
			_scores_text += "\n"

	roster.update_score_lines(players)
	roster.update_impact_status_ui(data.get("impactScoreStatus", {}))

	update_inventory_ui(
		my_blocks,
		int(data.get("activeInventorySlots", MAX_INVENTORY_SLOTS))
	)
	power.last_power_inventory = my_power
	power.update_power_inventory_ui(my_power)
	chat.quick_chat_templates = data.get("quickChatTemplates", chat.quick_chat_templates)
	chat.quick_chat_cooldown_ms = int(data.get("quickChatCooldownMs", chat.quick_chat_cooldown_ms))
	chat.update_quick_chat_buttons()
	chat.process_quick_chat_events(data.get("quickChatEvents", []))
	power.process_power_events(data.get("powerEvents", []), players)

	var score_popup_wait_seconds: float = score_popups.process_score_events(data.get("scoreEvents", []), players)

	if state == "finished" or state == "failed":
		summary.queue_level_summary_after_score_popups(
			data.get("lastLevelSummary", {}),
			state,
			score_popup_wait_seconds
		)
	else:
		summary.cancel_pending_level_summary()
		summary.hide_level_summary()

func update_inventory_ui(blocks: Array, active_slots: int = MAX_INVENTORY_SLOTS) -> void:
	var clean_blocks: Array = []
	var local_player_color: Color = players_ctx.local_color()
	active_inventory_slots = clampi(active_slots, 1, MAX_INVENTORY_SLOTS)
	inventory_slot_blocks = [{}, {}, {}]

	for i in range(blocks.size()):
		clean_blocks.append(normalize_block(blocks[i], i))

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

	draw_pile_preview.cell_color = DRAW_PILE_COLOR

	if draw_pile_count <= 0 or raw_next_block == null:
		draw_pile_name_label.text = "Next Draw"
		draw_pile_count_label.text = "0 left"
		draw_pile_preview.clear_block()
		return

	var next_block: Dictionary = normalize_block(raw_next_block, 0)
	draw_pile_name_label.text = "Next " + str(next_block.get("shapeId", "BLOCK"))
	draw_pile_count_label.text = str(draw_pile_count) + " left"
	draw_pile_preview.set_block(next_block)

func update_tower_stability_ui(stability: int, diagnostics: Variant) -> void:
	if tower_stability_label == null:
		return
	var safe_stability: int = clampi(stability, 0, 100)
	var state := "Stable" if safe_stability > 60 else ("Warning" if safe_stability > 30 else "Critical")
	var lean_suffix := ""
	if typeof(diagnostics) == TYPE_DICTIONARY:
		var lean_direction := str(diagnostics.get("leanDirection", "center"))
		if lean_direction != "center":
			lean_suffix = " - leaning " + lean_direction
	tower_stability_label.text = "Tower Stability: " + str(safe_stability) + "% (" + state + lean_suffix + ")"
	tower_stability_label.modulate = Color(0.7, 1.0, 0.75, 1.0) if safe_stability > 60 else (Color(1.0, 0.8, 0.3, 1.0) if safe_stability > 30 else Color(1.0, 0.4, 0.32, 1.0))

func normalize_block(raw_block, index: int) -> Dictionary:
	if typeof(raw_block) == TYPE_DICTIONARY:
		var dictionary_cells: Array = raw_block.get("cells", [])
		var block_height: int = int(raw_block.get("height", calculate_block_height(dictionary_cells)))
		return {
			"id": str(raw_block.get("id", "slot-" + str(index))),
			"shapeId": str(raw_block.get("shapeId", "BLOCK")),
			"cells": dictionary_cells,
			"height": block_height
		}

	var legacy_height: int = max(0, int(raw_block))
	var legacy_cells: Array = []

	for y in range(legacy_height):
		legacy_cells.append([0, y])

	return {
		"id": "legacy-" + str(index),
		"shapeId": "LEGACY",
		"cells": legacy_cells,
		"height": legacy_height
	}

func calculate_block_height(cells: Array) -> int:
	if cells.is_empty():
		return 0

	var min_y: int = 999999
	var max_y: int = -999999

	for cell in cells:
		var y: int = 0

		if typeof(cell) == TYPE_DICTIONARY:
			y = int(cell.get("y", 0))
		else:
			y = int(cell[1])

		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	return max_y - min_y + 1

func set_tower_progress(current_height: int, target_height: int) -> void:
	var ratio: float = 0.0

	if target_height > 0:
		ratio = clamp(float(current_height) / float(target_height), 0.0, 1.0)

	tower_fill.anchor_top = 1.0 - ratio
	tower_fill.anchor_bottom = 1.0
	tower_fill.offset_top = 0.0
	tower_fill.offset_bottom = 0.0
	tower_fill.offset_left = 0.0
	tower_fill.offset_right = 0.0

func set_top_indicator_progress(current_height: int, target_height: int) -> void:
	if top_indicator_fill == null:
		return

	var ratio: float = 0.0

	if target_height > 0:
		ratio = clamp(float(current_height) / float(target_height), 0.0, 1.0)

	top_indicator_fill.anchor_right = ratio

func update_top_bar_display(level: int, impact_level: int, state: String, seconds_remaining: int) -> void:
	var is_impact_level: bool = level > 1 and (level - 1) % match_state.impact_interval == 0
	var is_frozen: bool = state != "playing"

	level_label.text = str(level) if level > 0 else "-"

	timer_deadline_ms = Time.get_ticks_msec() + seconds_remaining * 1000
	timer_shown_seconds = seconds_remaining
	timer_label.text = format_clock(seconds_remaining)

	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeSafeTexture if is_impact_level else LevelBadgeNormalTexture

	if round_time_texture != null:
		round_time_texture.texture = RoundTimeFreezeTexture if is_frozen else RoundTimeNormalTexture

func get_tower_status(state: String, current_height: int, target_height: int) -> String:
	if state == "starting":
		return "Get ready"

	if state == "failed":
		return "Level failed"

	if state == "finished":
		return "Target reached"

	if state == "game_completed":
		return "Tower complete"

	if target_height <= 0:
		return "Waiting"

	var remaining: int = max(0, target_height - current_height)
	return str(remaining) + " height to target"

func update_debug_config(config) -> void:
	debug_panel.apply_config(config)

