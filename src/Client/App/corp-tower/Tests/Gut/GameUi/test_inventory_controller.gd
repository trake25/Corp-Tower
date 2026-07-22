extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

const SHAPE_BLOCK_FIXTURE := {"id": "b1", "shapeId": "L2", "cells": [[0, 0], [0, 1]], "height": 2}

class NetworkStub:
	var is_conn_estab := true
	var placed: Array = []

	func place_block(index: int) -> void:
		placed.append(index)

var harness
var network_stub

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	network_stub = NetworkStub.new()
	inventory().network = network_stub

func inventory():
	return harness.main.inventory

func enter_playing_state_with_block() -> void:
	harness.main.match_state.current_match_state = "playing"
	inventory().update_inventory_ui([SHAPE_BLOCK_FIXTURE], 3)

func test_can_place_block_requires_connection() -> void:
	enter_playing_state_with_block()
	network_stub.is_conn_estab = false
	assert_false(inventory().can_place_block(0), "Placement must be blocked while disconnected.")

func test_can_place_block_requires_playing_state() -> void:
	enter_playing_state_with_block()
	harness.main.match_state.current_match_state = "finished"
	assert_false(inventory().can_place_block(0), "Placement must be blocked outside the playing state.")

func test_can_place_block_rejects_empty_and_locked_slots() -> void:
	harness.main.match_state.current_match_state = "playing"
	inventory().update_inventory_ui([SHAPE_BLOCK_FIXTURE], 2)
	assert_false(inventory().can_place_block(1), "An empty slot can never place.")
	assert_false(inventory().can_place_block(2), "A locked slot can never place.")
	assert_false(inventory().can_place_block(5), "An out of range slot can never place.")

func test_can_place_block_respects_cooldown() -> void:
	enter_playing_state_with_block()
	assert_true(inventory().can_place_block(0), "A filled slot while playing and off cooldown should place.")
	inventory().last_placement_sent_at_ms = Time.get_ticks_msec()
	assert_false(inventory().can_place_block(0), "Placement must be blocked during the local cooldown.")

func test_drag_release_inside_drop_zone_places_block() -> void:
	enter_playing_state_with_block()
	var card_center: Vector2 = harness.center_of("PlaceBlockButton1")
	inventory()._on_inventory_card_gui_input(HarnessScript.touch_press(card_center, 0), 0)
	assert_true(inventory().is_block_dragging, "A touch press on a placeable card should start a drag.")
	var drop_center: Vector2 = (harness.find("TowerDropZone") as Control).get_global_rect().get_center()
	var release := InputEventScreenTouch.new()
	release.pressed = false
	release.index = 0
	release.position = drop_center
	inventory().handle_input(release)
	assert_false(inventory().is_block_dragging, "Releasing the drag should end it.")
	assert_eq(network_stub.placed, [0], "Releasing inside the drop zone should send the slot's place_block request.")

func test_drag_release_outside_drop_zone_cancels_without_sending() -> void:
	enter_playing_state_with_block()
	inventory()._on_inventory_card_gui_input(HarnessScript.touch_press(harness.center_of("PlaceBlockButton1"), 0), 0)
	var release := InputEventScreenTouch.new()
	release.pressed = false
	release.index = 0
	release.position = Vector2(5, 5)
	inventory().handle_input(release)
	assert_false(inventory().is_block_dragging, "Releasing outside the drop zone should still end the drag.")
	assert_eq(network_stub.placed.size(), 0, "Releasing outside the drop zone must not contact the server.")

func test_drag_ignores_other_pointer_ids() -> void:
	enter_playing_state_with_block()
	inventory()._on_inventory_card_gui_input(HarnessScript.touch_press(harness.center_of("PlaceBlockButton1"), 0), 0)
	var other_finger := InputEventScreenTouch.new()
	other_finger.pressed = false
	other_finger.index = 4
	other_finger.position = (harness.find("TowerDropZone") as Control).get_global_rect().get_center()
	inventory().handle_input(other_finger)
	assert_true(inventory().is_block_dragging, "A release from a different finger must not end the drag.")

func test_drag_start_closes_active_popover() -> void:
	enter_playing_state_with_block()
	harness.main.power.open_power_popover()
	assert_true((harness.find("PowerPopover") as Control).visible, "The popover should open before the drag begins.")
	inventory()._on_inventory_card_gui_input(HarnessScript.touch_press(harness.center_of("PlaceBlockButton1"), 0), 0)
	assert_false((harness.find("PowerPopover") as Control).visible, "Starting a drag must dismiss any open popover.")

func test_block_data_normalizes_dictionary_and_legacy_forms() -> void:
	var normalized: Dictionary = BlockDataScript.normalize_block(SHAPE_BLOCK_FIXTURE, 0)
	assert_eq(normalized["shapeId"], "L2", "Dictionary blocks should keep their shape id.")
	assert_eq(int(normalized["height"]), 2, "Dictionary blocks should keep their height.")
	var legacy: Dictionary = BlockDataScript.normalize_block(3, 1)
	assert_eq(legacy["shapeId"], "LEGACY", "Legacy numeric blocks should normalize to the LEGACY shape.")
	assert_eq((legacy["cells"] as Array).size(), 3, "Legacy numeric blocks should synthesize one cell per height unit.")
	assert_eq(BlockDataScript.calculate_block_height([[0, 2], [0, 4]]), 3, "Block height should span min to max cell rows.")
