extends Control

const UiNodeBinderScript = preload("res://Cor/Scripts/GameUi/UiNodeBinder.gd")
const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")
const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const AccessibilitySettingsScript = preload("res://Cor/Scripts/GameUi/AccessibilitySettings.gd")
const DebugPanelControllerScript = preload("res://Cor/Scripts/GameUi/DebugPanelController.gd")
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
const TopBarControllerScript = preload("res://Cor/Scripts/GameUi/TopBarController.gd")
const VisualHooksScript = preload("res://Cor/Scripts/GameUi/VisualHooks.gd")
const VisualHooksControllerScript = preload("res://Cor/Scripts/GameUi/VisualHooksController.gd")
const TutorialControllerScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialController.gd")
const TutorialMenuControllerScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialMenuController.gd")

signal tutorial_requested(lesson_id: StringName)
signal tutorial_exited

@onready var ui_root: Control = self

var missing_required_nodes: Array[String] = []
var tuning
var accessibility
var debug_panel
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
var visual_hooks
var visual_fx
var tutorial
var tutorial_menu

var tower_stack: Control
var background_parallax: Control
var platform_parallax: Control
var demo_mode_label: Label

func _ready() -> void:
	tuning = UiTuningScript.new()
	accessibility = AccessibilitySettingsScript.new()
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
	visual_hooks = VisualHooksScript.new()
	visual_fx = VisualHooksControllerScript.new()
	add_child(visual_fx)
	tutorial = TutorialControllerScript.new()
	add_child(tutorial)
	tutorial_menu = TutorialMenuControllerScript.new()
	add_child(tutorial_menu)

	if !prepare_ui():
		return

	demo_mode_label.visible = EndpointConfig.DEMO_MODE_ENABLED

	inventory.setup(players_ctx, match_state, tuning, NetworkManager, popovers, tutorial, accessibility)
	top_bar.setup(match_state)
	debug_panel.setup(tuning, NetworkManager, request_tutorial, accessibility)
	score_popups.setup(players_ctx, match_state, tuning)
	summary.setup(players_ctx, match_state, tuning)
	roster.setup(players_ctx, match_state)
	visual_fx.setup(tower_stack, roster, players_ctx, visual_hooks, platform_parallax)

	if tower_stack.has_method("set_visual_hooks"):
		tower_stack.call("set_visual_hooks", visual_hooks)
	quest.setup(players_ctx, match_state, popovers, should_block_popovers)
	summary.quest_text_provider = quest.get_quest_summary_text
	summary.on_summary_ended = visual_fx.end_beat
	chat.setup(match_state, NetworkManager, popovers, roster, score_popups, should_block_popovers, tutorial.on_chat_sent)
	power.setup(NetworkManager, popovers, score_popups, should_block_popovers, tutorial.on_power_activated)
	tutorial.setup({
		"tower_stack": tower_stack,
		"inventory": inventory,
		"top_bar": top_bar,
		"roster": roster,
		"quest": quest,
		"power": power,
		"chat": chat,
		"score_popups": score_popups,
		"players_ctx": players_ctx
	})
	tutorial_menu.setup(tutorial, _on_tutorial_menu_exit)

	if tower_stack.has_signal("scroll_offset_changed"):
		tower_stack.connect("scroll_offset_changed", Callable(background_parallax, "set_scroll_pixels"))
		tower_stack.connect("scroll_offset_changed", Callable(platform_parallax, "set_scroll_pixels"))

	accessibility.changed.connect(apply_accessibility)
	apply_accessibility()

	reset_ui()
	connect_network_signals()

func apply_accessibility() -> void:
	inventory.set_parallel_placement(
		accessibility.is_enabled(AccessibilitySettingsScript.PARALLEL_PLACEMENT)
	)
	debug_panel.refresh_accessibility_row()

