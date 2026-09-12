extends Node

const LevelBadgeNormalTexture = preload("res://Cor/Art/9-Play/play-level-badge.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/9-Play/play-safe-badge.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/9-Play/play-timer-round.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/9-Play/play-timer-freeze.png")
const TopIndicatorFillOverTexture = preload("res://Cor/Themes/TopIndicatorFillOver.tres")
const STABILITY_GREEN := Color("#166534")
const STABILITY_YELLOW := Color("#B45309")
const STABILITY_RED := Color("#B91C1C")
const TIMER_AMBER := Color("#D97706")
const TIMER_CORAL := Color("#F06A5F")
const TIMER_URGENCY_SECONDS := 15
const TIMER_CRITICAL_SECONDS := 5

var match_state
var level_label: Label
var timer_label: Label
var level_badge_texture: TextureRect
var round_time_texture: TextureRect
var top_indicator_frame: Panel
var top_indicator_fill: TextureRect
var top_indicator_fill_texture: Texture2D
var top_indicator_label: Label
var tower_stability_label: Label
var timer_deadline_ms: int = 0
var timer_shown_seconds: int = -1
var known_round_duration_seconds: int = -1
var known_round_duration_level: int = -1
var stability_feedback_mode := "warnings_only"
var stability_warning_threshold := 75
var stability_critical_threshold := 30
var timer_is_playing := false

func bind_nodes(binder) -> void:
	level_label = binder.require_node("LevelLabel") as Label
	timer_label = binder.require_node("TimerLabel") as Label
	level_badge_texture = binder.optional_node("LevelBadgeTexture") as TextureRect
	round_time_texture = binder.optional_node("RoundTimeTexture") as TextureRect
	top_indicator_frame = binder.optional_node("TopIndicatorFrame") as Panel
	top_indicator_fill = binder.optional_node("TopIndicatorFill") as TextureRect
	top_indicator_label = binder.optional_node("TopIndicatorLabel") as Label
	if top_indicator_fill != null:
		top_indicator_fill_texture = top_indicator_fill.texture
	tower_stability_label = binder.require_node("TowerStabilityLabel") as Label
	tower_stability_label.visible = false

func setup(match_state_ref) -> void:
	match_state = match_state_ref

func reset_indicators() -> void:
	level_label.text = "-"
	timer_label.text = "-"
	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeNormalTexture
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeNormalTexture
	timer_deadline_ms = 0
	timer_shown_seconds = -1
	known_round_duration_seconds = -1
	known_round_duration_level = -1
	timer_is_playing = false
	_reset_timer_urgency()

func tick_round_timer() -> void:
	if timer_label == null or timer_deadline_ms <= 0:
		return

	var remaining: int = int(ceil(
		float(timer_deadline_ms - Time.get_ticks_msec()) / 1000.0
	))
	remaining = maxi(0, remaining)

	if remaining == timer_shown_seconds:
		_apply_timer_urgency(remaining)
		return

	timer_shown_seconds = remaining
	timer_label.text = format_clock(remaining)
	_apply_timer_urgency(remaining)

func _apply_timer_urgency(remaining_seconds: int) -> void:
	if timer_label == null:
		return
	if !timer_is_playing or remaining_seconds > TIMER_URGENCY_SECONDS:
		_reset_timer_urgency()
		return
	if remaining_seconds > TIMER_CRITICAL_SECONDS:
		timer_label.modulate = TIMER_AMBER
		return
	var pulse := 0.72 + 0.28 * (0.5 + 0.5 * sin(float(Time.get_ticks_msec()) * 0.004))
	timer_label.modulate = TIMER_CORAL.lerp(Color.WHITE, pulse * 0.35)

func _reset_timer_urgency() -> void:
	if timer_label != null:
		timer_label.modulate = Color.WHITE

func format_clock(total_seconds: int) -> String:
	var safe_seconds: int = maxi(0, total_seconds)

	return "%02d:%02d" % [safe_seconds / 60, safe_seconds % 60]

func set_top_indicator_progress(current_height: int, target_height: int) -> void:
	if top_indicator_fill == null:
		return

	var is_perfect_build: bool = target_height > 0 and current_height == target_height
	var is_over_build: bool = target_height > 0 and current_height > target_height
	var is_achieved: bool = is_perfect_build or is_over_build

	var ratio: float = 0.0

	if target_height > 0:
		ratio = 1.0 if is_achieved else clamp(float(current_height) / float(target_height), 0.0, 1.0)

	top_indicator_fill.anchor_right = ratio
	top_indicator_fill.texture = TopIndicatorFillOverTexture if is_over_build else top_indicator_fill_texture

	if top_indicator_frame != null:
		top_indicator_frame.theme_type_variation = &"TopBarFrameAchievedPanel" if is_achieved else &"TopBarFramePanel"

	if top_indicator_label != null:
		if target_height <= 0:
			top_indicator_label.text = "TOP"
		elif is_over_build:
			top_indicator_label.text = "OVER BUILD (%d/%d)" % [current_height, target_height]
		elif is_perfect_build:
			top_indicator_label.text = "PERFECT BUILD (%d/%d)" % [current_height, target_height]
		else:
			top_indicator_label.text = "TOP (%d/%d)" % [current_height, target_height]

