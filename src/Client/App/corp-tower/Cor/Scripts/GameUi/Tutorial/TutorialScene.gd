extends RefCounted

const SnapGridScript = preload("res://Cor/Scripts/GameUi/SnapGrid.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

const LOCAL_PLAYER_ID := "local"

var tower_stack
var inventory
var top_bar
var roster
var quest
var power
var score_popups
var players_ctx

var tower_blocks: Array = []
var hand: Array = []
var hand_pool: Array = []
var active_slots: int = 2
var level: int = 1
var target_height: int = 0
var stability: int = 100
var diagnostics: Dictionary = {}
var players: Array = []
var side_quest: Dictionary = {}
var power_inventory: Array = []
var impact_status: Dictionary = {}
var draw_pile_count: int = 0
var next_draw_block: Variant = null
var seconds_remaining: int = 30
var placeable_min: int = 1
var placeable_max: int = 6
var grid_width: int = 8

var _original_get_local_id: Callable = Callable()
var _get_local_id_overridden: bool = false

func setup(
	tower_stack_ref, inventory_ref, top_bar_ref, roster_ref,
	quest_ref, power_ref, score_popups_ref, players_ctx_ref
) -> void:
	tower_stack = tower_stack_ref
	inventory = inventory_ref
	top_bar = top_bar_ref
	roster = roster_ref
	quest = quest_ref
	power = power_ref
	score_popups = score_popups_ref
	players_ctx = players_ctx_ref

func load_seed(seed: Dictionary) -> void:
	tower_blocks = (seed.get("tower_blocks", []) as Array).duplicate(true)
	active_slots = int(seed.get("active_slots", 2))

	var full_hand: Array = (seed.get("hand", []) as Array).duplicate(true)
	var initial_count: int = mini(active_slots, full_hand.size())
	hand = full_hand.slice(0, initial_count)
	hand_pool = full_hand.slice(initial_count) if full_hand.size() > initial_count else []

	level = int(seed.get("level", 1))
	target_height = int(seed.get("target_height", 0))
	stability = int(seed.get("stability", 100))
	diagnostics = (seed.get("diagnostics", {}) as Dictionary).duplicate(true)
	players = (seed.get("players", []) as Array).duplicate(true)
	side_quest = (seed.get("side_quest", {}) as Dictionary).duplicate(true)
	power_inventory = (seed.get("power_inventory", []) as Array).duplicate(true)
	impact_status = (seed.get("impact_status", {}) as Dictionary).duplicate(true)
	draw_pile_count = int(seed.get("draw_pile_count", 0))
	next_draw_block = seed.get("next_draw_block", null)
	seconds_remaining = int(seed.get("seconds_remaining", 30))
	placeable_min = int(seed.get("placeable_min", 1))
	placeable_max = int(seed.get("placeable_max", 6))
	grid_width = int(seed.get("grid_width", 8))

	SnapGridScript.set_grid_width(grid_width)
	SnapGridScript.set_placeable_range(placeable_min, placeable_max)

	if players_ctx != null:
		if !_get_local_id_overridden:
			_original_get_local_id = players_ctx.get_local_id
			_get_local_id_overridden = true
		players_ctx.get_local_id = func(): return LOCAL_PLAYER_ID
		players_ctx.update_from_players(players)

	push_state()

# Restores the real player-context identity. Only called once the whole
# tutorial session ends (not between lessons), so a mid-session lesson swap
# never clobbers the saved original with the tutorial's own override.
func teardown() -> void:
	if players_ctx != null and _get_local_id_overridden:
		players_ctx.get_local_id = _original_get_local_id
	_get_local_id_overridden = false

func push_state() -> void:
	var current_height: int = SnapGridScript.top_height(tower_blocks)

	if tower_stack != null:
		tower_stack.set_tower(tower_blocks, current_height, target_height, stability, diagnostics)

	if inventory != null:
		inventory.update_inventory_ui(hand, active_slots)
		inventory.update_draw_pile_ui(draw_pile_count, next_draw_block)

	if top_bar != null:
		top_bar.update_top_bar_display(level, level, "playing", seconds_remaining)
		top_bar.set_top_indicator_progress(current_height, target_height)
		top_bar.set_tower_progress(current_height, target_height)
		top_bar.update_tower_stability_ui(stability, diagnostics)
		top_bar.height_label.text = "Height " + str(current_height) + "/" + str(target_height)
		top_bar.tower_value_label.text = str(current_height) + " / " + str(target_height)

	if roster != null:
		roster.update_score_lines(players)
		roster.update_impact_status_ui(impact_status)

	if quest != null:
		quest.update_quest_chip(side_quest)

	if power != null:
		power.last_power_inventory = power_inventory

# Mirrors the live placement path: settle the row with the same SnapGrid mirror
# the drag preview already used, append the entry, refill the emptied slot from
# the queued pool (as the server would deal a new card), and re-push state.
func apply_placement(index: int, column: int) -> Dictionary:
	if index < 0 or index >= hand.size():
		return {"column": column}

	var block: Variant = hand[index]

	if typeof(block) != TYPE_DICTIONARY or (block as Dictionary).is_empty():
		return {"column": column}

	var cells: Array = block.get("cells", [])
	var resolved_column: int = column

	if resolved_column < placeable_min or resolved_column > placeable_max:
		resolved_column = placeable_min

	var origin_y: int = SnapGridScript.settle_origin_y(tower_blocks, cells, resolved_column)
	var balance_delta: int = int(block.get("scriptedBalanceDelta", 0))

	tower_blocks.append({
		"block": {
			"id": str(block.get("id", "")),
			"shapeId": str(block.get("shapeId", "")),
			"cells": cells,
			"height": int(block.get("height", BlockDataScript.calculate_block_height(cells)))
		},
		"originX": resolved_column,
		"originY": origin_y,
		"playerId": LOCAL_PLAYER_ID,
		"balanceDelta": balance_delta
	})

	hand.remove_at(index)
	if !hand_pool.is_empty():
		hand.append(hand_pool.pop_front())

	if block.has("scriptedPoints") and score_popups != null:
		score_popups.show_score_event_popup(
			{
				"type": str(block.get("scriptedEventType", "placement")),
				"points": int(block.get("scriptedPoints", 0)),
				"playerId": LOCAL_PLAYER_ID
			},
			players,
			2.0
		)

	push_state()

	return {"column": resolved_column, "originY": origin_y}

# Applies a lesson step's scripted, non-placement side effect. Kept to a small
# closed set -- new script types belong here, not in the catalog.
func apply_script(script: Dictionary) -> void:
	if script.is_empty():
		return

	match str(script.get("type", "")):
		"score_popup":
			if score_popups != null:
				score_popups.show_score_event_popup(
					script.get("event", {}),
					players,
					float(script.get("duration", 2.0))
				)
		"set_diagnostics":
			diagnostics = (script.get("diagnostics", {}) as Dictionary).duplicate(true)
			stability = int(script.get("stability", stability))
			if tower_stack != null:
				var current_height: int = SnapGridScript.top_height(tower_blocks)
				tower_stack.set_tower(tower_blocks, current_height, target_height, stability, diagnostics)
		"set_tower":
			tower_blocks = (script.get("tower_blocks", tower_blocks) as Array).duplicate(true)
			push_state()
