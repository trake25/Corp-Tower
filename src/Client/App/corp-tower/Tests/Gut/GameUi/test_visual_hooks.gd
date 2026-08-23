extends GutTest

const VisualHooks := preload("res://Cor/Scripts/GameUi/VisualHooks.gd")
const VisualHooksController := preload("res://Cor/Scripts/GameUi/VisualHooksController.gd")
const TowerStackScript := preload("res://Cor/Scripts/TowerStack.gd")
const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const O_BLOCK := { "shapeId": "O", "cells": [[0, 0], [1, 0], [0, 1], [1, 1]], "height": 2 }

const IMPACT_STATUS := {
	"nextImpactLevel": 4,
	"players": [
		{ "id": "P1", "met": true },
		{ "id": "P2", "met": false },
		{ "id": "P3", "met": true }
	]
}

func test_defaults_match_the_shipped_config() -> void:
	var hooks := VisualHooks.new()

	assert_true(hooks.impact_beat_enabled, "The Impact beat ships enabled.")
	assert_true(hooks.screen_shake_enabled, "Screen shake ships enabled.")
	assert_eq(hooks.impact_beat_min_zoom, 0.3, "The zoom floor defaults to 0.3.")

func test_apply_reads_every_key_from_the_payload() -> void:
	var hooks := VisualHooks.new()

	hooks.apply({
		"impactBeat": false,
		"screenShake": false,
		"impactBeatMinZoom": 0.45,
		"impactBeatZoomOutMs": 100,
		"impactBeatWaveMs": 200,
		"impactBeatHoldMs": 300,
		"screenShakeMs": 500,
		"screenShakeMagnitudeUnits": 0.6
	})

	assert_false(hooks.impact_beat_enabled, "impactBeat should drive the beat toggle.")
	assert_false(hooks.screen_shake_enabled, "screenShake should drive the shake toggle.")
	assert_eq(hooks.impact_beat_min_zoom, 0.45, "The zoom floor should follow the payload.")
	assert_eq(hooks.screen_shake_ms, 500, "The shake duration should follow the payload.")
	assert_eq(hooks.screen_shake_magnitude_units, 0.6, "The shake magnitude should follow the payload.")
	assert_eq(hooks.impact_beat_total_ms(), 600, "The beat total is the sum of zoom-out, wave and hold.")
	assert_eq(hooks.impact_beat_total_seconds(), 0.6, "The beat total converts to seconds.")

# A server predating the feature sends no visualHooks block at all, and a partial
# payload must not zero the phases it omits -- a 0 ms beat would consume its slot
# in the summary wait while rendering nothing.
func test_apply_ignores_a_non_dictionary_and_fills_missing_keys() -> void:
	var hooks := VisualHooks.new()

	hooks.apply(null)
	assert_eq(hooks.impact_beat_wave_ms, VisualHooks.DEFAULT_WAVE_MS, "A null payload should change nothing.")

	hooks.apply({ "impactBeat": false })
	assert_false(hooks.impact_beat_enabled, "A partial payload should still apply the keys it carries.")
	assert_eq(
		hooks.impact_beat_wave_ms,
		VisualHooks.DEFAULT_WAVE_MS,
		"An omitted duration should fall back to its default, not to zero."
	)

func test_min_zoom_is_clamped_into_a_drawable_range() -> void:
	var hooks := VisualHooks.new()

	hooks.apply({ "impactBeatMinZoom": 0.0 })
	assert_eq(hooks.impact_beat_min_zoom, 0.05, "A zero zoom floor should clamp to the minimum.")

	hooks.apply({ "impactBeatMinZoom": 4.0 })
	assert_eq(hooks.impact_beat_min_zoom, 1.0, "A zoom floor above 1 should clamp to no zoom at all.")

func test_verdicts_split_the_roster_by_impact_status() -> void:
	var verdicts: Dictionary = VisualHooksController.build_verdicts(IMPACT_STATUS)

	assert_eq(verdicts.size(), 3, "Every player in the status payload gets a verdict.")
	assert_eq(verdicts["P1"], VisualHooksController.VERDICT_POSITIVE, "A player who met their share smiles.")
	assert_eq(verdicts["P2"], VisualHooksController.VERDICT_NEGATIVE, "A player who missed their share worries.")
	assert_eq(verdicts["P3"], VisualHooksController.VERDICT_POSITIVE, "A player who met their share smiles.")

