extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const SHAPE_BLOCK_FIXTURE := {
	"id": "ready-block",
	"shapeId": "L2",
	"cells": [[0, 0], [0, 1]],
	"height": 2
}

class NetworkStub:
	var is_conn_estab := true
	var placed: Array = []

	func place_block(index: int, _column: int = -1, _origin_y: int = -1) -> void:
		placed.append(index)

var harness
var network_stub

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	network_stub = NetworkStub.new()
	harness.main.inventory.network = network_stub

func _state(state: String, state_remaining_ms: int = 4500) -> Dictionary:
	return {
		"state": state,
		"stateRemainingMs": state_remaining_ms,
		"secondsRemaining": int(ceil(float(state_remaining_ms) / 1000.0)),
		"levelDurationMs": 90000,
		"currentHeight": 0,
		"targetHeight": 12,
		"level": 2,
		"impactLevel": 2,
		"impactInterval": 3,
		"sideQuest": {"label": "Reach the top"},
		"players": [],
		"towerBlocks": [],
		"scoreEvents": []
	}

func _apply_ready(state_remaining_ms: int = 4500) -> void:
	harness.main.update_game_state(_state("starting", state_remaining_ms))
	harness.main.inventory.update_inventory_ui([SHAPE_BLOCK_FIXTURE], 3)

func _apply_playing() -> void:
	harness.main.update_game_state(_state("playing", 90000))
	harness.main.inventory.update_inventory_ui([SHAPE_BLOCK_FIXTURE], 3)

func test_ready_briefing_keeps_the_full_round_clock_and_overlay_passive() -> void:
	_apply_ready()

	assert_true((harness.find("ReadyBriefingCard") as Control).visible)
	assert_false((harness.find("StartCountdownLabel") as Label).visible)
	assert_eq((harness.find("TimerLabel") as Label).text, "01:30")
	assert_true((harness.find("ReadyLockOverlay1") as Control).visible)
	assert_false((harness.find("PlaceBlockButton1") as Button).disabled)
	assert_false((harness.find("QuestPopover") as Control).visible)
	assert_eq(
		(harness.find("RoundStartOverlay") as Control).mouse_filter,
		Control.MOUSE_FILTER_IGNORE,
		"The presentation must not block placement input when play becomes authoritative."
	)
	harness.resize(Vector2(320, 640))
	await get_tree().process_frame
	var briefing_rect := (harness.find("ReadyBriefingCard") as Control).get_global_rect()
	assert_gte(briefing_rect.position.x, 0.0)
	assert_lte(briefing_rect.end.x, 320.0, "The compact briefing stays inside a narrow mobile viewport.")

func test_countdown_uses_the_current_authoritative_interval_without_local_unlock() -> void:
	_apply_ready(3000)
	var overlay = harness.main.round_start_overlay
	overlay.presentation_deadline_ms = Time.get_ticks_msec() + 3000
	overlay.update_presentation()
	assert_eq((harness.find("StartCountdownLabel") as Label).text, "3")

	overlay.presentation_deadline_ms = Time.get_ticks_msec() + 1999
	overlay.update_presentation()
	assert_eq((harness.find("StartCountdownLabel") as Label).text, "2")

	overlay.presentation_deadline_ms = Time.get_ticks_msec() + 999
	overlay.update_presentation()
	assert_eq((harness.find("StartCountdownLabel") as Label).text, "1")

	overlay.presentation_deadline_ms = Time.get_ticks_msec() - 1
	overlay.update_presentation()
	assert_false((harness.find("StartCountdownLabel") as Label).visible)
	assert_true(overlay.ready_active, "Local presentation time cannot become gameplay authority.")
	assert_false(harness.main.inventory.can_place_block(0))

func test_authoritative_playing_shows_build_without_replaying_it_on_recovery() -> void:
	_apply_ready()
	_apply_playing()

	assert_false(harness.main.inventory.ready_locked)
	assert_true(harness.main.inventory.can_place_block(0))
	assert_false((harness.find("ReadyLockOverlay1") as Control).visible)
	assert_eq((harness.find("StartCountdownLabel") as Label).text, "BUILD!")

	var recovery_harness = HarnessScript.new()
	await recovery_harness.mount(self, Vector2(412, 917))
	recovery_harness.main.inventory.network = network_stub
	recovery_harness.main.update_game_state(_state("playing", 90000))
	assert_false(
		(recovery_harness.find("StartCountdownLabel") as Label).visible,
		"A direct playing snapshot must not replay BUILD."
	)

func test_ready_rejects_every_card_mode_with_throttled_feedback_and_cleans_stale_state() -> void:
	_apply_ready()
	var inventory = harness.main.inventory
	var card_center := harness.center_of("PlaceBlockButton1")

	inventory._on_inventory_card_gui_input(HarnessScript.touch_press(card_center), 0)
	inventory._on_inventory_card_gui_input(HarnessScript.touch_press(card_center), 0)
	assert_false(inventory.is_block_dragging)
	assert_eq(inventory.selected_slot_index, -1)
	assert_eq(network_stub.placed.size(), 0)
	assert_true((harness.find("WaitForBuildLabel") as Label).visible)
	assert_eq(harness.main.round_start_overlay.ready_feedback_count(0), 1)
	assert_eq(inventory.get_placement_cooldown_remaining_ms(), 0)
	harness.main.round_start_overlay.wait_for_build_deadline_ms = Time.get_ticks_msec() - 1
	harness.main.round_start_overlay.update_presentation()
	assert_false((harness.find("WaitForBuildLabel") as Label).visible)

	inventory.set_tap_to_drag(true)
	inventory._on_inventory_card_gui_input(HarnessScript.touch_press(card_center), 0)
	assert_false(inventory.is_block_dragging, "Tap to Drag cannot detach a READY card.")

	inventory.set_parallel_placement(true)
	inventory._on_inventory_card_gui_input(HarnessScript.touch_press(card_center), 0)
	assert_eq(inventory.selected_slot_index, -1, "Tap to Place cannot arm a READY card.")

	inventory.selected_slot_index = 0
	inventory.is_armed = true
	inventory.armed_snap = {"column": 4, "origin_y": 0}
	inventory.drag_snap = {"column": 4, "origin_y": 0}
	inventory.last_placement_sent_at_ms = Time.get_ticks_msec()
	inventory.apply_authoritative_state("starting", 3, true)
	assert_eq(inventory.selected_slot_index, -1)
	assert_false(inventory.is_armed)
	assert_true(inventory.armed_snap.is_empty())
	assert_true(inventory.drag_snap.is_empty())
	assert_eq(inventory.last_placement_sent_at_ms, 0)

	inventory.apply_authoritative_state("playing", 3)
	harness.main.match_state.current_match_state = "playing"
	assert_true(inventory.can_place_block(0), "A new round must not inherit its predecessor's cooldown.")
