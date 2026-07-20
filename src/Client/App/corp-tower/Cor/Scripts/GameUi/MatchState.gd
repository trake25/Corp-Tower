extends RefCounted

var current_match_state: String = ""
var current_level: int = 0
var impact_interval: int = 3

func is_playing() -> bool:
	return current_match_state == "playing"
