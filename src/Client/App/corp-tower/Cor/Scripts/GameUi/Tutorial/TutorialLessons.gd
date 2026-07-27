extends RefCounted

const TutorialGatesScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialGates.gd")
const BlockDataScript = preload("res://Cor/Scripts/GameUi/BlockData.gd")

const LOCAL_PLAYER_ID := "local"

# Mirror of the src/Server/app/Game_Config.js values the lessons narrate, at
# Level 1. Overridden by the last-seen live game_state/debug_config when the
# tutorial is launched from inside a match (see TutorialScene). Values only,
# no derivation here -- if Game_Config.js's tuning changes, update this dict
# to match; nothing below re-derives them.
const DEFAULTS := {
	"level": 1,
	"target_height": 16,
	"grid_width": 8,
	"site_width": 6,
	"placeable_min": 1,
	"placeable_max": 6,
	"hand_slots_level_1": 2,
	"hand_slots_level_3": 3,
	"placement_cooldown_ms": 1000,
	"level_time_limit_ms": 30000,
	"impact_min_contribution_share": 0.30,
	"impact_requirement_score": 48,
	"impact_interval": 2,
	"stability_pressure": 0.26,
	"power_unlock_level": 1,
}

static func _brick(id: String, shape_id: String, scripted_balance_delta: int = 0) -> Dictionary:
	var cells: Array = BlockDataScript.BRICK_SHAPES.get(shape_id, [])
	return {
		"id": id,
		"shapeId": shape_id,
		"cells": cells,
		"height": BlockDataScript.calculate_block_height(cells),
		"scriptedBalanceDelta": scripted_balance_delta
	}

static func _scored_brick(id: String, shape_id: String, points: int, event_type: String = "placement") -> Dictionary:
	var block: Dictionary = _brick(id, shape_id)
	block["scriptedPoints"] = points
	block["scriptedEventType"] = event_type
	return block

# Drives the tower's visible lean for this placement -- balanceDelta only
# reacts the brick's own face, it never moves TowerStack's tilt on its own.
static func _tilting_brick(id: String, shape_id: String, balance_delta: int, tilt_deg: float) -> Dictionary:
	var block: Dictionary = _brick(id, shape_id, balance_delta)
	block["scriptedTiltAngleDeg"] = tilt_deg
	return block

# A single-column filler stack used to seed a partially-built tower without
# hand-authoring every entry. Stacks O bricks (height 2) up from row 0;
# `total_height` should stay even since no odd-height shape is substituted.
static func _filler_tower(total_height: int, column: int) -> Array:
	var blocks: Array = []
	var placed: int = 0
	var index: int = 0

	while placed < total_height:
		var cells: Array = BlockDataScript.BRICK_SHAPES["O"]
		var height: int = BlockDataScript.calculate_block_height(cells)

		blocks.append({
			"block": {"id": "filler-%d" % index, "shapeId": "O", "cells": cells, "height": height},
			"originX": column,
			"originY": placed,
			"playerId": LOCAL_PLAYER_ID,
			"balanceDelta": 0
		})

		placed += height
		index += 1

	return blocks

static func _default_players() -> Array:
	return [
		{"id": LOCAL_PLAYER_ID, "displayName": "You", "score": 0, "levelScore": 0},
		{"id": "teammate-1", "displayName": "Ari", "score": 0, "levelScore": 0},
		{"id": "teammate-2", "displayName": "Sam", "score": 0, "levelScore": 0}
	]

static func _base_seed(overrides: Dictionary = {}) -> Dictionary:
	var seed: Dictionary = {
		"level": DEFAULTS.level,
		"target_height": DEFAULTS.target_height,
		"grid_width": DEFAULTS.grid_width,
		"placeable_min": DEFAULTS.placeable_min,
		"placeable_max": DEFAULTS.placeable_max,
		"active_slots": DEFAULTS.hand_slots_level_1,
		"seconds_remaining": DEFAULTS.level_time_limit_ms / 1000,
		"tower_blocks": [],
		"hand": [],
		"players": _default_players(),
		"stability": 100,
		"diagnostics": {},
		"draw_pile_count": 6,
		"next_draw_block": null,
		"side_quest": {},
		"power_inventory": [],
		"impact_status": {},
		"quick_chat_templates": ["Place Block!", "Sorry!", "Hello!"],
		"quick_chat_cooldown_ms": 3000
	}

	for key in overrides:
		seed[key] = overrides[key]

	return seed

