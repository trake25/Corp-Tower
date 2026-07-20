extends GutTest

const PlayerContextScript = preload("res://Cor/Scripts/GameUi/PlayerContext.gd")
const MatchStateScript = preload("res://Cor/Scripts/GameUi/MatchState.gd")
const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")

var context

func before_each() -> void:
	context = PlayerContextScript.new()
	context.get_local_id = func(): return "P1"

func test_update_from_players_assigns_seat_colors_in_order() -> void:
	context.update_from_players([{"id": "P1"}, {"id": "P2"}, {"id": "P3"}])
	assert_eq(context.order, Array(["P1", "P2", "P3"], TYPE_STRING, "", null), "Player order should follow the payload order.")
	assert_eq(context.color_map["P1"], PlayerColors.color_for_player_index(0), "The first player should get the first seat color.")
	assert_eq(context.color_map["P3"], PlayerColors.color_for_player_index(2), "The third player should get the third seat color.")

func test_update_from_players_skips_blank_ids() -> void:
	context.update_from_players([{"id": ""}, {"id": "P2"}])
	assert_false(context.color_map.has(""), "Blank player ids should never enter the color map.")
	assert_eq(context.order.size(), 1, "Blank player ids should never enter the order list.")

func test_is_local_matches_injected_id() -> void:
	assert_true(context.is_local("P1"), "The injected local id should read as local.")
	assert_false(context.is_local("P2"), "Other ids should not read as local.")

func test_display_name_resolves_marker_roster_and_fallback() -> void:
	context.roster = [{"id": "P2", "displayName": "Rocket"}]
	assert_eq(context.display_name(""), "-", "A blank id should display as a dash.")
	assert_eq(context.display_name("P1"), "You", "The local player should display as You.")
	assert_eq(context.display_name("P2"), "Rocket", "Roster entries should resolve to their display name.")
	assert_eq(context.display_name("P9"), "P9", "Unknown ids should fall back to the raw id.")

func test_rail_name_truncates_long_names() -> void:
	context.roster = [{"id": "P2", "displayName": "LongPlayerName"}]
	assert_eq(context.rail_name("P2"), "LongPlay..", "Rail names longer than ten characters should truncate with dots.")
	context.roster = [{"id": "P3", "displayName": "Short"}]
	assert_eq(context.rail_name("P3"), "Short", "Short rail names should pass through unchanged.")

func test_avatar_id_resolves_from_roster() -> void:
	context.roster = [{"id": "P2", "avatarId": "avatar_3"}]
	assert_eq(context.avatar_id("P2"), "avatar_3", "Roster entries should resolve their avatar id.")
	assert_eq(context.avatar_id("P9"), "", "Unknown ids should have no avatar id.")

func test_color_lookups_fall_back_when_unmapped() -> void:
	context.update_from_players([{"id": "P1"}])
	assert_eq(context.color_for("P1"), PlayerColors.color_for_player_index(0), "Mapped ids should use their seat color.")
	assert_eq(context.color_for("P9"), PlayerColors.color_for_player_id("P9"), "Unmapped ids should hash to a stable color.")
	context.seat_index["P9"] = 2
	assert_eq(context.seat_color("P9"), PlayerColors.color_for_player_index(2), "Unmapped seat colors should use the recorded seat index.")

func test_match_state_is_playing_only_during_play() -> void:
	var match_state = MatchStateScript.new()
	assert_false(match_state.is_playing(), "A fresh match state is not playing.")
	match_state.current_match_state = "playing"
	assert_true(match_state.is_playing(), "The playing state should report as playing.")
	match_state.current_match_state = "finished"
	assert_false(match_state.is_playing(), "A finished state should not report as playing.")
