extends GutTest

const LevelSummaryControllerScript = preload("res://Cor/Scripts/GameUi/LevelSummaryController.gd")
const PlayerContextScript = preload("res://Cor/Scripts/GameUi/PlayerContext.gd")
const MatchStateScript = preload("res://Cor/Scripts/GameUi/MatchState.gd")
const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
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

const IMPACT_FAILURE_FIXTURE := {
	"level": 4,
	"result": "failed",
	"reason": "impact_score_requirement",
	"blockedLevel": 4,
	"impactScoreStatus": {
		"nextImpactLevel": 4,
		"players": [
			{"id": "P1", "met": false, "score": 12, "requiredScore": 40},
			{"id": "P2", "met": true, "score": 44, "requiredScore": 40},
			{"id": "P3", "met": false, "score": 5, "requiredScore": 40}
		]
	}
}

var controller

func before_each() -> void:
	controller = LevelSummaryControllerScript.new()
	var context = PlayerContextScript.new()
	context.get_local_id = func(): return "P1"
	context.roster = [{"id": "P2", "displayName": "Rocket"}, {"id": "P3", "displayName": "Crane"}]
	controller.setup(context, MatchStateScript.new(), UiTuningScript.new())
	add_child_autofree(controller)

func test_summary_key_composes_identity_fields() -> void:
	assert_eq(controller.get_level_summary_key(SUMMARY_FIXTURE), "3:completed:42:P2:true:0", "The summary key should compose level, result, score, mvp, exact and overbuild fields.")

func test_completed_result_text_shows_perfect_fit_and_finisher() -> void:
	assert_eq(controller.get_level_summary_result_text(SUMMARY_FIXTURE, "completed"), "Perfect Fit | Finisher Rocket", "An exact finish should read Perfect Fit with the finisher name.")

func test_completed_result_text_shows_overbuild() -> void:
	var overbuilt: Dictionary = {"exactFinish": false, "overbuildHeight": 2, "finisherId": ""}
	assert_eq(controller.get_level_summary_result_text(overbuilt, "completed"), "Overbuilt +2", "A non exact finish should read the overbuild height.")

func test_failed_result_text_formats_reason() -> void:
	assert_eq(controller.get_level_summary_result_text({"reason": "time_expired"}, "failed"), "Reason: Time Expired", "Failure reasons should be humanized.")

func test_impact_failure_text_lists_ready_count_local_line_and_goals() -> void:
	var text: String = controller.get_impact_failure_summary_text(IMPACT_FAILURE_FIXTURE)
	var text_lines: PackedStringArray = text.split("\n")
	assert_eq(text_lines[0], "Impact L4  |  1/3 ready", "The first line should show the blocked level and ready count.")
	assert_eq(text_lines[1], "You: 12 / 40", "The second line should show the local player's progress.")
	assert_eq(text_lines[2], "Goals: Crane 40", "The goals line should list only unmet non-local players.")

func test_impact_failure_falls_back_to_failure_list_without_statuses() -> void:
	var fixture: Dictionary = {"blockedLevel": 5, "impactScoreFailures": [{"id": "P3", "requiredScore": 55}]}
	assert_eq(controller.get_impact_failure_summary_text(fixture), "Impact L5\nGoals: Crane 55", "Without player statuses the failure list should drive the goals text.")

func test_mvp_text_resolves_name_and_score() -> void:
	assert_eq(controller.get_level_summary_mvp_text(SUMMARY_FIXTURE), "MVP Rocket +18", "The MVP line should resolve the display name and score.")
	assert_eq(controller.get_level_summary_mvp_text({}), "MVP -", "A missing MVP should read as a dash.")

func test_scene_summary_shows_and_dedupes_by_key() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var scene_summary = harness.main.summary
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0)
	var overlay: Control = harness.find("LevelSummaryOverlay") as Control
	assert_true(overlay.visible, "A queued summary with no popup wait should show immediately.")
	assert_eq((harness.find("LevelSummaryTitleLabel") as Label).text, "Level 3 Complete", "The summary title should show the completed level.")
	assert_eq((harness.find("LevelSummaryPlayersBox") as VBoxContainer).get_child_count(), 2, "Each summarized player should get a row.")
	scene_summary.queue_level_summary_after_score_popups(SUMMARY_FIXTURE, "finished", 0.0)
	assert_true(overlay.visible, "Requeueing the same summary key must not restart or hide the overlay.")

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
