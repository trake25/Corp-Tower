extends RefCounted

const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const PLAYER_NAME_MAX_LENGTH := 10
const LOCAL_PLAYER_MARKER := "You"

var color_map: Dictionary = {}
var order: Array[String] = []
var seat_index: Dictionary = {}
var roster: Array = []
var get_local_id: Callable = func(): return ""

func local_id() -> String:
	return str(get_local_id.call())

func is_local(player_id: String) -> bool:
	return player_id == local_id()

func update_from_players(players: Array) -> void:
	var updated_map: Dictionary = {}
	var updated_order: Array[String] = []

	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", ""))
		if player_id != "":
			updated_map[player_id] = PlayerColors.color_for_player_index(i)
			updated_order.append(player_id)

	color_map = updated_map
	order = updated_order

func local_color() -> Color:
	var player_id: String = local_id()
	if color_map.has(player_id):
		return color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func color_for(player_id: String) -> Color:
	if color_map.has(player_id):
		return color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func seat_color(player_id: String) -> Color:
	if color_map.has(player_id):
		return color_map[player_id]

	return PlayerColors.color_for_player_index(int(seat_index.get(player_id, 0)))

func display_name(player_id: String) -> String:
	if player_id == "":
		return "-"

	if is_local(player_id):
		return LOCAL_PLAYER_MARKER

	for roster_entry in roster:
		if str(roster_entry.get("id", "")) == player_id:
			return str(roster_entry.get("displayName", player_id))

	return player_id

func avatar_id(player_id: String) -> String:
	for roster_entry in roster:
		if str(roster_entry.get("id", "")) == player_id:
			return str(roster_entry.get("avatarId", ""))

	return ""

func rail_name(player_id: String) -> String:
	var full_name := display_name(player_id)

	if full_name.length() > PLAYER_NAME_MAX_LENGTH:
		return full_name.substr(0, PLAYER_NAME_MAX_LENGTH - 2) + ".."

	return full_name