func test_verdicts_tolerate_a_missing_or_malformed_status() -> void:
	assert_eq(VisualHooksController.build_verdicts(null).size(), 0, "A null status yields no verdicts.")
	assert_eq(VisualHooksController.build_verdicts({}).size(), 0, "An empty status yields no verdicts.")
	assert_eq(
		VisualHooksController.build_verdicts({ "players": ["P1", { "met": true }] }).size(),
		0,
		"Entries that are not dictionaries with an id are skipped."
	)

func _tower_entry(player_id: String, origin_y: int) -> Dictionary:
	var block: Dictionary = O_BLOCK.duplicate(true)
	block["id"] = "%s-%s" % [player_id, origin_y]
	return {
		"block": block,
		"originX": 3,
		"originY": origin_y,
		"playerId": player_id,
		"balanceDelta": 0
	}

func _mounted_tower() -> Control:
	var tower: Control = TowerStackScript.new()

	tower.size = Vector2(272, 620)
	add_child_autofree(tower)

	var hooks := VisualHooks.new()

	tower.set_visual_hooks(hooks)
	tower.set_tower(
		[_tower_entry("P1", 0), _tower_entry("P2", 2)], 4, 30, 100, {}
	)

	return tower

func test_the_beat_is_skipped_when_there_is_nothing_to_reveal() -> void:
	var tower: Control = _mounted_tower()

	tower.clear_tower()
	assert_false(
		tower.play_impact_beat({ "P1": "positive" }),
		"An empty tower has no faces to wave across."
	)

	var hooks := VisualHooks.new()

	hooks.apply({ "impactBeat": false })
	tower.set_visual_hooks(hooks)
	tower.set_tower([_tower_entry("P1", 0)], 2, 30, 100, {})
	assert_false(
		tower.play_impact_beat({ "P1": "positive" }),
		"A disabled hook must not play, so the caller adds no wait."
	)

# A collapsed tower has already been handed to the debris renderer -- there are
# no standing bricks left to flip, so the beat yields and only the shake plays.
func test_the_beat_is_skipped_while_the_tower_is_collapsing() -> void:
	var tower: Control = _mounted_tower()

	tower.set_tower(
		[_tower_entry("P1", 0)], 2, 30, 0, { "collapsed": true, "tiltAngleDeg": 12.0 }
	)
	assert_false(
		tower.play_impact_beat({ "P1": "positive" }),
		"A collapsing tower must not start the Impact beat."
	)

func test_collapse_seeds_begin_from_the_displayed_structural_pose() -> void:
	var tower: Control = _mounted_tower()
	var entry: Dictionary = _tower_entry("P1", 0)
	var block_id: String = str(entry.block.id)
	tower.set_tower(
		[entry], 2, 30, 0,
		{"collapsed": true, "criticalSupport": {"direction": "right"}},
		[{"blockId": block_id, "offsetXUnits": 1.0, "offsetYUnits": -0.25, "rotationDeg": 14.0, "failureWeight": 1.0}]
	)
	tower._begin_collapse()
	var piece: Dictionary = tower._collapse_sim.pieces[0]

	assert_almost_eq(float(piece.angle), deg_to_rad(14.0), 0.001, "Collapse inherits the displayed block rotation.")
	assert_gt(float(piece.vel.x), 0.0, "The critical pose seeds a rightward initial impulse.")

func test_the_beat_arms_the_camera_and_the_wave() -> void:
	var tower: Control = _mounted_tower()

	assert_true(
		tower.play_impact_beat({ "P1": "positive", "P2": "negative" }),
		"A standing tower with an enabled hook plays the beat."
	)
	assert_eq(tower._beat_phase, TowerStackScript.BEAT_ZOOM_OUT, "The beat opens on the pull-back.")
	assert_lt(tower._beat_zoom_target, 1.0, "A 30-row target does not fit unzoomed, so the camera pulls back.")
	assert_gte(
		tower._beat_zoom_target,
		tower.visual_hooks.impact_beat_min_zoom,
		"The derived zoom never goes below the configured floor."
	)