static func _catalog() -> Array:
	return [
		{
			"id": &"basics",
			"title": "The shared tower",
			"blurb": "Meet the tower every player builds together.",
			"seed": _base_seed(),
			"steps": [
				{
					"id": &"one_team",
					"title": "One tower, one team",
					"body": "All three players build the SAME tower. This bar shows how close the team is to this level's target height.",
					"target": &"TopIndicatorRow",
					"card": "below",
					"gate": TutorialGatesScript.INFO
				},
				{
					"id": &"target_height",
					"title": "Target height 16",
					"body": "Level 1's target is 16 bricks tall. Reach it exactly for a Perfect Build -- short and the level isn't done, over and the extra height is wasted.",
					"target": &"TowerStack",
					"card": "auto",
					"gate": TutorialGatesScript.INFO
				}
			]
		},
		{
			"id": &"bricks",
			"title": "Your bricks",
			"blurb": "Five shapes, random rotation, and what makes a brick worth a shot.",
			"seed": _base_seed({
				"hand": [_brick("tut-bricks-1", "L"), _brick("tut-bricks-2", "T")]
			}),
			"steps": [
				{
					"id": &"five_shapes",
					"title": "5 shapes, random rotation",
					"body": "Every brick is one of five shapes -- I, O, L, T, Z -- drawn with a random rotation. Height is what scores, so a tall, awkward shape can still be worth placing.",
					"target": &"PlaceBlockButton1",
					"card": "above",
					"gate": TutorialGatesScript.INFO
				},
				{
					"id": &"hand_size",
					"title": "2 slots now, 3 from Level 3",
					"body": "A brick of height 2 or less is a precision brick -- perfect for landing an exact finish. You hold 2 bricks at once at Level 1, 3 from Level 3 on.",
					"target": &"ActionRow",
					"card": "above",
					"gate": TutorialGatesScript.INFO
				}
			]
		},
		{
			"id": &"placement",
			"title": "Placing a brick",
			"blurb": "Drag, snap, and drop onto the site.",
			"seed": _base_seed({
				"hand": [_brick("tut-place-1", "O")]
			}),
			"steps": [
				{
					"id": &"drag_and_drop",
					"title": "Drag it onto the site",
					"body": "Press and hold a brick, drag it over the tower, then release. While dragging, the placeable band and the nearest corner snap points light up -- release and the brick docks on the highlighted point, then falls to first contact.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK
				}
			]
		},
		{
			"id": &"gravity",
			"title": "Gravity and cantilevers",
			"blurb": "Snapping only picks the column -- gravity decides the row.",
			"seed": _base_seed({
				"tower_blocks": _filler_tower(4, 3),
				"hand": [_brick("tut-gravity-1", "T")]
			}),
			"steps": [
				{
					"id": &"column_only",
					"title": "Snapping only picks the column",
					"body": "A snap point fixes which column your brick lands in. Drop it anywhere over the site -- it always falls until it hits something.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK_AT,
					"gate_arg": null
				},
				{
					"id": &"watch_settle",
					"title": "Falls to first contact",
					"body": "The brick fell until it touched the stack -- an overhang is possible, but a void can never be filled from above.",
					"target": &"TowerStack",
					"card": "auto",
					"gate": TutorialGatesScript.OBSERVE,
					"observe_seconds": 3.5
				}
			]
		},
		{
			"id": &"stability",
			"title": "Lean and Integrity",
			"blurb": "Two independent axes, and the faces that react to them.",
			"seed": _base_seed({
				"tower_blocks": _filler_tower(6, 3),
				"hand": [
					_tilting_brick("tut-stability-1", "L", -5, 8.0),
					_tilting_brick("tut-stability-2", "L", 5, 0.0)
				]
			}),
			"steps": [
				{
					"id": &"off_center",
					"title": "Lean vs. Integrity",
					"body": "Lean is side-to-side asymmetry -- you can see it as a visible tilt. Integrity is site usage and support underneath. Place this one off to the side and watch the brick's face.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK_AT,
					"gate_arg": null
				},
				{
					"id": &"straighten",
					"title": "Straighten it back up",
					"body": "Now place one that pulls the tower back toward centre -- a smiley face means you improved the lean.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK_AT,
					"gate_arg": null
				}
			]
		},
		{
			"id": &"collapse",
			"title": "Collapse",
			"blurb": "Stability at 0 ends the level before a height finish counts.",
			"seed": _base_seed({
				"tower_blocks": _filler_tower(10, 3),
				"diagnostics": {"tiltAngleDeg": 8.0, "leanDirection": "right"},
				"stability": 18
			}),
			"steps": [
				{
					"id": &"watch_collapse",
					"title": "0 stability collapses the tower",
					"body": "This tower has almost nothing left. Watch what happens when Stability actually hits 0 -- the level fails before a height finish can count, even if the target was reached.",
					"target": &"TowerStack",
					"card": "center",
					"gate": TutorialGatesScript.OBSERVE,
					"observe_seconds": 5.5,
					"on_enter": {
						"type": "set_diagnostics",
						"stability": 0,
						"diagnostics": {"collapsed": true, "tiltAngleDeg": 20.0, "leanDirection": "right"}
					}
				}
			]
		},
		{
			"id": &"scoring",
			"title": "Scoring and Reinforce",
			"blurb": "Contribution pays for height; Reinforce pays for fixing.",
			"seed": _base_seed({
				"tower_blocks": _filler_tower(4, 3),
				"hand": [_scored_brick("tut-scoring-1", "I", 40, "placement")]
			}),
			"steps": [
				{
					"id": &"contribution",
					"title": "Contribution = height x level x 10",
					"body": "Placing height scores Contribution, scaled by the level and by the tower's stability at the moment you placed. Try one.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK
				},
				{
					"id": &"reinforce",
					"title": "Reinforce pays for fixing",
					"body": "Straightening a lean or widening the base also pays Reinforce points, front-loaded so early repairs are worth the most.",
					"target": &"PlayerRailBox",
					"card": "auto",
					"gate": TutorialGatesScript.INFO,
					"on_enter": {
						"type": "score_popup",
						"event": {"type": "reinforce", "points": 22, "playerId": LOCAL_PLAYER_ID},
						"duration": 2.0
					}
				}
			]
		},
		{
			"id": &"perfect_build",
			"title": "Perfect Build",
			"blurb": "An exact finish pays every player; overbuilding wastes the excess.",
			"seed": _base_seed({
				"tower_blocks": _filler_tower(14, 3),
				"hand": [_scored_brick("tut-perfect-1", "O", 20, "team_exact_bonus")]
			}),
			"steps": [
				{
					"id": &"finish_exact",
					"title": "Land it exactly",
					"body": "This brick finishes the tower at exactly 16. An exact finish pays the finisher a Precision bonus and pays EVERY player a Team Exact bonus -- overbuilding past the target forfeits both.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.PLACE_BLOCK_AT,
					"gate_arg": null
				}
			]
		},
		{
			"id": &"impact",
			"title": "Impact",
			"blurb": "Every 2 levels, the whole team's contribution is checked.",
			"seed": _base_seed({
				"impact_status": {
					"requiredBandScore": DEFAULTS.impact_requirement_score,
					"nextImpactLevel": 1,
					"players": [
						{"id": LOCAL_PLAYER_ID, "met": false, "bandScore": 10, "requiredBandScore": DEFAULTS.impact_requirement_score, "requiredScore": DEFAULTS.impact_requirement_score},
						{"id": "teammate-1", "met": true, "bandScore": 48, "requiredBandScore": DEFAULTS.impact_requirement_score, "requiredScore": DEFAULTS.impact_requirement_score},
						{"id": "teammate-2", "met": false, "bandScore": 6, "requiredBandScore": DEFAULTS.impact_requirement_score, "requiredScore": DEFAULTS.impact_requirement_score}
					]
				}
			}),
			"steps": [
				{
					"id": &"every_level",
					"title": "Every 2 levels is an Impact",
					"body": "Every 2nd level gates on Impact: each player must personally clear their own share of the score banked since the last one, not just the team total.",
					"target": &"ImpactPill",
					"card": "below",
					"gate": TutorialGatesScript.INFO
				},
				{
					"id": &"your_share",
					"title": "Your share, by Level 2",
					"body": "At Level 1's pace that's 48 points each by the time the Impact check lands. Fall short and the WHOLE team rolls back to replay the band -- not just you.",
					"target": &"PlayerRailBox",
					"card": "auto",
					"gate": TutorialGatesScript.INFO
				}
			]
		},
		{
			"id": &"team_supply",
			"title": "Team Inventory",
			"blurb": "The shared draw pile, always visible.",
			"seed": _base_seed({
				"draw_pile_count": 9,
				"next_draw_block": _brick("tut-supply-next", "Z")
			}),
			"steps": [
				{
					"id": &"shared_pile",
					"title": "Next Draw, always visible",
					"body": "This panel previews the next brick the pool will deal and how many remain. Bricks left over at the end of a level carry over -- but are discarded entirely if the level fails.",
					"target": &"TeamInventoryPanel",
					"card": "above",
					"gate": TutorialGatesScript.INFO
				}
			]
		},
		{
			"id": &"quest_power",
			"title": "Quest and Power",
			"blurb": "A side quest can earn a room-wide Power item.",
			"seed": _base_seed({
				"side_quest": {"label": "Land 2 exact finishes", "claimedBy": ""},
				"power_inventory": [{"id": "refresh"}],
				"hand": [_brick("tut-quest-power-1", "L")],
				"draw_pile_count": 5,
				"next_draw_block": _brick("tut-quest-power-next", "T"),
				"power_refresh_hand": [
					_brick("tut-quest-power-refreshed-1", "O"),
					_brick("tut-quest-power-refreshed-2", "Z")
				]
			}),
			"steps": [
				{
					"id": &"open_quest",
					"title": "Check the quest chip",
					"body": "Tap the quest chip to see this level's side quest. Clearing it can award a Power item -- Refresh is the only one earnable this way right now.",
					"target": &"QuestChip",
					"card": "below",
					"gate": TutorialGatesScript.OPEN_QUEST
				},
				{
					"id": &"open_power",
					"title": "Check your Power items",
					"body": "Tap the Power icon to see what you've earned.",
					"target": &"PowerTrigger",
					"card": "above",
					"gate": TutorialGatesScript.OPEN_POWER
				},
				{
					"id": &"activate_power",
					"title": "Activate Refresh",
					"body": "Tap Refresh in the popup to activate it. Power effects are room-wide -- everyone feels it, including you.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.ACTIVATE_POWER
				}
			]
		},
		{
			"id": &"pressure",
			"title": "Playing under pressure",
			"blurb": "The clock, the level badge, and quick chat.",
			"seed": _base_seed({"seconds_remaining": 30}),
			"steps": [
				{
					"id": &"round_timer",
					"title": "30 seconds a level",
					"body": "Each level runs on a shared clock. Run out of time mid-build and the level fails -- coordinate fast.",
					"target": &"RoundTimeBadge",
					"card": "below",
					"gate": TutorialGatesScript.INFO
				},
				{
					"id": &"level_badge",
					"title": "The level badge",
					"body": "This badge marks the current level and flags whether it's an Impact level -- extra pressure to clear your personal share.",
					"target": &"LevelBadge",
					"card": "below",
					"gate": TutorialGatesScript.INFO
				},
				{
					"id": &"quick_chat",
					"title": "Quick Chat",
					"body": "Tap Quick Chat to coordinate without typing -- \"Place Block!\", \"Sorry!\", \"Hello!\".",
					"target": &"QuickChatTrigger",
					"card": "above",
					"gate": TutorialGatesScript.OPEN_CHAT
				},
				{
					"id": &"send_message",
					"title": "Send one",
					"body": "Tap a template in the popup to send it -- everyone in the room sees it appear over your rail entry.",
					"target": &"PlayField",
					"card": "center",
					"gate": TutorialGatesScript.SEND_CHAT
				}
			]
		}
	]

static func lesson_ids() -> Array[StringName]:
	var ids: Array[StringName] = []
	for lesson in _catalog():
		ids.append(lesson.get("id", &""))
	return ids

static func lesson_by_id(lesson_id: StringName) -> Dictionary:
	for lesson in _catalog():
		if lesson.get("id", &"") == lesson_id:
			return lesson
	return {}

static func all_lessons() -> Array:
	return _catalog()
