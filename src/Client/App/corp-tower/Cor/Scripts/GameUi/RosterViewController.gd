extends Node

const MAX_RAIL_PLAYERS := 3
const IMPACT_FLASH_PULSES := 3
const IMPACT_GLOW_BRIGHTEN := 1.6
const IMPACT_FLASH_MISSED_TINT := Color(1.3, 0.5, 0.5, 1.0)
const PlayerRailEntryScene = preload("res://Cor/Scenes/PlayerRailEntry.tscn")
const ImpactBarScene = preload("res://Cor/Scenes/ImpactBar.tscn")

var players_ctx
var match_state
var player_rail_entries: Dictionary = {}
var impact_bars: Dictionary = {}
var player_level_scores: Dictionary = {}
var player_rail_box: VBoxContainer
var impact_track: VBoxContainer

func bind_nodes(binder) -> void:
	player_rail_box = binder.optional_node("PlayerRailBox") as VBoxContainer
	impact_track = binder.optional_node("ImpactTrack") as VBoxContainer

func setup(players_ref, match_state_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref

func rail_entry(player_id: String) -> Control:
	return player_rail_entries.get(player_id, null)

func rail_box() -> Control:
	return player_rail_box

func update_score_lines(players: Array) -> void:
	if player_rail_box == null:
		return

	var rail_player_count: int = min(players.size(), MAX_RAIL_PLAYERS)
	var seen_player_ids: Dictionary = {}

	player_level_scores.clear()

	for player in players:
		player_level_scores[str(player.get("id", ""))] = int(player.get("levelScore", 0))

	for i in range(rail_player_count):
		var player: Dictionary = players[i]
		var player_id := str(player.get("id", ""))
		seen_player_ids[player_id] = true
		players_ctx.seat_index[player_id] = i

		var entry: Control = player_rail_entries.get(player_id, null)
		if entry == null:
			entry = PlayerRailEntryScene.instantiate()
			player_rail_box.add_child(entry)
			player_rail_entries[player_id] = entry

		var displayed_total: int = int(player.get("score", 0))
		if match_state.current_match_state == "playing":
			displayed_total += int(player.get("levelScore", 0))

		entry.get_parent().move_child(entry, i)
		entry.call(
			"set_entry",
			players_ctx.rail_name(player_id),
			displayed_total,
			i,
			players_ctx.avatar_id(player_id)
		)

	for player_id in player_rail_entries.keys():
		if not seen_player_ids.has(player_id):
			player_rail_entries[player_id].queue_free()
			player_rail_entries.erase(player_id)

func update_impact_status_ui(raw_status: Variant) -> void:
	if typeof(raw_status) != TYPE_DICTIONARY:
		update_impact_track([], 0)
		return

	var status: Dictionary = raw_status
	var required_band_score: int = int(status.get(
		"requiredBandScore",
		status.get("requiredScore", 0)
	))

	if required_band_score <= 0:
		update_impact_track([], 0)
		return

	var next_impact_level: int = int(status.get("nextImpactLevel", 0))
	var player_statuses: Array = status.get("players", [])

	update_impact_track(player_statuses, next_impact_level)

func update_impact_track(player_statuses: Array, _next_impact_level: int) -> void:
	if impact_track == null:
		return

	var seen_player_ids: Dictionary = {}
	var slot: int = 0

	for player_status in player_statuses:
		if typeof(player_status) != TYPE_DICTIONARY:
			continue

		if slot >= MAX_RAIL_PLAYERS:
			break

		var player_id: String = str(player_status.get("id", ""))
		seen_player_ids[player_id] = true

		var bar: Control = impact_bars.get(player_id, null)
		if bar == null:
			bar = ImpactBarScene.instantiate()
			impact_track.add_child(bar)
			impact_bars[player_id] = bar

		bar.get_parent().move_child(bar, slot)

		var required: int = int(player_status.get(
			"requiredBandScore",
			player_status.get("requiredScore", 0)
		))
		var current: int = int(player_status.get(
			"bandScore",
			player_status.get("score", 0)
		))
		if match_state.current_match_state == "playing":
			current += int(player_level_scores.get(player_id, 0))
		var ratio: float = 1.0 if bool(player_status.get("met", false)) else 0.0

		if required > 0:
			ratio = clampf(float(current) / float(required), 0.0, 1.0)

		bar.call("set_bar", players_ctx.seat_color(player_id), ratio)
		slot += 1

	for player_id in impact_bars.keys():
		if not seen_player_ids.has(player_id):
			impact_bars[player_id].queue_free()
			impact_bars.erase(player_id)

	if impact_pill != null:
		impact_pill.visible = true

func flash_impact_bars(verdicts: Dictionary, duration_seconds: float) -> void:
	if impact_bars.is_empty() or duration_seconds <= 0.0:
		return

	var half_pulse: float = maxf(
		0.05, duration_seconds / float(IMPACT_FLASH_PULSES * 2)
	)

	for player_id in impact_bars.keys():
		var bar: Control = impact_bars[player_id]

		if bar == null or !is_instance_valid(bar):
			continue

		var met: bool = str(verdicts.get(player_id, "")) == "positive"
		var tween: Tween = create_tween()

		tween.set_loops(IMPACT_FLASH_PULSES)
		tween.tween_property(
			bar,
			"modulate",
			_impact_glow_tint(player_id) if met else IMPACT_FLASH_MISSED_TINT,
			half_pulse
		)
		tween.tween_property(bar, "modulate", Color.WHITE, half_pulse)

func _impact_glow_tint(player_id: String) -> Color:
	var seat_color: Color = players_ctx.seat_color(player_id)

	return Color(
		seat_color.r * IMPACT_GLOW_BRIGHTEN,
		seat_color.g * IMPACT_GLOW_BRIGHTEN,
		seat_color.b * IMPACT_GLOW_BRIGHTEN,
		1.0
	)
