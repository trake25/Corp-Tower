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
	"towerStabilityFeedbackMode": "meter_only"
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

func test_apply_config_falls_back_to_defaults_for_missing_keys() -> void:
	harness.main.update_debug_config({})
	assert_eq((harness.find("BotDelayMinSlider") as HSlider).value, 2000.0, "A missing bot delay min should fall back to its default.")
	assert_eq((harness.find("LevelTimeSlider") as HSlider).value, 30000.0, "A missing level time should fall back to its default.")
	assert_false((harness.find("BotsToggle") as CheckButton).button_pressed, "A missing bots flag should fall back to disabled.")

func test_apply_config_refreshes_value_labels() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq((harness.find("CooldownLabel") as Label).text, "Placement Cooldown: 1500 ms", "The cooldown label should reflect the synced slider value.")
	assert_eq((harness.find("LevelTimeLabel") as Label).text, "Level Time: 45 sec", "The level time label should reflect the synced slider value.")
	assert_eq((harness.find("BotCountLabel") as Label).text, "Bot Count: 2", "The bot count label should reflect the synced slider value.")

func test_apply_config_updates_popup_and_summary_durations() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_eq(harness.main.get_score_event_popup_duration_seconds({"type": "placement"}), 4.0, "Placement popups should use the configured placement duration.")
	assert_eq(harness.main.get_score_event_popup_duration_seconds({"type": "mvp"}), 5.0, "Finish popups should use the configured finish duration.")

func test_apply_config_leaves_sync_guard_released() -> void:
	harness.main.update_debug_config(CONFIG_FIXTURE)
	assert_false(bool(harness.main.get("is_syncing_debug_config")) if harness.main.get("is_syncing_debug_config") != null else false, "The sync guard must release after applying a config.")

func test_toggle_debug_overlay_flips_visibility() -> void:
	var overlay: Control = harness.find("DebugOverlay") as Control
	var initial_visibility: bool = overlay.visible
	harness.main.toggle_debug_overlay()
	assert_ne(overlay.visible, initial_visibility, "toggle_debug_overlay should flip the overlay visibility.")
	harness.main.toggle_debug_overlay()
	assert_eq(overlay.visible, initial_visibility, "A second toggle should restore the overlay visibility.")
