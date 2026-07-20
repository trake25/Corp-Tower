extends Node

const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const BOT_STRATEGY_COOPERATIVE := "cooperative"
const BOT_STRATEGY_MVP_GREEDY := "mvp_greedy"
const TOWER_FEEDBACK_MODES := ["warnings_only", "meter_only", "live_preview"]
const TOWER_FEEDBACK_MODE_TITLES := ["Warnings Only", "Meter Only", "Live Preview"]

var tuning
var network
var is_syncing_debug_config: bool = false

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

func bind_nodes(binder) -> void:
	debug_overlay = binder.optional_node("DebugOverlay") as Control
	debug_dim_layer = binder.optional_node("DebugDimLayer") as Control
	reset_debug_button = binder.optional_node("ResetDebugButton") as Button
	close_debug_button = binder.optional_node("CloseDebugButton") as Button
	bots_toggle = binder.optional_node("BotsToggle") as CheckButton
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
	target_multiplier_label = binder.optional_node("TargetMultiplierLabel") as Label
	target_multiplier_slider = binder.optional_node("TargetMultiplierSlider") as HSlider
	level_supply_min_label = binder.optional_node("LevelSupplyMinLabel") as Label
	level_supply_min_slider = binder.optional_node("LevelSupplyMinSlider") as HSlider
	level_supply_max_label = binder.optional_node("LevelSupplyMaxLabel") as Label
	level_supply_max_slider = binder.optional_node("LevelSupplyMaxSlider") as HSlider
	min_precision_blocks_label = binder.optional_node("MinPrecisionBlocksLabel") as Label
	min_precision_blocks_slider = binder.optional_node("MinPrecisionBlocksSlider") as HSlider
	max_team_carry_over_label = binder.optional_node("MaxTeamCarryOverLabel") as Label
	max_team_carry_over_slider = binder.optional_node("MaxTeamCarryOverSlider") as HSlider
	refresh_min_useful_height_label = binder.optional_node("RefreshMinUsefulHeightLabel") as Label
	refresh_min_useful_height_slider = binder.optional_node("RefreshMinUsefulHeightSlider") as HSlider
	placement_score_label = binder.optional_node("PlacementScoreLabel") as Label
	placement_score_slider = binder.optional_node("PlacementScoreSlider") as HSlider
	impact_score_label = binder.optional_node("ImpactScoreLabel") as Label
	impact_score_slider = binder.optional_node("ImpactScoreSlider") as HSlider
	finisher_bonus_label = binder.optional_node("FinisherBonusLabel") as Label
	finisher_bonus_slider = binder.optional_node("FinisherBonusSlider") as HSlider
	precision_bonus_label = binder.optional_node("PrecisionBonusLabel") as Label
	precision_bonus_slider = binder.optional_node("PrecisionBonusSlider") as HSlider
	team_exact_bonus_label = binder.optional_node("TeamExactBonusLabel") as Label
	team_exact_bonus_slider = binder.optional_node("TeamExactBonusSlider") as HSlider
	assist_bonus_label = binder.optional_node("AssistBonusLabel") as Label
	assist_bonus_slider = binder.optional_node("AssistBonusSlider") as HSlider
	assist_threshold_label = binder.optional_node("AssistThresholdLabel") as Label
	assist_threshold_slider = binder.optional_node("AssistThresholdSlider") as HSlider
	tower_overhang_weight_label = binder.optional_node("TowerOverhangWeightLabel") as Label
	tower_overhang_weight_slider = binder.optional_node("TowerOverhangWeightSlider") as HSlider
	tower_max_tilt_label = binder.optional_node("TowerMaxTiltLabel") as Label
	tower_max_tilt_slider = binder.optional_node("TowerMaxTiltSlider") as HSlider
	tower_collapse_threshold_label = binder.optional_node("TowerCollapseThresholdLabel") as Label
	tower_collapse_threshold_slider = binder.optional_node("TowerCollapseThresholdSlider") as HSlider
	tower_warning_threshold_label = binder.optional_node("TowerWarningThresholdLabel") as Label
	tower_warning_threshold_slider = binder.optional_node("TowerWarningThresholdSlider") as HSlider
	tower_critical_threshold_label = binder.optional_node("TowerCriticalThresholdLabel") as Label
	tower_critical_threshold_slider = binder.optional_node("TowerCriticalThresholdSlider") as HSlider
	tower_feedback_mode_button = binder.optional_node("TowerFeedbackModeButton") as OptionButton
	power_unlock_level_label = binder.optional_node("PowerUnlockLevelLabel") as Label
	power_unlock_level_slider = binder.optional_node("PowerUnlockLevelSlider") as HSlider
	power_max_slots_label = binder.optional_node("PowerMaxSlotsLabel") as Label
	power_max_slots_slider = binder.optional_node("PowerMaxSlotsSlider") as HSlider
	power_cooldown_label = binder.optional_node("PowerCooldownLabel") as Label
	power_cooldown_slider = binder.optional_node("PowerCooldownSlider") as HSlider

func setup(tuning_ref, network_ref) -> void:
	tuning = tuning_ref
	network = network_ref

	if debug_overlay != null:
		set_open(false)

	if close_debug_button != null:
		close_debug_button.pressed.connect(func(): set_open(false))

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

func is_open() -> bool:
	return debug_overlay != null and debug_overlay.visible

func on_debug_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_open(false)

func on_bots_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("debugBotsEnabled", enabled)

func on_reset_debug_pressed() -> void:
	network.update_config("resetDebugConfig", true)

func on_bot_strategy_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	var strategy: String = BOT_STRATEGY_COOPERATIVE
	if index == 1:
		strategy = BOT_STRATEGY_MVP_GREEDY

	network.update_config("debugBotStrategy", strategy)

func on_tower_feedback_mode_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	if index < 0 or index >= TOWER_FEEDBACK_MODES.size():
		return

	network.update_config("towerStabilityFeedbackMode", TOWER_FEEDBACK_MODES[index])

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
		"Max Tilt Angle: " + str(int(get_slider_value(tower_max_tilt_slider, 24))) + "°"
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
