extends Control

const MAX_INVENTORY_SLOTS := 3
const SHOW_DEBUG_UI := true
const DRAW_PILE_COLOR := Color(0.95, 0.72, 0.25, 1.0)
const SCORE_POPUP_DEFAULT_DURATION_MS := 3000
const SCORE_POPUP_FLOAT_DISTANCE := 64.0
const SCORE_POPUP_INTRO_SECONDS := 0.16
const SCORE_POPUP_FADE_RATIO := 0.28
const SCORE_POPUP_MIN_FADE_SECONDS := 0.35
const SCORE_POPUP_MAX_FADE_SECONDS := 2.0
const SCORE_POPUP_MIN_HOLD_SECONDS := 0.05
const FINISH_SCORE_POPUP_MIN_HOLD_RATIO := 0.08
const LEVEL_SUMMARY_DEFAULT_DELAY_MS := 3000
const BOT_STRATEGY_COOPERATIVE := "cooperative"
const BOT_STRATEGY_MVP_GREEDY := "mvp_greedy"
const TOWER_FEEDBACK_MODES := ["warnings_only", "meter_only", "live_preview"]
const TOWER_FEEDBACK_MODE_TITLES := ["Warnings Only", "Meter Only", "Live Preview"]
const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const BlockPreviewScript = preload("res://Cor/Scripts/BlockPreview.gd")
const LOCAL_PLAYER_MARKER := "You"
const DRAG_PREVIEW_SIZE := Vector2(96, 96)
const DRAG_POINTER_MOUSE := -1

@onready var ui_root: Control = $UIRoot

var inventory_buttons: Array = []
var cooldown_overlays: Array = []
var quick_chat_buttons: Array = []
var power_buttons: Array = []
var selected_power_slot: int = -1
var power_target_buttons: Array = []
var power_dragging := false
var power_drag_ghost: Label
var power_feedback_tween: Tween
var score_line_labels: Dictionary = {}
var score_tints: Dictionary = {}
var block_previews: Array = []
var block_height_labels: Array = []
var block_name_labels: Array = []
var is_syncing_debug_config: bool = false
var missing_required_nodes: Array[String] = []
var player_color_map: Dictionary = {}
var player_order: Array[String] = []
var seen_score_event_ids: Dictionary = {}
var seen_quick_chat_event_ids: Dictionary = {}
var quick_chat_templates: Array = []
var quick_chat_cooldown_ms: int = 6000
var last_quick_chat_sent_at_ms: int = 0
var current_level: int = 0
var placement_score_popup_duration_ms: int = SCORE_POPUP_DEFAULT_DURATION_MS
var finish_score_popup_duration_ms: int = SCORE_POPUP_DEFAULT_DURATION_MS
var level_summary_delay_ms: int = LEVEL_SUMMARY_DEFAULT_DELAY_MS
var last_level_summary_key: String = ""
var pending_level_summary: Dictionary = {}
var pending_level_summary_state: String = ""
var pending_level_summary_key: String = ""
var summary_show_timer: Timer
var summary_hide_timer: Timer
var active_inventory_slots: int = MAX_INVENTORY_SLOTS
var current_match_state: String = ""
var placement_cooldown_ms: int = 2000
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
var score_popup_layer: Control
var debug_button: Button
var debug_overlay: Control
var debug_dim_layer: Control
var reset_debug_button: Button
var close_debug_button: Button
var bots_toggle: CheckButton
var bot_strategy_button: OptionButton
var bot_count_label: Label
var bot_count_slider: HSlider
var bot_delay_min_label: Label
var bot_delay_min_slider: HSlider
var bot_delay_max_label: Label
var bot_delay_max_slider: HSlider
var debug_start_level_label: Label
var debug_start_level_slider: HSlider
var cooldown_label: Label
var cooldown_slider: HSlider
var level_time_label: Label
var level_time_slider: HSlider
var start_delay_label: Label
var start_delay_slider: HSlider
var placement_popup_duration_label: Label
var placement_popup_duration_slider: HSlider
var finish_popup_duration_label: Label
var finish_popup_duration_slider: HSlider
var level_summary_delay_label: Label
var level_summary_delay_slider: HSlider
var target_multiplier_label: Label
var target_multiplier_slider: HSlider
var level_supply_min_label: Label
var level_supply_min_slider: HSlider
var level_supply_max_label: Label
var level_supply_max_slider: HSlider
var min_precision_blocks_label: Label
var min_precision_blocks_slider: HSlider
var max_team_carry_over_label: Label
var max_team_carry_over_slider: HSlider
var refresh_min_useful_height_label: Label
var refresh_min_useful_height_slider: HSlider
var placement_score_label: Label
var placement_score_slider: HSlider
var impact_score_label: Label
var impact_score_slider: HSlider
var finisher_bonus_label: Label
var finisher_bonus_slider: HSlider
var precision_bonus_label: Label
var precision_bonus_slider: HSlider
var team_exact_bonus_label: Label
var team_exact_bonus_slider: HSlider
var assist_bonus_label: Label
var assist_bonus_slider: HSlider
var assist_threshold_label: Label
var assist_threshold_slider: HSlider
var tower_overhang_weight_label: Label
var tower_overhang_weight_slider: HSlider
var tower_max_tilt_label: Label
var tower_max_tilt_slider: HSlider
var tower_collapse_threshold_label: Label
var tower_collapse_threshold_slider: HSlider
var tower_warning_threshold_label: Label
var tower_warning_threshold_slider: HSlider
var tower_critical_threshold_label: Label
var tower_critical_threshold_slider: HSlider
var tower_feedback_mode_button: OptionButton
var power_unlock_level_label: Label
var power_unlock_level_slider: HSlider
var power_max_slots_label: Label
var power_max_slots_slider: HSlider
var power_cooldown_label: Label
var power_cooldown_slider: HSlider

func _ready() -> void:
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
	setup_debug_controls()
	reset_ui()
	connect_network_signals()

func prepare_ui() -> bool:
	bind_ui_nodes()

	if !missing_required_nodes.is_empty():
		push_error("UI is missing required nodes: " + ", ".join(missing_required_nodes))
		return false

	return true

