extends Control

const MAX_INVENTORY_SLOTS := 3
const DRAW_PILE_COLOR := Color(0.95, 0.72, 0.25, 1.0)
const CHAT_BUBBLE_MAX_WIDTH := 240.0
const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const UiNodeBinderScript = preload("res://Cor/Scripts/GameUi/UiNodeBinder.gd")
const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const DebugPanelControllerScript = preload("res://Cor/Scripts/GameUi/DebugPanelController.gd")
const PointerTriggerRouterScript = preload("res://Cor/Scripts/GameUi/PointerTriggerRouter.gd")
const PlayerContextScript = preload("res://Cor/Scripts/GameUi/PlayerContext.gd")
const MatchStateScript = preload("res://Cor/Scripts/GameUi/MatchState.gd")
const ScorePopupControllerScript = preload("res://Cor/Scripts/GameUi/ScorePopupController.gd")
const BlockPreviewScript = preload("res://Cor/Scripts/BlockPreview.gd")
const LevelBadgeNormalTexture = preload("res://Cor/Art/Static/level.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/Static/safe.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/Static/timer-round-time.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/Static/timer-freeze-time.png")
const PlayerRailEntryScene = preload("res://Cor/Scenes/PlayerRailEntry.tscn")
const ImpactBarScene = preload("res://Cor/Scenes/ImpactBar.tscn")
const QuestIdleTexture = preload("res://Cor/Art/Static/ic-quest-state1.png")
const QuestUnseenTexture = preload("res://Cor/Art/Static/ic-quest-state2.png")
const QuestClearedTexture = preload("res://Cor/Art/Static/ic-quest-state3.png")
const MAX_RAIL_PLAYERS := 3
const DRAG_PREVIEW_SIZE := Vector2(96, 96)
const DRAG_POINTER_MOUSE := -1

@onready var ui_root: Control = self

var inventory_buttons: Array = []
var cooldown_overlays: Array = []
var quick_chat_buttons: Array = []
var power_buttons: Array = []
var selected_power_slot: int = -1
var power_target_buttons: Array = []
var power_dragging := false
var power_drag_ghost: Label
var power_feedback_tween: Tween
var player_rail_entries: Dictionary = {}
var impact_bars: Dictionary = {}
var player_level_scores: Dictionary = {}
var player_rail_box: VBoxContainer
var impact_track: VBoxContainer
var impact_pill: Control
var quest_chip: TextureButton
var quest_badge: TextureRect
var quest_seen_level: int = -1
var last_side_quest: Dictionary = {}
var quest_popover: Control
var quick_chat_trigger: TextureButton
var power_trigger: TextureButton
var last_power_inventory: Array = []
var timer_deadline_ms: int = 0
var timer_shown_seconds: int = -1
var team_inventory_button: TextureButton
var team_inventory_popover: Control
var active_popover: Control
var shared_popover_mode: String = ""
var last_draw_pile_count: int = 0
var last_next_draw_block: Variant = null
var score_tints: Dictionary = {}
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
var seen_quick_chat_event_ids: Dictionary = {}
var seen_power_event_ids: Dictionary = {}
var quick_chat_templates: Array = []
var quick_chat_cooldown_ms: int = 6000
var last_quick_chat_sent_at_ms: int = 0
var last_level_summary_key: String = ""
var pending_level_summary: Dictionary = {}
var pending_level_summary_state: String = ""
var pending_level_summary_key: String = ""
var summary_show_timer: Timer
var summary_hide_timer: Timer
var active_inventory_slots: int = MAX_INVENTORY_SLOTS
var last_placement_sent_at_ms: int = 0
var is_block_dragging: bool = false
var drag_slot_index: int = -1
var drag_pointer_id: int = DRAG_POINTER_MOUSE
var inventory_slot_blocks: Array = []

var status_label: Label
var power_target_box: VBoxContainer
var player_label: Label
var room_label: Label
var level_label: Label
var timer_label: Label
var level_badge_texture: TextureRect
var round_time_texture: TextureRect
var top_indicator_fill: TextureRect
var score_label: Label
var impact_status_label: Label
var impact_separator: HSeparator
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
var level_summary_overlay: Control
var level_summary_title_label: Label
var level_summary_result_label: Label
var level_summary_team_label: Label
var level_summary_mvp_label: Label
var level_summary_players_box: VBoxContainer

