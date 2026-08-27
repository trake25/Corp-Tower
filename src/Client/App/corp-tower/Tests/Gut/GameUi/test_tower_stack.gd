extends GutTest

const TowerStackScript = preload("res://Cor/Scripts/TowerStack.gd")

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
