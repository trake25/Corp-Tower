extends Node

const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const AccessibilitySettingsScript = preload("res://Cor/Scripts/GameUi/AccessibilitySettings.gd")
const DebugPanelCatalogScript = preload("res://Cor/Scripts/GameUi/DebugPanelCatalog.gd")
const BOT_STRATEGY_COOPERATIVE := DebugPanelCatalogScript.BOT_STRATEGY_COOPERATIVE
const BOT_STRATEGY_MVP_GREEDY := DebugPanelCatalogScript.BOT_STRATEGY_MVP_GREEDY
const TOWER_FEEDBACK_MODES := DebugPanelCatalogScript.TOWER_FEEDBACK_MODES
const TOWER_FEEDBACK_MODE_TITLES := DebugPanelCatalogScript.TOWER_FEEDBACK_MODE_TITLES
const DEBUG_CATEGORY_NAMES := DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES
const DEBUG_CONTEXT_LOBBY := DebugPanelCatalogScript.DEBUG_CONTEXT_LOBBY
const DEBUG_CONTEXT_PLAY := DebugPanelCatalogScript.DEBUG_CONTEXT_PLAY
const DEBUG_TOOLTIPS := DebugPanelCatalogScript.DEBUG_TOOLTIPS
const SCORE_TABLE_AVERAGE_BRICK_HEIGHT := 2.35

var tuning
var network
var is_syncing_debug_config: bool = false

var debug_overlay: Control
var debug_dim_layer: Control
var debug_tooltip: Control
var reset_debug_button: Button
var restart_level_button: Button
var close_debug_button: Button
var category_dropdown: OptionButton
var category_panels: Dictionary = {}
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
var level_supply_min_label: Control
var level_supply_min_slider: HSlider
var level_supply_max_label: Control
var level_supply_max_slider: HSlider
var min_precision_blocks_label: Control
var min_precision_blocks_slider: HSlider
var max_team_carry_over_label: Control
var max_team_carry_over_slider: HSlider
var refresh_min_useful_height_label: Control
var refresh_min_useful_height_slider: HSlider
var placement_score_table_label: Control
var placement_score_label: Control
var placement_score_slider: HSlider
var recovery_height_score_label: Control
var recovery_height_score_slider: HSlider
var impact_score_label: Control
var impact_score_slider: HSlider
var impact_interval_label: Control
var impact_interval_slider: HSlider
var impact_score_floor_label: Control
var impact_score_floor_slider: HSlider
var tower_stability_difficulty_label: Control
var tower_stability_difficulty_slider: HSlider
var tower_lateral_load_share_label: Control
var tower_lateral_load_share_slider: HSlider
var tower_max_tilt_label: Control
var tower_max_tilt_slider: HSlider
var supply_effective_width_label: Control
var supply_effective_width_slider: HSlider
var placement_stability_floor_label: Control
var placement_stability_floor_slider: HSlider
var reinforcement_action_label: Control
var reinforcement_action_slider: HSlider
var critical_save_action_label: Control
var critical_save_action_slider: HSlider
var perfect_build_finisher_label: Control
var perfect_build_finisher_slider: HSlider
var perfect_build_impact_label: Control
var perfect_build_impact_slider: HSlider
var tower_warning_threshold_label: Control
var tower_warning_threshold_slider: HSlider
var tower_critical_threshold_label: Control
var tower_critical_threshold_slider: HSlider
var tower_mood_threshold_label: Control
var tower_mood_threshold_slider: HSlider
var tower_feedback_mode_button: OptionButton
var power_unlock_level_label: Label
var power_unlock_level_slider: HSlider
var power_max_slots_label: Label
var power_max_slots_slider: HSlider
var power_cooldown_label: Label
var power_cooldown_slider: HSlider
var power_replenish_share_label: Control
var power_replenish_share_slider: HSlider
var power_last_chance_toggle: CheckButton
var tutorial_launch_button: Button
var parallel_placement_button: Button
var impact_beat_toggle: CheckButton
var screen_shake_toggle: CheckButton
var latency_indicator_toggle: CheckButton
var impact_beat_zoom_out_label: Control
var impact_beat_zoom_out_slider: HSlider
var impact_beat_wave_label: Control
var impact_beat_wave_slider: HSlider
var impact_beat_hold_label: Control
var impact_beat_hold_slider: HSlider
var screen_shake_duration_label: Control
var screen_shake_duration_slider: HSlider
var accessibility
var on_tutorial_requested: Callable = Callable()
var debug_context := DebugPanelCatalogScript.DEBUG_CONTEXT_PLAY

