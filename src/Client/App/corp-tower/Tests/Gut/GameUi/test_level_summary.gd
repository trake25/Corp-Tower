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
	"sideQuest": {"id": "exact_finish", "claimedBy": "P1", "rewardId": "replenish"},
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

func terminal_fixture(reason: String = "time_expired") -> Dictionary:
	var fixture := failure_fixture(reason)
	fixture["level"] = 8
	fixture["result"] = "game_over"
	fixture["failureStatus"] = {"gameOver": true, "retriesRemaining": 0}
	fixture["players"] = [
		{"id": "P1", "levelScore": 40, "finalTotalScore": 190, "rollbackTotalScore": 120},
		{"id": "P2", "levelScore": 8, "finalTotalScore": 150, "rollbackTotalScore": 150},
		{"id": "P3", "levelScore": 60, "finalTotalScore": 180, "rollbackTotalScore": 80}
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
	assert_eq((harness.find("LevelSummaryQuestLabel") as Label).text, "QUEST RESULT · Claimed by You · Replenish")
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

func test_consecutive_results_detach_previous_rows_before_current_layout_is_measured() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(320, 640))
	set_result_players(harness)
	var summary = harness.main.summary
	summary.show_level_summary(SUMMARY_FIXTURE, "finished", 3000)
	summary.hide_level_summary()
	summary.last_level_summary_key = ""
	harness.main.players_ctx.roster = [
		{"id": "P4", "displayName": "Drew", "avatarId": ""},
		{"id": "P5", "displayName": "Emery", "avatarId": ""},
		{"id": "P6", "displayName": "Frankie", "avatarId": ""}
	]
	harness.main.players_ctx.update_from_players([
		{"id": "P4"}, {"id": "P5"}, {"id": "P6"}
	])
	var second_outcome := failure_fixture("impact_score_requirement")
	second_outcome["players"] = [
		{"id": "P4", "levelScore": 5, "finalTotalScore": 100, "rollbackTotalScore": 90, "isMvp": false},
		{"id": "P5", "levelScore": 12, "finalTotalScore": 120, "rollbackTotalScore": 120, "isMvp": false},
		{"id": "P6", "levelScore": 8, "finalTotalScore": 110, "rollbackTotalScore": 95, "isMvp": false}
	]
	second_outcome["impactScoreStatus"] = {
		"impactLevel": 3,
		"players": [
			{"id": "P4", "met": true},
			{"id": "P5", "met": false},
			{"id": "P6", "met": true}
		]
	}
	summary.show_level_summary(second_outcome, "failed", 3000)
	var rows := harness.find("LevelSummaryPlayersBox") as VBoxContainer
	assert_eq(rows.get_child_count(), 3)
	assert_eq(rows.get_child(0).name, "LevelSummaryPlayerRow_P5")
	assert_eq(rows.get_child(1).name, "LevelSummaryPlayerRow_P6")
	assert_eq(rows.get_child(2).name, "LevelSummaryPlayerRow_P4")
	assert_null(rows.get_node_or_null("LevelSummaryPlayerRow_P1"))
	assert_null(rows.get_node_or_null("LevelSummaryPlayerRow_P2"))
	assert_null(rows.get_node_or_null("LevelSummaryPlayerRow_P3"))

func test_final_success_and_completed_quest_by_another_player_do_not_preview_next_quest() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["hasNextLevel"] = false
	fixture["nextLevel"] = null
	fixture["sideQuest"] = {"id": "exact_finish", "claimedBy": "P2", "rewardId": "replenish"}
	harness.main.summary.show_level_summary(fixture, "finished", 2000)
	assert_false(harness.main.summary.summary_has_next_level)
	var quest_label := harness.find("LevelSummaryQuestLabel") as Label
	assert_true(quest_label.visible)
	assert_eq(quest_label.text, "QUEST RESULT · Claimed by Blair · Replenish")
	assert_false(quest_label.text.contains("Next Level Quest"))

