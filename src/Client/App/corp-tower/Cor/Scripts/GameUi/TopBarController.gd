extends Node

const LevelBadgeNormalTexture = preload("res://Cor/Art/Static/level.png")
const LevelBadgeSafeTexture = preload("res://Cor/Art/Static/safe.png")
const RoundTimeNormalTexture = preload("res://Cor/Art/Static/timer-round-time.png")
const RoundTimeFreezeTexture = preload("res://Cor/Art/Static/timer-freeze-time.png")
const TopIndicatorFillOverTexture = preload("res://Cor/Themes/TopIndicatorFillOver.tres")

var match_state
var level_label: Label
var timer_label: Label
var level_badge_texture: TextureRect
var round_time_texture: TextureRect
var top_indicator_frame: Panel
var top_indicator_fill: TextureRect
var top_indicator_fill_texture: Texture2D
var top_indicator_label: Label
var height_label: Label
var tower_value_label: Label
var tower_status_label: Label
var tower_stability_label: Label
var tower_fill: Panel
var timer_deadline_ms: int = 0
var timer_shown_seconds: int = -1

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
	height_label = binder.require_node("HeightLabel") as Label
	tower_value_label = binder.require_node("TowerValueLabel") as Label
	tower_status_label = binder.require_node("TowerStatusLabel") as Label
	tower_stability_label = binder.optional_node("TowerStabilityLabel") as Label
	tower_fill = binder.require_node("TowerFill") as Panel

func setup(match_state_ref) -> void:
	match_state = match_state_ref

func reset_indicators() -> void:
	level_label.text = "-"
	timer_label.text = "-"
	if level_badge_texture != null:
		level_badge_texture.texture = LevelBadgeNormalTexture
	if round_time_texture != null:
		round_time_texture.texture = RoundTimeNormalTexture

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

func set_tower_progress(current_height: int, target_height: int) -> void:
	var ratio: float = 0.0

	if target_height > 0:
		ratio = clamp(float(current_height) / float(target_height), 0.0, 1.0)

	tower_fill.anchor_top = 1.0 - ratio
	tower_fill.anchor_bottom = 1.0
	tower_fill.offset_top = 0.0
	tower_fill.offset_bottom = 0.0
	tower_fill.offset_left = 0.0
	tower_fill.offset_right = 0.0

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

func get_tower_status(state: String, current_height: int, target_height: int) -> String:
	if state == "starting":
		return "Get ready"

	if state == "failed":
		return "Level failed"

	if state == "finished":
		return "Target reached"

	if state == "game_completed":
		return "Tower complete"

	if target_height <= 0:
		return "Waiting"

	var remaining: int = max(0, target_height - current_height)
	return str(remaining) + " height to target"

func update_tower_stability_ui(stability: int, diagnostics: Variant) -> void:
	if tower_stability_label == null:
		return
	var safe_stability: int = clampi(stability, 0, 100)
	var state := "Stable" if safe_stability > 60 else ("Warning" if safe_stability > 30 else "Critical")
	var lean_suffix := ""
	if typeof(diagnostics) == TYPE_DICTIONARY:
		var lean_direction := str(diagnostics.get("leanDirection", "center"))
		if lean_direction != "center":
			lean_suffix = " - leaning " + lean_direction
	tower_stability_label.text = "Tower Stability: " + str(safe_stability) + "% (" + state + lean_suffix + ")"
	tower_stability_label.modulate = Color(0.7, 1.0, 0.75, 1.0) if safe_stability > 60 else (Color(1.0, 0.8, 0.3, 1.0) if safe_stability > 30 else Color(1.0, 0.4, 0.32, 1.0))
