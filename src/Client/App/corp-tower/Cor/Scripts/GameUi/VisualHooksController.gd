extends Node

const VERDICT_POSITIVE := "positive"
const VERDICT_NEGATIVE := "negative"

var tower_stack: Control
var roster
var players_ctx
var hooks
var platform_parallax: Control
var tower_stack_base_position_y: float = 0.0
var platform_ground_depth: float = 0.0
var last_beat_key: String = ""

func setup(tower_stack_ref: Control, roster_ref, players_ctx_ref, hooks_ref, platform_ref: Control = null) -> void:
	tower_stack = tower_stack_ref
	roster = roster_ref
	players_ctx = players_ctx_ref
	hooks = hooks_ref
	platform_parallax = platform_ref

	if platform_parallax == null or tower_stack == null:
		return

	tower_stack_base_position_y = tower_stack.position.y
	var tower_baseline_y: float = (
		tower_stack.position.y + tower_stack.size.y - float(tower_stack.get("bottom_padding"))
	)
	var platform_contact_y: float = tower_baseline_y - platform_parallax.position.y
	platform_ground_depth = maxf(0.0, platform_parallax.size.y - platform_contact_y)

	var zoom_callable := Callable(self, "apply_camera_zoom")
	if tower_stack.has_signal("camera_zoom_changed") and not tower_stack.is_connected("camera_zoom_changed", zoom_callable):
		tower_stack.connect("camera_zoom_changed", zoom_callable)

func apply_camera_zoom(zoom: float) -> void:
	if platform_parallax == null or tower_stack == null:
		return

	var resolved_zoom: float = clampf(zoom, 0.0, 1.0)
	platform_parallax.pivot_offset = Vector2(
		platform_parallax.size.x * 0.5,
		platform_parallax.size.y
	)
	platform_parallax.scale = Vector2(resolved_zoom, resolved_zoom)
	tower_stack.position.y = (
		tower_stack_base_position_y + platform_ground_depth * (1.0 - resolved_zoom)
	)

func reset() -> void:
	last_beat_key = ""
	end_beat()

func end_beat() -> void:
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

static func build_completion_verdicts(summary: Dictionary) -> Dictionary:
	var verdicts: Dictionary = {}

	for raw_player in summary.get("players", []):
		if typeof(raw_player) != TYPE_DICTIONARY:
			continue

		var player_id: String = str((raw_player as Dictionary).get("id", ""))

		if player_id != "":
			verdicts[player_id] = VERDICT_POSITIVE

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

	var verdicts: Dictionary = build_verdicts(summary.get("impactScoreStatus", {}))

	if verdicts.is_empty() and str(summary.get("result", "")) == "completed":
		verdicts = build_completion_verdicts(summary)

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
