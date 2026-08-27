extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const SUMMARY_FIXTURE := {
	"level": 3,
	"result": "completed",
	"teamLevelScore": 42,
	"mvpId": "P2",
	"mvpScore": 18,
	"exactFinish": true,
	"overbuildHeight": 0,
	"finisherId": "P2",
	"players": [
		{"id": "P1", "levelScore": 10, "finalTotalScore": 30, "isMvp": false},
		{"id": "P2", "levelScore": 18, "finalTotalScore": 40, "isMvp": true}
	]
}

func test_scene_summary_shows_and_dedupes_by_key() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var scene_summary = harness.main.summary
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0)
	var overlay: Control = harness.find("LevelSummaryOverlay") as Control
	assert_true(overlay.visible, "A queued summary with no popup wait should show immediately.")
	assert_eq((harness.find("LevelSummaryPlayersBox") as VBoxContainer).get_child_count(), 2, "Each summarized player should get a row.")
	assert_true((harness.find("LevelSummaryCountdownLabel") as Label).visible, "The summary should expose its live next-level countdown.")
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0)
	assert_true(overlay.visible, "Requeueing the same summary key must not restart or hide the overlay.")

func test_scene_summary_places_next_level_quest_after_countdown() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["sideQuest"] = {
		"label": "Reach the top and earn special power.",
		"rewardId": "refresh"
	}
	harness.main.summary.show_level_summary(fixture, "finished")
	var quest_label := harness.find("LevelSummaryQuestLabel") as Label
	var countdown_label := harness.find("LevelSummaryCountdownLabel") as Label
	assert_true(quest_label.visible, "An authoritative next-level quest should be visible in the summary.")
	assert_gt(quest_label.get_index(), countdown_label.get_index(), "The next-level quest should follow the transition countdown.")

func test_failed_summary_shows_progress_message_for_non_impact_failure() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["result"] = "failed"
	fixture["failureStatus"] = {"retriesRemaining": 2}
	harness.main.summary.show_level_summary(fixture, "failed")
	var collapse_label := harness.find("LevelSummaryTeamLabel") as Label
	var failures_label := harness.find("LevelSummaryMvpLabel") as Label
	assert_true(collapse_label.visible)
	assert_true(failures_label.visible)
	assert_eq(collapse_label.text, "Reach the top!")
	assert_eq(collapse_label.horizontal_alignment, HORIZONTAL_ALIGNMENT_CENTER, "The collapse status should be centered.")
	assert_eq(failures_label.horizontal_alignment, HORIZONTAL_ALIGNMENT_CENTER, "The failures status should be centered.")

func test_failed_summary_shows_impact_message_for_early_impact_failure() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["level"] = 2
	fixture["result"] = "failed"
	fixture["failureReason"] = "impact_score_requirement"
	fixture["failureStatus"] = {"retriesRemaining": 2}
	harness.main.summary.show_level_summary(fixture, "failed")
	var status_label := harness.find("LevelSummaryTeamLabel") as Label
	assert_eq(status_label.text, "Fill impact bars!")

func test_scene_summary_waits_for_popup_window() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var scene_summary = harness.main.summary
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.2)
	var overlay: Control = harness.find("LevelSummaryOverlay") as Control
	assert_false(overlay.visible, "The summary must stay hidden while score popups play out.")
	await get_tree().create_timer(0.4).timeout
	assert_true(overlay.visible, "The summary should show once the popup window elapses.")

func test_cancel_pending_stops_queued_summary() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var scene_summary = harness.main.summary
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.2)
	scene_summary.cancel_pending_level_summary()
	await get_tree().create_timer(0.4).timeout
	assert_false((harness.find("LevelSummaryOverlay") as Control).visible, "A cancelled pending summary must never show.")

func test_terminal_failure_shows_glass_home_countdown() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var fixture: Dictionary = {
		"level": 4,
		"result": "game_over",
		"reason": "failure_limit_reached",
		"failureStatus": {
			"failureCount": 4,
			"recoverableFailureLimit": 3,
			"retriesRemaining": 0,
			"gameOver": true
		}
	}
	harness.main.summary.show_level_summary(fixture, "game_over")
	assert_true((harness.find("TerminalFailureOverlay") as Control).visible, "The fourth failure should show the terminal glass popup.")
	assert_true((harness.find("TerminalFailureCountdownLabel") as Label).visible, "The terminal popup should expose its Home countdown.")
