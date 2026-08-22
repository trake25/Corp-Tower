extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const PlayerRailEntryScript = preload("res://Cor/Scripts/PlayerRailEntry.gd")

const PLAYERS_FIXTURE := [
	{"id": "P1", "score": 10, "levelScore": 4},
	{"id": "P2", "score": 8, "levelScore": 2},
	{"id": "P3", "score": 0, "levelScore": 0}
]

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func roster():
	return harness.main.roster

func test_rail_entries_follow_roster_membership() -> void:
	roster().update_score_lines(PLAYERS_FIXTURE)
	assert_eq(roster().player_rail_entries.size(), 3, "Each payload player should get a rail entry.")
	roster().update_score_lines([PLAYERS_FIXTURE[0], PLAYERS_FIXTURE[1]])
	assert_eq(roster().player_rail_entries.size(), 2, "A player who leaves the payload should lose their rail entry.")
	assert_false(roster().player_rail_entries.has("P3"), "The departed player's entry should be removed.")

func test_rail_records_seat_indexes() -> void:
	roster().update_score_lines(PLAYERS_FIXTURE)
	assert_eq(int(harness.main.players_ctx.seat_index["P1"]), 0, "The first payload player should sit in seat 0.")
	assert_eq(int(harness.main.players_ctx.seat_index["P3"]), 2, "The third payload player should sit in seat 2.")

func test_impact_bars_follow_status_membership() -> void:
	roster().update_impact_status_ui({
		"requiredBandScore": 40,
		"nextImpactLevel": 3,
		"players": [
			{"id": "P1", "met": true},
			{"id": "P2", "met": false, "bandScore": 10, "requiredBandScore": 40}
		]
	})
	assert_eq(roster().impact_bars.size(), 2, "Each status player should get an impact bar.")
	roster().update_impact_status_ui({
		"requiredBandScore": 40,
		"nextImpactLevel": 3,
		"players": [{"id": "P1", "met": true}]
	})
	assert_eq(roster().impact_bars.size(), 1, "A player who leaves the status should lose their impact bar.")

func test_impact_bars_leave_room_for_avatar_markers() -> void:
	roster().update_impact_status_ui({
		"requiredBandScore": 40,
		"players": [
			{"id": "P1", "bandScore": 20, "requiredBandScore": 40},
			{"id": "P2", "bandScore": 20, "requiredBandScore": 40}
		]
	})
	await get_tree().process_frame
	var first_bar: Control = roster().impact_bars["P1"]
	var second_bar: Control = roster().impact_bars["P2"]
	assert_almost_eq(first_bar.custom_minimum_size.y, 187.0, 0.5, "Each Impact slot should reserve the complete frame height.")
	assert_almost_eq(second_bar.position.y - first_bar.position.y, 195.0, 0.5, "Impact frames should keep an eight-unit gap for their avatar markers.")

func test_legacy_avatar_ids_map_to_flat_9_play_assets() -> void:
	var expected := {
		"avatar_0": "avatar-lion.png",
		"avatar_1": "avatar-duck.png",
		"avatar_2": "avatar-hippo.png",
		"avatar_3": "avatar-fox.png",
		"avatar_4": "avatar-penguin.png",
		"avatar_5": "avatar-elephant.png"
	}
	for avatar_id in expected:
		var texture := PlayerRailEntryScript.load_avatar_texture(avatar_id)
		assert_not_null(texture, "%s should resolve to a 9-Play avatar." % avatar_id)
		assert_true(texture.resource_path.ends_with("/9-Play/" + expected[avatar_id]), "%s should preserve its existing character mapping." % avatar_id)

func test_progressing_impact_bar_shows_player_avatar_marker() -> void:
	harness.main.players_ctx.roster = [{"id": "P1", "avatarId": "avatar_1"}]
	roster().update_impact_status_ui({
		"requiredBandScore": 40,
		"nextImpactLevel": 3,
		"players": [{"id": "P1", "bandScore": 20, "requiredBandScore": 40}]
	})
	var bar: Control = roster().impact_bars["P1"]
	var fill: Panel = bar.get_node("%ImpactBarFill") as Panel
	var track: Panel = bar.get_node("ImpactBarTrack") as Panel
	assert_true(fill.visible, "A progressing Impact bar should render its runtime fill.")
	assert_almost_eq(fill.anchor_top, 0.5, 0.001, "The Impact fill height should match the player's progress ratio.")
	assert_eq(track.clip_children, CanvasItem.CLIP_CHILDREN_DISABLED, "The Impact track must draw its runtime fill instead of masking it behind the frame.")
	assert_gt(track.z_index, (bar.get_node("BarTexture") as TextureRect).z_index, "The runtime fill should draw above the frame's opaque track interior.")
	assert_true((bar.get_node("%ImpactAvatarMarker") as Control).visible, "A progressing Impact bar should show the guide's avatar marker.")
	assert_true((bar.get_node("%ImpactAvatarTexture") as TextureRect).texture.resource_path.ends_with("/9-Play/avatar-duck.png"), "The marker should use the player's mapped avatar.")

func test_empty_impact_bar_hides_fill_and_avatar_marker() -> void:
	harness.main.players_ctx.roster = [{"id": "P1", "avatarId": "avatar_1"}]
	roster().update_impact_status_ui({
		"requiredBandScore": 40,
		"nextImpactLevel": 3,
		"players": [{"id": "P1", "bandScore": 0, "requiredBandScore": 40}]
	})
	var bar: Control = roster().impact_bars["P1"]
	assert_false((bar.get_node("%ImpactBarFill") as Panel).visible, "An empty Impact bar should not show a fill.")
	assert_false((bar.get_node("%ImpactAvatarMarker") as Control).visible, "An empty Impact bar should not show an avatar marker.")
