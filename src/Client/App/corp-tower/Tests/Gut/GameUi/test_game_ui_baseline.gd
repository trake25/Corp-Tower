extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const PLAYERS_FIXTURE := [
	{"id": "P1", "score": 10, "levelScore": 4, "blocks": [], "powerInventory": []},
	{"id": "P2", "score": 8, "levelScore": 2, "blocks": [], "powerInventory": []},
	{"id": "P3", "score": 0, "levelScore": 0, "blocks": [], "powerInventory": []}
]

const GAME_STATE_FIXTURE := {
	"state": "playing",
	"secondsRemaining": 25,
	"currentHeight": 2,
	"targetHeight": 12,
	"level": 1,
	"impactLevel": 3,
	"impactInterval": 3,
	"players": PLAYERS_FIXTURE,
	"towerBlocks": [],
	"scoreEvents": [
		{"id": "e1", "type": "placement", "playerId": "P1", "points": 6, "level": 1},
		{"id": "e2", "type": "placement", "playerId": "P2", "points": 4, "level": 1}
	]
}

const IMPACT_STATUS_FIXTURE := {
	"requiredContribution": 40,
	"nextImpactLevel": 3,
	"players": [
		{"id": "P1", "met": true, "bandContribution": 40, "requiredContribution": 40},
		{"id": "P2", "met": false, "bandContribution": 10, "requiredContribution": 40},
		{"id": "P3", "met": false, "bandContribution": 0, "requiredContribution": 40}
	]
}

const SHAPE_BLOCK_FIXTURE := {"id": "b1", "shapeId": "L2", "cells": [[0, 0], [0, 1]], "height": 2}

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func test_all_required_nodes_bound() -> void:
	assert_true((harness.main.missing_required_nodes as Array).is_empty(), "GameUI must provide every node the controller requires.")

func test_reset_ui_restores_idle_labels() -> void:
	harness.main.reset_ui()
	assert_eq((harness.find("TopIndicatorLabel") as Label).text, "TOP", "reset_ui should reset the top indicator.")
	assert_false((harness.find("ConnectionBanner") as Control).is_visible_in_tree(), "The disconnected banner should stay hidden until its replacement UX is ready.")

func test_legacy_hidden_contract_is_removed() -> void:
	assert_null(harness.find("LegacyHidden"), "The permanently hidden legacy ancestor should not exist.")
	for retired_name in ["ConnectButton", "TowerFill", "HeightLabel", "TowerValueLabel", "TowerStatusLabel", "ImpactSeparator", "PowerQuestLabel", "BlockLabel", "SessionPanel", "PlayerLabel", "RoomLabel"]:
		assert_null(harness.find(retired_name), "%s should be retired instead of retained as a hidden alias." % retired_name)

func test_game_state_renders_rail_and_top_bar() -> void:
	harness.main.update_game_state(GAME_STATE_FIXTURE)
	assert_eq(harness.main.roster.player_rail_entries.size(), 3, "A three player payload should produce three rail entries.")
	assert_eq((harness.find("TopIndicatorLabel") as Label).text, "TOP (2/12)", "The visible top indicator should show the approved label and payload heights.")
	assert_not_null(harness.main.roster.rail_entry("P1").find_child("ScoreLabel"), "The player rail score label is active HUD, not legacy UI.")
	assert_false((harness.find("TowerStabilityLabel") as Label).is_visible_in_tree(), "Tower stability should stay hidden outside the debug meter modes.")
	assert_eq((harness.find("LevelLabel") as Label).text, "1", "The level label should reflect the payload level.")