func bind_ui_nodes() -> void:
	missing_required_nodes.clear()
	status_label = require_node("StatusLabel") as Label
	power_target_box = optional_node("PowerTargetBox") as VBoxContainer
	player_label = require_node("PlayerLabel") as Label
	room_label = require_node("RoomLabel") as Label
	level_label = require_node("LevelLabel") as Label
	timer_label = require_node("TimerLabel") as Label
	score_label = require_node("ScoreLabel") as Label
	impact_status_label = require_node("ImpactStatusLabel") as Label
	impact_separator = optional_node("ImpactSeparator") as HSeparator
	tower_stability_label = optional_node("TowerStabilityLabel") as Label
	height_label = require_node("HeightLabel") as Label
	tower_value_label = require_node("TowerValueLabel") as Label
	tower_status_label = require_node("TowerStatusLabel") as Label
	tower_fill = require_node("TowerFill") as Panel
	tower_stack = require_node("TowerStack") as Control
	tower_drop_zone = require_node("TowerDropZone") as Control
	drag_preview = require_node("DragPreview") as Control
	block_label = require_node("BlockLabel") as Label
	draw_pile_name_label = require_node("DrawPileNameLabel") as Label
	draw_pile_count_label = require_node("DrawPileCountLabel") as Label
	draw_pile_preview = require_node("DrawPilePreview") as Control
	connect_button = require_node("ConnectButton") as Button
	level_summary_overlay = require_node("LevelSummaryOverlay") as Control
	level_summary_title_label = require_node("LevelSummaryTitleLabel") as Label
	level_summary_result_label = require_node("LevelSummaryResultLabel") as Label
	level_summary_team_label = require_node("LevelSummaryTeamLabel") as Label
	level_summary_mvp_label = require_node("LevelSummaryMvpLabel") as Label
	level_summary_players_box = require_node("LevelSummaryPlayersBox") as VBoxContainer
	score_popup_layer = require_node("ScorePopupLayer") as Control

	inventory_buttons = [
		require_node("PlaceBlockButton1") as Button,
		require_node("PlaceBlockButton2") as Button,
		require_node("PlaceBlockButton3") as Button
	]
	block_previews = [
		require_node("BlockPreview1") as Control,
		require_node("BlockPreview2") as Control,
		require_node("BlockPreview3") as Control
	]
	block_height_labels = [
		require_node("BlockHeightLabel1") as Label,
		require_node("BlockHeightLabel2") as Label,
		require_node("BlockHeightLabel3") as Label
	]
	block_name_labels = [
		require_node("BlockNameLabel1") as Label,
		require_node("BlockNameLabel2") as Label,
		require_node("BlockNameLabel3") as Label
	]
	cooldown_overlays = []
	for button in inventory_buttons:
		cooldown_overlays.append(button.get_node_or_null("CooldownOverlay") as Control)
	quick_chat_buttons = [
		optional_node("QuickChatButton1") as Button,
		optional_node("QuickChatButton2") as Button,
		optional_node("QuickChatButton3") as Button
	]
	power_buttons = [optional_node("PowerButton1") as Button, optional_node("PowerButton2") as Button, optional_node("PowerButton3") as Button]

	debug_button = optional_node("DebugButton") as Button
	debug_overlay = optional_node("DebugOverlay") as Control
	debug_dim_layer = optional_node("DebugDimLayer") as Control
	reset_debug_button = optional_node("ResetDebugButton") as Button
	close_debug_button = optional_node("CloseDebugButton") as Button
	bots_toggle = optional_node("BotsToggle") as CheckButton
	bot_strategy_button = optional_node("BotStrategyButton") as OptionButton
	bot_count_label = optional_node("BotCountLabel") as Label
	bot_count_slider = optional_node("BotCountSlider") as HSlider
	bot_delay_min_label = optional_node("BotDelayMinLabel") as Label
	bot_delay_min_slider = optional_node("BotDelayMinSlider") as HSlider
	bot_delay_max_label = optional_node("BotDelayMaxLabel") as Label
	bot_delay_max_slider = optional_node("BotDelayMaxSlider") as HSlider
	debug_start_level_label = optional_node("DebugStartLevelLabel") as Label
	debug_start_level_slider = optional_node("DebugStartLevelSlider") as HSlider
	cooldown_label = optional_node("CooldownLabel") as Label
	cooldown_slider = optional_node("CooldownSlider") as HSlider
	level_time_label = optional_node("LevelTimeLabel") as Label
	level_time_slider = optional_node("LevelTimeSlider") as HSlider
	start_delay_label = optional_node("StartDelayLabel") as Label
	start_delay_slider = optional_node("StartDelaySlider") as HSlider
	placement_popup_duration_label = optional_node("PlacementPopupDurationLabel") as Label
	placement_popup_duration_slider = optional_node("PlacementPopupDurationSlider") as HSlider
	finish_popup_duration_label = optional_node("FinishPopupDurationLabel") as Label
	finish_popup_duration_slider = optional_node("FinishPopupDurationSlider") as HSlider
	level_summary_delay_label = optional_node("LevelSummaryDelayLabel") as Label
	level_summary_delay_slider = optional_node("LevelSummaryDelaySlider") as HSlider
	target_multiplier_label = optional_node("TargetMultiplierLabel") as Label
	target_multiplier_slider = optional_node("TargetMultiplierSlider") as HSlider
	level_supply_min_label = optional_node("LevelSupplyMinLabel") as Label
	level_supply_min_slider = optional_node("LevelSupplyMinSlider") as HSlider
	level_supply_max_label = optional_node("LevelSupplyMaxLabel") as Label
	level_supply_max_slider = optional_node("LevelSupplyMaxSlider") as HSlider
	min_precision_blocks_label = optional_node("MinPrecisionBlocksLabel") as Label
	min_precision_blocks_slider = optional_node("MinPrecisionBlocksSlider") as HSlider
	max_team_carry_over_label = optional_node("MaxTeamCarryOverLabel") as Label
	max_team_carry_over_slider = optional_node("MaxTeamCarryOverSlider") as HSlider
	refresh_min_useful_height_label = optional_node("RefreshMinUsefulHeightLabel") as Label
	refresh_min_useful_height_slider = optional_node("RefreshMinUsefulHeightSlider") as HSlider
	placement_score_label = optional_node("PlacementScoreLabel") as Label
	placement_score_slider = optional_node("PlacementScoreSlider") as HSlider
	impact_score_label = optional_node("ImpactScoreLabel") as Label
	impact_score_slider = optional_node("ImpactScoreSlider") as HSlider
	finisher_bonus_label = optional_node("FinisherBonusLabel") as Label
	finisher_bonus_slider = optional_node("FinisherBonusSlider") as HSlider
	precision_bonus_label = optional_node("PrecisionBonusLabel") as Label
	precision_bonus_slider = optional_node("PrecisionBonusSlider") as HSlider
	team_exact_bonus_label = optional_node("TeamExactBonusLabel") as Label
	team_exact_bonus_slider = optional_node("TeamExactBonusSlider") as HSlider
	assist_bonus_label = optional_node("AssistBonusLabel") as Label
	assist_bonus_slider = optional_node("AssistBonusSlider") as HSlider
	assist_threshold_label = optional_node("AssistThresholdLabel") as Label
	assist_threshold_slider = optional_node("AssistThresholdSlider") as HSlider
	tower_overhang_weight_label = optional_node("TowerOverhangWeightLabel") as Label
	tower_overhang_weight_slider = optional_node("TowerOverhangWeightSlider") as HSlider
	tower_max_tilt_label = optional_node("TowerMaxTiltLabel") as Label
	tower_max_tilt_slider = optional_node("TowerMaxTiltSlider") as HSlider
	tower_collapse_threshold_label = optional_node("TowerCollapseThresholdLabel") as Label
	tower_collapse_threshold_slider = optional_node("TowerCollapseThresholdSlider") as HSlider
	tower_warning_threshold_label = optional_node("TowerWarningThresholdLabel") as Label
	tower_warning_threshold_slider = optional_node("TowerWarningThresholdSlider") as HSlider
	tower_critical_threshold_label = optional_node("TowerCriticalThresholdLabel") as Label
	tower_critical_threshold_slider = optional_node("TowerCriticalThresholdSlider") as HSlider
	tower_feedback_mode_button = optional_node("TowerFeedbackModeButton") as OptionButton
	power_unlock_level_label = optional_node("PowerUnlockLevelLabel") as Label
	power_unlock_level_slider = optional_node("PowerUnlockLevelSlider") as HSlider
	power_max_slots_label = optional_node("PowerMaxSlotsLabel") as Label
	power_max_slots_slider = optional_node("PowerMaxSlotsSlider") as HSlider
	power_cooldown_label = optional_node("PowerCooldownLabel") as Label
	power_cooldown_slider = optional_node("PowerCooldownSlider") as HSlider

