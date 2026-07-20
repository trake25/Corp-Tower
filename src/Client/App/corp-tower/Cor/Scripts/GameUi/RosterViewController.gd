extends Node

const MAX_RAIL_PLAYERS := 3
const PlayerRailEntryScene = preload("res://Cor/Scenes/PlayerRailEntry.tscn")
const ImpactBarScene = preload("res://Cor/Scenes/ImpactBar.tscn")

var players_ctx
var match_state
var player_rail_entries: Dictionary = {}
var impact_bars: Dictionary = {}
var player_level_scores: Dictionary = {}
var score_tints: Dictionary = {}
var player_rail_box: VBoxContainer
var impact_track: VBoxContainer
var impact_pill: Control
var impact_status_label: Label
var impact_separator: HSeparator

func bind_nodes(binder) -> void:
	player_rail_box = binder.optional_node("PlayerRailBox") as VBoxContainer
	impact_track = binder.optional_node("ImpactTrack") as VBoxContainer
	impact_pill = binder.optional_node("ImpactPill") as Control
	impact_status_label = binder.require_node("ImpactStatusLabel") as Label
	impact_separator = binder.optional_node("ImpactSeparator") as HSeparator

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

		entry.get_parent().move_child(entry, i)
		entry.call(
			"set_entry",
			players_ctx.rail_name(player_id),
			int(player.get("score", 0)) + int(player.get("levelScore", 0)),
			i,
			players_ctx.avatar_id(player_id)
		)

		var tint: Dictionary = score_tints.get(player_id, {})
		if !tint.is_empty() and int(tint.get("until", 0)) > Time.get_ticks_msec():
			entry.modulate = tint.get("color", Color.WHITE)
		else:
			entry.modulate = Color.WHITE

	for player_id in player_rail_entries.keys():
		if not seen_player_ids.has(player_id):
			player_rail_entries[player_id].queue_free()
			player_rail_entries.erase(player_id)

func update_impact_status_ui(raw_status: Variant) -> void:
	if impact_status_label == null:
		return

	if typeof(raw_status) != TYPE_DICTIONARY:
		set_impact_status_visible(false)
		impact_status_label.visible = false
		impact_status_label.text = ""
		update_impact_track([], 0)
		return

	var status: Dictionary = raw_status
	var required_band_score: int = int(status.get(
		"requiredBandScore",
		status.get("requiredScore", 0)
	))

	if required_band_score <= 0:
		set_impact_status_visible(false)
		impact_status_label.visible = false
		impact_status_label.text = ""
		update_impact_track([], 0)
		return

	var next_impact_level: int = int(status.get("nextImpactLevel", 0))
	var player_statuses: Array = status.get("players", [])
	var ready_count: int = 0
	var player_count: int = 0
	var local_status: Dictionary = {}
	var short_player_goals: Array[String] = []

	for player_status in player_statuses:
		if typeof(player_status) != TYPE_DICTIONARY:
			continue

		var player_id: String = str(player_status.get("id", ""))
		var is_local_player: bool = players_ctx.is_local(player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			short_player_goals.append(
				players_ctx.display_name(player_id) +
				" " + str(int(player_status.get("requiredScore", required_band_score)))
			)

	var lines: Array[String] = [
		"Impact L" + str(next_impact_level) + "  |  " + str(ready_count) + "/" + str(player_count) + " ready"
	]

	if !local_status.is_empty():
		var local_score: int = int(local_status.get("score", 0))
		var local_required_score: int = int(local_status.get("requiredScore", required_band_score))

		lines.append("You: " + str(local_score) + " / " + str(local_required_score))
	elif short_player_goals.is_empty():
		lines.append("All players ready")

	if !short_player_goals.is_empty():
		lines.append("Goals: " + ", ".join(short_player_goals))
	elif !local_status.is_empty() && ready_count == player_count:
		lines.append("All ready")

	set_impact_status_visible(true)
	impact_status_label.text = "\n".join(lines)

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

func set_impact_status_visible(should_show: bool) -> void:
	if impact_separator != null:
		impact_separator.visible = should_show

	if impact_status_label != null:
		impact_status_label.visible = should_show
