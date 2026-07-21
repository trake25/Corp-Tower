extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

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