func require_node(node_name: String) -> Node:
	var node: Node = optional_node(node_name)

	if node == null:
		missing_required_nodes.append(node_name)

	return node

func optional_node(node_name: String) -> Node:
	if ui_root == null:
		return null

	return ui_root.find_child(node_name, true, false)

func setup_inventory_controls() -> void:
	for preview in block_previews:
		preview.cell_color = get_local_player_color()

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

func setup_debug_controls() -> void:
	if debug_button == null:
		return

	debug_button.visible = SHOW_DEBUG_UI
	debug_button.disabled = true
	debug_button.pressed.connect(toggle_debug_overlay)

	if debug_overlay != null:
		set_debug_overlay_open(false)

	if close_debug_button != null:
		close_debug_button.pressed.connect(func(): set_debug_overlay_open(false))

	if reset_debug_button != null:
		reset_debug_button.pressed.connect(on_reset_debug_pressed)

	if debug_dim_layer != null:
		debug_dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
		debug_dim_layer.gui_input.connect(on_debug_dim_layer_input)

	if bots_toggle != null:
		bots_toggle.toggled.connect(on_bots_toggle)

	if bot_strategy_button != null:
		bot_strategy_button.clear()
		bot_strategy_button.add_item("Cooperative", 0)
		bot_strategy_button.add_item("MVP Greedy", 1)
		bot_strategy_button.item_selected.connect(on_bot_strategy_selected)

	configure_slider(bot_count_slider, 0, 2, 1, func(value): send_debug_int("debugBotCount", value))
	configure_slider(bot_delay_min_slider, 250, 10000, 250, func(value): send_debug_int("debugBotDelayMin", value))
	configure_slider(bot_delay_max_slider, 250, 10000, 250, func(value): send_debug_int("debugBotDelayMax", value))
	configure_slider(debug_start_level_slider, 1, 99, 1, func(value): send_debug_int("debugStartLevel", value))
	configure_slider(cooldown_slider, 0, 5000, 250, func(value): send_debug_int("placementCooldown", value))
	configure_slider(level_time_slider, 5000, 120000, 1000, func(value): send_debug_int("levelTimeLimitMs", value))
	configure_slider(start_delay_slider, 0, 10000, 500, func(value): send_debug_int("startDelayMs", value))
	configure_slider(placement_popup_duration_slider, 500, 10000, 500, on_placement_popup_duration_changed)
	configure_slider(finish_popup_duration_slider, 500, 10000, 500, on_finish_popup_duration_changed)
	configure_slider(level_summary_delay_slider, 1000, 10000, 500, on_level_summary_delay_changed)
	configure_slider(target_multiplier_slider, 1, 20, 1, func(value): send_debug_int("targetHeightMultiplier", value))
	configure_slider(level_supply_min_slider, 0, 20, 1, func(value): send_debug_int("levelSupplyMinSurplus", value))
	configure_slider(level_supply_max_slider, 0, 30, 1, func(value): send_debug_int("levelSupplyMaxSurplus", value))
	configure_slider(min_precision_blocks_slider, 0, 9, 1, func(value): send_debug_int("minPrecisionBlocksPerLevel", value))
	configure_slider(max_team_carry_over_slider, 0, 12, 1, func(value): send_debug_int("maxTeamCarryOverBlocks", value))
	configure_slider(refresh_min_useful_height_slider, 1, 6, 1, func(value): send_debug_int("refreshMinUsefulBlockHeight", value))
	configure_slider(placement_score_slider, 1, 25, 1, func(value): send_debug_int("placementScorePerHeight", value))
	configure_slider(impact_score_slider, 0, 50, 5, func(value): send_debug_float("impactMinContributionShare", value / 100.0))
	configure_slider(finisher_bonus_slider, 0, 25, 1, func(value): send_debug_int("finisherBonusPerLevel", value))
	configure_slider(precision_bonus_slider, 0, 25, 1, func(value): send_debug_int("precisionBonusPerLevel", value))
	configure_slider(team_exact_bonus_slider, 0, 25, 1, func(value): send_debug_int("teamExactBonusPerLevel", value))
	configure_slider(assist_bonus_slider, 0, 25, 1, func(value): send_debug_int("assistBonusPerLevel", value))
	configure_slider(assist_threshold_slider, 0, 100, 5, func(value): send_debug_float("assistContributionThreshold", value / 100.0))
	configure_slider(tower_overhang_weight_slider, 0, 100, 5, func(value): send_debug_float("towerOverhangWeight", value / 100.0))
	configure_slider(tower_max_tilt_slider, 5, 60, 1, func(value): send_debug_int("towerMaxTiltAngleDeg", value))
	configure_slider(tower_collapse_threshold_slider, 0.3, 3.0, 0.1, func(value): send_debug_float("towerCollapseTiltScore", value))
	configure_slider(tower_warning_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityWarningThreshold", value))
	configure_slider(tower_critical_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityCriticalThreshold", value))
	configure_slider(power_unlock_level_slider, 1, 20, 1, func(value): send_debug_int("powerUnlockLevel", value))
	configure_slider(power_max_slots_slider, 1, 6, 1, func(value): send_debug_int("powerMaxSlots", value))
	configure_slider(power_cooldown_slider, 0, 30000, 500, func(value): send_debug_int("powerActivationCooldownMs", value))

	if tower_feedback_mode_button != null:
		tower_feedback_mode_button.clear()
		for i in range(TOWER_FEEDBACK_MODES.size()):
			tower_feedback_mode_button.add_item(TOWER_FEEDBACK_MODE_TITLES[i], i)
		tower_feedback_mode_button.item_selected.connect(on_tower_feedback_mode_selected)

	update_debug_labels()

func configure_slider(slider: HSlider, min_value: float, max_value: float, step: float, callback: Callable) -> void:
	if slider == null:
		return

	slider.min_value = min_value
	slider.max_value = max_value
	slider.step = step
	slider.value_changed.connect(callback)

func set_slider_no_signal(slider: HSlider, value: float) -> void:
	if slider != null:
		slider.set_value_no_signal(value)

func get_slider_value(slider: HSlider, fallback: float = 0.0) -> float:
	if slider == null:
		return fallback

	return slider.value

func set_debug_label_text(label: Label, text: String) -> void:
	if label != null:
		label.text = text

func reset_ui() -> void:
	connect_button.text = "Connect"
	status_label.text = "Disconnected"
	player_label.text = "Player -"
	room_label.text = "Room -"
	level_label.text = "Level -"
	timer_label.text = "Time -"
	score_label.text = "Waiting for players"
	current_match_state = ""
	last_placement_sent_at_ms = 0
	cancel_block_drag()
	update_impact_status_ui({})
	height_label.text = "Height 0/0"
	tower_value_label.text = "0 / 0"
	tower_status_label.text = "Connect to start"
	block_label.text = "Inventory"
	set_tower_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	clear_score_popups()
	cancel_pending_level_summary()
	hide_level_summary()
	cancel_block_drag()
	seen_score_event_ids.clear()
	last_level_summary_key = ""
	current_level = 0

func connect_network_signals() -> void:
	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.room_closed.connect(update_room_closed)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)
	NetworkManager.debug_config_updated.connect(update_debug_config)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and debug_overlay != null and debug_overlay.visible:
		set_debug_overlay_open(false)

func _input(event: InputEvent) -> void:
	if is_block_dragging:
		_handle_block_drag_input(event)
	if power_dragging and event is InputEventMouseButton and !event.pressed:
		for target in power_target_buttons:
			if target.get_global_rect().has_point(event.global_position):
				NetworkManager.activate_power(selected_power_slot, str(target.get_meta("player_id")))
		power_dragging = false
		selected_power_slot = -1
		hide_power_drag_ghost()
	if power_dragging and event is InputEventMouseMotion:
		move_power_drag_ghost(event.global_position)
	if power_dragging and event is InputEventScreenDrag:
		move_power_drag_ghost(event.position)

func _process(_delta: float) -> void:
	update_placement_cooldown_overlays()

func on_connect_pressed() -> void:
	NetworkManager.toggle_connection()

func on_block_pressed(index: int) -> void:
	if !can_place_block(index):
		return

	last_placement_sent_at_ms = Time.get_ticks_msec()
	NetworkManager.place_block(index)

func on_quick_chat_pressed(slot: int) -> void:
	if !NetworkManager.is_conn_estab or current_match_state != "playing":
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

	if current_match_state != "playing":
		return false

	if is_block_dragging:
		return true

	return get_placement_cooldown_remaining_ms() <= 0

func get_placement_cooldown_remaining_ms() -> int:
	if last_placement_sent_at_ms <= 0:
		return 0

	var elapsed_ms: int = Time.get_ticks_msec() - last_placement_sent_at_ms
	return maxi(0, placement_cooldown_ms - elapsed_ms)

func update_placement_cooldown_overlays() -> void:
	var ratio: float = 0.0
	if placement_cooldown_ms > 0:
		ratio = float(get_placement_cooldown_remaining_ms()) / float(placement_cooldown_ms)
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
		button.disabled = !has_template or !NetworkManager.is_conn_estab or current_match_state != "playing"

func begin_block_drag(index: int, global_pos: Vector2, pointer_id: int) -> void:
	if drag_preview == null:
		return

	var block: Dictionary = inventory_slot_blocks[index]
	is_block_dragging = true
	drag_slot_index = index
	drag_pointer_id = pointer_id
	drag_preview.cell_color = get_local_player_color()

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
	if debug_overlay == null:
		return

	if debug_overlay.has_method("toggle"):
		debug_overlay.call("toggle")
	else:
		debug_overlay.visible = !debug_overlay.visible

func set_debug_overlay_open(open: bool) -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("set_open"):
		debug_overlay.call("set_open", open)
	else:
		debug_overlay.visible = open

func on_debug_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_debug_overlay_open(false)

func update_status(text: String) -> void:
	status_label.text = text

	if debug_button == null:
		return

	debug_button.disabled = text != "Connected"

func update_connect_button(status: String) -> void:
	if status == "[Connect]":
		connect_button.text = "Connect"
	elif status == "[Disconnect]":
		connect_button.text = "Disconnect"
	else:
		connect_button.text = status.replace("[", "").replace("]", "").strip_edges()

func update_room(data) -> void:
	connect_button.disabled = true
	player_label.text = LOCAL_PLAYER_MARKER + " " + str(data.playerId)
	room_label.text = "Room " + str(int(data.roomId))
	level_label.text = "Level " + str(int(data.level))
	current_level = int(data.get("level", 0))
	seen_score_event_ids.clear()
	last_level_summary_key = ""
	clear_score_popups()
	cancel_pending_level_summary()
	hide_level_summary()
	timer_label.text = "Time -"
	tower_status_label.text = "Match starting"
	set_tower_progress(0, int(data.get("targetHeight", 0)))
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
	current_match_state = ""
	last_placement_sent_at_ms = 0
	cancel_block_drag()
	room_label.text = "Room closed"
	level_label.text = "Level -"
	timer_label.text = "Time -"
	height_label.text = "Height -"
	score_label.text = "Room closed: " + str(data.get("reason", "unknown"))
	update_impact_status_ui({})
	tower_status_label.text = "Room closed"
	block_label.text = "Inventory"
	set_tower_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	set_debug_overlay_open(false)
	clear_score_popups()
	cancel_pending_level_summary()
	hide_level_summary()
	seen_score_event_ids.clear()
	last_level_summary_key = ""
	current_level = 0

func update_game_state(data) -> void:
	var state: String = str(data.get("state", "playing"))
	current_match_state = state

	if state != "playing" and is_block_dragging:
		cancel_block_drag()

	var seconds_remaining: int = int(data.get("secondsRemaining", 0))
	var current_height: int = int(data.get("currentHeight", 0))
	var target_height: int = int(data.get("targetHeight", 0))
	var incoming_level: int = int(data.get("level", 0))
	var players: Array = data.get("players", [])
	var fallback_popup_duration_ms: int = int(data.get("scorePopupDurationMs", SCORE_POPUP_DEFAULT_DURATION_MS))
	placement_score_popup_duration_ms = int(data.get(
		"placementScorePopupDurationMs",
		fallback_popup_duration_ms
	))
	finish_score_popup_duration_ms = int(data.get(
		"finishScorePopupDurationMs",
		fallback_popup_duration_ms
	))
	level_summary_delay_ms = int(data.get("levelSummaryDelayMs", level_summary_delay_ms))

	if incoming_level != current_level:
		current_level = incoming_level
		seen_score_event_ids.clear()
		last_level_summary_key = ""
		clear_score_popups()
		seen_quick_chat_event_ids.clear()
		cancel_pending_level_summary()
		if state != "finished" and state != "failed":
			hide_level_summary()

	update_player_color_map(players)
	update_power_target_ui(players)
	var power_quest_label := optional_node("PowerQuestLabel") as Label
	if power_quest_label != null:
		var side_quest: Variant = data.get("sideQuest", {})
		var quest_label := "Unlocks at Level 4"
		if typeof(side_quest) == TYPE_DICTIONARY:
			quest_label = str(side_quest.get("label", quest_label))
			var completed_by := str(side_quest.get("claimedBy", ""))
			if completed_by != "" or completed_by != null:				
				power_quest_label.modulate = player_color_map.get(completed_by, Color.WHITE)
			else:
				power_quest_label.modulate = Color.WHITE
		else:
			power_quest_label.modulate = Color.WHITE
		power_quest_label.text = "Power Quest\n" + quest_label
	if tower_stack.has_method("set_player_color_map"):
		tower_stack.call("set_player_color_map", player_color_map)

	level_label.text = "Level " + str(incoming_level) + " - " + state.capitalize()
	timer_label.text = "Time " + str(seconds_remaining) + "s"
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
		var prefix: String = LOCAL_PLAYER_MARKER if player_id == NetworkManager.player_id else player_id
		_scores_text += prefix + ": " + str(int(player.get("score", 0))) + " total / " + str(int(player.get("levelScore", 0))) + " level"

		if player_id == NetworkManager.player_id:
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
	update_power_inventory_ui(my_power)
	quick_chat_templates = data.get("quickChatTemplates", quick_chat_templates)
	quick_chat_cooldown_ms = int(data.get("quickChatCooldownMs", quick_chat_cooldown_ms))
	update_quick_chat_buttons()
	process_quick_chat_events(data.get("quickChatEvents", []), players)
	process_power_events(data.get("powerEvents", []))

	var score_popup_wait_seconds: float = process_score_events(data.get("scoreEvents", []), players)

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
	var local_player_color: Color = get_local_player_color()
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
		var is_local_player: bool = player_id == str(NetworkManager.player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			short_player_goals.append(
				get_player_display_name(player_id, []) +
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

func get_local_player_color() -> Color:
	var player_id: String = str(NetworkManager.player_id)
	if player_color_map.has(player_id):
		return player_color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func update_player_color_map(players: Array) -> void:
	var updated_map: Dictionary = {}
	var updated_order: Array[String] = []

	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", ""))
		if player_id != "":
			updated_map[player_id] = PlayerColors.color_for_player_index(i)
			updated_order.append(player_id)

	player_color_map = updated_map
	player_order = updated_order

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
		target.add_theme_color_override("font_color", player_color_map.get(player_id, Color.WHITE))
		target.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.8))
		target.add_theme_constant_override("outline_size", 3)
		target.custom_minimum_size = Vector2(72, 24)
		power_target_box.add_child(target)
		target.set_meta("player_id", player_id)
		power_target_buttons.append(target)
		target.gui_input.connect(func(event):
			if power_dragging and event is InputEventMouseButton and !event.pressed:
				NetworkManager.activate_power(selected_power_slot, player_id)
				power_dragging = false
				selected_power_slot = -1
				hide_power_drag_ghost()
				get_viewport().set_input_as_handled()
			elif power_dragging and event is InputEventScreenTouch and !event.pressed:
				NetworkManager.activate_power(selected_power_slot, player_id)
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
			button.disabled = current_match_state != "playing"
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

func process_score_events(raw_events: Variant, players: Array) -> float:
	var max_popup_duration_seconds: float = 0.0

	if score_popup_layer == null or typeof(raw_events) != TYPE_ARRAY:
		return max_popup_duration_seconds

	for event_value in raw_events:
		if typeof(event_value) != TYPE_DICTIONARY:
			continue

		var event: Dictionary = event_value
		if str(event.get("type", "")) == "team_total":
			continue

		var event_id: String = str(event.get("id", ""))

		if event_id == "":
			event_id = str(event.get("level", current_level)) + ":" + str(event.get("type", "")) + ":" + str(seen_score_event_ids.size())

		if seen_score_event_ids.has(event_id):
			continue

		seen_score_event_ids[event_id] = true
		var popup_duration_seconds: float = get_score_event_popup_duration_seconds(event)
		show_score_event_popup(event, players, popup_duration_seconds)
		max_popup_duration_seconds = maxf(
			max_popup_duration_seconds,
			popup_duration_seconds
		)

	return max_popup_duration_seconds

func process_quick_chat_events(raw_events: Variant, players: Array) -> void:
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
		show_score_event_popup({
			"type": "quick_chat",
			"playerId": player_id,
			"label": get_player_display_name(player_id, players) + ": " + str(event.get("text", ""))
		}, players, 2.5)

func process_power_events(raw_events: Variant) -> void:
	if typeof(raw_events) != TYPE_ARRAY:
		return
	for raw_event in raw_events:
		if typeof(raw_event) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = raw_event
		var meta: Variant = event.get("meta", {})
		if typeof(meta) != TYPE_DICTIONARY:
			continue
		var caster_color: Color = player_color_map.get(str(event.get("playerId", "")), Color.WHITE)
		var target_id := str(event.get("targetPlayerId", ""))
		if bool(meta.get("tintTargetScore", false)) and target_id != "":
			score_tints[target_id] = { "color": caster_color, "until": Time.get_ticks_msec() + 4000 }

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
	score_label.text = ""
	score_label.custom_minimum_size = Vector2(0, max(1, players.size()) * 34)
	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id := str(player.get("id", ""))
		var line: Label = score_line_labels.get(player_id, null)
		if line == null:
			line = Label.new()
			line.add_theme_font_size_override("font_size", 14)
			score_label.add_child(line)
			score_line_labels[player_id] = line
		line.position = Vector2(0, i * 34)
		line.size = Vector2(score_label.size.x, 32)
		var prefix := LOCAL_PLAYER_MARKER if player_id == NetworkManager.player_id else player_id
		line.text = prefix + ": " + str(int(player.get("score", 0))) + " total / " + str(int(player.get("levelScore", 0))) + " level"
		var tint: Dictionary = score_tints.get(player_id, {})
		if !tint.is_empty() and int(tint.get("until", 0)) > Time.get_ticks_msec():
			line.modulate = tint.get("color", Color.WHITE)
		else:
			line.modulate = Color.WHITE

func show_score_event_popup(
	event: Dictionary,
	players: Array,
	popup_duration_seconds: float
) -> void:
	if score_popup_layer == null:
		return

	var event_type: String = str(event.get("type", ""))
	var text: String = get_score_event_text(event, players)

	if text == "":
		return

	var text_color: Color = get_score_event_color(event)
	var is_emphasis: bool = is_emphasis_score_event(event_type)
	var popup_size: Vector2 = get_score_popup_size(event_type)
	var popup: PanelContainer = PanelContainer.new()

	popup.mouse_filter = Control.MOUSE_FILTER_IGNORE
	popup.z_index = 20
	popup.custom_minimum_size = popup_size
	popup.size = popup_size
	popup.pivot_offset = popup_size * 0.5
	popup.modulate.a = 0.0
	popup.scale = Vector2(0.82, 0.82) if is_emphasis else Vector2(0.92, 0.92)
	popup.add_theme_stylebox_override("panel", make_score_popup_style(text_color, is_emphasis))

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)

	var label: Label = Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.add_theme_color_override("font_color", text_color)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.72))
	label.add_theme_constant_override("outline_size", 4)
	label.add_theme_font_size_override("font_size", get_score_popup_font_size(event_type))

	margin.add_child(label)
	popup.add_child(margin)
	score_popup_layer.add_child(popup)

	var start_position: Vector2 = get_score_popup_position(event)
	popup.position = start_position - popup_size * 0.5

	var total_duration_seconds: float = maxf(0.1, popup_duration_seconds)
	var intro_duration_seconds: float = minf(SCORE_POPUP_INTRO_SECONDS, total_duration_seconds * 0.3)
	var fade_duration_seconds: float = get_score_popup_fade_duration_seconds(
		total_duration_seconds,
		intro_duration_seconds,
		event_type
	)
	var hold_duration_seconds: float = maxf(
		0.0,
		total_duration_seconds - intro_duration_seconds - fade_duration_seconds
	)

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 1.0, intro_duration_seconds)
	tween.tween_property(popup, "scale", Vector2(1.08, 1.08) if is_emphasis else Vector2.ONE, intro_duration_seconds)
	tween.set_parallel(false)
	tween.tween_interval(hold_duration_seconds)
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 0.0, fade_duration_seconds)
	tween.tween_property(popup, "position:y", popup.position.y - SCORE_POPUP_FLOAT_DISTANCE, fade_duration_seconds)
	tween.tween_property(popup, "scale", Vector2.ONE, fade_duration_seconds)
	tween.set_parallel(false)
	tween.tween_callback(Callable(popup, "queue_free"))

