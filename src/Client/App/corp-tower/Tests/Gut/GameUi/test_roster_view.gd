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

func test_rail_renders_and_restores_authoritative_presence_states() -> void:
	harness.main.players_ctx.roster = [
		{"id": "P1", "displayName": "Connected", "avatarId": "avatar_0"},
		{"id": "P2", "displayName": "Dropped", "avatarId": "avatar_1"},
		{"id": "P3", "displayName": "Departed", "avatarId": "avatar_2"}
	]
	roster().update_score_lines([
		{"id": "P1", "score": 10, "levelScore": 0, "presence": "connected"},
		{"id": "P2", "score": 8, "levelScore": 0, "presence": "disconnected"},
		{"id": "P3", "score": 6, "levelScore": 0, "presence": "left"}
	])

	var connected = roster().rail_entry("P1")
	var dropped = roster().rail_entry("P2")
	var departed = roster().rail_entry("P3")
	var normal_avatar_modulate := (connected.get_node("%AvatarTexture") as TextureRect).modulate
	var dropped_name_color := (dropped.get_node("%NameLabel") as Label).get_theme_color("font_color")
	var dropped_avatar_color := (dropped.get_node("%AvatarTexture") as TextureRect).modulate
	assert_eq((connected.get_node("%NameLabel") as Label).text, "Connected")
	assert_true((dropped.get_node("%NameLabel") as Label).text.contains("\u0336"))
	assert_true(dropped_name_color.r > dropped_name_color.g and dropped_name_color.r > dropped_name_color.b)
	assert_true(dropped_avatar_color.r > dropped_avatar_color.g and dropped_avatar_color.r > dropped_avatar_color.b)
	assert_eq((departed.get_node("%ScoreLabel") as Label).text, "LEFT")
	assert_false((departed.get_node("%NameLabel") as Label).text.contains("\u0336"))
	var departed_avatar_color := (departed.get_node("%AvatarTexture") as TextureRect).modulate
	assert_false(departed_avatar_color.r > departed_avatar_color.g and departed_avatar_color.r > departed_avatar_color.b)

	roster().update_score_lines([
		{"id": "P1", "score": 10, "levelScore": 0, "presence": "connected"},
		{"id": "P2", "score": 8, "levelScore": 0, "presence": "connected"},
		{"id": "P3", "score": 6, "levelScore": 0, "presence": "connected"}
	])
	assert_eq((dropped.get_node("%NameLabel") as Label).text, "Dropped")
	assert_eq((dropped.get_node("%AvatarTexture") as TextureRect).modulate, normal_avatar_modulate)
	assert_eq((departed.get_node("%ScoreLabel") as Label).text, "6")

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

func test_legacy_avatar_ids_map_to_flat_9_play_assets() -> void:
	var resolved_paths: Array[String] = []
	var unique_paths: Dictionary = {}
	for avatar_id in ["avatar_0", "avatar_1", "avatar_2", "avatar_3", "avatar_4", "avatar_5"]:
		var texture := PlayerRailEntryScript.load_avatar_texture(avatar_id)
		assert_not_null(texture, "%s should resolve to an avatar." % avatar_id)
		resolved_paths.append(texture.resource_path)
		unique_paths[texture.resource_path] = true
	assert_eq(unique_paths.size(), resolved_paths.size(), "Legacy avatar ids should remain distinct.")

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

func test_impact_bar_uses_authoritative_contribution_without_live_score_addition() -> void:
	harness.main.players_ctx.roster = [{"id": "P1", "avatarId": "avatar_1"}]
	roster().update_score_lines([{"id": "P1", "score": 0, "levelScore": 40}])
	harness.main.match_state.current_match_state = "playing"
	roster().update_impact_status_ui({
		"requiredContribution": 40,
		"requiredBandScore": 40,
		"nextImpactLevel": 3,
		"players": [{
			"id": "P1",
			"bandContribution": 20,
			"bandScore": 0,
			"requiredContribution": 40,
			"requiredBandScore": 40,
			"met": false
		}]
	})
	var bar: Control = roster().impact_bars["P1"]
	var fill: Panel = bar.get_node("%ImpactBarFill") as Panel
	assert_almost_eq(fill.anchor_top, 0.5, 0.001, "The bar must use the server's 20/40 contribution instead of adding level score.")

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