func bind_nodes(binder) -> void:
	debug_overlay = binder.optional_node("DebugOverlay") as Control
	debug_dim_layer = binder.optional_node("DebugDimLayer") as Control
	debug_tooltip = binder.optional_node("DebugTooltip") as Control
	category_dropdown = binder.optional_node("DebugCategoryDropdown") as OptionButton
	category_panels = {
		"Bots": binder.optional_node("Bots") as Control,
		"Round": binder.optional_node("Round") as Control,
		"UI": binder.optional_node("UI") as Control,
		"Supply": binder.optional_node("Supply") as Control,
		"Scoring": binder.optional_node("Scoring") as Control,
		"Impact": binder.optional_node("Impact") as Control,
		"Tower": binder.optional_node("Tower") as Control,
		"Power": binder.optional_node("Power") as Control,
		"Hooks": binder.optional_node("Hooks") as Control,
		"Sign In": null,
	}
	reset_debug_button = binder.optional_node("ResetDebugButton") as Button
	restart_level_button = binder.optional_node("RestartLevelButton") as Button
	close_debug_button = binder.optional_node("CloseDebugButton") as Button
	bots_toggle = binder.optional_node("BotsToggle") as CheckButton
	impact_beat_toggle = binder.optional_node("ImpactBeatToggle") as CheckButton
	screen_shake_toggle = binder.optional_node("ScreenShakeToggle") as CheckButton
	latency_indicator_toggle = binder.optional_node("LatencyIndicatorToggle") as CheckButton
	bind_tooltip_row(binder, "HooksAboutButton")
	impact_beat_zoom_out_label = bind_tooltip_row(binder, "ImpactBeatZoomOutLabel")
	impact_beat_zoom_out_slider = binder.optional_node("ImpactBeatZoomOutSlider") as HSlider
	impact_beat_wave_label = bind_tooltip_row(binder, "ImpactBeatWaveLabel")
	impact_beat_wave_slider = binder.optional_node("ImpactBeatWaveSlider") as HSlider
	impact_beat_hold_label = bind_tooltip_row(binder, "ImpactBeatHoldLabel")
	impact_beat_hold_slider = binder.optional_node("ImpactBeatHoldSlider") as HSlider
	screen_shake_duration_label = bind_tooltip_row(binder, "ScreenShakeDurationLabel")
	screen_shake_duration_slider = binder.optional_node("ScreenShakeDurationSlider") as HSlider
	bot_strategy_button = binder.optional_node("BotStrategyButton") as OptionButton
	bot_count_label = binder.optional_node("BotCountLabel") as Label
	bot_count_slider = binder.optional_node("BotCountSlider") as HSlider
	bot_delay_min_label = binder.optional_node("BotDelayMinLabel") as Label
	bot_delay_min_slider = binder.optional_node("BotDelayMinSlider") as HSlider
	bot_delay_max_label = binder.optional_node("BotDelayMaxLabel") as Label
	bot_delay_max_slider = binder.optional_node("BotDelayMaxSlider") as HSlider
	debug_start_level_label = binder.optional_node("DebugStartLevelLabel") as Label
	debug_start_level_slider = binder.optional_node("DebugStartLevelSlider") as HSlider
	cooldown_label = binder.optional_node("CooldownLabel") as Label
	cooldown_slider = binder.optional_node("CooldownSlider") as HSlider
	level_time_label = binder.optional_node("LevelTimeLabel") as Label
	level_time_slider = binder.optional_node("LevelTimeSlider") as HSlider
	start_delay_label = binder.optional_node("StartDelayLabel") as Label
	start_delay_slider = binder.optional_node("StartDelaySlider") as HSlider
	placement_popup_duration_label = binder.optional_node("PlacementPopupDurationLabel") as Label
	placement_popup_duration_slider = binder.optional_node("PlacementPopupDurationSlider") as HSlider
	finish_popup_duration_label = binder.optional_node("FinishPopupDurationLabel") as Label
	finish_popup_duration_slider = binder.optional_node("FinishPopupDurationSlider") as HSlider
	level_summary_delay_label = binder.optional_node("LevelSummaryDelayLabel") as Label
	level_summary_delay_slider = binder.optional_node("LevelSummaryDelaySlider") as HSlider
	tutorial_launch_button = binder.optional_node("TutorialLaunchButton") as Button
	parallel_placement_button = binder.optional_node("ParallelPlacementButton") as Button
	target_multiplier_label = binder.optional_node("TargetMultiplierLabel") as Label
	target_multiplier_slider = binder.optional_node("TargetMultiplierSlider") as HSlider
	level_supply_min_label = bind_tooltip_row(binder, "LevelSupplyMinLabel")
	level_supply_min_slider = binder.optional_node("LevelSupplyMinSlider") as HSlider
	level_supply_max_label = bind_tooltip_row(binder, "LevelSupplyMaxLabel")
	level_supply_max_slider = binder.optional_node("LevelSupplyMaxSlider") as HSlider
	min_precision_blocks_label = bind_tooltip_row(binder, "MinPrecisionBlocksLabel")
	min_precision_blocks_slider = binder.optional_node("MinPrecisionBlocksSlider") as HSlider
	max_team_carry_over_label = bind_tooltip_row(binder, "MaxTeamCarryOverLabel")
	max_team_carry_over_slider = binder.optional_node("MaxTeamCarryOverSlider") as HSlider
	refresh_min_useful_height_label = bind_tooltip_row(binder, "RefreshMinUsefulHeightLabel")
	refresh_min_useful_height_slider = binder.optional_node("RefreshMinUsefulHeightSlider") as HSlider
	placement_score_table_label = bind_placement_score_table_row(binder)
	placement_score_label = bind_tooltip_row(binder, "PlacementScoreLabel")
	placement_score_slider = binder.optional_node("PlacementScoreSlider") as HSlider
	recovery_height_score_label = bind_tooltip_row(binder, "RecoveryHeightScoreLabel")
	recovery_height_score_slider = binder.optional_node("RecoveryHeightScoreSlider") as HSlider
	impact_score_label = bind_tooltip_row(binder, "ImpactScoreLabel")
	impact_score_slider = binder.optional_node("ImpactScoreSlider") as HSlider
	impact_interval_label = bind_tooltip_row(binder, "ImpactIntervalLabel")
	impact_interval_slider = binder.optional_node("ImpactIntervalSlider") as HSlider
	impact_score_floor_label = bind_tooltip_row(binder, "ImpactScoreFloorLabel")
	impact_score_floor_slider = binder.optional_node("ImpactScoreFloorSlider") as HSlider
	tower_stability_difficulty_label = bind_tooltip_row(binder, "TowerStabilityDifficultyLabel")
	tower_stability_difficulty_slider = binder.optional_node("TowerStabilityDifficultySlider") as HSlider
	tower_lateral_load_share_label = bind_tooltip_row(binder, "TowerLateralLoadShareLabel")
	tower_lateral_load_share_slider = binder.optional_node("TowerLateralLoadShareSlider") as HSlider
	tower_max_tilt_label = bind_tooltip_row(binder, "TowerMaxTiltLabel")
	tower_max_tilt_slider = binder.optional_node("TowerMaxTiltSlider") as HSlider
	supply_effective_width_label = bind_tooltip_row(binder, "SupplyEffectiveWidthLabel")
	supply_effective_width_slider = binder.optional_node("SupplyEffectiveWidthSlider") as HSlider
	placement_stability_floor_label = bind_tooltip_row(binder, "PlacementStabilityFloorLabel")
	placement_stability_floor_slider = binder.optional_node("PlacementStabilityFloorSlider") as HSlider
	reinforcement_action_label = bind_tooltip_row(binder, "ReinforcementActionLabel")
	reinforcement_action_slider = binder.optional_node("ReinforcementActionSlider") as HSlider
	critical_save_action_label = bind_tooltip_row(binder, "CriticalSaveActionLabel")
	critical_save_action_slider = binder.optional_node("CriticalSaveActionSlider") as HSlider
	perfect_build_finisher_label = bind_tooltip_row(binder, "PerfectBuildFinisherLabel")
	perfect_build_finisher_slider = binder.optional_node("PerfectBuildFinisherSlider") as HSlider
	perfect_build_impact_label = bind_tooltip_row(binder, "PerfectBuildImpactLabel")
	perfect_build_impact_slider = binder.optional_node("PerfectBuildImpactSlider") as HSlider
	tower_warning_threshold_label = bind_tooltip_row(binder, "TowerWarningThresholdLabel")
	tower_warning_threshold_slider = binder.optional_node("TowerWarningThresholdSlider") as HSlider
	tower_critical_threshold_label = bind_tooltip_row(binder, "TowerCriticalThresholdLabel")
	tower_critical_threshold_slider = binder.optional_node("TowerCriticalThresholdSlider") as HSlider
	tower_mood_threshold_label = bind_tooltip_row(binder, "TowerMoodThresholdLabel")
	tower_mood_threshold_slider = binder.optional_node("TowerMoodThresholdSlider") as HSlider
	tower_feedback_mode_button = binder.optional_node("TowerFeedbackModeButton") as OptionButton
	power_unlock_level_label = binder.optional_node("PowerUnlockLevelLabel") as Label
	power_unlock_level_slider = binder.optional_node("PowerUnlockLevelSlider") as HSlider
	power_max_slots_label = binder.optional_node("PowerMaxSlotsLabel") as Label
	power_max_slots_slider = binder.optional_node("PowerMaxSlotsSlider") as HSlider
	power_cooldown_label = binder.optional_node("PowerCooldownLabel") as Label
	power_cooldown_slider = binder.optional_node("PowerCooldownSlider") as HSlider
	power_replenish_share_label = bind_tooltip_row(binder, "PowerReplenishShareLabel")
	power_replenish_share_slider = binder.optional_node("PowerReplenishShareSlider") as HSlider
	power_last_chance_toggle = binder.optional_node("PowerLastChanceToggle") as CheckButton