func _ready() -> void:
	tuning = UiTuningScript.new()
	players_ctx = PlayerContextScript.new()
	players_ctx.get_local_id = func(): return str(NetworkManager.player_id)
	match_state = MatchStateScript.new()
	debug_panel = DebugPanelControllerScript.new()
	add_child(debug_panel)
	score_popups = ScorePopupControllerScript.new()
	add_child(score_popups)

	summary_show_timer = Timer.new()
	summary_show_timer.one_shot = true
	summary_show_timer.timeout.connect(show_pending_level_summary)
	add_child(summary_show_timer)

	summary_hide_timer = Timer.new()
	summary_hide_timer.one_shot = true
	summary_hide_timer.timeout.connect(hide_level_summary)
	add_child(summary_hide_timer)

	if !prepare_ui():
		return

	setup_inventory_controls()
	debug_panel.setup(tuning, NetworkManager)
	score_popups.setup(players_ctx, match_state, tuning)
	setup_popover_controls()
	setup_trigger_router()
	reset_ui()
	connect_network_signals()

func setup_trigger_router() -> void:
	trigger_router = PointerTriggerRouterScript.new()
	trigger_router.add_guard(func(): return debug_panel.is_open())
	trigger_router.add_guard(func(): return level_summary_overlay != null and level_summary_overlay.visible)
	trigger_router.add_trigger(
		func(): return quest_chip.get_global_rect() if quest_chip != null else null,
		on_quest_chip_pressed
	)
	trigger_router.add_trigger(
		func(): return quick_chat_trigger.get_global_rect() if quick_chat_trigger != null else null,
		open_quick_chat_popover
	)
	trigger_router.add_trigger(
		func(): return team_inventory_button.get_global_rect() if team_inventory_button != null else null,
		open_team_inventory_popover
	)
	trigger_router.add_trigger(
		func(): return power_trigger.get_global_rect() if power_trigger != null else null,
		open_power_popover
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
	power_target_box = binder.optional_node("PowerTargetBox") as VBoxContainer
	player_label = binder.require_node("PlayerLabel") as Label
	room_label = binder.require_node("RoomLabel") as Label
	level_label = binder.require_node("LevelLabel") as Label
	timer_label = binder.require_node("TimerLabel") as Label
	level_badge_texture = binder.optional_node("LevelBadgeTexture") as TextureRect
	round_time_texture = binder.optional_node("RoundTimeTexture") as TextureRect
	top_indicator_fill = binder.optional_node("TopIndicatorFill") as TextureRect
	score_label = binder.require_node("ScoreLabel") as Label
	player_rail_box = binder.optional_node("PlayerRailBox") as VBoxContainer
	impact_track = binder.optional_node("ImpactTrack") as VBoxContainer
	impact_pill = binder.optional_node("ImpactPill") as Control
	quest_chip = binder.optional_node("QuestChip") as TextureButton
	quest_badge = binder.optional_node("QuestBadge") as TextureRect
	quick_chat_trigger = binder.optional_node("QuickChatTrigger") as TextureButton
	power_trigger = binder.optional_node("PowerTrigger") as TextureButton
	team_inventory_button = binder.optional_node("TeamInventoryButton") as TextureButton
	team_inventory_popover = binder.optional_node("TeamInventoryPopover") as Control
	quest_popover = binder.optional_node("QuestPopover") as Control
	impact_status_label = binder.require_node("ImpactStatusLabel") as Label
	impact_separator = binder.optional_node("ImpactSeparator") as HSeparator
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
	level_summary_overlay = binder.require_node("LevelSummaryOverlay") as Control
	level_summary_title_label = binder.require_node("LevelSummaryTitleLabel") as Label
	level_summary_result_label = binder.require_node("LevelSummaryResultLabel") as Label
	level_summary_team_label = binder.require_node("LevelSummaryTeamLabel") as Label
	level_summary_mvp_label = binder.require_node("LevelSummaryMvpLabel") as Label
	level_summary_players_box = binder.require_node("LevelSummaryPlayersBox") as VBoxContainer

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
	quick_chat_buttons = [
		binder.optional_node("QuickChatButton1") as Button,
		binder.optional_node("QuickChatButton2") as Button,
		binder.optional_node("QuickChatButton3") as Button
	]
	power_buttons = [binder.optional_node("PowerButton1") as Button, binder.optional_node("PowerButton2") as Button, binder.optional_node("PowerButton3") as Button]

	debug_panel.bind_nodes(binder)
	score_popups.bind_nodes(binder)
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
	for i in range(quick_chat_buttons.size()):
		var quick_chat_button: Button = quick_chat_buttons[i]
		if quick_chat_button != null:
			quick_chat_button.focus_mode = Control.FOCUS_NONE
			quick_chat_button.pressed.connect(func(): on_quick_chat_pressed(i))
	update_quick_chat_buttons()
	for i in range(power_buttons.size()):
		if power_buttons[i] != null:
			power_buttons[i].gui_input.connect(func(event):
				if event is InputEventMouseButton and event.pressed and !power_buttons[i].disabled:
					selected_power_slot = i
					power_dragging = true
					show_power_drag_ghost(power_buttons[i].text, event.global_position)
			)

func open_quick_chat_popover() -> void:
	if team_inventory_popover == null:
		return

	if active_popover == team_inventory_popover and shared_popover_mode == "quick_chat" \
			and team_inventory_popover.visible:
		close_active_popover()
		return

	team_inventory_popover.call("set_title", "Quick Chat")
	team_inventory_popover.call("clear_rows")

	if quick_chat_templates.is_empty():
		team_inventory_popover.call("add_row", "No quick chat available")
	else:
		for i in range(quick_chat_templates.size()):
			var index: int = i
			team_inventory_popover.call(
				"add_action_row",
				str(quick_chat_templates[i]),
				func():
					on_quick_chat_pressed(index)
					close_active_popover()
			)

	close_active_popover()
	active_popover = team_inventory_popover
	shared_popover_mode = "quick_chat"
	team_inventory_popover.call("open")
	position_shared_popover_card()

func open_power_popover() -> void:
	if team_inventory_popover == null:
		return

	if active_popover == team_inventory_popover and shared_popover_mode == "power" \
			and team_inventory_popover.visible:
		close_active_popover()
		return

	team_inventory_popover.call("set_title", "Power")
	team_inventory_popover.call("clear_rows")

	if last_power_inventory.is_empty():
		team_inventory_popover.call("add_row", "No power items")
	else:
		for i in range(last_power_inventory.size()):
			var index: int = i
			var entry: Variant = last_power_inventory[i]
			var power_id: String = str(entry.get("id", "")) if typeof(entry) == TYPE_DICTIONARY else str(entry)
			team_inventory_popover.call(
				"add_action_row",
				get_power_row_label(power_id),
				func():
					NetworkManager.activate_power(index)
					close_active_popover()
			)

	close_active_popover()
	active_popover = team_inventory_popover
	shared_popover_mode = "power"
	team_inventory_popover.call("open")
	position_shared_popover_card()

func get_power_row_label(power_id: String) -> String:
	if power_id == "refresh":
		return "Refresh team inventory"

	return power_id.replace("_", " ").capitalize()

func open_team_inventory_popover() -> void:
	if team_inventory_popover == null:
		return

	if active_popover == team_inventory_popover and shared_popover_mode == "team_inventory" \
			and team_inventory_popover.visible:
		close_active_popover()
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

	close_active_popover()
	active_popover = team_inventory_popover
	shared_popover_mode = "team_inventory"
	team_inventory_popover.call("open")
	position_shared_popover_card()

func close_active_popover() -> void:
	if active_popover != null:
		active_popover.call("close")
		active_popover = null
	shared_popover_mode = ""

func position_shared_popover_card() -> void:
	if team_inventory_popover == null:
		return
	var row_anchor: Control = power_trigger
	if row_anchor == null:
		row_anchor = quick_chat_trigger
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

func position_quest_popover_card() -> void:
	if quest_popover == null or quest_chip == null:
		return
	var chip_rect: Rect2 = quest_chip.get_global_rect()
	quest_popover.call("set_card_global_position", Vector2(
		chip_rect.position.x + chip_rect.size.x + 5.0,
		chip_rect.position.y
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
	update_impact_status_ui({})
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
	cancel_pending_level_summary()
	hide_level_summary()
	cancel_block_drag()
	score_popups.seen_score_event_ids.clear()
	last_level_summary_key = ""
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
	if power_dragging and event is InputEventMouseButton and !event.pressed:
		for target in power_target_buttons:
			if target.get_global_rect().has_point(event.global_position):
				NetworkManager.activate_power(selected_power_slot)
		power_dragging = false
		selected_power_slot = -1
		hide_power_drag_ghost()
	if power_dragging and event is InputEventMouseMotion:
		move_power_drag_ghost(event.global_position)
	if power_dragging and event is InputEventScreenDrag:
		move_power_drag_ghost(event.position)

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

func on_quick_chat_pressed(slot: int) -> void:
	if !NetworkManager.is_conn_estab or match_state.current_match_state != "playing":
		return
	if slot < 0 or slot >= quick_chat_templates.size():
		return
	if Time.get_ticks_msec() - last_quick_chat_sent_at_ms < quick_chat_cooldown_ms:
		return
	last_quick_chat_sent_at_ms = Time.get_ticks_msec()
	NetworkManager.send_quick_chat(slot)

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

func update_quick_chat_buttons() -> void:
	for i in range(quick_chat_buttons.size()):
		var button: Button = quick_chat_buttons[i]
		if button == null:
			continue
		var has_template: bool = i < quick_chat_templates.size()
		button.text = str(quick_chat_templates[i]) if has_template else "Chat"
		button.disabled = !has_template or !NetworkManager.is_conn_estab or match_state.current_match_state != "playing"

func begin_block_drag(index: int, global_pos: Vector2, pointer_id: int) -> void:
	if drag_preview == null:
		return

	close_active_popover()

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
	last_level_summary_key = ""
	score_popups.clear_score_popups()
	cancel_pending_level_summary()
	hide_level_summary()
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
	update_impact_status_ui(data.get("impactScoreStatus", {}))
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
	update_impact_status_ui({})
	tower_status_label.text = "Room closed"
	block_label.text = "Inventory"
	set_tower_progress(0, 0)
	set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	debug_panel.set_open(false)
	score_popups.clear_score_popups()
	cancel_pending_level_summary()
	hide_level_summary()
	score_popups.seen_score_event_ids.clear()
	last_level_summary_key = ""
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
		last_level_summary_key = ""
		score_popups.clear_score_popups()
		seen_quick_chat_event_ids.clear()
		seen_power_event_ids.clear()
		cancel_pending_level_summary()
		if state != "finished" and state != "failed":
			hide_level_summary()

	players_ctx.update_from_players(players)
	update_power_target_ui(players)
	update_quest_chip(data.get("sideQuest", {}))
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

	update_score_lines(players)
	update_impact_status_ui(data.get("impactScoreStatus", {}))

	update_inventory_ui(
		my_blocks,
		int(data.get("activeInventorySlots", MAX_INVENTORY_SLOTS))
	)
	last_power_inventory = my_power
	update_power_inventory_ui(my_power)
	quick_chat_templates = data.get("quickChatTemplates", quick_chat_templates)
	quick_chat_cooldown_ms = int(data.get("quickChatCooldownMs", quick_chat_cooldown_ms))
	update_quick_chat_buttons()
	process_quick_chat_events(data.get("quickChatEvents", []))
	process_power_events(data.get("powerEvents", []), players)

	var score_popup_wait_seconds: float = score_popups.process_score_events(data.get("scoreEvents", []), players)

	if state == "finished" or state == "failed":
		queue_level_summary_after_score_popups(
			data.get("lastLevelSummary", {}),
			state,
			score_popup_wait_seconds
		)
	else:
		cancel_pending_level_summary()
		hide_level_summary()

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

func update_impact_status_ui(raw_status: Variant) -> void:
	if impact_status_label == null:
		return

	if typeof(raw_status) != TYPE_DICTIONARY:
		set_impact_status_visible(false)
		impact_status_label.visible = false
		impact_status_label.text = ""
		update_impact_track([], 0)
		return

	var status: Dictionary = raw_status
	var required_band_score: int = int(status.get(
		"requiredBandScore",
		status.get("requiredScore", 0)
	))

	if required_band_score <= 0:
		set_impact_status_visible(false)
		impact_status_label.visible = false
		impact_status_label.text = ""
		update_impact_track([], 0)
		return

	var next_impact_level: int = int(status.get("nextImpactLevel", 0))
	var player_statuses: Array = status.get("players", [])
	var ready_count: int = 0
	var player_count: int = 0
	var local_status: Dictionary = {}
	var short_player_goals: Array[String] = []

	for player_status in player_statuses:
		if typeof(player_status) != TYPE_DICTIONARY:
			continue

		var player_id: String = str(player_status.get("id", ""))
		var is_local_player: bool = players_ctx.is_local(player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			short_player_goals.append(
				players_ctx.display_name(player_id) +
				" " + str(int(player_status.get("requiredScore", required_band_score)))
			)

	var lines: Array[String] = [
		"Impact L" + str(next_impact_level) + "  |  " + str(ready_count) + "/" + str(player_count) + " ready"
	]

	if !local_status.is_empty():
		var local_score: int = int(local_status.get("score", 0))
		var local_required_score: int = int(local_status.get("requiredScore", required_band_score))

		lines.append("You: " + str(local_score) + " / " + str(local_required_score))
	elif short_player_goals.is_empty():
		lines.append("All players ready")

	if !short_player_goals.is_empty():
		lines.append("Goals: " + ", ".join(short_player_goals))
	elif !local_status.is_empty() && ready_count == player_count:
		lines.append("All ready")

	set_impact_status_visible(true)
	impact_status_label.text = "\n".join(lines)

	update_impact_track(player_statuses, next_impact_level)

func update_quest_chip(raw_side_quest: Variant) -> void:
	if quest_chip == null:
		return

	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	last_side_quest = side_quest
	var is_unlocked: bool = str(side_quest.get("label", "")) != ""
	var is_cleared: bool = get_quest_claimed_by(side_quest) != ""
	var is_seen: bool = quest_seen_level == match_state.current_level

	quest_chip.visible = true
	if is_cleared:
		quest_chip.texture_normal = QuestClearedTexture
	elif is_unlocked and !is_seen:
		quest_chip.texture_normal = QuestUnseenTexture
	else:
		quest_chip.texture_normal = QuestIdleTexture
	quest_chip.tooltip_text = str(side_quest.get("label", ""))

func get_quest_claimed_by(side_quest: Dictionary) -> String:
	var claimed_by: Variant = side_quest.get("claimedBy", null)
	return claimed_by if typeof(claimed_by) == TYPE_STRING else ""

func on_quest_chip_pressed() -> void:
	quest_seen_level = match_state.current_level
	update_quest_chip(last_side_quest)

	if quest_popover != null and active_popover == quest_popover and quest_popover.visible:
		close_active_popover()
		return

	open_quest_popover()

func open_quest_popover() -> void:
	if quest_popover == null:
		return

	quest_popover.call("set_title", "Quest")
	quest_popover.call("clear_rows")

	var label: String = str(last_side_quest.get("label", ""))
	var claimed_by: String = get_quest_claimed_by(last_side_quest)

	if label == "":
		quest_popover.call("add_row", "No active quest yet")
	else:
		quest_popover.call("add_row", label)
		if claimed_by != "":
			var claim_row: Label = quest_popover.call(
				"add_row",
				"Claimed by " + players_ctx.display_name(claimed_by)
			)
			if claim_row != null:
				claim_row.add_theme_color_override("font_color", players_ctx.color_for(claimed_by))

	close_active_popover()
	active_popover = quest_popover
	quest_popover.call("open")
	position_quest_popover_card()

func update_impact_track(player_statuses: Array, next_impact_level: int) -> void:
	if impact_track == null:
		return

	var seen_player_ids: Dictionary = {}
	var slot: int = 0

	for player_status in player_statuses:
		if typeof(player_status) != TYPE_DICTIONARY:
			continue

		if slot >= MAX_RAIL_PLAYERS:
			break

		var player_id: String = str(player_status.get("id", ""))
		seen_player_ids[player_id] = true

		var bar: Control = impact_bars.get(player_id, null)
		if bar == null:
			bar = ImpactBarScene.instantiate()
			impact_track.add_child(bar)
			impact_bars[player_id] = bar

		bar.get_parent().move_child(bar, slot)

		var required: int = int(player_status.get(
			"requiredBandScore",
			player_status.get("requiredScore", 0)
		))
		var current: int = int(player_status.get(
			"bandScore",
			player_status.get("score", 0)
		))
		if match_state.current_match_state == "playing":
			current += int(player_level_scores.get(player_id, 0))
		var ratio: float = 1.0 if bool(player_status.get("met", false)) else 0.0

		if required > 0:
			ratio = clampf(float(current) / float(required), 0.0, 1.0)

		bar.call("set_bar", players_ctx.seat_color(player_id), ratio)
		slot += 1

	for player_id in impact_bars.keys():
		if not seen_player_ids.has(player_id):
			impact_bars[player_id].queue_free()
			impact_bars.erase(player_id)

	if impact_pill != null:
		impact_pill.visible = true

func set_impact_status_visible(should_show: bool) -> void:
	if impact_separator != null:
		impact_separator.visible = should_show

	if impact_status_label != null:
		impact_status_label.visible = should_show

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
				NetworkManager.activate_power(selected_power_slot)
				power_dragging = false
				selected_power_slot = -1
				hide_power_drag_ghost()
				get_viewport().set_input_as_handled()
			elif power_dragging and event is InputEventScreenTouch and !event.pressed:
				NetworkManager.activate_power(selected_power_slot)
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
		ui_root.add_child(power_drag_ghost)
	power_drag_ghost.text = text
	power_drag_ghost.visible = true
	move_power_drag_ghost(pointer_position)

func move_power_drag_ghost(pointer_position: Vector2) -> void:
	if power_drag_ghost != null:
		power_drag_ghost.global_position = pointer_position + Vector2(14, 14)

func hide_power_drag_ghost() -> void:
	if power_drag_ghost != null:
		power_drag_ghost.visible = false

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

func process_quick_chat_events(raw_events: Variant) -> void:
	if typeof(raw_events) != TYPE_ARRAY:
		return

	for raw_event in raw_events:
		if typeof(raw_event) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = raw_event
		var event_id: String = str(event.get("id", ""))
		if event_id == "" or seen_quick_chat_event_ids.has(event_id):
			continue
		seen_quick_chat_event_ids[event_id] = true
		var player_id: String = str(event.get("playerId", ""))
		show_quick_chat_bubble(player_id, str(event.get("text", "")), 3.0)

func show_quick_chat_bubble(player_id: String, text: String, duration_seconds: float) -> void:
	if score_popups.score_popup_layer == null or text == "":
		return

	var entry: Control = player_rail_entries.get(player_id, null)
	if entry == null or player_rail_box == null:
		score_popups.show_score_event_popup({
			"type": "quick_chat",
			"playerId": player_id,
			"label": text
		}, [], duration_seconds)
		return

	var bubble: PanelContainer = PanelContainer.new()
	bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bubble.z_index = 20
	bubble.modulate.a = 0.0
	bubble.add_theme_stylebox_override("panel", make_chat_bubble_style())

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 8)

	var label: Label = Label.new()
	label.text = text
	label.theme_type_variation = &"PopoverBodyLabel"
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(CHAT_BUBBLE_MAX_WIDTH, 0)

	margin.add_child(label)
	bubble.add_child(margin)
	score_popups.score_popup_layer.add_child(bubble)

	bubble.size = bubble.get_combined_minimum_size()
	bubble.pivot_offset = bubble.size * 0.5
	bubble.scale = Vector2(0.9, 0.9)

	var rail_right: float = player_rail_box.global_position.x + player_rail_box.size.x
	var row_center_y: float = entry.global_position.y + entry.size.y * 0.5
	bubble.position = Vector2(rail_right + 8.0, row_center_y - bubble.size.y * 0.5)

	var total_duration: float = maxf(0.1, duration_seconds)
	var intro_duration: float = minf(ScorePopupControllerScript.SCORE_POPUP_INTRO_SECONDS, total_duration * 0.3)
	var fade_duration: float = minf(0.35, total_duration * 0.3)
	var hold_duration: float = maxf(0.0, total_duration - intro_duration - fade_duration)

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(bubble, "modulate:a", 1.0, intro_duration)
	tween.tween_property(bubble, "scale", Vector2.ONE, intro_duration)
	tween.set_parallel(false)
	tween.tween_interval(hold_duration)
	tween.tween_property(bubble, "modulate:a", 0.0, fade_duration)
	tween.tween_callback(Callable(bubble, "queue_free"))

func make_chat_bubble_style() -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(1, 1, 1, 1)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_right = 14
	style.corner_radius_bottom_left = 4
	style.shadow_color = Color(0.42, 0.55, 0.6, 0.22)
	style.shadow_size = 8
	style.shadow_offset = Vector2(0, 4)
	return style

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
				score_tints[str(player.get("id", ""))] = { "color": caster_color, "until": tint_until }

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

func update_score_lines(players: Array) -> void:
	if player_rail_box == null:
		return

	var rail_player_count: int = min(players.size(), MAX_RAIL_PLAYERS)
	var seen_player_ids: Dictionary = {}

	player_level_scores.clear()

	for player in players:
		player_level_scores[str(player.get("id", ""))] = int(player.get("levelScore", 0))

	for i in range(rail_player_count):
		var player: Dictionary = players[i]
		var player_id := str(player.get("id", ""))
		seen_player_ids[player_id] = true
		players_ctx.seat_index[player_id] = i

		var entry: Control = player_rail_entries.get(player_id, null)
		if entry == null:
			entry = PlayerRailEntryScene.instantiate()
			player_rail_box.add_child(entry)
			player_rail_entries[player_id] = entry

		entry.get_parent().move_child(entry, i)
		entry.call(
			"set_entry",
			players_ctx.rail_name(player_id),
			int(player.get("score", 0)) + int(player.get("levelScore", 0)),
			i,
			players_ctx.avatar_id(player_id)
		)

		var tint: Dictionary = score_tints.get(player_id, {})
		if !tint.is_empty() and int(tint.get("until", 0)) > Time.get_ticks_msec():
			entry.modulate = tint.get("color", Color.WHITE)
		else:
			entry.modulate = Color.WHITE

	for player_id in player_rail_entries.keys():
		if not seen_player_ids.has(player_id):
			player_rail_entries[player_id].queue_free()
			player_rail_entries.erase(player_id)

func queue_level_summary_after_score_popups(
	summary_value: Variant,
	state: String,
	score_popup_wait_seconds: float
) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		return

	if (
		summary_key == pending_level_summary_key and
		summary_show_timer != null and
		!summary_show_timer.is_stopped()
	):
		return

	pending_level_summary = summary.duplicate(true)
	pending_level_summary_state = state
	pending_level_summary_key = summary_key

	if score_popup_wait_seconds > 0.0:
		if summary_hide_timer != null:
			summary_hide_timer.stop()

		if level_summary_overlay != null:
			level_summary_overlay.visible = false

		if summary_show_timer != null:
			summary_show_timer.stop()
			summary_show_timer.wait_time = score_popup_wait_seconds
			summary_show_timer.start()

		return

	show_pending_level_summary()

func show_pending_level_summary() -> void:
	if pending_level_summary.is_empty():
		return

	var summary: Dictionary = pending_level_summary
	var state: String = pending_level_summary_state

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""

	show_level_summary(summary, state)

func cancel_pending_level_summary() -> void:
	if summary_show_timer != null:
		summary_show_timer.stop()

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""

func show_level_summary(summary_value: Variant, state: String) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		return

	last_level_summary_key = summary_key
	level_summary_overlay.visible = true
	level_summary_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	level_summary_overlay.modulate.a = 0.0

	var result: String = str(summary.get("result", state))
	var level_number: int = int(summary.get("level", match_state.current_level))
	level_summary_title_label.text = "Level " + str(level_number) + (" Complete" if result == "completed" else " Failed")
	level_summary_result_label.text = get_level_summary_result_text(summary, result)
	level_summary_team_label.visible = false
	level_summary_team_label.text = ""
	level_summary_mvp_label.text = get_level_summary_mvp_text(summary)

	clear_children(level_summary_players_box)

	var players: Array = []
	for player_value in summary.get("players", []):
		if typeof(player_value) == TYPE_DICTIONARY:
			players.append(player_value)

	players.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("levelScore", 0)) > int(b.get("levelScore", 0))
	)

	for player_summary in players:
		level_summary_players_box.add_child(create_level_summary_player_row(player_summary, result))

	var tween: Tween = create_tween()
	tween.tween_property(level_summary_overlay, "modulate:a", 1.0, 0.16)

	if summary_hide_timer != null:
		summary_hide_timer.stop()
		summary_hide_timer.wait_time = clamp(float(tuning.level_summary_delay_ms) / 1000.0, 1.0, 10.0)
		summary_hide_timer.start()

func hide_level_summary() -> void:
	if summary_hide_timer != null:
		summary_hide_timer.stop()

	if level_summary_overlay != null:
		level_summary_overlay.visible = false
		level_summary_overlay.modulate.a = 1.0

func get_level_summary_key(summary: Dictionary) -> String:
	return (
		str(summary.get("level", match_state.current_level)) + ":" +
		str(summary.get("result", "")) + ":" +
		str(summary.get("teamLevelScore", 0)) + ":" +
		str(summary.get("mvpId", "")) + ":" +
		str(summary.get("exactFinish", false)) + ":" +
		str(summary.get("overbuildHeight", 0))
	)

func get_level_summary_result_text(summary: Dictionary, result: String) -> String:
	if result == "completed":
		var result_text: String = "Perfect Fit" if bool(summary.get("exactFinish", false)) else "Overbuilt +" + str(int(summary.get("overbuildHeight", 0)))
		var finisher_id: String = str(summary.get("finisherId", ""))

		if finisher_id != "":
			result_text += " | Finisher " + players_ctx.display_name(finisher_id)

		return result_text

	var reason: String = str(summary.get("reason", "failed"))

	if reason == "impact_score_requirement":
		return get_impact_failure_summary_text(summary)

	return "Reason: " + format_summary_reason(reason)

func get_impact_failure_summary_text(summary: Dictionary) -> String:
	var status: Dictionary = {}
	var raw_status: Variant = summary.get("impactScoreStatus", {})

	if typeof(raw_status) == TYPE_DICTIONARY:
		status = raw_status

	var blocked_level: int = int(summary.get(
		"blockedLevel",
		status.get("nextImpactLevel", 0)
	))
	var player_statuses: Array = status.get("players", [])
	var player_count: int = 0
	var ready_count: int = 0
	var local_status: Dictionary = {}
	var goal_texts: Array[String] = []

	for raw_player_status in player_statuses:
		if typeof(raw_player_status) != TYPE_DICTIONARY:
			continue

		var player_status: Dictionary = raw_player_status
		var player_id: String = str(player_status.get("id", ""))
		var is_local_player: bool = players_ctx.is_local(player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			goal_texts.append(
				players_ctx.display_name(player_id) +
				" " + str(int(player_status.get("requiredScore", 0)))
			)

	if player_count == 0:
		return get_impact_failure_fallback_text(summary, blocked_level)

	var lines: Array[String] = [
		"Impact L" + str(blocked_level) + "  |  " + str(ready_count) + "/" + str(player_count) + " ready"
	]

	if !local_status.is_empty():
		lines.append(
			"You: " +
			str(int(local_status.get("score", 0))) +
			" / " +
			str(int(local_status.get("requiredScore", 0)))
		)

	if !goal_texts.is_empty():
		lines.append("Goals: " + ", ".join(goal_texts))
	elif ready_count == player_count:
		lines.append("All ready")

	return "\n".join(lines)

func get_impact_failure_fallback_text(summary: Dictionary, blocked_level: int) -> String:
	var failure_texts: Array[String] = []

	for raw_failure in summary.get("impactScoreFailures", []):
		if typeof(raw_failure) != TYPE_DICTIONARY:
			continue

		var failure: Dictionary = raw_failure
		var player_id: String = str(failure.get("id", ""))
		failure_texts.append(
			players_ctx.display_name(player_id) +
			" " + str(int(failure.get("requiredScore", 0)))
		)

	if failure_texts.is_empty():
		return "Impact L" + str(blocked_level) + " failed"

	return "Impact L" + str(blocked_level) + "\nGoals: " + ", ".join(failure_texts)

func get_level_summary_mvp_text(summary: Dictionary) -> String:
	var mvp_id: String = str(summary.get("mvpId", ""))

	if mvp_id == "":
		return "MVP -"

	return "MVP " + players_ctx.display_name(mvp_id) + " +" + str(int(summary.get("mvpScore", 0)))

func create_level_summary_player_row(player_summary: Dictionary, result: String) -> Control:
	var player_id: String = str(player_summary.get("id", ""))
	var is_mvp: bool = bool(player_summary.get("isMvp", false))
	var player_color: Color = players_ctx.color_for(player_id)
	var row_panel: PanelContainer = PanelContainer.new()

	row_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.add_theme_stylebox_override("panel", make_summary_row_style(player_color, is_mvp))

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 4)
	margin.add_theme_constant_override("margin_right", 8)
	margin.add_theme_constant_override("margin_bottom", 4)

	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var name_label: Label = Label.new()
	name_label.text = ("MVP " if is_mvp else "") + players_ctx.display_name(player_id)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.add_theme_color_override("font_color", player_color if is_mvp else Color(0.92, 0.94, 0.98, 1.0))
	name_label.add_theme_font_size_override("font_size", 13)

	var score_label_node: Label = Label.new()
	score_label_node.text = ("Level +" if result == "completed" else "Level ") + str(int(player_summary.get("levelScore", 0)))
	score_label_node.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	score_label_node.custom_minimum_size.x = 86
	score_label_node.add_theme_color_override("font_color", Color(0.92, 0.94, 0.98, 1.0))
	score_label_node.add_theme_font_size_override("font_size", 13)

	var total_label_node: Label = Label.new()
	total_label_node.text = "Total " + str(int(player_summary.get("finalTotalScore", 0)))
	total_label_node.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	total_label_node.custom_minimum_size.x = 76
	total_label_node.add_theme_color_override("font_color", Color(0.72, 0.77, 0.86, 1.0))
	total_label_node.add_theme_font_size_override("font_size", 13)

	row.add_child(name_label)
	row.add_child(score_label_node)
	row.add_child(total_label_node)
	margin.add_child(row)
	row_panel.add_child(margin)

	return row_panel

func make_summary_row_style(player_color: Color, is_mvp: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = (
		Color(player_color.r, player_color.g, player_color.b, 0.18)
		if is_mvp
		else Color(0.08, 0.1, 0.13, 0.72)
	)
	style.border_color = (
		Color(player_color.r, player_color.g, player_color.b, 0.72)
		if is_mvp
		else Color(0.22, 0.25, 0.31, 0.72)
	)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 6
	style.corner_radius_top_right = 6
	style.corner_radius_bottom_left = 6
	style.corner_radius_bottom_right = 6
	return style

func clear_children(container: Node) -> void:
	if container == null:
		return

	for child in container.get_children():
		child.queue_free()

func format_summary_reason(reason: String) -> String:
	if reason == "impact_score_requirement":
		return "Impact contribution requirement"

	return reason.replace("_", " ").capitalize()

func update_debug_config(config) -> void:
	debug_panel.apply_config(config)

