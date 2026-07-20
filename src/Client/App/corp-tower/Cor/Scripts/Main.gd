extends Control

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
const InventoryControllerScript = preload("res://Cor/Scripts/GameUi/InventoryController.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const LevelBadgeNormalTexture = preload("res://Cor/Art/Static/level.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/Static/safe.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/Static/timer-round-time.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/Static/timer-freeze-time.png")

@onready var ui_root: Control = self

var timer_deadline_ms: int = 0
var timer_shown_seconds: int = -1
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

	if !prepare_ui():
		return

	inventory.setup(players_ctx, match_state, tuning, NetworkManager, popovers)
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
	connect_button = binder.require_node("ConnectButton") as Button


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
	level_label.text = "-"
	timer_label.text = "-"
	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeNormalTexture
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeNormalTexture
	score_label.text = "Waiting for players"
	match_state.current_match_state = ""
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
	roster.update_impact_status_ui({})
	height_label.text = "Height 0/0"
	tower_value_label.text = "0 / 0"
	tower_status_label.text = "Connect to start"
	set_tower_progress(0, 0)
	set_top_indicator_progress(0, 0)
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

	if trigger_router.process(event, Engine.get_process_frames()):
		get_viewport().set_input_as_handled()

func _process(_delta: float) -> void:
	inventory.tick()
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
	inventory.update_inventory_ui(
		data.get("blocks", []),
		int(data.get("activeInventorySlots", InventoryControllerScript.MAX_INVENTORY_SLOTS))
	)
	inventory.update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)
	roster.update_impact_status_ui(data.get("impactScoreStatus", {}))
	update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))

func update_room_closed(data) -> void:
	match_state.current_match_state = ""
	players_ctx.roster = []
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
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
	set_tower_progress(0, 0)
	set_top_indicator_progress(0, 0)
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