func get_score_popup_fade_duration_seconds(
	total_duration_seconds: float,
	intro_duration_seconds: float,
	event_type: String
) -> float:
	var available_duration_seconds: float = maxf(
		0.01,
		total_duration_seconds - intro_duration_seconds
	)
	if event_type != "placement":
		var finish_hold_seconds: float = minf(
			available_duration_seconds * FINISH_SCORE_POPUP_MIN_HOLD_RATIO,
			0.5
		)

		return maxf(0.01, available_duration_seconds - finish_hold_seconds)

	var minimum_hold_seconds: float = minf(
		SCORE_POPUP_MIN_HOLD_SECONDS,
		available_duration_seconds * 0.5
	)
	var maximum_fade_seconds: float = maxf(
		0.01,
		available_duration_seconds - minimum_hold_seconds
	)
	var scaled_fade_seconds: float = clampf(
		total_duration_seconds * SCORE_POPUP_FADE_RATIO,
		SCORE_POPUP_MIN_FADE_SECONDS,
		SCORE_POPUP_MAX_FADE_SECONDS
	)

	return minf(maximum_fade_seconds, scaled_fade_seconds)

func clear_score_popups() -> void:
	if score_popup_layer == null:
		return

	for child in score_popup_layer.get_children():
		child.queue_free()

