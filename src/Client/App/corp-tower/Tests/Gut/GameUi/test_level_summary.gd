extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const SUMMARY_FIXTURE := {
	"level": 3,
	"result": "completed",
	"hasNextLevel": true,
	"nextLevel": 4,
	"teamLevelScore": 42,
	"mvpId": "P2",
	"mvpScore": 18,
	"exactFinish": true,
	"overbuildHeight": 0,
	"finisherId": "P1",
	"sideQuest": {"claimedBy": "P1"},
	"players": [
		{"id": "P1", "levelScore": 10, "finalTotalScore": 30, "isMvp": false},
		{"id": "P2", "levelScore": 18, "finalTotalScore": 40, "isMvp": true},
		{"id": "P3", "levelScore": 6, "finalTotalScore": 25, "isMvp": false}
	]
}

func set_result_players(harness) -> void:
	harness.main.players_ctx.get_local_id = func(): return "P1"
	harness.main.players_ctx.roster = [
		{"id": "P1", "displayName": "Alex", "avatarId": ""},
		{"id": "P2", "displayName": "Blair", "avatarId": ""},
		{"id": "P3", "displayName": "Casey", "avatarId": ""}
	]
	harness.main.players_ctx.update_from_players([
		{"id": "P1"}, {"id": "P2"}, {"id": "P3"}
	])

func failure_fixture(reason: String) -> Dictionary:
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["result"] = "failed"
	fixture["failureReason"] = reason
	fixture["failureStatus"] = {"retriesRemaining": 2}
	fixture["impactScoreStatus"] = {
		"impactLevel": 3,
		"players": [
			{"id": "P1", "met": true},
			{"id": "P2", "met": false},
			{"id": "P3", "met": true}
		]
	}
	fixture["players"] = [
		{"id": "P1", "levelScore": 10, "finalTotalScore": 4870, "rollbackTotalScore": 3760, "isMvp": false},
		{"id": "P2", "levelScore": 18, "finalTotalScore": 4050, "rollbackTotalScore": 4050, "isMvp": true},
		{"id": "P3", "levelScore": 6, "finalTotalScore": 2020, "rollbackTotalScore": 1800, "isMvp": false}
	]
	return fixture

func test_human_success_uses_the_bottom_results_sheet_and_ranked_rows() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	harness.main.summary.show_level_summary(SUMMARY_FIXTURE, "finished", 3000)
	var title := harness.find("LevelSummaryTitleLabel") as Label
	var rows := harness.find("LevelSummaryPlayersBox") as VBoxContainer
	assert_true(title.visible)
	assert_eq(rows.get_child_count(), 3)
	assert_eq(rows.get_child(0).name, "LevelSummaryPlayerRow_P2", "Rows rank by level score.")
	assert_true((harness.find("SummaryYouTag_P1") as Label).visible, "The local row explicitly says YOU.")
	assert_true((harness.find("SummaryMvpTag_P2") as Label).visible, "MVP stays inside its ranked success row.")
	assert_true((harness.find("LevelSummaryTeamLabel") as Label).visible)
	assert_true((harness.find("LevelSummaryQuestLabel") as Label).visible)
	assert_true((harness.find("LevelSummaryProgressRail") as ProgressBar).visible)

func test_local_mvp_retains_both_local_and_mvp_identity_markers() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["mvpId"] = "P1"
	fixture["mvpScore"] = 10
	fixture["players"] = [
		{"id": "P1", "levelScore": 10, "finalTotalScore": 30, "isMvp": true},
		{"id": "P2", "levelScore": 18, "finalTotalScore": 40, "isMvp": false},
		{"id": "P3", "levelScore": 6, "finalTotalScore": 25, "isMvp": false}
	]
	harness.main.summary.show_level_summary(fixture, "finished", 3000)
	assert_true((harness.find("SummaryYouTag_P1") as Label).visible)
	assert_true((harness.find("SummaryMvpTag_P1") as Label).visible)

func test_final_success_and_completed_quest_by_another_player_do_not_preview_next_quest() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["hasNextLevel"] = false
	fixture["nextLevel"] = null
	fixture["sideQuest"] = {"claimedBy": "P2"}
	harness.main.summary.show_level_summary(fixture, "finished", 2000)
	assert_false(harness.main.summary.summary_has_next_level)
	assert_true((harness.find("LevelSummaryQuestLabel") as Label).visible)

