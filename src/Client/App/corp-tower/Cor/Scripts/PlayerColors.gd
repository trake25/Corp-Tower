extends RefCounted

const PLAYER_COLORS := [
	Color(0.0, 0.78, 1.0, 1.0),
	Color(0.66, 0.33, 0.97, 1.0),
	Color(0.96, 0.62, 0.04, 1.0),
	Color(0.06, 0.73, 0.51, 1.0),
	Color(0.96, 0.25, 0.37, 1.0),
	Color(0.24, 0.51, 0.96, 1.0)
]

const FALLBACK_COLOR := Color(0.23, 0.5, 0.88, 0.82)

static func color_for_player_id(player_id: String) -> Color:
	if player_id == "":
		return FALLBACK_COLOR

	var color_index: int = abs(hash(player_id)) % PLAYER_COLORS.size()
	return PLAYER_COLORS[color_index]

static func color_for_player_index(player_index: int) -> Color:
	if player_index < 0:
		return FALLBACK_COLOR

	return PLAYER_COLORS[player_index % PLAYER_COLORS.size()]