func get_score_event_text(event: Dictionary, players: Array) -> String:
	var event_type: String = str(event.get("type", ""))
	var points: int = int(event.get("points", 0))
	var player_id: String = str(event.get("playerId", ""))

	match event_type:
		"placement":
			return "+" + str(points)
		"finisher_bonus":
			return "FINISH +" + str(points)
		"precision_bonus":
			return "PRECISION +" + str(points)
		"team_exact_bonus":
			return "TEAM +" + str(points)
		"assist_bonus":
			return "ASSIST +" + str(points)
		"exact_finish":
			return "PERFECT FIT"
		"overbuild_finish":
			return "TARGET REACHED +" + str(get_event_overbuild_height(event))
		"mvp":
			return "MVP " + get_player_display_name(player_id, players) + " +" + str(points)
		"impact_failed":
			return "IMPACT FAILED"
		"tower_warning":
			return "TOWER WOBBLING"
		"tower_critical":
			return "TOWER CRITICAL"

	return str(event.get("label", "")).strip_edges()

func get_event_overbuild_height(event: Dictionary) -> int:
	var meta: Variant = event.get("meta", {})

	if typeof(meta) == TYPE_DICTIONARY:
		return int(meta.get("overbuildHeight", event.get("points", 0)))

	return int(event.get("points", 0))