func test_game_state_passes_structural_pose_to_the_tower_stack() -> void:
	var state: Dictionary = GAME_STATE_FIXTURE.duplicate(true)
	state["towerBlocks"] = [{
		"playerId": "P1",
		"block": {"id": "B1", "shapeId": "O", "cells": [[0, 0], [1, 0], [0, 1], [1, 1]], "height": 2},
		"originX": 3,
		"originY": 0
	}]
	state["towerStructuralPose"] = [{
		"blockId": "B1",
		"offsetXUnits": 0.5,
		"offsetYUnits": -0.1,
		"rotationDeg": 8.0,
		"failureWeight": 0.7
	}]
	harness.main.update_game_state(state)
	var tower: Control = harness.find("TowerStack") as Control
	assert_true(tower.structural_pose.has_pose("B1"), "The TowerStack must receive the server pose alongside towerBlocks.")

func test_top_indicator_uses_only_approved_copy() -> void:
	var label: Label = harness.find("TopIndicatorLabel") as Label
	harness.main.top_bar.set_top_indicator_progress(0, 12)
	assert_eq(label.text, "TOP (0/12)")
	harness.main.top_bar.set_top_indicator_progress(12, 12)
	assert_eq(label.text, "PERFECT BUILD (12/12)")
	harness.main.top_bar.set_top_indicator_progress(13, 12)
	assert_eq(label.text, "OVER BUILD (13/12)")

func test_quest_chip_uses_only_active_and_completed_art() -> void:
	var quest_chip := harness.find("QuestChip") as TextureButton
	harness.main.quest.update_quest_chip({"label": "Reach the top"})
	assert_true(quest_chip.texture_normal.resource_path.ends_with("/9-Play/play-quest-active.png"), "An unclaimed quest should use the active 9-Play state.")
	harness.main.quest.update_quest_chip({"label": "Reach the top", "claimedBy": "P2"})
	assert_true(quest_chip.texture_normal.resource_path.ends_with("/9-Play/play-quest-completed.png"), "A room-wide claim should use the completed 9-Play state.")
	assert_null(harness.find("QuestBadge"), "The retired unread-dot state should not remain in the scene.")

func test_demo_game_state_uses_the_shared_hud_contract() -> void:
	harness.main.demo_mode_label.visible = true
	var state: Dictionary = GAME_STATE_FIXTURE.duplicate(true)
	state["impactScoreStatus"] = IMPACT_STATUS_FIXTURE
	harness.main.update_game_state(state)
	assert_eq((harness.find("TopIndicatorLabel") as Label).text, "TOP (2/12)")
	assert_eq(harness.main.roster.player_rail_entries.size(), 3)
	assert_eq(harness.main.roster.impact_bars.size(), 3)

func test_debug_meter_mode_reveals_stability_label() -> void:
	harness.main.update_debug_config({"towerStabilityFeedbackMode": "meter_only"})
	assert_true((harness.find("TowerStabilityLabel") as Label).is_visible_in_tree(), "The debug meter mode should reveal the stability label.")

func test_score_events_deduplicate_by_id() -> void:
	var layer: Control = harness.find("ScorePopupLayer") as Control
	var first_wait: float = harness.main.score_popups.process_score_events(GAME_STATE_FIXTURE["scoreEvents"], PLAYERS_FIXTURE)
	var popup_count_after_first: int = layer.get_child_count()
	var second_wait: float = harness.main.score_popups.process_score_events(GAME_STATE_FIXTURE["scoreEvents"], PLAYERS_FIXTURE)
	assert_gt(first_wait, 0.0, "New score events should report a popup wait time.")
	assert_eq(second_wait, 0.0, "Replayed score events must not report a popup wait time.")
	assert_eq(layer.get_child_count(), popup_count_after_first, "Replayed score events must not spawn duplicate popups.")

