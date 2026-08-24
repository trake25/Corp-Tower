extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const CONFIG_FIXTURE := {
	"placementCooldown": 1500,
	"debugBotsEnabled": true,
	"debugBotStrategy": "mvp_greedy",
	"debugBotCount": 2,
	"debugBotDelayMin": 500,
	"debugBotDelayMax": 1000,
	"debugStartLevel": 3,
	"levelTimeLimitMs": 45000,
	"startDelayMs": 2000,
	"placementScorePopupDurationMs": 4000,
	"finishScorePopupDurationMs": 5000,
	"levelSummaryDelayMs": 6000,
	"targetHeightMultiplier": 5,
	"towerStabilityFeedbackMode": "meter_only",
	"towerStabilityMoodThreshold": 12,
	"powerLastChanceEnabled": true,
	"towerStructuralPoseMaxAngleDeg": 7,
	"visualHookImpactBeat": false,
	"visualHookScreenShake": false,
	"visualHookZoomOutMs": 500,
	"visualHookWaveMs": 300,
	"visualHookHoldMs": 200,
	"visualHookShakeMs": 340,
	"placementScorePerHeight": 12,
	"dangerousHeightFloor": 0.4,
	"strongReinforcementActionShare": 0.9,
	"normalCombinedCapActionShare": 1.7,
	"criticalSaveBonusActionShare": 1.1,
	"criticalCombinedCapActionShare": 2.25
}

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func test_apply_config_syncs_sliders_toggles_and_options() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq((harness.find("BotCountSlider") as HSlider).value, 2.0, "The bot count slider should sync from the config payload.")
	assert_eq((harness.find("BotDelayMinSlider") as HSlider).value, 500.0, "The bot delay min slider should sync from the config payload.")
	assert_eq((harness.find("CooldownSlider") as HSlider).value, 1500.0, "The placement cooldown slider should sync from the config payload.")
	assert_true((harness.find("BotsToggle") as CheckButton).button_pressed, "The bots toggle should sync from the config payload.")
	assert_eq((harness.find("BotStrategyButton") as OptionButton).selected, 1, "The MVP greedy strategy should select the second option.")
	assert_eq((harness.find("TowerFeedbackModeButton") as OptionButton).selected, 1, "The meter_only mode should select the second option.")
	assert_eq((harness.find("TowerMaxTiltSlider") as HSlider).value, 7.0, "The pose cap should sync from the config payload.")
	assert_true((harness.find("PowerLastChanceToggle") as CheckButton).button_pressed, "Last Chance should sync from the config payload.")

func test_lobby_debug_context_enables_only_bots() -> void:
	harness.main.set_debug_context("lobby")
	var dropdown := harness.find("DebugCategoryDropdown") as OptionButton

	assert_false(dropdown.is_item_disabled(0), "Bots must be selectable in the public lobby.")
	assert_true(dropdown.is_item_disabled(1), "Round controls must be disabled outside play.")
	assert_true(dropdown.is_item_disabled(dropdown.item_count - 1), "Sign In must be disabled in the lobby.")

func test_play_debug_context_disables_only_sign_in() -> void:
	harness.main.set_debug_context("play")
	var dropdown := harness.find("DebugCategoryDropdown") as OptionButton

	assert_false(dropdown.is_item_disabled(0), "Bots must be selectable during play.")
	assert_false(dropdown.is_item_disabled(1), "Gameplay controls must be selectable during play.")
	assert_true(dropdown.is_item_disabled(dropdown.item_count - 1), "Sign In is not a gameplay category.")

func test_apply_config_falls_back_to_defaults_for_missing_keys() -> void:
	harness.main.update_debug_config({})
	assert_eq((harness.find("BotDelayMinSlider") as HSlider).value, 2000.0, "A missing bot delay min should fall back to its default.")
	assert_eq((harness.find("LevelTimeSlider") as HSlider).value, 30000.0, "A missing level time should fall back to its default.")
	assert_false((harness.find("BotsToggle") as CheckButton).button_pressed, "A missing bots flag should fall back to disabled.")
	assert_false((harness.find("PowerLastChanceToggle") as CheckButton).button_pressed, "A missing Last Chance flag should fall back to disabled.")

func test_last_chance_toggle_lives_in_the_power_category() -> void:
	var toggle: Node = harness.find("PowerLastChanceToggle")
	var rows: Node = harness.find("PowerRows")

	assert_eq(toggle.get_parent(), rows, "Last Chance belongs to the Power category rows.")
	assert_eq(rows.get_parent().name, StringName("Power"), "PowerRows should sit under the Power category panel.")
	assert_eq((toggle as CheckButton).text, "Last Chance: OFF", "Last Chance should label its default disabled state.")