func test_quest_missed_and_absent_quest_use_only_the_completed_quest_outcome() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var missed: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	missed["sideQuest"] = {"id": "exact_finish", "claimedBy": "", "rewardId": "replenish"}
	harness.main.summary.show_level_summary(missed, "finished")
	var missed_label := harness.find("LevelSummaryQuestLabel") as Label
	assert_true(missed_label.visible)
	assert_eq(missed_label.text, "QUEST RESULT · Unclaimed")
	var missed_text := missed_label.text
	harness.main.summary.hide_level_summary()
	harness.main.summary.last_level_summary_key = ""
	var absent: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	absent["sideQuest"] = null
	harness.main.summary.show_level_summary(absent, "finished")
	assert_false((harness.find("LevelSummaryQuestLabel") as Label).visible)
	assert_ne(missed_text, (harness.find("LevelSummaryQuestLabel") as Label).text)

func test_spectator_results_use_the_ended_quest_result_without_previewing_the_next_quest() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	harness.main.summary.set_spectator_mode(true)
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["sideQuest"] = {"id": "exact_finish", "claimedBy": "P2", "rewardId": "replenish"}
	harness.main.summary.show_level_summary(fixture, "finished", 2000)
	var quest_label := harness.find("LevelSummaryQuestLabel") as Label
	assert_eq(quest_label.text, "QUEST RESULT · Claimed by Blair · Replenish")
	assert_false(quest_label.text.contains("Next Level Quest"))

func test_compact_results_keep_the_reward_bearing_quest_row_inside_the_sheet() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(320, 640))
	set_result_players(harness)
	var fixture: Dictionary = SUMMARY_FIXTURE.duplicate(true)
	fixture["sideQuest"] = {"id": "exact_finish", "claimedBy": "P2", "rewardId": "replenish"}
	harness.main.summary.show_level_summary(fixture, "finished", 2000)
	await get_tree().create_timer(0.20).timeout
	var panel := harness.find("LevelSummaryPanel") as PanelContainer
	var quest_label := harness.find("LevelSummaryQuestLabel") as Label
	var overlay := harness.find("LevelSummaryOverlay") as Control
	assert_true(harness.main.summary.summary_uses_compact_layout)
	assert_true(panel.get_global_rect().encloses(quest_label.get_global_rect()))
	assert_lte(panel.get_global_rect().end.y, overlay.get_global_rect().end.y)

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

func test_results_stays_visible_at_zero_until_authoritative_state_replaces_it() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var summary = harness.main.summary
	summary.show_level_summary(SUMMARY_FIXTURE, "finished", 0)
	summary.summary_deadline_ms = Time.get_ticks_msec() - 1
	summary.update_summary_countdown()
	assert_true((harness.find("LevelSummaryOverlay") as Control).visible)
	assert_eq((harness.find("LevelSummaryCountdownLabel") as Label).text, "NEXT LEVEL…")
	var failed := failure_fixture("time_expired")
	summary.hide_level_summary()
	summary.last_level_summary_key = ""
	summary.show_level_summary(failed, "failed", 0)
	summary.summary_deadline_ms = Time.get_ticks_msec() - 1
	summary.update_summary_countdown()
	assert_eq(
		(harness.find("LevelSummaryCountdownLabel") as Label).text,
		"RETURNING TO SAFE LEVEL 3…"
	)

