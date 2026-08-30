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
	"towerStabilityFeedbackMode": "live_preview",
	"towerStabilityMoodThreshold": 12,
	"showLatencyIndicator": true,
	"powerLastChanceEnabled": true,
	"towerStructuralPoseMaxAngleDeg": 7,
	"visualHookImpactBeat": false,
	"visualHookScreenShake": false,
	"visualHookZoomOutMs": 500,
	"visualHookWaveMs": 300,
	"visualHookHoldMs": 200,
	"visualHookShakeMs": 340,
	"placementScorePerHeight": 12,
	"recoveryHeightScorePercent": 70,
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
	assert_true((harness.find("BotsToggle") as CheckButton).button_pressed, "The bots toggle should sync from the config payload.")
	assert_eq((harness.find("BotStrategyButton") as OptionButton).selected, 1, "The MVP greedy strategy should select the second option.")
	assert_true((harness.find("PowerLastChanceToggle") as CheckButton).button_pressed, "Last Chance should sync from the config payload.")
	assert_true((harness.find("LatencyIndicatorToggle") as CheckButton).button_pressed, "The latency toggle should sync from the config payload.")
	assert_eq((harness.find("RecoveryHeightScoreSlider") as HSlider).value, 70.0)
	assert_eq((harness.find("RecoveryHeightScoreSlider") as HSlider).step, 10.0)
	var feedback := harness.find("TowerFeedbackModeButton") as OptionButton
	assert_eq(feedback.item_count, 2)
	assert_eq(feedback.get_item_text(0), "Warnings Only")
	assert_eq(feedback.get_item_text(1), "Live Preview")

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

func test_mood_threshold_reaches_the_tower_renderer() -> void:
	var tower_stack: Node = harness.find("TowerStack")

	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq(
		int(tower_stack.get("mood_threshold")),
		12,
		"A debug_config broadcast should push the mood threshold onto TowerStack."
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

func test_visual_hook_durations_sync_from_the_config() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq((harness.find("ImpactBeatZoomOutSlider") as HSlider).value, 500.0, "The zoom-out slider should sync from the config payload.")
	assert_eq((harness.find("ImpactBeatWaveSlider") as HSlider).value, 300.0, "The wave slider should sync from the config payload.")
	assert_eq((harness.find("ImpactBeatHoldSlider") as HSlider).value, 200.0, "The hold slider should sync from the config payload.")
	assert_eq((harness.find("ScreenShakeDurationSlider") as HSlider).value, 340.0, "The screen shake duration slider should sync from the config payload.")

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