func test_apply_config_refreshes_value_labels() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq((harness.find("CooldownLabel") as Label).text, "Placement Cooldown: 1500 ms", "The cooldown label should reflect the synced slider value.")
	assert_eq((harness.find("LevelTimeLabel") as Label).text, "Level Time: 45 sec", "The level time label should reflect the synced slider value.")
	assert_eq((harness.find("BotCountLabel") as Label).text, "Bot Count: 2", "The bot count label should reflect the synced slider value.")

func test_scoring_table_uses_the_transaction_controls() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	var rows: Node = harness.find("ScoringRows")
	var table_button: Button = harness.find("PlacementScoreTableLabel") as Button

	assert_eq(table_button.get_parent(), rows, "The score table opener belongs to the Scoring category.")
	assert_eq((harness.find("PlacementScoreSlider") as HSlider).value, 12.0)
	assert_eq((harness.find("CriticalSaveBonusSlider") as HSlider).value, 110.0)
	assert_eq((harness.find("CriticalSaveCapSlider") as HSlider).value, 225.0)
	assert_eq((harness.find("PlacementScoreLabel") as Button).text, "Useful Height Rate: 12")
	assert_eq((harness.find("CriticalSaveBonusLabel") as Button).text, "Critical Save Bonus: 110% action")
	assert_null(harness.find("FinisherBonusLabel"), "Completion bonuses are not placement transaction knobs.")

	table_button.pressed.emit()

	assert_true((harness.find("DebugTooltip") as Control).visible, "The score table opens in the shared debug tooltip.")
	var body: String = (harness.find("TooltipBodyLabel") as Label).text
	assert_true(body.contains("CLEAN: +1 / +2 / +3 / +4 HEIGHT"))
	assert_true(body.contains("L1:12/24/36/48"))
	assert_true(body.contains("REPAIR MAX / SAVE"))
	assert_true(body.contains("Full new-risk: 40% clean score."))
	assert_true(body.contains("Critical cap: 225% action."))

func test_apply_config_updates_popup_and_summary_durations() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq(harness.main.score_popups.get_score_event_popup_duration_seconds({"type": "placement"}), 4.0, "Placement popups should use the configured placement duration.")
	assert_eq(harness.main.score_popups.get_score_event_popup_duration_seconds({"type": "mvp"}), 5.0, "Finish popups should use the configured finish duration.")

func test_apply_config_leaves_sync_guard_released() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_false(bool(harness.main.get("is_syncing_debug_config")) if harness.main.get("is_syncing_debug_config") != null else false, "The sync guard must release after applying a config.")

func test_brick_mood_threshold_row_syncs_from_the_config() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq(
		(harness.find("TowerMoodThresholdSlider") as HSlider).value,
		12.0,
		"The brick mood threshold slider should sync from the config payload."
	)
	assert_eq(
		(harness.find("TowerMoodThresholdLabel") as Button).text,
		"Brick Mood Threshold: ±12",
		"The brick mood threshold label should reflect the synced slider value."
	)

# A .tscn declares parents before children, so a row node authored outside its
# category container silently disappears from the panel with only a warning at
# instantiation. Assert the placement, not just that the node resolves.
func test_brick_mood_threshold_row_lives_in_the_tower_category() -> void:
	var label: Node = harness.find("TowerMoodThresholdLabel")
	var slider: Node = harness.find("TowerMoodThresholdSlider")
	var rows: Node = harness.find("TowerRows")

	assert_eq(label.get_parent(), rows, "The mood threshold label belongs to the Tower category rows.")
	assert_eq(slider.get_parent(), rows, "The mood threshold slider belongs to the Tower category rows.")
	assert_eq(
		rows.get_parent().name,
		StringName("Tower"),
		"TowerRows should sit under the Tower category panel."
	)
	assert_gt(
		label.get_index(),
		harness.find("TowerCriticalThresholdSlider").get_index(),
		"The mood threshold row should follow the other display-only feedback rows."
	)

func test_brick_mood_threshold_row_falls_back_to_its_default() -> void:
	harness.main.update_debug_config({})
	assert_eq(
		(harness.find("TowerMoodThresholdSlider") as HSlider).value,
		3.0,
		"A missing brick mood threshold should fall back to its default."
	)

# The row can sync perfectly and still do nothing if the value never reaches the
# renderer that draws the faces -- which is exactly how the knob looked dead.
func test_mood_threshold_reaches_the_tower_renderer() -> void:
	var tower_stack: Node = harness.find("TowerStack")

	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq(
		int(tower_stack.get("mood_threshold")),
		12,
		"A debug_config broadcast should push the mood threshold onto TowerStack."
	)

	harness.main.update_debug_config({})
	assert_eq(
		int(tower_stack.get("mood_threshold")),
		3,
		"A missing mood threshold should fall back to the shared default."
	)

