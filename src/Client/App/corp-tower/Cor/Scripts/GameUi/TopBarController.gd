extends Node

const LevelBadgeNormalTexture = preload("res://Cor/Art/9-Play/play-level-badge.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/9-Play/play-safe-badge.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/9-Play/play-timer-round.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/9-Play/play-timer-freeze.png")
const TopIndicatorFillOverTexture = preload("res://Cor/Themes/TopIndicatorFillOver.tres")
const FREEZE_BLINK_HALF_SECONDS := 0.35
const FREEZE_BLINK_COLOR := Color(0.82, 0.12, 0.12, 1.0)
const STABILITY_GREEN := Color("#166534")
const STABILITY_YELLOW := Color("#B45309")
const STABILITY_RED := Color("#B91C1C")

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
var freeze_blink_tween: Tween
var freeze_blink_base_color: Color = Color.BLACK
var stability_feedback_mode := "warnings_only"
var stability_warning_threshold := 75
var stability_critical_threshold := 45

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
	stop_freeze_blink()

func start_freeze_blink() -> void:
	if timer_label == null:
		return

	if freeze_blink_tween != null and is_instance_valid(freeze_blink_tween) and freeze_blink_tween.is_running():
		return

	stop_freeze_blink()
	freeze_blink_base_color = timer_label.get_theme_color("font_color")
	freeze_blink_tween = create_tween()
	freeze_blink_tween.set_loops()
	freeze_blink_tween.tween_property(
		timer_label, "theme_override_colors/font_color", FREEZE_BLINK_COLOR, FREEZE_BLINK_HALF_SECONDS
	)
	freeze_blink_tween.tween_property(
		timer_label, "theme_override_colors/font_color", freeze_blink_base_color, FREEZE_BLINK_HALF_SECONDS
	)

func stop_freeze_blink() -> void:
	var was_active: bool = freeze_blink_tween != null and is_instance_valid(freeze_blink_tween)

	if was_active:
		freeze_blink_tween.kill()

	freeze_blink_tween = null

	if was_active and timer_label != null:
		timer_label.add_theme_color_override("font_color", freeze_blink_base_color)

func tick_round_timer() -> void:
	if timer_label == null or timer_deadline_ms <= 0:
		return

	var remaining: int = int(ceil(
		float(timer_deadline_ms - Time.get_ticks_msec()) / 1000.0
	))
	remaining = maxi(0, remaining)

	if remaining == timer_shown_seconds:
		return

	timer_shown_seconds = remaining
	timer_label.text = format_clock(remaining)

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

func update_top_bar_display(level: int, impact_level: int, state: String, seconds_remaining: int) -> void:
	var is_impact_level: bool = level > 1 and (level - 1) % match_state.impact_interval == 0
	var is_frozen: bool = state != "playing"

	level_label.text = str(level) if level > 0 else "-"

	timer_deadline_ms = Time.get_ticks_msec() + seconds_remaining * 1000
	timer_shown_seconds = seconds_remaining
	timer_label.text = format_clock(seconds_remaining)

	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeSafeTexture if is_impact_level else LevelBadgeNormalTexture

	if round_time_texture != null:
		round_time_texture.texture = RoundTimeFreezeTexture if is_frozen else RoundTimeNormalTexture

	if state == "starting":
		start_freeze_blink()
	else:
		stop_freeze_blink()

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