func test_faces_flip_to_their_placer_verdict_only_once_the_wave_arrives() -> void:
	var tower: Control = _mounted_tower()
	var lower := _tower_entry("P1", 0)
	var upper := _tower_entry("P2", 2)

	tower.play_impact_beat({ "P1": "positive", "P2": "negative" })
	tower._wave_progress = 2.0

	assert_eq(
		tower._verdict_mood_for(lower, 2.0),
		TowerStackScript.VERDICT_POSITIVE,
		"A brick the wave has reached wears its placer's verdict."
	)
	assert_eq(
		tower._verdict_mood_for(upper, 4.0),
		"",
		"A brick above the wave front keeps its own balance-delta face."
	)

	tower._wave_progress = 6.0
	assert_eq(
		tower._verdict_mood_for(upper, 4.0),
		TowerStackScript.VERDICT_NEGATIVE,
		"Once the wave passes, a missed player's brick wears the negative verdict."
	)
	assert_eq(
		tower._verdict_mood_for(_tower_entry("P9", 0), 2.0),
		"",
		"A placer with no Impact status this level gets no verdict face."
	)

func test_the_beat_holds_until_cancelled_with_no_zoom_in() -> void:
	var tower: Control = _mounted_tower()

	tower.play_impact_beat({ "P1": "positive" })
	tower._step_impact_beat(float(tower.visual_hooks.impact_beat_zoom_out_ms) / 1000.0 + 0.01)
	assert_eq(tower._beat_phase, TowerStackScript.BEAT_WAVE, "Zoom-out complete, the wave begins.")

	tower._step_impact_beat(float(tower.visual_hooks.impact_beat_wave_ms) / 1000.0 + 0.01)
	assert_eq(tower._beat_phase, TowerStackScript.BEAT_HOLD, "The wave complete, the beat settles into the hold.")

	var held_zoom: float = tower._camera_zoom
	tower._step_impact_beat(float(tower.visual_hooks.impact_beat_hold_ms) / 1000.0 + 10.0)
	assert_eq(tower._beat_phase, TowerStackScript.BEAT_HOLD, "Hold has no timed exit -- only an external cancel ends it.")
	assert_eq(tower._camera_zoom, held_zoom, "There is no zoom-in phase; the camera holds at the pulled-back zoom.")

	tower.cancel_impact_beat()
	assert_eq(tower._camera_zoom, 1.0, "Cancelling -- fired when the level summary closes -- snaps the camera back.")

func test_cancelling_the_beat_restores_the_camera() -> void:
	var tower: Control = _mounted_tower()

	tower.play_impact_beat({ "P1": "positive" })
	tower._set_camera_zoom(0.5)
	tower.cancel_impact_beat()

	assert_eq(tower._camera_zoom, 1.0, "Cancelling must return the camera to full zoom.")
	assert_eq(tower._beat_phase, TowerStackScript.BEAT_NONE, "Cancelling must clear the beat phase.")
	assert_lt(tower._wave_progress, 0.0, "Cancelling must retire the wave.")

func test_hook_zoom_preserves_platform_aspect_and_ground_contact() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var platform: Control = harness.find("PlatformArt") as Control
	var tower: Control = harness.find("TowerStack") as Control
	var original_rect: Rect2 = platform.get_global_rect()
	var bottom_padding: float = float(tower.get("bottom_padding"))
	var contact_y: float = tower.position.y + tower.size.y - bottom_padding - platform.position.y

	tower._set_camera_zoom(0.5)
	var zoomed_rect: Rect2 = platform.get_global_rect()
	var contact_global_y: float = (platform.get_global_transform() * Vector2(platform.size.x * 0.5, contact_y)).y
	var tower_baseline_global_y: float = tower.global_position.y + tower.size.y - bottom_padding

	assert_eq(platform.scale, Vector2(0.5, 0.5), "Hook Zoom should preserve the platform PNG's aspect ratio.")
	assert_almost_eq(zoomed_rect.size.x, original_rect.size.x * 0.5, 0.01, "Hook Zoom should scale the platform width with the tower.")
	assert_almost_eq(zoomed_rect.size.y, original_rect.size.y * 0.5, 0.01, "Hook Zoom should scale the platform height by the same ratio.")
	assert_almost_eq(zoomed_rect.end.y, original_rect.end.y, 0.01, "Hook Zoom should keep the platform bottom anchored to the ground.")
	assert_almost_eq(tower_baseline_global_y, contact_global_y, 0.01, "Hook Zoom should keep the tower seated on the platform's contact line.")
	assert_almost_eq(zoomed_rect.get_center().x, original_rect.get_center().x, 0.01, "Hook Zoom should keep the platform centered below the tower.")

	tower._set_camera_zoom(1.0)
	assert_eq(platform.scale, Vector2.ONE, "Ending Hook Zoom should restore the platform scale.")
	assert_almost_eq(tower.position.y, harness.main.visual_fx.tower_stack_base_position_y, 0.01, "Ending Hook Zoom should restore the tower's authored vertical position.")