func test_visual_hook_toggles_sync_from_the_config() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_false(
		(harness.find("ImpactBeatToggle") as CheckButton).button_pressed,
		"The Impact beat toggle should sync from the config payload."
	)
	assert_false(
		(harness.find("ScreenShakeToggle") as CheckButton).button_pressed,
		"The screen shake toggle should sync from the config payload."
	)

# Both hooks ship on, so a server too old to send the keys must not read as a
# silent opt-out of the feature.
func test_visual_hook_toggles_default_to_enabled() -> void:
	harness.main.update_debug_config({})
	assert_true(
		(harness.find("ImpactBeatToggle") as CheckButton).button_pressed,
		"A missing Impact beat flag should fall back to enabled."
	)
	assert_true(
		(harness.find("ScreenShakeToggle") as CheckButton).button_pressed,
		"A missing screen shake flag should fall back to enabled."
	)

func test_visual_hook_toggles_live_in_the_hooks_category() -> void:
	var rows: Node = harness.find("HooksRows")

	assert_eq(
		harness.find("ImpactBeatToggle").get_parent(),
		rows,
		"The Impact beat toggle belongs to the Hooks category rows."
	)
	assert_eq(
		harness.find("ScreenShakeToggle").get_parent(),
		rows,
		"The screen shake toggle belongs to the Hooks category rows."
	)
	assert_eq(
		rows.get_parent().name,
		StringName("Hooks"),
		"HooksRows should sit under the Hooks category panel."
	)

func test_visual_hook_durations_sync_from_the_config() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq((harness.find("ImpactBeatZoomOutSlider") as HSlider).value, 500.0, "The zoom-out slider should sync from the config payload.")
	assert_eq((harness.find("ImpactBeatWaveSlider") as HSlider).value, 300.0, "The wave slider should sync from the config payload.")
	assert_eq((harness.find("ImpactBeatHoldSlider") as HSlider).value, 200.0, "The hold slider should sync from the config payload.")
	assert_eq((harness.find("ScreenShakeDurationSlider") as HSlider).value, 340.0, "The screen shake duration slider should sync from the config payload.")
	assert_eq((harness.find("ImpactBeatZoomOutLabel") as Button).text, "Zoom Out: 500 ms", "The zoom-out label should reflect the synced slider value.")
	assert_eq((harness.find("ScreenShakeDurationLabel") as Button).text, "Screen Shake Duration: 340 ms", "The screen shake duration label should reflect the synced slider value.")

func test_visual_hook_durations_fall_back_to_their_defaults() -> void:
	harness.main.update_debug_config({})
	assert_eq((harness.find("ImpactBeatZoomOutSlider") as HSlider).value, 900.0, "A missing zoom-out duration should fall back to its default.")
	assert_eq((harness.find("ImpactBeatWaveSlider") as HSlider).value, 1100.0, "A missing wave duration should fall back to its default.")
	assert_eq((harness.find("ImpactBeatHoldSlider") as HSlider).value, 0.0, "A missing hold duration should fall back to its default.")
	assert_eq((harness.find("ScreenShakeDurationSlider") as HSlider).value, 260.0, "A missing screen shake duration should fall back to its default.")

func test_visual_hook_duration_rows_live_in_the_hooks_category() -> void:
	var rows: Node = harness.find("HooksRows")

	for row_name in [
		"HooksAboutButton",
		"ImpactBeatZoomOutLabel", "ImpactBeatZoomOutSlider",
		"ImpactBeatWaveLabel", "ImpactBeatWaveSlider",
		"ImpactBeatHoldLabel", "ImpactBeatHoldSlider",
		"ScreenShakeDurationLabel", "ScreenShakeDurationSlider",
	]:
		assert_eq(
			harness.find(row_name).get_parent(),
			rows,
			"%s belongs to the Hooks category rows." % row_name
		)

func test_hooks_about_button_opens_the_shared_debug_tooltip() -> void:
	var about_button: Button = harness.find("HooksAboutButton") as Button
	var tooltip: Control = harness.find("DebugTooltip") as Control

	about_button.pressed.emit()

	assert_true(tooltip.visible, "Pressing the About Hooks row should open the shared debug tooltip.")

func test_toggle_debug_overlay_flips_visibility() -> void:
	var overlay: Control = harness.find("DebugOverlay") as Control
	var initial_visibility: bool = overlay.visible
	harness.main.toggle_debug_overlay()
	assert_ne(overlay.visible, initial_visibility, "toggle_debug_overlay should flip the overlay visibility.")
	harness.main.toggle_debug_overlay()
	assert_eq(overlay.visible, initial_visibility, "A second toggle should restore the overlay visibility.")
