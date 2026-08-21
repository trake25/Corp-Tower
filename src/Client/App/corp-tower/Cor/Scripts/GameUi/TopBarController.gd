extends Node

const LevelBadgeNormalTexture = preload("res://Cor/Art/Static/level.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/Static/safe.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/Static/timer-round-time.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/Static/timer-freeze-time.png")
const TopIndicatorFillOverTexture = preload("res://Cor/Themes/TopIndicatorFillOver.tres")
const FREEZE_BLINK_HALF_SECONDS := 0.35
const FREEZE_BLINK_COLOR := Color(0.82, 0.12, 0.12, 1.0)

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

func set_top_indicator_progress(current_height: int, target_height: int, state: String = "playing") -> void:
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
		if state == "room_closed":
			top_indicator_label.text = "ROOM CLOSED"
		elif state == "starting":
			top_indicator_label.text = "GET READY · %d/%d" % [current_height, target_height]
		elif state == "failed":
			top_indicator_label.text = "LEVEL FAILED · %d/%d" % [current_height, target_height]
		elif state == "game_completed":
			top_indicator_label.text = "TOWER COMPLETE · %d/%d" % [current_height, target_height]
		elif target_height <= 0:
			top_indicator_label.text = "WAITING FOR MATCH"
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

func update_tower_stability_ui(stability: int, diagnostics: Variant) -> void:
	var safe_stability: int = clampi(stability, 0, 100)
	var state := "Stable" if safe_stability > 60 else ("Warning" if safe_stability > 30 else "Critical")
	var lean_suffix := ""
	if typeof(diagnostics) == TYPE_DICTIONARY:
		var lean_direction := str(diagnostics.get("leanDirection", "center"))
		if lean_direction != "center":
			lean_suffix = " - leaning " + lean_direction
	tower_stability_label.text = state.to_upper() + " · " + str(safe_stability) + "%" + lean_suffix
	tower_stability_label.modulate = Color(0.7, 1.0, 0.75, 1.0) if safe_stability > 60 else (Color(1.0, 0.8, 0.3, 1.0) if safe_stability > 30 else Color(1.0, 0.4, 0.32, 1.0))
