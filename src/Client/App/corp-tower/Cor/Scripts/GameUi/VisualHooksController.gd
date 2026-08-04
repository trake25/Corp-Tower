extends Node

const VERDICT_POSITIVE := "positive"
const VERDICT_NEGATIVE := "negative"

var tower_stack: Control
var roster
var players_ctx
var hooks
var last_beat_key: String = ""

func setup(tower_stack_ref: Control, roster_ref, players_ctx_ref, hooks_ref) -> void:
	tower_stack = tower_stack_ref
	roster = roster_ref
	players_ctx = players_ctx_ref
	hooks = hooks_ref

func reset() -> void:
	last_beat_key = ""

	if tower_stack != null and tower_stack.has_method("cancel_impact_beat"):
		tower_stack.call("cancel_impact_beat")

static func build_verdicts(status: Variant) -> Dictionary:
	var verdicts: Dictionary = {}

	if typeof(status) != TYPE_DICTIONARY:
		return verdicts

	for raw_player_status in status.get("players", []):
		if typeof(raw_player_status) != TYPE_DICTIONARY:
			continue

		var player_status: Dictionary = raw_player_status
		var player_id: String = str(player_status.get("id", ""))

		if player_id == "":
			continue

		verdicts[player_id] = (
			VERDICT_POSITIVE if bool(player_status.get("met", false)) else VERDICT_NEGATIVE
		)

	return verdicts

static func level_result_key(summary: Dictionary, state: String) -> String:
	return (
		state + ":" +
		str(summary.get("level", 0)) + ":" +
		str(summary.get("result", "")) + ":" +
		str(summary.get("teamLevelScore", 0))
	)

func on_level_result(data: Dictionary, state: String) -> float:
	if hooks == null or tower_stack == null:
		return 0.0

	var raw_summary: Variant = data.get("lastLevelSummary", {})

	if typeof(raw_summary) != TYPE_DICTIONARY:
		return 0.0

	var summary: Dictionary = raw_summary

	if summary.is_empty():
		return 0.0

	var beat_key: String = level_result_key(summary, state)

	if beat_key == last_beat_key:
		return 0.0

	last_beat_key = beat_key

	var status: Variant = summary.get("impactScoreStatus", {})

	if typeof(status) != TYPE_DICTIONARY or (status as Dictionary).is_empty():
		status = data.get("impactScoreStatus", {})

	var verdicts: Dictionary = build_verdicts(status)

	if hooks.screen_shake_enabled and _should_shake(state, verdicts):
		if tower_stack.has_method("shake"):
			tower_stack.call("shake", hooks.screen_shake_ms, hooks.screen_shake_magnitude_units)

	if not hooks.impact_beat_enabled:
		return 0.0

	if not tower_stack.has_method("play_impact_beat"):
		return 0.0

	if not bool(tower_stack.call("play_impact_beat", verdicts)):
		return 0.0

	if roster != null and roster.has_method("flash_impact_bars"):
		roster.flash_impact_bars(verdicts, hooks.impact_beat_total_seconds())

	return hooks.impact_beat_total_seconds()

func _should_shake(state: String, verdicts: Dictionary) -> bool:
	if state == "failed":
		return true

	return verdicts.values().has(VERDICT_NEGATIVE)