func test_quest_missed_and_absent_quest_use_only_the_completed_quest_outcome() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var missed: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	missed["sideQuest"] = {"claimedBy": ""}
	harness.main.summary.show_level_summary(missed, "finished")
	var missed_label := harness.find("LevelSummaryQuestLabel") as Label
	assert_true(missed_label.visible)
	var missed_text := missed_label.text
	harness.main.summary.hide_level_summary()
	harness.main.summary.last_level_summary_key = ""
	var absent: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	absent["sideQuest"] = null
	harness.main.summary.show_level_summary(absent, "finished")
	assert_false((harness.find("LevelSummaryQuestLabel") as Label).visible)
	assert_ne(missed_text, (harness.find("LevelSummaryQuestLabel") as Label).text)

func test_recoverable_failure_shows_reason_rollback_impact_and_safe_retry_copy() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var fixture := failure_fixture("impact_score_requirement")
	harness.main.summary.show_level_summary(fixture, "failed", 3000)
	assert_true((harness.find("LevelSummaryTitleLabel") as Label).visible)
	assert_true((harness.find("LevelSummaryTeamLabel") as Label).visible)
	assert_true((harness.find("LevelSummaryMvpLabel") as Label).visible)
	assert_true((harness.find("SummaryPlayerScore_P1") as Label).visible)
	assert_true((harness.find("SummaryPlayerStatus_P1") as Label).visible)
	assert_true((harness.find("SummaryPlayerStatus_P2") as Label).visible)
	assert_ne(
		(harness.find("SummaryPlayerStatus_P1") as Label).text,
		(harness.find("SummaryPlayerStatus_P2") as Label).text
	)
	assert_true((harness.find("SummaryImpactStatus_P1") as Label).visible)
	assert_true((harness.find("SummaryImpactStatus_P2") as Label).visible)
	assert_false((harness.find("SummaryMvpTag_P2") as Label).visible, "Failures never receive success-path MVP treatment.")

func test_non_impact_failures_do_not_render_impact_row_status() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var summary = harness.main.summary
	var fixture := failure_fixture("time_expired")
	summary.show_level_summary(fixture, "failed", 2000)
	assert_null(harness.find("SummaryImpactStatus_P1"), "Impact status is limited to Impact failures.")

func test_authoritative_remaining_time_controls_the_footer_without_restarting_the_window() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var summary = harness.main.summary
	summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0, Callable(), true, Callable(), 1250)
	var first_wait: float = summary.summary_hide_timer.wait_time
	var first_progress: float = (harness.find("LevelSummaryProgressRail") as ProgressBar).value
	summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0, Callable(), true, Callable(), 600)
	assert_lt(summary.summary_hide_timer.wait_time, first_wait, "A Results-ready resync uses the newer server remainder.")
	assert_lt((harness.find("LevelSummaryProgressRail") as ProgressBar).value, first_progress)

func test_summary_remains_hidden_until_authoritative_results_ready() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var summary = harness.main.summary
	summary.queue_level_summary_after_score_popups(
		SUMMARY_FIXTURE,
		"finished",
		0.0,
		Callable(),
		false
	)
	assert_false((harness.find("LevelSummaryOverlay") as Control).visible, "Results stays hidden until the server marks it ready.")
	summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0, Callable(), true, Callable(), 2000)
	assert_true((harness.find("LevelSummaryOverlay") as Control).visible, "Only the authoritative Results-ready broadcast opens Results.")

func test_spectator_and_terminal_results_keep_their_existing_presentation_paths() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	harness.main.summary.set_spectator_mode(true)
	harness.main.summary.show_level_summary(SUMMARY_FIXTURE, "finished", 3000)
	assert_true((harness.find("LevelSummaryTitleLabel") as Label).visible)
	assert_false((harness.find("LevelSummaryProgressRail") as ProgressBar).visible)
	harness.main.summary.hide_level_summary()
	harness.main.summary.last_level_summary_key = ""
	var terminal := {
		"level": 4,
		"result": "game_over",
		"reason": "failure_limit_reached",
		"failureStatus": {"gameOver": true}
	}
	harness.main.summary.show_level_summary(terminal, "game_over")
	assert_true((harness.find("TerminalFailureOverlay") as Control).visible, "Terminal RUN OVER stays on its dedicated path.")