func should_block_popovers() -> bool:
	return (
		debug_panel.is_open()
		or summary.is_overlay_visible()
		or tutorial.blocks_popovers()
		or tutorial_menu.is_menu_visible()
	)

func prepare_ui() -> bool:
	bind_ui_nodes()

	if !missing_required_nodes.is_empty():
		push_error("UI is missing required nodes: " + ", ".join(missing_required_nodes))
		return false

	return true

func bind_ui_nodes() -> void:
	var binder = UiNodeBinderScript.new(ui_root)
	tower_stack = binder.require_node("TowerStack") as Control
	background_parallax = binder.require_node("BgArt") as Control
	platform_parallax = binder.require_node("PlatformArt") as Control
	demo_mode_label = binder.require_node("DemoModeLabel") as Label

	top_bar.bind_nodes(binder)
	inventory.bind_nodes(binder)
	debug_panel.bind_nodes(binder)
	score_popups.bind_nodes(binder)
	summary.bind_nodes(binder)
	roster.bind_nodes(binder)
	quest.bind_nodes(binder)
	chat.bind_nodes(binder)
	power.bind_nodes(binder)
	tutorial.bind_nodes(binder)
	tutorial_menu.bind_nodes(binder)
	missing_required_nodes = binder.missing

func reset_ui() -> void:
	top_bar.reset_indicators()
	match_state.current_match_state = ""
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
	roster.update_impact_status_ui({})
	top_bar.set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	inventory.update_inventory_ui([], InventoryControllerScript.MAX_INVENTORY_SLOTS)
	inventory.update_draw_pile_ui(0, null)
	score_popups.clear_score_popups()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	quest.reset_freeze_quest_popover()
	inventory.cancel_block_drag()
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	match_state.current_level = 0

func connect_network_signals() -> void:
	NetworkManager.room_joined.connect(_on_room_joined)
	NetworkManager.match_started.connect(update_room)
	NetworkManager.room_closed.connect(update_room_closed)
	NetworkManager.game_state_updated.connect(update_game_state)
	NetworkManager.debug_config_updated.connect(update_debug_config)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and debug_panel.is_open():
		debug_panel.set_open(false)

func _input(event: InputEvent) -> void:
	inventory.handle_input(event)

func _process(_delta: float) -> void:
	inventory.tick()
	top_bar.tick_round_timer()

func toggle_debug_overlay() -> void:
	debug_panel.toggle()

func set_debug_context(context: String) -> void:
	debug_panel.set_screen_context(context)

func _on_room_joined(data) -> void:
	if bool(data.get("matchStarted", true)):
		update_room(data)

func update_room(data) -> void:
	players_ctx.roster = data.get("roster", [])
	top_bar.update_top_bar_display(int(data.get("level", 0)), int(data.get("level", 0)), "starting", 0)
	match_state.current_level = int(data.get("level", 0))
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	score_popups.clear_score_popups()
	visual_fx.reset()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	quest.reset_freeze_quest_popover()
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

func update_room_closed(_data) -> void:
	match_state.current_match_state = ""
	players_ctx.roster = []
	inventory.last_placement_sent_at_ms = 0
	inventory.cancel_block_drag()
	top_bar.reset_indicators()
	roster.update_impact_status_ui({})
	top_bar.set_top_indicator_progress(0, 0)
	tower_stack.clear_tower()
	inventory.update_inventory_ui([], InventoryControllerScript.MAX_INVENTORY_SLOTS)
	inventory.update_draw_pile_ui(0, null)
	debug_panel.set_open(false)
	score_popups.clear_score_popups()
	visual_fx.reset()
	summary.cancel_pending_level_summary()
	summary.hide_level_summary()
	quest.reset_freeze_quest_popover()
	score_popups.seen_score_event_ids.clear()
	summary.last_level_summary_key = ""
	match_state.current_level = 0