func test_completion_verdicts_default_every_player_to_positive() -> void:
	var summary := {
		"result": "completed",
		"players": [{ "id": "P1" }, { "id": "P2" }]
	}
	var verdicts: Dictionary = VisualHooksController.build_completion_verdicts(summary)

	assert_eq(verdicts.size(), 2, "Every scored player gets a default verdict.")
	assert_eq(verdicts["P1"], VisualHooksController.VERDICT_POSITIVE, "A completed level defaults to positive.")
	assert_eq(verdicts["P2"], VisualHooksController.VERDICT_POSITIVE, "A completed level defaults to positive.")

func _controller_for(tower: Control) -> Node:
	var controller := VisualHooksController.new()

	add_child_autofree(controller)
	controller.setup(tower, null, null, tower.visual_hooks)

	return controller

# A level that finishes with no impact judgement attached (either it wasn't
# an Impact level, or it was one and the later gate check hasn't failed it)
# must not borrow the live, forward-looking impactScoreStatus for the next
# checkpoint -- that reads as a fresh band with nobody's contribution banked
# yet, which would wave every brick to a false "worried" face.
func test_a_completed_level_with_no_impact_judgement_waves_smiley_faces() -> void:
	var tower: Control = _mounted_tower()
	var controller: Node = _controller_for(tower)

	var data := {
		"lastLevelSummary": {
			"level": 2,
			"result": "completed",
			"teamLevelScore": 500,
			"players": [{ "id": "P1" }, { "id": "P2" }]
		},
		"impactScoreStatus": {
			"nextImpactLevel": 3,
			"players": [
				{ "id": "P1", "met": false },
				{ "id": "P2", "met": false }
			]
		}
	}

	controller.on_level_result(data, "finished")

	assert_eq(
		tower._verdict_by_player,
		{ "P1": VisualHooksController.VERDICT_POSITIVE, "P2": VisualHooksController.VERDICT_POSITIVE },
		"A completed level with no judgement of its own must not adopt the live next-checkpoint status."
	)

func test_a_failed_impact_gate_still_uses_its_own_real_verdicts() -> void:
	var tower: Control = _mounted_tower()
	var controller: Node = _controller_for(tower)

	var data := {
		"lastLevelSummary": {
			"level": 3,
			"result": "failed",
			"reason": "impact_score_requirement",
			"teamLevelScore": 500,
			"impactScoreStatus": IMPACT_STATUS
		}
	}

	controller.on_level_result(data, "failed")

	assert_eq(
		tower._verdict_by_player,
		{ "P1": "positive", "P2": "negative", "P3": "positive" },
		"A real Impact-gate failure keeps its own per-player verdicts."
	)

func test_the_level_result_key_separates_levels_and_outcomes() -> void:
	var completed := { "level": 3, "result": "completed", "teamLevelScore": 900 }
	var failed := { "level": 3, "result": "failed", "teamLevelScore": 900 }

	assert_ne(
		VisualHooksController.level_result_key(completed, "finished"),
		VisualHooksController.level_result_key(failed, "failed"),
		"A completed and a failed level 3 must not share a beat key."
	)
	assert_eq(
		VisualHooksController.level_result_key(completed, "finished"),
		VisualHooksController.level_result_key(completed.duplicate(), "finished"),
		"The same summary rebroadcast must produce the same key so the beat fires once."
	)
