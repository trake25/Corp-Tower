extends Control

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
const InventoryControllerScript = preload("res://Cor/Scripts/GameUi/InventoryController.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const TopBarControllerScript = preload("res://Cor/Scripts/GameUi/TopBarController.gd")

@onready var ui_root: Control = self

var team_inventory_button: TextureButton
var team_inventory_popover: Control
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
var inventory
var top_bar

var status_label: Label
var player_label: Label
var room_label: Label
var score_label: Label
var tower_stack: Control
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
	inventory = InventoryControllerScript.new()
	add_child(inventory)
	top_bar = TopBarControllerScript.new()
	add_child(top_bar)

	if !prepare_ui():
		return

	inventory.setup(players_ctx, match_state, tuning, NetworkManager, popovers)
	top_bar.setup(match_state)
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
	score_label = binder.require_node("ScoreLabel") as Label
	team_inventory_button = binder.optional_node("TeamInventoryButton") as TextureButton
	team_inventory_popover = binder.optional_node("TeamInventoryPopover") as Control
	tower_stack = binder.require_node("TowerStack") as Control
	connect_button = binder.require_node("ConnectButton") as Button

	top_bar.bind_nodes(binder)
	inventory.bind_nodes(binder)
	debug_panel.bind_nodes(binder)
	score_popups.bind_nodes(binder)
	summary.bind_nodes(binder)
	roster.bind_nodes(binder)
	quest.bind_nodes(binder)
	chat.bind_nodes(binder)
	power.bind_nodes(binder)
	missing_required_nodes = binder.missing

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

	if inventory.last_draw_pile_count > 0 and inventory.last_next_draw_block != null:
		var next_block: Dictionary = BlockDataScript.normalize_block(inventory.last_next_draw_block, 0)
		var icon := Control.new()
		icon.set_script(InventoryControllerScript.BlockPreviewScript)
		icon.custom_minimum_size = Vector2(32.0, 32.0)
		icon.set("cell_color", InventoryControllerScript.DRAW_PILE_COLOR)
		icon.call("set_block", next_block)
		team_inventory_popover.call("add_icon_row", icon, "Next brick")

	var remaining_label: Label = team_inventory_popover.call(
		"add_row",
		str(inventory.last_draw_pile_count) + " Remaining bricks"
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
	top_bar.reset_indicators()
	score_label.text = "Waiting for players"
	match_state.current_match_state = ""
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
	roster.update_impact_status_ui({})
	top_bar.height_label.text = "Height 0/0"
	top_bar.tower_value_label.text = "0 / 0"
	top_bar.tower_status_label.text = "Connect to start"
	top_bar.set_tower_progress(0, 0)
	top_bar.set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	inventory.update_inventory_ui([], InventoryControllerScript.MAX_INVENTORY_SLOTS)
	inventory.update_draw_pile_ui(0, null)
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	inventory.cancel_block_drag()
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
	inventory.handle_input(event)
	power.handle_input(event)

	if trigger_router.process(event):
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	inventory.tick()
	top_bar.tick_round_timer()

func on_connect_pressed() -> void:
	NetworkManager.toggle_connection()

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
	top_bar.update_top_bar_display(int(data.get("level", 0)), int(data.get("level", 0)), "starting", 0)
	match_state.current_level = int(data.get("level", 0))
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	top_bar.tower_status_label.text = "Match starting"
	top_bar.set_tower_progress(0, int(data.get("targetHeight", 0)))
	top_bar.set_top_indicator_progress(0, int(data.get("targetHeight", 0)))
	tower_stack.clear_tower()
	inventory.update_inventory_ui(
		data.get("blocks", []),
		int(data.get("activeInventorySlots", InventoryControllerScript.MAX_INVENTORY_SLOTS))
	)
	inventory.update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)
	roster.update_impact_status_ui(data.get("impactScoreStatus", {}))
	top_bar.update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))

func update_room_closed(data) -> void:
	match_state.current_match_state = ""
	players_ctx.roster = []
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
	room_label.text = "Room closed"
	top_bar.reset_indicators()
	top_bar.height_label.text = "Height -"
	score_label.text = "Room closed: " + str(data.get("reason", "unknown"))
	roster.update_impact_status_ui({})
	top_bar.tower_status_label.text = "Room closed"
	top_bar.set_tower_progress(0, 0)
	top_bar.set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	inventory.update_inventory_ui([], InventoryControllerScript.MAX_INVENTORY_SLOTS)
	inventory.update_draw_pile_ui(0, null)
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

	if state != "playing" and inventory.is_block_dragging:
		inventory.cancel_block_drag()

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

	top_bar.update_top_bar_display(incoming_level, impact_level, state, seconds_remaining)
	top_bar.set_top_indicator_progress(current_height, target_height)
	top_bar.height_label.text = "Height " + str(current_height) + "/" + str(target_height)
	top_bar.update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))
	top_bar.tower_value_label.text = str(current_height) + " / " + str(target_height)
	top_bar.tower_status_label.text = top_bar.get_tower_status(state, current_height, target_height)
	if str(data.get("towerStabilityFeedbackMode", "warnings_only")) == "meter_only":
		top_bar.tower_status_label.text += " | Stability " + str(int(data.get("towerStability", 100))) + "%"
	top_bar.set_tower_progress(current_height, target_height)
	tower_stack.set_tower(
		data.get("towerBlocks", []), current_height, target_height,
		int(data.get("towerStability", 100)),
		data.get("towerStabilityDiagnostics", {})
	)
	inventory.update_draw_pile_ui(
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

	inventory.update_inventory_ui(
		my_blocks,
		int(data.get("activeInventorySlots", InventoryControllerScript.MAX_INVENTORY_SLOTS))
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

func update_debug_config(config) -> void:
	debug_panel.apply_config(config)