func start_tutorial(lesson_id: StringName = &"") -> void:
	match_state.tutorial_mode = true

	if lesson_id == &"":
		tutorial_menu.show_menu()
	else:
		tutorial_menu.hide_menu()
		tutorial.start_lesson(lesson_id)

func request_tutorial(lesson_id: StringName = &"") -> void:
	tutorial_requested.emit(lesson_id)

func _on_tutorial_menu_exit() -> void:
	tutorial.teardown()
	match_state.tutorial_mode = false
	match_state.tutorial_lesson = &""
	tutorial_exited.emit()

func update_game_state(data) -> void:
	if match_state.tutorial_mode:
		return

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
		visual_fx.reset()
		summary.cancel_pending_level_summary()
		if state != "finished" and state != "failed":
			summary.hide_level_summary()

	players_ctx.update_from_players(players)
	quest.update_quest_chip(data.get("sideQuest", {}))
	quest.update_freeze_quest_popover(state, data.get("sideQuest", {}))
	if tower_stack.has_method("set_player_color_map"):
		tower_stack.call("set_player_color_map", players_ctx.color_map)

	top_bar.update_top_bar_display(incoming_level, impact_level, state, seconds_remaining)
	top_bar.set_top_indicator_progress(current_height, target_height)
	top_bar.update_tower_stability_ui(int(data.get("towerStability", 100)), data.get("towerStabilityDiagnostics", {}))
	if data.has("accessibility"):
		accessibility.apply_server_defaults(data.get("accessibility", {}))
	if data.has("visualHooks"):
		visual_hooks.apply(data.get("visualHooks", {}))
	if data.has("towerGridWidth"):
		SnapGridScript.set_grid_width(int(data.get("towerGridWidth", 14)))
	if data.has("placeableColumnMin") and data.has("placeableColumnMax"):
		SnapGridScript.set_placeable_range(
			int(data.get("placeableColumnMin", 4)),
			int(data.get("placeableColumnMax", 9))
		)
	tower_stack.set_tower(
		data.get("towerBlocks", []), current_height, target_height,
		int(data.get("towerStability", 100)),
		data.get("towerStabilityDiagnostics", {})
	)
	inventory.update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)
	inventory.revalidate_armed_placement()

	var my_blocks: Array = []
	var my_power: Array = []

	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", "P?"))
		if players_ctx.is_local(player_id):
			my_blocks = player.get("blocks", [])
			my_power = player.get("powerInventory", [])

	roster.update_score_lines(players)
	roster.update_impact_status_ui(data.get("impactScoreStatus", {}))

	inventory.update_inventory_ui(
		my_blocks,
		int(data.get("activeInventorySlots", InventoryControllerScript.MAX_INVENTORY_SLOTS))
	)
	power.last_power_inventory = my_power
	chat.quick_chat_templates = data.get("quickChatTemplates", chat.quick_chat_templates)
	chat.quick_chat_cooldown_ms = int(data.get("quickChatCooldownMs", chat.quick_chat_cooldown_ms))
	chat.process_quick_chat_events(data.get("quickChatEvents", []))
	power.process_power_events(data.get("powerEvents", []), players)

	var score_popup_wait_seconds: float = score_popups.process_score_events(data.get("scoreEvents", []), players)

	if state == "finished" or state == "failed":
		summary.queue_level_summary_after_score_popups(
			data.get("lastLevelSummary", {}),
			state,
			score_popup_wait_seconds + visual_fx.on_level_result(data, state)
		)
	else:
		summary.cancel_pending_level_summary()
		summary.hide_level_summary()

func update_debug_config(config) -> void:
	debug_panel.apply_config(config)
	top_bar.set_stability_meter_visible(
		str(config.get("towerStabilityFeedbackMode", "warnings_only"))
	)

	if tower_stack != null and tower_stack.has_method("set_mood_threshold"):
		tower_stack.set_mood_threshold(
			int(config.get("towerStabilityMoodThreshold", BlockDataScript.DEFAULT_MOOD_THRESHOLD))
		)