func test_score_popups_use_server_structural_classification() -> void:
	var score_popups = harness.main.score_popups
	var reinforced_placement := {"id": "structural-1", "type": "placement", "playerId": "P1", "points": 12, "meta": {"classification": "reinforcement"}}
	var combined_placement := {"id": "combined-1", "type": "placement", "playerId": "P1", "points": 14, "meta": {"classification": "combined"}}
	var critical_save := {"id": "critical-1", "type": "critical_save", "playerId": "P1", "points": 20}
	var legacy_reinforce := {"id": "legacy-1", "type": "reinforce", "playerId": "P1", "points": 8}

	assert_eq(score_popups.get_score_event_text(reinforced_placement, PLAYERS_FIXTURE), "REINFORCE +12")
	assert_eq(score_popups.get_score_event_text(combined_placement, PLAYERS_FIXTURE), "+14")
	assert_eq(score_popups.get_score_event_text(legacy_reinforce, PLAYERS_FIXTURE), "REINFORCE +8")
	assert_eq(score_popups.get_score_event_text(critical_save, PLAYERS_FIXTURE), "CRITICAL SAVE +20")
	assert_true(score_popups.is_emphasis_score_event("critical_save"))
	assert_eq(score_popups.get_score_popup_size("critical_save"), Vector2(220, 48))
	assert_eq(score_popups.get_score_popup_font_size("critical_save"), 20)
	assert_eq(score_popups.get_score_event_color(critical_save), Color(1.0, 0.78, 0.22, 1.0))
	assert_eq(score_popups.get_score_event_popup_duration_seconds(critical_save), score_popups.get_score_event_popup_duration_seconds({"type": "finisher_bonus"}))
	var critical_position: Vector2 = score_popups.get_score_popup_position(critical_save)
	var critical_size: Vector2 = score_popups.get_score_popup_size("critical_save")
	assert_gte(critical_position.x - critical_size.x * 0.5, 0.0)
	assert_lte(critical_position.x + critical_size.x * 0.5, (harness.find("ScorePopupLayer") as Control).size.x)

	var layer: Control = harness.find("ScorePopupLayer") as Control
	var before_count: int = layer.get_child_count()
	score_popups.process_score_events([combined_placement], PLAYERS_FIXTURE)
	assert_eq(layer.get_child_count(), before_count + 1, "One server placement event must produce one popup.")

func test_team_total_events_never_spawn_popups() -> void:
	var layer: Control = harness.find("ScorePopupLayer") as Control
	var before_count: int = layer.get_child_count()
	harness.main.score_popups.process_score_events([{"id": "t1", "type": "team_total", "points": 20}], PLAYERS_FIXTURE)
	assert_eq(layer.get_child_count(), before_count, "team_total events are aggregate rows, not popups.")

func test_inventory_renders_active_empty_and_locked_slots() -> void:
	harness.main.inventory.update_inventory_ui([SHAPE_BLOCK_FIXTURE], 2)
	assert_false((harness.find("PlaceBlockButton1") as Button).disabled, "A filled slot should stay enabled.")
	assert_true((harness.find("PlaceBlockButton2") as Button).disabled, "An empty slot should be disabled.")
	assert_true((harness.find("PlaceBlockButton3") as Button).disabled, "A slot past the active count should be disabled.")
	for retired_name in ["BlockNameLabel1", "BlockHeightLabel1", "BlockNameLabel2", "BlockHeightLabel2", "BlockNameLabel3", "BlockHeightLabel3"]:
		assert_null(harness.find(retired_name), "%s should not duplicate card state as metadata." % retired_name)

func test_impact_status_renders_track() -> void:
	harness.main.roster.update_impact_status_ui(IMPACT_STATUS_FIXTURE)
	assert_eq(harness.main.roster.impact_bars.size(), 3, "Each impact player status should get a track bar.")
	assert_null(harness.find("ImpactStatusPanel"), "Impact readiness should not duplicate the player bars in a details panel.")
	assert_null(harness.find("ImpactPill"), "The retired Impact heading should not remain above the bars.")
	assert_null(harness.find("ImpactLabel"), "Impact bars should not duplicate their meaning as text.")

func test_empty_impact_status_hides_track() -> void:
	harness.main.roster.update_impact_status_ui(IMPACT_STATUS_FIXTURE)
	harness.main.roster.update_impact_status_ui({})
	assert_eq(harness.main.roster.impact_bars.size(), 0, "Clearing the impact status should remove the player bars.")