func test_run_over_bypasses_results_and_uses_restored_standings() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	set_result_players(harness)
	var summary = harness.main.summary
	summary.show_level_summary(terminal_fixture(), "game_over", 1800)
	await get_tree().process_frame
	var root := harness.find("LevelSummaryOverlay") as Control
	var normal_dim := harness.find("LevelSummaryDim") as ColorRect
	var normal_panel := harness.find("LevelSummaryPanel") as PanelContainer
	var terminal_overlay := harness.find("TerminalFailureOverlay") as Control
	assert_true(root.is_visible_in_tree(), "The parent presentation surface remains renderable for Run Over.")
	assert_false(normal_dim.visible, "Run Over uses only its terminal dim treatment.")
	assert_false(normal_panel.visible, "The Stage #4 sheet is hidden rather than layered beneath Run Over.")
	assert_true(terminal_overlay.is_visible_in_tree())
	assert_eq((harness.find("TerminalFailureTitleLabel") as Label).text, "RUN OVER")
	assert_eq((harness.find("TerminalFailureBodyLabel") as Label).text, "TIME EXPIRED")
	assert_eq((harness.find("TerminalFailureStatusLabel") as Label).text, "NO RETRIES REMAINING")
	assert_eq((harness.find("TerminalFailureLevelLabel") as Label).text, "RUN ENDED AT LEVEL 8")
	var rows := harness.find("TerminalFailurePlayersBox") as VBoxContainer
	assert_eq(rows.get_child_count(), 3)
	assert_eq(rows.get_child(0).name, "RunOverPlayerRow_P2", "Final standing uses restored totals.")
	assert_true((harness.find("RunOverYouTag_P1") as Label).visible)
	assert_true((harness.find("RunOverLeaderTag_P2") as Label).visible)
	assert_true((harness.find("TerminalFailureRollbackLabel") as Label).visible)
	assert_eq((harness.find("TerminalFailureRollbackLabel") as Label).text, "190 → 120 FINAL\nRESTORED TO CHECKPOINT")
	assert_null(harness.find("RunOverMvpTag_P2"), "Run Over does not reuse MVP.")
	var panel := harness.find("TerminalFailurePanel") as PanelContainer
	var overlay := harness.find("TerminalFailureOverlay") as Control
	assert_true(panel.is_visible_in_tree())
	assert_true((harness.find("TerminalFailureReturnButton") as Button).is_visible_in_tree())
	assert_true(rows.get_child(0).is_visible_in_tree())
	assert_lte(panel.get_global_rect().end.y, overlay.get_global_rect().end.y)
	assert_eq(panel.theme_type_variation, &"", "Run Over owns a terminal-local panel surface instead of shared glass styling.")
	assert_eq((harness.find("TerminalFailureReturnButton") as Button).theme_type_variation, &"PrimaryButton")
	assert_false((harness.find("TerminalFailureReturnButton") as Button).disabled)
	assert_true((harness.find("RunOverRank_P2") as Label).has_theme_color_override("font_color"))
	assert_true((harness.find("RunOverPlayerName_P2") as Label).has_theme_color_override("font_color"))
	assert_true((harness.find("RunOverPlayerScore_P2") as Label).has_theme_color_override("font_color"))
	summary.hide_level_summary()
	assert_false(root.visible)
	assert_false(terminal_overlay.visible)
	summary.show_level_summary(SUMMARY_FIXTURE, "finished", 1200)
	assert_true(root.visible)
	assert_true(normal_dim.visible)
	assert_true(normal_panel.visible)
	assert_false(terminal_overlay.visible)

func test_run_over_resync_and_return_home_keep_server_authority() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(320, 640))
	set_result_players(harness)
	var summary = harness.main.summary
	var leave_calls: Array = []
	summary.return_home_action = func() -> bool:
		leave_calls.append(true)
		return true
	summary.show_level_summary(terminal_fixture("impact_score_requirement"), "game_over", 1200)
	await get_tree().process_frame
	var panel := harness.find("TerminalFailurePanel") as PanelContainer
	var overlay := harness.find("TerminalFailureOverlay") as Control
	var return_button := harness.find("TerminalFailureReturnButton") as Button
	assert_true(panel.get_global_rect().encloses(return_button.get_global_rect()))
	assert_lte(panel.get_global_rect().end.y, overlay.get_global_rect().end.y)
	var first_deadline: int = summary.terminal_failure_deadline_ms
	summary.show_level_summary(terminal_fixture("impact_score_requirement"), "game_over", 500)
	assert_lt(summary.terminal_failure_deadline_ms, first_deadline)
	summary.terminal_failure_deadline_ms = Time.get_ticks_msec() - 1
	summary.update_terminal_failure_countdown()
	assert_true((harness.find("TerminalFailureOverlay") as Control).visible)
	assert_eq((harness.find("TerminalFailureCountdownLabel") as Label).text, "RETURNING HOME…")
	summary._on_terminal_return_home_pressed()
	summary._on_terminal_return_home_pressed()
	assert_eq(leave_calls.size(), 1)
	assert_true(return_button.disabled)

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
