extends GutTest

const TowerStackScript = preload("res://Cor/Scripts/TowerStack.gd")
const BlockData = preload("res://Cor/Scripts/GameUi/BlockData.gd")

func entry(block_id: String, state: String = "standing") -> Dictionary:
	return {
		"block": {"id": block_id, "shapeId": "O", "cells": [[0, 0]]},
		"originX": 0,
		"originY": 0,
		"towerState": state
	}

func test_only_newly_fallen_bricks_enter_the_component_collapse_animation() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	tower.set_tower([entry("failed"), entry("survivor")], 1, 10)
	tower.set_tower([
		entry("failed", "fallen"),
		entry("survivor"),
		entry("placed", "fallen")
	], 1, 10)

	assert_true(tower._collapsing_block_ids.has("failed"))
	assert_true(tower._collapsing_block_ids.has("placed"))
	assert_false(tower._collapsing_block_ids.has("survivor"))
	assert_eq(tower._collapse_phase, tower.COLLAPSE_LEAN)

func test_reconnect_does_not_replay_persisted_fallen_bricks() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	tower.set_tower([entry("old", "fallen"), entry("survivor")], 1, 10)

	assert_true(tower._collapsing_block_ids.is_empty())
	assert_eq(tower._collapse_phase, tower.COLLAPSE_NONE)

func test_new_brick_uses_placement_mood_then_switches_to_live_support() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var placed: Dictionary = entry("placed")
	placed[BlockData.BALANCE_DELTA_KEY] = 10
	placed[BlockData.SUPPORT_STABILITY_KEY] = 20
	tower.set_tower([placed], 1, 10)

	assert_eq(tower._emoji_mood_for_entry(placed), "positive")
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(placed), "negative")

func test_standing_brick_face_updates_with_authoritative_support_state() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var standing: Dictionary = entry("standing")
	standing[BlockData.BALANCE_DELTA_KEY] = 10
	standing[BlockData.SUPPORT_STABILITY_KEY] = 90
	tower.set_tower([standing], 1, 10)
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(standing), "positive")

	standing[BlockData.SUPPORT_STABILITY_KEY] = 60
	tower.set_tower([standing], 1, 10)
	assert_eq(tower._emoji_mood_for_entry(standing), "neutral")

	standing[BlockData.SUPPORT_STABILITY_KEY] = 30
	tower.set_tower([standing], 1, 10)
	assert_eq(tower._emoji_mood_for_entry(standing), "negative")

func test_collapsing_faces_use_frozen_support_and_trigger_is_worried() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var prior: Dictionary = entry("prior")
	prior[BlockData.SUPPORT_STABILITY_KEY] = 60
	var trigger: Dictionary = entry("trigger")
	trigger[BlockData.BALANCE_DELTA_KEY] = 10
	trigger[BlockData.SUPPORT_STABILITY_KEY] = 0
	tower.set_tower([prior], 1, 10)
	tower._process(tower.drop_duration)
	prior.towerState = "fallen"
	trigger.towerState = "fallen"
	tower.set_tower([prior, trigger], 0, 10)

	assert_eq(tower._emoji_mood_for_entry(prior), "neutral")
	assert_eq(tower._emoji_mood_for_entry(trigger), "negative")

func test_support_threshold_updates_reclassify_standing_faces() -> void:
	var tower = TowerStackScript.new()
	add_child_autofree(tower)
	var standing: Dictionary = entry("standing")
	standing[BlockData.SUPPORT_STABILITY_KEY] = 70
	tower.set_tower([standing], 1, 10)
	tower._process(tower.drop_duration)
	assert_eq(tower._emoji_mood_for_entry(standing), "neutral")

	tower.set_support_stability_thresholds(60, 30)
	assert_eq(tower._emoji_mood_for_entry(standing), "positive")