func setup(
	tuning_ref,
	network_ref,
	on_tutorial_requested_ref: Callable = Callable(),
	accessibility_ref = null
) -> void:
	tuning = tuning_ref
	network = network_ref
	on_tutorial_requested = on_tutorial_requested_ref
	accessibility = accessibility_ref

	if debug_overlay != null:
		set_open(false)

	if close_debug_button != null:
		close_debug_button.pressed.connect(func(): set_open(false))

	if tutorial_launch_button != null:
		tutorial_launch_button.pressed.connect(_on_tutorial_launch_pressed)

	if parallel_placement_button != null:
		parallel_placement_button.pressed.connect(_on_parallel_placement_pressed)

	refresh_accessibility_row()

	if reset_debug_button != null:
		reset_debug_button.pressed.connect(on_reset_debug_pressed)

	if restart_level_button != null:
		restart_level_button.pressed.connect(on_restart_level_pressed)

	if debug_dim_layer != null:
		debug_dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
		debug_dim_layer.gui_input.connect(on_debug_dim_layer_input)

	if bots_toggle != null:
		bots_toggle.toggled.connect(on_bots_toggle)

	if impact_beat_toggle != null:
		impact_beat_toggle.toggled.connect(on_impact_beat_toggle)

	if screen_shake_toggle != null:
		screen_shake_toggle.toggled.connect(on_screen_shake_toggle)

	if latency_indicator_toggle != null:
		latency_indicator_toggle.toggled.connect(on_latency_indicator_toggle)

	if power_last_chance_toggle != null:
		power_last_chance_toggle.toggled.connect(on_power_last_chance_toggle)

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
	configure_slider(recovery_height_score_slider, 0, 100, 10, func(value): send_debug_int("recoveryHeightScorePercent", value))
	configure_slider(impact_score_slider, 0, 50, 5, func(value): send_debug_float("impactMinContributionShare", value / 100.0))
	configure_slider(impact_interval_slider, 1, 10, 1, func(value): send_debug_int("impactInterval", value))
	configure_slider(impact_score_floor_slider, 0, 5000, 50, func(value): send_debug_int("impactScoreRequirement", value))
	configure_slider(tower_stability_difficulty_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityDifficulty", value))
	configure_slider(tower_lateral_load_share_slider, 0, 100, 5, func(value): send_debug_float("towerLateralLoadShare", value / 100.0))
	configure_slider(tower_max_tilt_slider, 2, 20, 1, func(value): send_debug_int("towerStructuralPoseMaxAngleDeg", value))
	configure_slider(supply_effective_width_slider, 10, 200, 5, func(value): send_debug_float("supplyEffectiveWidthRatio", value / 100.0))
	configure_slider(placement_stability_floor_slider, 10, 100, 5, func(value): send_debug_float("dangerousHeightFloor", value / 100.0))
	configure_slider(reinforcement_action_slider, 10, 200, 5, func(value): send_debug_float("strongReinforcementActionShare", value / 100.0))
	configure_slider(critical_save_action_slider, 10, 500, 10, func(value): send_debug_float("criticalSaveActionShare", value / 100.0))
	configure_slider(perfect_build_finisher_slider, 100, 800, 25, func(value): send_debug_float("perfectBuildFinisherActionShare", value / 100.0))
	configure_slider(perfect_build_impact_slider, 0, 50, 5, func(value): send_debug_float("perfectBuildImpactRequirementShare", value / 100.0))
	configure_slider(tower_warning_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityWarningThreshold", value))
	configure_slider(tower_critical_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityCriticalThreshold", value))
	configure_slider(tower_mood_threshold_slider, 1, 50, 1, func(value): send_debug_int("towerStabilityMoodThreshold", value))
	configure_slider(power_unlock_level_slider, 1, 20, 1, func(value): send_debug_int("powerUnlockLevel", value))
	configure_slider(power_max_slots_slider, 1, 6, 1, func(value): send_debug_int("powerMaxSlots", value))
	configure_slider(power_cooldown_slider, 0, 30000, 500, func(value): send_debug_int("powerActivationCooldownMs", value))
	configure_slider(power_replenish_share_slider, 0, 100, 5, func(value): send_debug_float("powerReplenishPileShare", value / 100.0))
	configure_slider(impact_beat_zoom_out_slider, 100, 2000, 50, func(value): send_debug_int("visualHookZoomOutMs", value))
	configure_slider(impact_beat_wave_slider, 100, 2000, 50, func(value): send_debug_int("visualHookWaveMs", value))
	configure_slider(impact_beat_hold_slider, 0, 3000, 50, func(value): send_debug_int("visualHookHoldMs", value))
	configure_slider(screen_shake_duration_slider, 0, 2000, 20, func(value): send_debug_int("visualHookShakeMs", value))

	if tower_feedback_mode_button != null:
		tower_feedback_mode_button.clear()
		for i in range(DebugPanelCatalogScript.TOWER_FEEDBACK_MODES.size()):
			tower_feedback_mode_button.add_item(DebugPanelCatalogScript.TOWER_FEEDBACK_MODE_TITLES[i], i)
		tower_feedback_mode_button.item_selected.connect(on_tower_feedback_mode_selected)

	setup_category_dropdown()
	set_screen_context(debug_context)
	update_debug_labels()

func setup_category_dropdown() -> void:
	if category_dropdown == null:
		return

	category_dropdown.clear()
	for i in range(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES.size()):
		category_dropdown.add_item(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES[i], i)

	category_dropdown.item_selected.connect(on_category_selected)
	select_first_enabled_category()

func set_screen_context(context: String) -> void:
	debug_context = context

	if category_dropdown == null:
		return

	for i in range(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES.size()):
		category_dropdown.set_item_disabled(i, not is_category_enabled(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES[i]))

	select_first_enabled_category()

func is_category_enabled(category_name: String) -> bool:
	if debug_context == DebugPanelCatalogScript.DEBUG_CONTEXT_LOBBY:
		return category_name == "Bots"

	return debug_context == DebugPanelCatalogScript.DEBUG_CONTEXT_PLAY and category_name != "Sign In"

func select_first_enabled_category() -> void:
	if category_dropdown == null:
		return

	for i in range(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES.size()):
		if is_category_enabled(DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES[i]):
			category_dropdown.select(i)
			on_category_selected(i)
			return

func on_category_selected(index: int) -> void:
	if index < 0 or index >= DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES.size():
		return

	var selected_name: String = DebugPanelCatalogScript.DEBUG_CATEGORY_NAMES[index]
	if not is_category_enabled(selected_name):
		select_first_enabled_category()
		return
	for category_name in category_panels:
		var panel: Control = category_panels[category_name]
		if panel != null:
			panel.visible = (category_name == selected_name)

func open_debug_tooltip(title: String, body: String) -> void:
	if debug_tooltip != null and debug_tooltip.has_method("open"):
		debug_tooltip.call("open", title, body)

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

func set_debug_label_text(label: Control, text: String) -> void:
	if label != null:
		label.set("text", text)

func bind_placement_score_table_row(row_binder) -> Control:
	var node: Control = row_binder.optional_node("PlacementScoreTableLabel") as Control

	if node != null and node.has_signal("pressed"):
		node.connect("pressed", func(): open_debug_tooltip("Placement Score Table", placement_score_table_body()))

	return node

func placement_score_table_body() -> String:
	var height_rate: int = maxi(1, roundi(get_slider_value(placement_score_slider, 10)))
	var recovery_share: int = clampi(roundi(get_slider_value(recovery_height_score_slider, 50)), 0, 100)
	var dangerous_floor: float = clampf(get_slider_value(placement_stability_floor_slider, 35) / 100.0, 0.1, 1.0)
	var repair_share: float = clampf(get_slider_value(reinforcement_action_slider, 200) / 100.0, 0.1, 2.0)
	var critical_share: float = clampf(get_slider_value(critical_save_action_slider, 300) / 100.0, 0.1, 5.0)
	var perfect_share: float = clampf(get_slider_value(perfect_build_finisher_slider, 500) / 100.0, 1.0, 8.0)
	var perfect_impact_share: int = clampi(roundi(get_slider_value(perfect_build_impact_slider, 15)), 0, 50)
	var lines: PackedStringArray = [
		"CLEAN: +1 / +2 / +3 / +4 HEIGHT"
	]

	for level in [1, 5, 10, 25]:
		lines.append("L%d:%d/%d/%d/%d" % [
			level,
			roundi(float(height_rate * level)),
			roundi(float(height_rate * level * 2)),
			roundi(float(height_rate * level * 3)),
			roundi(float(height_rate * level * 4))
		])

	lines.append("REPAIR / SAVE / PERFECT")
	lines.append("RECOVERY: %d%% of clean row value, halved after each rebuild." % recovery_share)

	for level in [1, 5, 10, 25]:
		var action_unit: float = float(level) * float(height_rate) * SCORE_TABLE_AVERAGE_BRICK_HEIGHT
		lines.append("L%d:+%d/+%d/+%d" % [
			level,
			roundi(action_unit * repair_share),
			roundi(action_unit * critical_share),
			roundi(action_unit * perfect_share)
		])

	lines.append("Full new-risk: %d%% clean score." % roundi(dangerous_floor * 100.0))
	lines.append("Perfect Impact: %d%% of each player's current requirement." % perfect_impact_share)
	lines.append("Save: zero-height critical rescue total.")
	lines.append("Repair and useful Height add independently.")

	return "\n".join(lines)

func bind_tooltip_row(row_binder, node_name: String) -> Control:
	var node: Control = row_binder.optional_node(node_name) as Control

	if node == null or not DebugPanelCatalogScript.DEBUG_TOOLTIPS.has(node_name):
		return node

	if node.has_signal("pressed"):
		var info: Dictionary = DebugPanelCatalogScript.DEBUG_TOOLTIPS[node_name]
		node.connect("pressed", func(): open_debug_tooltip(info.title, info.body))

	return node

func toggle() -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("toggle"):
		debug_overlay.call("toggle")
	else:
		debug_overlay.visible = !debug_overlay.visible

func set_open(open: bool) -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("set_open"):
		debug_overlay.call("set_open", open)
	else:
		debug_overlay.visible = open

	if not open and debug_tooltip != null and debug_tooltip.has_method("close"):
		debug_tooltip.call("close")

func is_open() -> bool:
	return debug_overlay != null and debug_overlay.visible

func on_debug_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_open(false)

func on_bots_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("debugBotsEnabled", enabled)

func on_impact_beat_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("visualHookImpactBeat", enabled)

func on_screen_shake_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("visualHookScreenShake", enabled)

func on_latency_indicator_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("showLatencyIndicator", enabled)

func on_power_last_chance_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("powerLastChanceEnabled", enabled)

func on_reset_debug_pressed() -> void:
	network.update_config("resetDebugConfig", true)

func on_restart_level_pressed() -> void:
	network.update_config("restartLevel", true)
	set_open(false)

func _on_tutorial_launch_pressed() -> void:
	set_open(false)
	if on_tutorial_requested.is_valid():
		on_tutorial_requested.call()

func _on_parallel_placement_pressed() -> void:
	if accessibility == null:
		return

	accessibility.toggle(AccessibilitySettingsScript.PARALLEL_PLACEMENT)

func refresh_accessibility_row() -> void:
	if parallel_placement_button == null or accessibility == null:
		return

	var enabled: bool = accessibility.is_enabled(
		AccessibilitySettingsScript.PARALLEL_PLACEMENT
	)
	parallel_placement_button.text = (
		"Parallel Placement: ON" if enabled else "Parallel Placement: OFF"
	)

func on_bot_strategy_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	var strategy: String = DebugPanelCatalogScript.BOT_STRATEGY_COOPERATIVE
	if index == 1:
		strategy = DebugPanelCatalogScript.BOT_STRATEGY_MVP_GREEDY

	network.update_config("debugBotStrategy", strategy)

func on_tower_feedback_mode_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	if index < 0 or index >= DebugPanelCatalogScript.TOWER_FEEDBACK_MODES.size():
		return

	network.update_config("towerStabilityFeedbackMode", DebugPanelCatalogScript.TOWER_FEEDBACK_MODES[index])

func send_debug_int(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	network.update_config(key, int(value))

func send_debug_float(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	network.update_config(key, value)

func on_placement_popup_duration_changed(value: float) -> void:
	tuning.placement_score_popup_duration_ms = int(value)
	send_debug_int("placementScorePopupDurationMs", value)

func on_finish_popup_duration_changed(value: float) -> void:
	tuning.finish_score_popup_duration_ms = int(value)
	send_debug_int("finishScorePopupDurationMs", value)

func on_level_summary_delay_changed(value: float) -> void:
	tuning.level_summary_delay_ms = int(value)
	send_debug_int("levelSummaryDelayMs", value)

func apply_config(config) -> void:
	if bots_toggle == null:
		return

	is_syncing_debug_config = true
	tuning.placement_cooldown_ms = int(config.get("placementCooldown", tuning.placement_cooldown_ms))
	bots_toggle.set_pressed_no_signal(bool(config.get("debugBotsEnabled", false)))
	if impact_beat_toggle != null:
		impact_beat_toggle.set_pressed_no_signal(
			bool(config.get("visualHookImpactBeat", true))
		)
	if screen_shake_toggle != null:
		screen_shake_toggle.set_pressed_no_signal(
			bool(config.get("visualHookScreenShake", true))
		)
	if latency_indicator_toggle != null:
		latency_indicator_toggle.set_pressed_no_signal(
			bool(config.get("showLatencyIndicator", false))
		)
	if bot_strategy_button != null:
		var strategy: String = str(config.get("debugBotStrategy", DebugPanelCatalogScript.BOT_STRATEGY_COOPERATIVE))
		var selected_strategy_index: int = 1 if strategy == DebugPanelCatalogScript.BOT_STRATEGY_MVP_GREEDY else 0
		bot_strategy_button.select(selected_strategy_index)
	set_slider_no_signal(bot_count_slider, float(config.get("debugBotCount", 0)))
	set_slider_no_signal(bot_delay_min_slider, float(config.get("debugBotDelayMin", 2000)))
	set_slider_no_signal(bot_delay_max_slider, float(config.get("debugBotDelayMax", 5000)))
	set_slider_no_signal(debug_start_level_slider, float(config.get("debugStartLevel", 1)))
	set_slider_no_signal(cooldown_slider, float(config.get("placementCooldown", 2000)))
	set_slider_no_signal(level_time_slider, float(config.get("levelTimeLimitMs", 30000)))
	set_slider_no_signal(start_delay_slider, float(config.get("startDelayMs", 4000)))
	tuning.placement_score_popup_duration_ms = int(config.get(
		"placementScorePopupDurationMs",
		UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
	))
	tuning.finish_score_popup_duration_ms = int(config.get(
		"finishScorePopupDurationMs",
		UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
	))
	tuning.level_summary_delay_ms = int(config.get("levelSummaryDelayMs", UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS))
	set_slider_no_signal(
		placement_popup_duration_slider,
		float(config.get("placementScorePopupDurationMs", UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(
		finish_popup_duration_slider,
		float(config.get("finishScorePopupDurationMs", UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(level_summary_delay_slider, float(config.get("levelSummaryDelayMs", UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS)))
	set_slider_no_signal(target_multiplier_slider, float(config.get("targetHeightMultiplier", 3)))
	set_slider_no_signal(level_supply_min_slider, float(config.get("levelSupplyMinSurplus", 0)))
	set_slider_no_signal(level_supply_max_slider, float(config.get("levelSupplyMaxSurplus", 6)))
	set_slider_no_signal(min_precision_blocks_slider, float(config.get("minPrecisionBlocksPerLevel", 2)))
	set_slider_no_signal(max_team_carry_over_slider, float(config.get("maxTeamCarryOverBlocks", 3)))
	set_slider_no_signal(refresh_min_useful_height_slider, float(config.get("refreshMinUsefulBlockHeight", 2)))
	set_slider_no_signal(placement_score_slider, float(config.get("placementScorePerHeight", 10)))
	set_slider_no_signal(recovery_height_score_slider, float(config.get("recoveryHeightScorePercent", 50)))
	set_slider_no_signal(
		impact_interval_slider,
		float(config.get("impactInterval", 1))
	)
	set_slider_no_signal(
		impact_score_floor_slider,
		float(config.get("impactScoreRequirement", 0))
	)
	set_slider_no_signal(
		impact_score_slider,
		float(config.get("impactMinContributionShare", 0.30)) * 100.0
	)
	set_slider_no_signal(
		tower_stability_difficulty_slider,
		float(config.get("towerStabilityDifficulty", 25))
	)
	set_slider_no_signal(
		tower_lateral_load_share_slider,
		float(config.get("towerLateralLoadShare", 0.4)) * 100.0
	)
	set_slider_no_signal(tower_max_tilt_slider, float(config.get("towerStructuralPoseMaxAngleDeg", 10)))
	set_slider_no_signal(
		supply_effective_width_slider,
		float(config.get("supplyEffectiveWidthRatio", 0.5)) * 100.0
	)
	set_slider_no_signal(
		placement_stability_floor_slider,
		float(config.get("dangerousHeightFloor", 0.35)) * 100.0
	)
	set_slider_no_signal(
		reinforcement_action_slider,
		float(config.get("strongReinforcementActionShare", 2.0)) * 100.0
	)
	set_slider_no_signal(
		critical_save_action_slider,
		float(config.get("criticalSaveActionShare", 3.0)) * 100.0
	)
	set_slider_no_signal(
		perfect_build_finisher_slider,
		float(config.get("perfectBuildFinisherActionShare", 5.0)) * 100.0
	)
	set_slider_no_signal(
		perfect_build_impact_slider,
		float(config.get("perfectBuildImpactRequirementShare", 0.15)) * 100.0
	)
	set_slider_no_signal(
		tower_warning_threshold_slider,
		float(config.get("towerStabilityWarningThreshold", 60))
	)
	set_slider_no_signal(
		tower_critical_threshold_slider,
		float(config.get("towerStabilityCriticalThreshold", 30))
	)
	set_slider_no_signal(
		tower_mood_threshold_slider,
		float(config.get("towerStabilityMoodThreshold", 3))
	)
	if tower_feedback_mode_button != null:
		var feedback_mode: String = str(config.get("towerStabilityFeedbackMode", DebugPanelCatalogScript.TOWER_FEEDBACK_MODES[0]))
		var feedback_mode_index: int = DebugPanelCatalogScript.TOWER_FEEDBACK_MODES.find(feedback_mode)
		tower_feedback_mode_button.select(max(feedback_mode_index, 0))
	set_slider_no_signal(power_unlock_level_slider, float(config.get("powerUnlockLevel", 4)))
	set_slider_no_signal(power_max_slots_slider, float(config.get("powerMaxSlots", 3)))
	set_slider_no_signal(power_cooldown_slider, float(config.get("powerActivationCooldownMs", 3000)))
	set_slider_no_signal(power_replenish_share_slider, float(config.get("powerReplenishPileShare", 0.25)) * 100.0)
	if power_last_chance_toggle != null:
		power_last_chance_toggle.button_pressed = bool(config.get("powerLastChanceEnabled", false))
	set_slider_no_signal(impact_beat_zoom_out_slider, float(config.get("visualHookZoomOutMs", 900)))
	set_slider_no_signal(impact_beat_wave_slider, float(config.get("visualHookWaveMs", 1100)))
	set_slider_no_signal(impact_beat_hold_slider, float(config.get("visualHookHoldMs", 0)))
	set_slider_no_signal(screen_shake_duration_slider, float(config.get("visualHookShakeMs", 260)))
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
		"Start Delay: " + str(int(get_slider_value(start_delay_slider, 4000))) + " ms"
	)
	set_debug_label_text(
		placement_popup_duration_label,
		"Placement Popups: " + str(int(get_slider_value(
			placement_popup_duration_slider,
			UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		finish_popup_duration_label,
		"MVP / Perfect / Team Popups: " + str(int(get_slider_value(
			finish_popup_duration_slider,
			UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		level_summary_delay_label,
		"Level Score Summary: " + str(int(get_slider_value(level_summary_delay_slider, UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS))) + " ms"
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
		"Useful Height Rate: " + str(int(get_slider_value(placement_score_slider, 10)))
	)
	set_debug_label_text(
		recovery_height_score_label,
		"Recovery Height Score: " + str(int(get_slider_value(recovery_height_score_slider, 50))) + "%"
	)
	set_debug_label_text(
		supply_effective_width_label,
		"Supply Effective Width: " + str(int(get_slider_value(supply_effective_width_slider, 50))) + "%"
	)
	set_debug_label_text(
		placement_stability_floor_label,
		"Dangerous Height Floor: " + str(int(get_slider_value(placement_stability_floor_slider, 35))) + "%"
	)
	set_debug_label_text(
		reinforcement_action_label,
		"Strong Reinforcement: " + str(int(get_slider_value(reinforcement_action_slider, 200))) + "% action"
	)
	set_debug_label_text(
		critical_save_action_label,
		"Critical Save Total: " + str(int(get_slider_value(critical_save_action_slider, 300))) + "% action"
	)
	set_debug_label_text(
		perfect_build_finisher_label,
		"Perfect Build Finisher: " + str(int(get_slider_value(perfect_build_finisher_slider, 500))) + "% action"
	)
	set_debug_label_text(
		perfect_build_impact_label,
		"Perfect Build Impact: " + str(int(get_slider_value(perfect_build_impact_slider, 15))) + "% requirement"
	)
	set_debug_label_text(
		impact_score_label,
		"Min Contribution Share: " + str(int(get_slider_value(impact_score_slider, 25))) + "%"
	)
	set_debug_label_text(
		impact_interval_label,
		"Impact Interval: " + str(int(get_slider_value(impact_interval_slider, 1))) + " level(s)"
	)
	set_debug_label_text(
		impact_score_floor_label,
		"Impact Flat Floor: " + str(int(get_slider_value(impact_score_floor_slider, 0)))
	)
	set_debug_label_text(
		tower_stability_difficulty_label,
		"Stability Difficulty: " + str(int(get_slider_value(tower_stability_difficulty_slider, 25)))
	)
	set_debug_label_text(
		tower_lateral_load_share_label,
		"Lateral Load Share: " + str(int(get_slider_value(tower_lateral_load_share_slider, 40))) + "%"
	)
	set_debug_label_text(
		tower_max_tilt_label,
		"Structural Pose Cap: " + str(int(get_slider_value(tower_max_tilt_slider, 10))) + "°"
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
		tower_mood_threshold_label,
		"Brick Mood Threshold: ±" + str(int(get_slider_value(tower_mood_threshold_slider, 3)))
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
	set_debug_label_text(
		power_replenish_share_label,
		"Replenish Share: " + str(int(get_slider_value(power_replenish_share_slider, 25))) + "%"
	)
	if power_last_chance_toggle != null:
		power_last_chance_toggle.text = "Last Chance: " + ("ON" if power_last_chance_toggle.button_pressed else "OFF")
	set_debug_label_text(
		impact_beat_zoom_out_label,
		"Zoom Out: " + str(int(get_slider_value(impact_beat_zoom_out_slider, 900))) + " ms"
	)
	set_debug_label_text(
		impact_beat_wave_label,
		"Wave: " + str(int(get_slider_value(impact_beat_wave_slider, 1100))) + " ms"
	)
	set_debug_label_text(
		impact_beat_hold_label,
		"Hold: " + str(int(get_slider_value(impact_beat_hold_slider, 0))) + " ms"
	)
	set_debug_label_text(
		screen_shake_duration_label,
		"Screen Shake Duration: " + str(int(get_slider_value(screen_shake_duration_slider, 260))) + " ms"
	)