func get_score_event_color(event: Dictionary) -> Color:
	var event_type: String = str(event.get("type", ""))
	var player_id: String = str(event.get("playerId", ""))

	if player_id != "" and player_color_map.has(player_id):
		return player_color_map[player_id]

	if event_type == "exact_finish":
		return Color(1.0, 0.84, 0.26, 1.0)

	if event_type == "team_exact_bonus":
		return Color(0.42, 0.84, 1.0, 1.0)

	if event_type == "impact_failed":
		return Color(1.0, 0.38, 0.28, 1.0)

	if event_type == "tower_warning" or event_type == "tower_critical":
		return Color(1.0, 0.55, 0.2, 1.0)

	return Color(1.0, 1.0, 1.0, 1.0)

func is_emphasis_score_event(event_type: String) -> bool:
	return (
		event_type == "exact_finish" or
		event_type == "mvp" or
		event_type == "impact_failed"
	)

func get_score_popup_size(event_type: String) -> Vector2:
	if event_type == "exact_finish":
		return Vector2(240, 54)

	if (
		event_type == "mvp" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return Vector2(220, 48)

	return Vector2(128, 38)

func get_score_popup_font_size(event_type: String) -> int:
	if event_type == "exact_finish":
		return 24

	if (
		event_type == "mvp" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return 20

	return 16

func make_score_popup_style(accent_color: Color, is_emphasis: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.03, 0.035, 0.045, 0.88 if is_emphasis else 0.78)
	style.border_color = Color(accent_color.r, accent_color.g, accent_color.b, 0.95)
	style.border_width_left = 2 if is_emphasis else 1
	style.border_width_top = 2 if is_emphasis else 1
	style.border_width_right = 2 if is_emphasis else 1
	style.border_width_bottom = 2 if is_emphasis else 1
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	return style

func get_score_popup_position(event: Dictionary) -> Vector2:
	var layer_size: Vector2 = score_popup_layer.size if score_popup_layer != null else get_viewport_rect().size

	if layer_size.x <= 0.0 or layer_size.y <= 0.0:
		layer_size = get_viewport_rect().size

	var event_type: String = str(event.get("type", ""))

	if event_type == "mvp":
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.25)

	if (
		event_type == "exact_finish" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.4)

	var player_id: String = str(event.get("playerId", ""))
	var lane_count: int = max(1, player_order.size())
	var lane_index: int = player_order.find(player_id)

	if lane_index < 0:
		lane_index = 0

	var x: float = layer_size.x * 0.5

	if lane_count > 1:
		x = lerpf(layer_size.x * 0.22, layer_size.x * 0.78, float(lane_index) / float(lane_count - 1))

	var y_offsets: Dictionary = {
		"placement": 0.58,
		"finisher_bonus": 0.5,
		"precision_bonus": 0.44,
		"team_exact_bonus": 0.38,
		"assist_bonus": 0.52
	}
	var y_ratio: float = float(y_offsets.get(event_type, 0.52))

	return Vector2(x, layer_size.y * y_ratio)

func get_score_event_popup_duration_seconds(event: Dictionary) -> float:
	var event_type: String = str(event.get("type", ""))
	var duration_ms: int = finish_score_popup_duration_ms

	if event_type == "placement":
		duration_ms = placement_score_popup_duration_ms

	return max(0.1, float(duration_ms) / 1000.0)

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
	var level_number: int = int(summary.get("level", current_level))
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
		summary_hide_timer.wait_time = clamp(float(level_summary_delay_ms) / 1000.0, 1.0, 10.0)
		summary_hide_timer.start()

func hide_level_summary() -> void:
	if summary_hide_timer != null:
		summary_hide_timer.stop()

	if level_summary_overlay != null:
		level_summary_overlay.visible = false
		level_summary_overlay.modulate.a = 1.0

func get_level_summary_key(summary: Dictionary) -> String:
	return (
		str(summary.get("level", current_level)) + ":" +
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
			result_text += " | Finisher " + get_player_display_name(finisher_id, [])

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
		var is_local_player: bool = player_id == str(NetworkManager.player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			goal_texts.append(
				get_player_display_name(player_id, []) +
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
			get_player_display_name(player_id, []) +
			" " + str(int(failure.get("requiredScore", 0)))
		)

	if failure_texts.is_empty():
		return "Impact L" + str(blocked_level) + " failed"

	return "Impact L" + str(blocked_level) + "\nGoals: " + ", ".join(failure_texts)

func get_level_summary_mvp_text(summary: Dictionary) -> String:
	var mvp_id: String = str(summary.get("mvpId", ""))

	if mvp_id == "":
		return "MVP -"

	return "MVP " + get_player_display_name(mvp_id, []) + " +" + str(int(summary.get("mvpScore", 0)))

func create_level_summary_player_row(player_summary: Dictionary, result: String) -> Control:
	var player_id: String = str(player_summary.get("id", ""))
	var is_mvp: bool = bool(player_summary.get("isMvp", false))
	var player_color: Color = get_player_color(player_id)
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
	name_label.text = ("MVP " if is_mvp else "") + get_player_display_name(player_id, [])
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

func get_player_display_name(player_id: String, _players: Array) -> String:
	if player_id == "":
		return "-"

	if player_id == str(NetworkManager.player_id):
		return LOCAL_PLAYER_MARKER

	return player_id

func get_player_color(player_id: String) -> Color:
	if player_color_map.has(player_id):
		return player_color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func format_summary_reason(reason: String) -> String:
	if reason == "impact_score_requirement":
		return "Impact contribution requirement"

	return reason.replace("_", " ").capitalize()

func on_bots_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	NetworkManager.update_config("debugBotsEnabled", enabled)

func on_reset_debug_pressed() -> void:
	NetworkManager.update_config("resetDebugConfig", true)

func on_bot_strategy_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	var strategy: String = BOT_STRATEGY_COOPERATIVE
	if index == 1:
		strategy = BOT_STRATEGY_MVP_GREEDY

	NetworkManager.update_config("debugBotStrategy", strategy)

func on_tower_feedback_mode_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	if index < 0 or index >= TOWER_FEEDBACK_MODES.size():
		return

	NetworkManager.update_config("towerStabilityFeedbackMode", TOWER_FEEDBACK_MODES[index])

func send_debug_int(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config(key, int(value))

func send_debug_float(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config(key, value)

func on_placement_popup_duration_changed(value: float) -> void:
	placement_score_popup_duration_ms = int(value)
	send_debug_int("placementScorePopupDurationMs", value)

func on_finish_popup_duration_changed(value: float) -> void:
	finish_score_popup_duration_ms = int(value)
	send_debug_int("finishScorePopupDurationMs", value)

func on_level_summary_delay_changed(value: float) -> void:
	level_summary_delay_ms = int(value)
	send_debug_int("levelSummaryDelayMs", value)

func update_debug_config(config) -> void:
	if bots_toggle == null:
		return

	is_syncing_debug_config = true
	placement_cooldown_ms = int(config.get("placementCooldown", placement_cooldown_ms))
	bots_toggle.set_pressed_no_signal(bool(config.get("debugBotsEnabled", false)))
	if bot_strategy_button != null:
		var strategy: String = str(config.get("debugBotStrategy", BOT_STRATEGY_COOPERATIVE))
		var selected_strategy_index: int = 1 if strategy == BOT_STRATEGY_MVP_GREEDY else 0
		bot_strategy_button.select(selected_strategy_index)
	set_slider_no_signal(bot_count_slider, float(config.get("debugBotCount", 0)))
	set_slider_no_signal(bot_delay_min_slider, float(config.get("debugBotDelayMin", 2000)))
	set_slider_no_signal(bot_delay_max_slider, float(config.get("debugBotDelayMax", 5000)))
	set_slider_no_signal(debug_start_level_slider, float(config.get("debugStartLevel", 1)))
	set_slider_no_signal(cooldown_slider, float(config.get("placementCooldown", 2000)))
	set_slider_no_signal(level_time_slider, float(config.get("levelTimeLimitMs", 30000)))
	set_slider_no_signal(start_delay_slider, float(config.get("startDelayMs", 1500)))
	placement_score_popup_duration_ms = int(config.get(
		"placementScorePopupDurationMs",
		SCORE_POPUP_DEFAULT_DURATION_MS
	))
	finish_score_popup_duration_ms = int(config.get(
		"finishScorePopupDurationMs",
		SCORE_POPUP_DEFAULT_DURATION_MS
	))
	level_summary_delay_ms = int(config.get("levelSummaryDelayMs", LEVEL_SUMMARY_DEFAULT_DELAY_MS))
	set_slider_no_signal(
		placement_popup_duration_slider,
		float(config.get("placementScorePopupDurationMs", SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(
		finish_popup_duration_slider,
		float(config.get("finishScorePopupDurationMs", SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(level_summary_delay_slider, float(config.get("levelSummaryDelayMs", LEVEL_SUMMARY_DEFAULT_DELAY_MS)))
	set_slider_no_signal(target_multiplier_slider, float(config.get("targetHeightMultiplier", 3)))
	set_slider_no_signal(level_supply_min_slider, float(config.get("levelSupplyMinSurplus", 0)))
	set_slider_no_signal(level_supply_max_slider, float(config.get("levelSupplyMaxSurplus", 6)))
	set_slider_no_signal(min_precision_blocks_slider, float(config.get("minPrecisionBlocksPerLevel", 2)))
	set_slider_no_signal(max_team_carry_over_slider, float(config.get("maxTeamCarryOverBlocks", 3)))
	set_slider_no_signal(refresh_min_useful_height_slider, float(config.get("refreshMinUsefulBlockHeight", 2)))
	set_slider_no_signal(placement_score_slider, float(config.get("placementScorePerHeight", 10)))
	set_slider_no_signal(
		impact_score_slider,
		float(config.get("impactMinContributionShare", 0.30)) * 100.0
	)
	set_slider_no_signal(finisher_bonus_slider, float(config.get("finisherBonusPerLevel", 4)))
	set_slider_no_signal(precision_bonus_slider, float(config.get("precisionBonusPerLevel", 8)))
	set_slider_no_signal(team_exact_bonus_slider, float(config.get("teamExactBonusPerLevel", 6)))
	set_slider_no_signal(assist_bonus_slider, float(config.get("assistBonusPerLevel", 0)))
	set_slider_no_signal(
		assist_threshold_slider,
		float(config.get("assistContributionThreshold", 0.25)) * 100.0
	)
	set_slider_no_signal(
		tower_overhang_weight_slider,
		float(config.get("towerOverhangWeight", 0.18)) * 100.0
	)
	set_slider_no_signal(tower_max_tilt_slider, float(config.get("towerMaxTiltAngleDeg", 24)))
	set_slider_no_signal(
		tower_collapse_threshold_slider,
		float(config.get("towerCollapseTiltScore", 1.0))
	)
	set_slider_no_signal(
		tower_warning_threshold_slider,
		float(config.get("towerStabilityWarningThreshold", 60))
	)
	set_slider_no_signal(
		tower_critical_threshold_slider,
		float(config.get("towerStabilityCriticalThreshold", 30))
	)
	if tower_feedback_mode_button != null:
		var feedback_mode: String = str(config.get("towerStabilityFeedbackMode", TOWER_FEEDBACK_MODES[0]))
		var feedback_mode_index: int = TOWER_FEEDBACK_MODES.find(feedback_mode)
		tower_feedback_mode_button.select(max(feedback_mode_index, 0))
	set_slider_no_signal(power_unlock_level_slider, float(config.get("powerUnlockLevel", 4)))
	set_slider_no_signal(power_max_slots_slider, float(config.get("powerMaxSlots", 3)))
	set_slider_no_signal(power_cooldown_slider, float(config.get("powerActivationCooldownMs", 3000)))
	update_debug_labels()
	is_syncing_debug_config = false

func update_debug_labels() -> void:
	set_debug_label_text(bot_count_label, "Bot Count: " + str(int(get_slider_value(bot_count_slider))))
	set_debug_label_text(
		bot_delay_min_label,
		"Bot Delay Min: " + str(int(get_slider_value(bot_delay_min_slider, 2000))) + " ms"
	)
	set_debug_label_text(
		bot_delay_max_label,
		"Bot Delay Max: " + str(int(get_slider_value(bot_delay_max_slider, 5000))) + " ms"
	)
	set_debug_label_text(
		debug_start_level_label,
		"Start Level: " + str(int(get_slider_value(debug_start_level_slider, 1)))
	)
	set_debug_label_text(
		cooldown_label,
		"Placement Cooldown: " + str(int(get_slider_value(cooldown_slider, 2000))) + " ms"
	)
	set_debug_label_text(
		level_time_label,
		"Level Time: " + str(int(get_slider_value(level_time_slider, 30000) / 1000.0)) + " sec"
	)
	set_debug_label_text(
		start_delay_label,
		"Start Delay: " + str(int(get_slider_value(start_delay_slider, 1500))) + " ms"
	)
	set_debug_label_text(
		placement_popup_duration_label,
		"Placement Popups: " + str(int(get_slider_value(
			placement_popup_duration_slider,
			SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		finish_popup_duration_label,
		"MVP / Perfect / Team Popups: " + str(int(get_slider_value(
			finish_popup_duration_slider,
			SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		level_summary_delay_label,
		"Level Score Summary: " + str(int(get_slider_value(level_summary_delay_slider, LEVEL_SUMMARY_DEFAULT_DELAY_MS))) + " ms"
	)
	set_debug_label_text(
		target_multiplier_label,
		"Target Multiplier: " + str(int(get_slider_value(target_multiplier_slider, 3)))
	)
	set_debug_label_text(
		level_supply_min_label,
		"Supply Min Surplus: " + str(int(get_slider_value(level_supply_min_slider)))
	)
	set_debug_label_text(
		level_supply_max_label,
		"Supply Max Surplus: " + str(int(get_slider_value(level_supply_max_slider, 6)))
	)
	set_debug_label_text(
		min_precision_blocks_label,
		"Precision Blocks: " + str(int(get_slider_value(min_precision_blocks_slider, 2)))
	)
	set_debug_label_text(
		max_team_carry_over_label,
		"Carry-Over Blocks: " + str(int(get_slider_value(max_team_carry_over_slider, 3)))
	)
	set_debug_label_text(
		refresh_min_useful_height_label,
		"Refresh Useful Height: " + str(int(get_slider_value(refresh_min_useful_height_slider, 2)))
	)
	set_debug_label_text(
		placement_score_label,
		"Placement Score/Height: " + str(int(get_slider_value(placement_score_slider, 10)))
	)
	set_debug_label_text(
		impact_score_label,
		"Impact Share: " + str(int(get_slider_value(impact_score_slider, 30))) + "%"
	)
	set_debug_label_text(
		finisher_bonus_label,
		"Finisher Bonus/Level: " + str(int(get_slider_value(finisher_bonus_slider, 4)))
	)
	set_debug_label_text(
		precision_bonus_label,
		"Precision Bonus/Level: " + str(int(get_slider_value(precision_bonus_slider, 8)))
	)
	set_debug_label_text(
		team_exact_bonus_label,
		"Team Exact Bonus/Level: " + str(int(get_slider_value(team_exact_bonus_slider, 6)))
	)
	var assist_bonus_value: int = int(get_slider_value(assist_bonus_slider, 0))
	set_debug_label_text(
		assist_bonus_label,
		"Assist Bonus/Level: " + ("Off" if assist_bonus_value <= 0 else str(assist_bonus_value))
	)
	set_debug_label_text(
		assist_threshold_label,
		"Assist Threshold: " + str(int(get_slider_value(assist_threshold_slider, 25))) + "%"
	)
	set_debug_label_text(
		tower_overhang_weight_label,
		"Overhang Weight: " + str(int(get_slider_value(tower_overhang_weight_slider, 18))) + "%"
	)
	set_debug_label_text(
		tower_max_tilt_label,
		"Max Tilt Angle: " + str(int(get_slider_value(tower_max_tilt_slider, 24))) + "\u00b0"
	)
	set_debug_label_text(
		tower_collapse_threshold_label,
		"Collapse Threshold: " + ("%.2f" % get_slider_value(tower_collapse_threshold_slider, 1.0))
	)
	set_debug_label_text(
		tower_warning_threshold_label,
		"Warning Threshold: " + str(int(get_slider_value(tower_warning_threshold_slider, 60))) + "%"
	)
	set_debug_label_text(
		tower_critical_threshold_label,
		"Critical Threshold: " + str(int(get_slider_value(tower_critical_threshold_slider, 30))) + "%"
	)
	set_debug_label_text(
		power_unlock_level_label,
		"Power Unlock Level: " + str(int(get_slider_value(power_unlock_level_slider, 4)))
	)
	set_debug_label_text(
		power_max_slots_label,
		"Power Slots: " + str(int(get_slider_value(power_max_slots_slider, 3)))
	)
	set_debug_label_text(
		power_cooldown_label,
		"Power Cooldown: " + ("%.1f" % (get_slider_value(power_cooldown_slider, 3000) / 1000.0)) + " sec"
	)