func update_top_bar_display(
	level: int,
	impact_level: int,
	state: String,
	seconds_remaining: int,
	state_remaining_ms: int = -1,
	level_duration_ms: int = 0
) -> void:
	var is_impact_level: bool = level > 1 and (level - 1) % match_state.impact_interval == 0
	var lifecycle_remaining_ms: int = state_remaining_ms
	if lifecycle_remaining_ms < 0:
		lifecycle_remaining_ms = maxi(0, seconds_remaining) * 1000
	var lifecycle_seconds: int = int(ceil(float(lifecycle_remaining_ms) / 1000.0))
	if level_duration_ms > 0:
		known_round_duration_seconds = int(ceil(float(level_duration_ms) / 1000.0))
		known_round_duration_level = level

	level_label.text = str(level) if level > 0 else "-"

	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeSafeTexture if is_impact_level else LevelBadgeNormalTexture

	if state == "starting":
		timer_is_playing = false
		_reset_timer_urgency()
		var paused_seconds := known_round_duration_seconds if known_round_duration_level == level else -1
		timer_deadline_ms = 0
		timer_shown_seconds = paused_seconds
		timer_label.text = format_clock(paused_seconds) if paused_seconds >= 0 else "—"
		if round_time_texture != null:
			round_time_texture.texture = RoundTimeNormalTexture
		return

	timer_is_playing = state == "playing"
	if !timer_is_playing:
		_reset_timer_urgency()
	timer_deadline_ms = Time.get_ticks_msec() + lifecycle_remaining_ms
	timer_shown_seconds = lifecycle_seconds
	timer_label.text = format_clock(lifecycle_seconds)
	var is_frozen: bool = state != "playing"
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeFreezeTexture if is_frozen else RoundTimeNormalTexture
	_apply_timer_urgency(lifecycle_seconds)

func update_tower_stability_ui(stability: int, diagnostics: Variant, components: Variant = []) -> void:
	var displayed_stability: int = stability
	var displayed_diagnostics: Variant = diagnostics
	if stability_feedback_mode == "live_preview" and typeof(components) == TYPE_ARRAY:
		var selected: Dictionary = {}
		var selected_height: int = -1
		var selected_id: int = 2147483647
		for candidate_value in components:
			if typeof(candidate_value) != TYPE_DICTIONARY or not candidate_value.has("height"):
				continue
			var candidate: Dictionary = candidate_value
			var candidate_height := int(candidate.get("height", 0))
			var candidate_id := int(candidate.get("id", 0))
			if candidate_height > selected_height or (candidate_height == selected_height and candidate_id < selected_id):
				selected = candidate
				selected_height = candidate_height
				selected_id = candidate_id
		if not selected.is_empty():
			displayed_stability = int(selected.get("stability", stability))
			displayed_diagnostics = selected.get("diagnostics", diagnostics)
	var safe_stability: int = clampi(displayed_stability, 0, 100)
	var state := (
		"Stable"
		if safe_stability > stability_warning_threshold
		else ("Warning" if safe_stability > stability_critical_threshold else "Critical")
	)
	var lean_suffix := ""
	if typeof(displayed_diagnostics) == TYPE_DICTIONARY:
		var lean_direction := str(displayed_diagnostics.get("leanDirection", "center"))
		if lean_direction != "center":
			lean_suffix = " - leaning " + lean_direction
	tower_stability_label.text = state.to_upper() + " · " + str(safe_stability) + "%" + lean_suffix
	tower_stability_label.modulate = (
		STABILITY_GREEN
		if safe_stability > stability_warning_threshold
		else (STABILITY_YELLOW if safe_stability > stability_critical_threshold else STABILITY_RED)
	)

func set_stability_thresholds(warning_threshold: int, critical_threshold: int) -> void:
	stability_warning_threshold = clampi(warning_threshold, 0, 100)
	stability_critical_threshold = mini(
		stability_warning_threshold,
		clampi(critical_threshold, 0, 100)
	)

func set_stability_meter_visible(feedback_mode: String) -> void:
	stability_feedback_mode = feedback_mode
	tower_stability_label.visible = feedback_mode == "live_preview"
