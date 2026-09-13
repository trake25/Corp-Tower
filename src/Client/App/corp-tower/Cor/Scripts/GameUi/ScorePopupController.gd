extends Node

const UiStylesScript = preload("res://Cor/Scripts/GameUi/UiStyles.gd")

const MAX_REWARD_BANNERS := 6
const MAX_REWARD_STREAKS := 3
const MAX_VISIBLE_REWARDS_PER_LANE := 2
const SCORE_POPUP_INTRO_SECONDS := 0.14
const SCORE_POPUP_RELEASE_SECONDS := 0.22
const SCORE_POPUP_SECONDARY_EXIT_SECONDS := 0.20
const POWER_TOAST_CENTER_Y_RATIO := 0.793
const DANGER_BANNER_CENTER_Y_RATIO := 0.24
const TOP_HUD_TEXT_BOTTOM_Y := 184.0
const DANGER_BANNER_MAX_SCALE := 1.04
const DANGER_BANNER_TOP_GAP := 8.0
const PLAYER_LEFT_NOTICE_SECONDS := 3.0
const INK_COLOR := Color("#07111f")
const INK_EDGE_COLOR := Color("#17304a")
const WHITE_COLOR := Color("#f6f8ff")
const POSITIVE_GREEN := Color("#54e59a")
const ACHIEVEMENT_GOLD := Color("#ffc552")
const DANGER_CORAL := Color("#ff6b5f")
const POPUP_EVENT_TYPES := {
	"placement": true,
	"reinforce": true,
	"critical_save": true,
	"tower_warning": true,
	"tower_critical": true
}

class ImpactBanner extends Control:
	var title_label: Label
	var value_label: Label
	var accent: Color = Color.WHITE
	var secondary_accent: Color = Color.WHITE
	var banner_kind := "placement"
	var effect_progress := 0.0
	var reward_strength := 0.0
	var player_id := ""
	var generation := 0
	var animation: Tween
	var effect_animation: Tween

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		z_index = 0
		title_label = _make_label(13)
		value_label = _make_label(25)
		add_child(title_label)
		add_child(value_label)

	func _make_label(font_size: int) -> Label:
		var label := Label.new()
		label.mouse_filter = Control.MOUSE_FILTER_IGNORE
		label.theme_type_variation = &"BoldLabel"
		label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		label.add_theme_color_override("font_color", WHITE_COLOR)
		label.add_theme_color_override("font_outline_color", Color(0.0, 0.02, 0.06, 0.92))
		label.add_theme_constant_override("outline_size", 3)
		label.add_theme_font_size_override("font_size", font_size)
		label.autowrap_mode = TextServer.AUTOWRAP_OFF
		return label

	func configure(
		next_kind: String,
		next_player_id: String,
		next_accent: Color,
		next_secondary_accent: Color,
		title: String,
		value: String,
		banner_size: Vector2
	) -> void:
		if effect_animation != null and is_instance_valid(effect_animation):
			effect_animation.kill()
		generation += 1
		banner_kind = next_kind
		player_id = next_player_id
		accent = next_accent
		secondary_accent = next_secondary_accent
		effect_progress = 0.0
		reward_strength = 0.0
		size = banner_size
		custom_minimum_size = banner_size
		pivot_offset = banner_size * 0.5
		title_label.text = title
		title_label.visible = title != ""
		title_label.position = Vector2(12.0, 8.0)
		title_label.size = Vector2(banner_size.x - 24.0, 18.0)
		value_label.text = value
		value_label.position = Vector2(12.0, 10.0 if title == "" else 24.0)
		value_label.size = Vector2(banner_size.x - 24.0, banner_size.y - value_label.position.y - 8.0)
		value_label.add_theme_font_size_override("font_size", _value_font_size())
		queue_redraw()

	func set_effect_progress(value: float) -> void:
		effect_progress = clampf(value, 0.0, 1.0)
		queue_redraw()

	func _value_font_size() -> int:
		match banner_kind:
			"critical_save":
				return 28
			"tower_warning", "tower_critical":
				return 19
			"reinforce":
				return 23
		return 25

	func _draw() -> void:
		if banner_kind in ["tower_warning", "tower_critical"]:
			_draw_danger_banner()
			return
		if banner_kind == "reinforce":
			_draw_stabilizing_ring()
		elif banner_kind == "critical_save":
			_draw_critical_burst()

		var plate := Rect2(8.0, 10.0, maxf(0.0, size.x - 16.0), maxf(0.0, size.y - 20.0))
		draw_rect(plate, Color(INK_COLOR.r, INK_COLOR.g, INK_COLOR.b, 0.80), true)
		draw_rect(plate, INK_EDGE_COLOR, false, 1.0, true)
		var rail_length := 26.0 + (size.x - 128.0) * 0.18 + reward_strength * 8.0
		if banner_kind == "critical_save":
			rail_length += 16.0
		elif banner_kind == "reinforce":
			rail_length += 7.0
		draw_line(Vector2(0.0, 15.0), Vector2(rail_length, 15.0), accent, 2.5, true)
		draw_line(Vector2(size.x - rail_length, size.y - 15.0), Vector2(size.x, size.y - 15.0), accent, 2.5, true)
		draw_line(Vector2(8.0, 10.0), Vector2(17.0, 10.0), secondary_accent, 1.0, true)
		draw_line(Vector2(size.x - 17.0, size.y - 10.0), Vector2(size.x - 8.0, size.y - 10.0), secondary_accent, 1.0, true)

	func _draw_stabilizing_ring() -> void:
		var center := size * 0.5
		var radius := lerpf(12.0, minf(size.x, size.y) * 0.72, effect_progress)
		var alpha := (1.0 - effect_progress) * 0.52
		draw_arc(center, radius, 0.18, TAU - 0.18, 28, Color(POSITIVE_GREEN.r, POSITIVE_GREEN.g, POSITIVE_GREEN.b, alpha), 1.6, true)
		draw_arc(center, radius * 0.72, PI + 0.25, TAU - 0.25, 20, Color(secondary_accent.r, secondary_accent.g, secondary_accent.b, alpha * 0.65), 1.0, true)

	func _draw_critical_burst() -> void:
		var center := size * 0.5
		var radius := lerpf(14.0, minf(size.x, size.y) * 0.86, effect_progress)
		var alpha := (1.0 - effect_progress) * 0.72
		draw_arc(center, radius, 0.0, TAU, 30, Color(ACHIEVEMENT_GOLD.r, ACHIEVEMENT_GOLD.g, ACHIEVEMENT_GOLD.b, alpha), 1.8, true)
		draw_circle(center, 2.2 + (1.0 - effect_progress) * 2.0, Color(1.0, 1.0, 1.0, alpha * 0.9), true)
		var glints := [
			Vector2(12.0, 8.0),
			Vector2(size.x - 14.0, 13.0),
			Vector2(size.x - 23.0, size.y - 10.0),
			Vector2(22.0, size.y - 8.0),
			Vector2(size.x * 0.5, 3.0)
		]
		for glint in glints:
			var length := 2.0 + effect_progress * 5.0
			var color := Color(1.0, 1.0, 1.0, alpha)
			draw_line(glint - Vector2(length, 0.0), glint + Vector2(length, 0.0), color, 1.2, true)
			draw_line(glint - Vector2(0.0, length), glint + Vector2(0.0, length), color, 1.2, true)

	func _draw_danger_banner() -> void:
		var plate := Rect2(8.0, 8.0, maxf(0.0, size.x - 16.0), maxf(0.0, size.y - 16.0))
		draw_rect(plate, Color(INK_COLOR.r, INK_COLOR.g, INK_COLOR.b, 0.80), true)
		draw_rect(plate, DANGER_CORAL, false, 2.0, true)
		var triangle := PackedVector2Array([
			Vector2(18.0, size.y * 0.5 + 14.0),
			Vector2(34.0, size.y * 0.5 - 14.0),
			Vector2(50.0, size.y * 0.5 + 14.0)
		])
		draw_colored_polygon(triangle, DANGER_CORAL)
		draw_line(Vector2(34.0, size.y * 0.5 - 6.0), Vector2(34.0, size.y * 0.5 + 4.0), WHITE_COLOR, 2.0, true)
		draw_circle(Vector2(34.0, size.y * 0.5 + 9.0), 1.7, WHITE_COLOR, true)
		var chevron_alpha := 0.44 + effect_progress * 0.36
		for offset in [0.0, 12.0, 24.0]:
			var x: float = size.x - 48.0 - float(offset)
			draw_line(Vector2(x, size.y * 0.5 - 9.0), Vector2(x + 7.0, size.y * 0.5), Color(DANGER_CORAL.r, DANGER_CORAL.g, DANGER_CORAL.b, chevron_alpha), 2.0, true)
			draw_line(Vector2(x + 7.0, size.y * 0.5), Vector2(x, size.y * 0.5 + 9.0), Color(DANGER_CORAL.r, DANGER_CORAL.g, DANGER_CORAL.b, chevron_alpha), 2.0, true)

class RewardStreak extends Control:
	var accent := Color.WHITE
	var origin := Vector2.ZERO
	var destination := Vector2.ZERO
	var progress := 0.0
	var animation: Tween

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		visible = false
		z_index = 0

	func configure(next_origin: Vector2, next_destination: Vector2, next_accent: Color, layer_size: Vector2) -> void:
		origin = next_origin
		destination = next_destination
		accent = next_accent
		progress = 0.0
		position = Vector2.ZERO
		size = layer_size
		queue_redraw()

	func set_progress(value: float) -> void:
		progress = clampf(value, 0.0, 1.0)
		queue_redraw()

	func _draw() -> void:
		var dot := origin.lerp(destination, progress)
		var trail_alpha := (1.0 - progress) * 0.62
		draw_line(origin, dot, Color(accent.r, accent.g, accent.b, trail_alpha), 2.0, true)
		draw_circle(dot, 2.4 + (1.0 - progress) * 1.6, Color(accent.r, accent.g, accent.b, 0.95), true)

var players_ctx
var match_state
var tuning
var score_popup_layer: Control
var seen_score_event_ids: Dictionary = {}
var known_player_presence: Dictionary = {}
var presence_snapshot_initialized := false
var reward_banners: Array[ImpactBanner] = []
var active_reward_banners: Dictionary = {}
var reward_streaks: Array[RewardStreak] = []
var danger_banner: ImpactBanner
var rail_target_provider: Callable
var rail_confirmation_callback: Callable
var score_feedback_suppressed := false

func bind_nodes(binder) -> void:
	score_popup_layer = binder.require_node("ScorePopupLayer") as Control
	if score_popup_layer != null:
		score_popup_layer.visible = true

func setup(players_ref, match_state_ref, tuning_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref

func set_reward_rail_presentation(target_provider: Callable, confirmation_callback: Callable) -> void:
	rail_target_provider = target_provider
	rail_confirmation_callback = confirmation_callback

func set_score_feedback_suppressed(suppressed: bool) -> void:
	if score_feedback_suppressed == suppressed:
		return
	score_feedback_suppressed = suppressed
	if suppressed:
		_clear_impact_feedback()

func process_score_events(raw_events: Variant, players: Array) -> float:
	var max_popup_duration_seconds: float = 0.0

	if score_popup_layer == null or typeof(raw_events) != TYPE_ARRAY:
		return max_popup_duration_seconds

	for event_value in raw_events:
		if typeof(event_value) != TYPE_DICTIONARY:
			continue

		var event: Dictionary = event_value
		var raw_event_type: String = str(event.get("type", ""))
		if !POPUP_EVENT_TYPES.has(raw_event_type):
			continue

		var event_id: String = str(event.get("id", ""))
		if event_id == "":
			event_id = str(event.get("level", match_state.current_level)) + ":" + str(event.get("type", "")) + ":" + str(seen_score_event_ids.size())
		if seen_score_event_ids.has(event_id):
			continue

		seen_score_event_ids[event_id] = true
		if score_feedback_suppressed:
			continue

		var popup_duration_seconds: float = get_score_event_popup_duration_seconds(event)
		show_score_event_popup(event, players, popup_duration_seconds)
		max_popup_duration_seconds = maxf(max_popup_duration_seconds, popup_duration_seconds)

	return max_popup_duration_seconds

func process_player_presence(players: Array, is_snapshot: bool) -> void:
	var next_presence: Dictionary = {}

	for player_value in players:
		if typeof(player_value) != TYPE_DICTIONARY:
			continue

		var player: Dictionary = player_value
		var player_id := str(player.get("id", ""))
		var presence := str(player.get("presence", "connected"))
		if player_id == "":
			continue

		if (
			presence_snapshot_initialized
			and not is_snapshot
			and known_player_presence.has(player_id)
			and str(known_player_presence[player_id]) != "left"
			and presence == "left"
		):
			show_player_left_notice(players_ctx.rail_name(player_id))
		next_presence[player_id] = presence

	known_player_presence = next_presence
	presence_snapshot_initialized = true

func reset_presence_tracking() -> void:
	known_player_presence.clear()
	presence_snapshot_initialized = false

func show_player_left_notice(display_name: String) -> void:
	show_score_event_popup({
		"type": "player_left",
		"label": display_name + " left the game"
	}, [], PLAYER_LEFT_NOTICE_SECONDS)

func show_score_event_popup(event: Dictionary, players: Array, popup_duration_seconds: float) -> void:
	if score_popup_layer == null:
		return

	var event_type: String = str(event.get("type", ""))
	if POPUP_EVENT_TYPES.has(event_type):
		if !score_feedback_suppressed:
			_show_impact_banner(event, popup_duration_seconds)
		return

	_show_legacy_toast(event, players, popup_duration_seconds)

func _show_impact_banner(event: Dictionary, popup_duration_seconds: float) -> void:
	var event_type := str(event.get("type", ""))
	if event_type in ["tower_warning", "tower_critical"]:
		_show_danger_banner(event_type, popup_duration_seconds)
		return

	var player_id := str(event.get("playerId", ""))
	var banner := _acquire_reward_banner(player_id)
	if banner == null:
		return
	var banner_kind := _reward_banner_kind(event)
	var content := _impact_banner_content(event)
	var accent := get_score_event_color(event)
	var semantic_accent := accent
	if banner_kind == "reinforce":
		semantic_accent = POSITIVE_GREEN
	elif banner_kind == "critical_save":
		semantic_accent = ACHIEVEMENT_GOLD

	banner.configure(
		banner_kind,
		player_id,
		semantic_accent,
		accent,
		str(content["title"]),
		str(content["value"]),
		get_score_popup_size(banner_kind)
	)
	banner.reward_strength = clampf(float(maxi(0, int(event.get("points", 0)))) / 100.0, 0.0, 1.0)
	banner.queue_redraw()
	var primary_position := get_score_popup_position(event) - banner.size * 0.5
	banner.position = primary_position
	banner.modulate = Color(1.0, 1.0, 1.0, 0.0)
	banner.scale = Vector2(0.88, 0.88) if banner_kind == "critical_save" else Vector2(0.92, 0.92)
	banner.visible = true
	_play_reward_banner(banner, popup_duration_seconds)

func _reward_banner_kind(event: Dictionary) -> String:
	var event_type := str(event.get("type", ""))
	if event_type == "placement":
		var meta: Dictionary = event.get("meta", {})
		if str(meta.get("classification", "")) == "reinforcement":
			return "reinforce"
	return event_type

func _impact_banner_content(event: Dictionary) -> Dictionary:
	var event_type := _reward_banner_kind(event)
	var points := int(event.get("points", 0))
	match event_type:
		"reinforce":
			return {"title": "REINFORCE", "value": "+" + str(points)}
		"critical_save":
			return {"title": "CRITICAL SAVE", "value": "+" + str(points)}
	return {"title": "", "value": "+" + str(points)}

func _acquire_reward_banner(player_id: String) -> ImpactBanner:
	var lane: Array = active_reward_banners.get(player_id, [])
	lane = lane.filter(func(banner): return banner != null and is_instance_valid(banner) and banner.visible)
	if lane.size() >= MAX_VISIBLE_REWARDS_PER_LANE:
		_release_reward_banner(lane.pop_back())
	if !lane.is_empty():
		_shift_to_secondary(lane[0])

	var banner: ImpactBanner = null
	for candidate in reward_banners:
		if !candidate.visible:
			banner = candidate
			break
	if banner == null and reward_banners.size() < MAX_REWARD_BANNERS:
		banner = ImpactBanner.new()
		banner.name = "ImpactBannerPool" + str(reward_banners.size() + 1)
		reward_banners.append(banner)
		score_popup_layer.add_child(banner)
	if banner == null:
		banner = lane.pop_back() if !lane.is_empty() else reward_banners[0]
		_release_reward_banner(banner)

	lane.push_front(banner)
	active_reward_banners[player_id] = lane
	return banner

func _shift_to_secondary(banner: ImpactBanner) -> void:
	if banner == null or !is_instance_valid(banner):
		return
	_stop_tween(banner.animation)
	_stop_tween(banner.effect_animation)
	var generation := banner.generation
	var shifted_position := banner.position + Vector2(0.0, -42.0)
	banner.animation = create_tween()
	banner.animation.set_parallel(true)
	banner.animation.tween_property(banner, "position", shifted_position, 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	banner.animation.tween_property(banner, "scale", Vector2(0.88, 0.88), 0.10)
	banner.animation.tween_property(banner, "modulate:a", 0.56, 0.10)
	banner.animation.set_parallel(false)
	banner.animation.tween_interval(0.05)
	banner.animation.tween_property(banner, "modulate:a", 0.0, SCORE_POPUP_SECONDARY_EXIT_SECONDS)
	banner.animation.tween_callback(func(): _release_reward_banner_if_current(banner, generation))

func _play_reward_banner(banner: ImpactBanner, configured_duration_seconds: float) -> void:
	_stop_tween(banner.animation)
	var duration := maxf(0.10, configured_duration_seconds)
	var strike := minf(SCORE_POPUP_INTRO_SECONDS, duration * 0.26)
	var release := minf(SCORE_POPUP_RELEASE_SECONDS, maxf(0.06, duration * 0.30))
	var settle := minf(0.10, maxf(0.04, duration * 0.13))
	var read := maxf(0.0, duration - strike - settle - release)
	var overshoot_base: float = 1.11 if banner.banner_kind == "critical_save" else 1.055
	var overshoot := Vector2.ONE * (overshoot_base + banner.reward_strength * 0.035)
	var generation := banner.generation

	banner.animation = create_tween()
	banner.animation.set_parallel(true)
	banner.animation.tween_property(banner, "modulate:a", 1.0, strike)
	banner.animation.tween_property(banner, "scale", overshoot, strike).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	banner.animation.set_parallel(false)
	banner.animation.tween_property(banner, "scale", Vector2.ONE, settle).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	banner.animation.tween_interval(read)
	banner.animation.tween_callback(func(): _launch_reward_streak(banner, generation))
	banner.animation.set_parallel(true)
	banner.animation.tween_property(banner, "modulate:a", 0.0, release)
	banner.animation.tween_property(banner, "position:y", banner.position.y - 18.0, release).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	banner.animation.tween_property(banner, "scale", Vector2(0.96, 0.96), release)
	banner.animation.set_parallel(false)
	banner.animation.tween_callback(func(): _release_reward_banner_if_current(banner, generation))

	if banner.banner_kind in ["reinforce", "critical_save"]:
		banner.effect_animation = create_tween()
		banner.effect_animation.tween_method(Callable(banner, "set_effect_progress"), 0.0, 1.0, minf(0.32, duration * 0.42))

func _release_reward_banner_if_current(banner: ImpactBanner, generation: int) -> void:
	if banner != null and is_instance_valid(banner) and banner.generation == generation:
		_release_reward_banner(banner)

func _release_reward_banner(banner: ImpactBanner) -> void:
	if banner == null or !is_instance_valid(banner):
		return
	_stop_tween(banner.animation)
	banner.visible = false
	banner.modulate = Color.WHITE
	banner.scale = Vector2.ONE
	var lane: Array = active_reward_banners.get(banner.player_id, [])
	lane.erase(banner)
	if lane.is_empty():
		active_reward_banners.erase(banner.player_id)
	else:
		active_reward_banners[banner.player_id] = lane

func _show_danger_banner(event_type: String, configured_duration_seconds: float) -> void:
	if danger_banner == null or !is_instance_valid(danger_banner):
		danger_banner = ImpactBanner.new()
		danger_banner.name = "TowerDangerBanner"
		score_popup_layer.add_child(danger_banner)
	_stop_tween(danger_banner.animation)
	_stop_tween(danger_banner.effect_animation)
	var title := "TOWER WOBBLING" if event_type == "tower_warning" else "TOWER CRITICAL"
	danger_banner.configure(event_type, "", DANGER_CORAL, WHITE_COLOR, "", title, get_score_popup_size(event_type))
	danger_banner.z_index = 60
	danger_banner.position = get_score_popup_position({"type": event_type}) - danger_banner.size * 0.5
	danger_banner.modulate = Color(1.0, 1.0, 1.0, 0.0)
	danger_banner.scale = Vector2(0.96, 0.96)
	danger_banner.visible = true
	var duration := maxf(0.10, configured_duration_seconds)
	var intro := minf(0.12, duration * 0.20)
	var release := minf(0.22, maxf(0.06, duration * 0.30))
	var pulse := maxf(0.04, duration - intro - release)
	danger_banner.animation = create_tween()
	danger_banner.animation.set_parallel(true)
	danger_banner.animation.tween_property(danger_banner, "modulate:a", 1.0, intro)
	danger_banner.animation.tween_property(danger_banner, "scale", Vector2(1.04, 1.04), intro).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	danger_banner.animation.set_parallel(false)
	danger_banner.animation.tween_property(danger_banner, "scale", Vector2.ONE, pulse * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	danger_banner.animation.tween_property(danger_banner, "scale", Vector2(1.025, 1.025), pulse * 0.5).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	danger_banner.animation.set_parallel(true)
	danger_banner.animation.tween_property(danger_banner, "modulate:a", 0.0, release)
	danger_banner.animation.tween_property(danger_banner, "scale", Vector2.ONE, release)
	danger_banner.animation.set_parallel(false)
	danger_banner.animation.tween_callback(func(): _release_danger_banner())
	danger_banner.effect_animation = create_tween()
	danger_banner.effect_animation.tween_method(Callable(danger_banner, "set_effect_progress"), 0.0, 1.0, intro + pulse)

func _release_danger_banner() -> void:
	if danger_banner == null or !is_instance_valid(danger_banner):
		return
	_stop_tween(danger_banner.animation)
	_stop_tween(danger_banner.effect_animation)
	danger_banner.visible = false
	danger_banner.modulate = Color.WHITE
	danger_banner.scale = Vector2.ONE

func _launch_reward_streak(banner: ImpactBanner, generation: int) -> void:
	if banner == null or !is_instance_valid(banner) or banner.generation != generation:
		return
	if !rail_target_provider.is_valid() or !rail_confirmation_callback.is_valid():
		return
	var target_global: Variant = rail_target_provider.call(banner.player_id)
	if typeof(target_global) != TYPE_VECTOR2 or target_global.x < 0.0 or target_global.y < 0.0:
		return
	var target: Vector2 = target_global
	var layer_global := score_popup_layer.get_global_rect().position
	var origin := banner.get_global_rect().get_center() - layer_global
	var destination: Vector2 = target - layer_global
	var streak := _acquire_reward_streak()
	if streak == null:
		return
	streak.configure(origin, destination, banner.secondary_accent, score_popup_layer.size)
	streak.visible = true
	streak.animation = create_tween()
	streak.animation.tween_method(Callable(streak, "set_progress"), 0.0, 1.0, 0.16)
	streak.animation.tween_callback(func(): _finish_reward_streak(streak, banner.player_id, banner.secondary_accent))

func _acquire_reward_streak() -> RewardStreak:
	for streak in reward_streaks:
		if !streak.visible:
			return streak
	if reward_streaks.size() < MAX_REWARD_STREAKS:
		var streak := RewardStreak.new()
		streak.name = "ImpactRewardStreak" + str(reward_streaks.size() + 1)
		reward_streaks.append(streak)
		score_popup_layer.add_child(streak)
		return streak
	var reused: RewardStreak = reward_streaks[0]
	_stop_tween(reused.animation)
	return reused

func _finish_reward_streak(streak: RewardStreak, player_id: String, accent: Color) -> void:
	if streak == null or !is_instance_valid(streak):
		return
	streak.visible = false
	if rail_confirmation_callback.is_valid():
		rail_confirmation_callback.call(player_id, accent)

func _show_legacy_toast(event: Dictionary, players: Array, popup_duration_seconds: float) -> void:
	var event_type: String = str(event.get("type", ""))
	var text: String = get_score_event_text(event, players)
	if text == "":
		return

	var text_color: Color = get_score_event_color(event)
	var is_glass_toast: bool = event_type in ["power_activated", "quick_chat", "player_left"]
	var popup_size: Vector2 = get_score_popup_size(event_type)
	var popup := PanelContainer.new()
	popup.name = "PlayerLeftToast" if event_type == "player_left" else (
		"PowerToast" if event_type == "power_activated" else "ScorePopup"
	)
	popup.mouse_filter = Control.MOUSE_FILTER_IGNORE
	popup.z_index = 20
	popup.custom_minimum_size = popup_size
	popup.size = popup_size
	popup.pivot_offset = popup_size * 0.5
	popup.modulate.a = 0.0
	popup.scale = Vector2(0.92, 0.92)
	popup.add_theme_stylebox_override("panel", make_score_popup_style(text_color, false, event_type))

	var margin := MarginContainer.new()
	margin.name = "ToastMargin" if is_glass_toast else "PopupMargin"
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)
	var label := Label.new()
	label.name = "ToastLabel" if is_glass_toast else "PopupLabel"
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.add_theme_color_override("font_color", text_color)
	label.add_theme_font_size_override("font_size", get_score_popup_font_size(event_type))
	label.autowrap_mode = TextServer.AUTOWRAP_OFF
	label.clip_text = is_glass_toast
	label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS if is_glass_toast else TextServer.OVERRUN_NO_TRIMMING
	margin.add_child(label)
	popup.add_child(margin)
	score_popup_layer.add_child(popup)
	popup.position = get_score_popup_position(event) - popup_size * 0.5

	var duration := maxf(0.1, popup_duration_seconds)
	var intro := minf(0.16, duration * 0.3)
	var fade := minf(0.5, maxf(0.16, duration * 0.28))
	var hold := maxf(0.0, duration - intro - fade)
	var tween := create_tween()
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 1.0, intro)
	tween.tween_property(popup, "scale", Vector2.ONE, intro)
	tween.set_parallel(false)
	tween.tween_interval(hold)
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 0.0, fade)
	tween.tween_property(popup, "position:y", popup.position.y - 48.0, fade)
	tween.set_parallel(false)
	tween.tween_callback(Callable(popup, "queue_free"))

func _clear_impact_feedback() -> void:
	for banner in reward_banners:
		_release_reward_banner(banner)
	for streak in reward_streaks:
		_stop_tween(streak.animation)
		streak.visible = false
	if danger_banner != null and is_instance_valid(danger_banner):
		_release_danger_banner()
	active_reward_banners.clear()

func clear_score_popups() -> void:
	if score_popup_layer == null:
		return
	_clear_impact_feedback()
	for child in score_popup_layer.get_children():
		if child is ImpactBanner or child is RewardStreak:
			continue
		child.queue_free()

func _stop_tween(tween: Tween) -> void:
	if tween != null and is_instance_valid(tween):
		tween.kill()

func get_score_event_text(event: Dictionary, _players: Array) -> String:
	var event_type: String = str(event.get("type", ""))
	var points: int = int(event.get("points", 0))
	match event_type:
		"placement":
			var meta: Dictionary = event.get("meta", {})
			if str(meta.get("classification", "")) == "reinforcement":
				return "REINFORCE +" + str(points)
			return "+" + str(points)
		"reinforce":
			return "REINFORCE +" + str(points)
		"critical_save":
			return "CRITICAL SAVE +" + str(points)
		"tower_warning":
			return "TOWER WOBBLING"
		"tower_critical":
			return "TOWER CRITICAL"
	return str(event.get("label", "")).strip_edges()

func get_score_event_color(event: Dictionary) -> Color:
	var event_type: String = str(event.get("type", ""))
	var player_id: String = str(event.get("playerId", ""))
	if event_type in ["power_activated", "quick_chat", "player_left"]:
		return Color(0.08, 0.08, 0.09, 1.0)
	if event_type == "critical_save":
		return ACHIEVEMENT_GOLD
	if event_type == "tower_warning" or event_type == "tower_critical":
		return DANGER_CORAL
	if player_id != "" and players_ctx.color_map.has(player_id):
		return players_ctx.color_map[player_id]
	return Color(1.0, 1.0, 1.0, 1.0)

func is_emphasis_score_event(event_type: String) -> bool:
	return event_type == "critical_save"

func get_score_popup_size(event_type: String) -> Vector2:
	if event_type == "power_activated":
		return Vector2(330, 64)
	if event_type == "quick_chat":
		return Vector2(218, 56)
	if event_type == "player_left":
		return Vector2(300, 56)
	if event_type == "critical_save":
		return Vector2(236, 68)
	if event_type == "reinforce":
		return Vector2(174, 58)
	if event_type in ["tower_warning", "tower_critical"]:
		return Vector2(246, 64)
	return Vector2(142, 54)

func get_score_popup_font_size(event_type: String) -> int:
	if event_type == "power_activated":
		return 16
	return 16

func make_score_popup_style(accent_color: Color, _is_emphasis: bool, event_type: String = "") -> StyleBoxFlat:
	if event_type in ["power_activated", "quick_chat", "player_left"]:
		return UiStylesScript.glass_panel(18)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(INK_COLOR.r, INK_COLOR.g, INK_COLOR.b, 0.86)
	style.border_color = Color(accent_color.r, accent_color.g, accent_color.b, 0.95)
	style.border_width_left = 1
	style.border_width_top = 1
	style.border_width_right = 1
	style.border_width_bottom = 1
	style.corner_radius_top_left = 8
	style.corner_radius_top_right = 8
	style.corner_radius_bottom_left = 8
	style.corner_radius_bottom_right = 8
	return style

func get_score_popup_position(event: Dictionary) -> Vector2:
	var layer_size: Vector2 = score_popup_layer.size if score_popup_layer != null else get_viewport().get_visible_rect().size
	if layer_size.x <= 0.0 or layer_size.y <= 0.0:
		layer_size = get_viewport().get_visible_rect().size
	var event_type: String = str(event.get("type", ""))
	if event_type == "power_activated":
		return Vector2(layer_size.x * 0.5, layer_size.y * POWER_TOAST_CENTER_Y_RATIO)
	if event_type == "player_left":
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.52)
	if event_type in ["tower_warning", "tower_critical"]:
		var banner_height := get_score_popup_size(event_type).y
		var safe_center_y := TOP_HUD_TEXT_BOTTOM_Y + banner_height * 0.5 * DANGER_BANNER_MAX_SCALE + DANGER_BANNER_TOP_GAP
		return Vector2(layer_size.x * 0.5, maxf(layer_size.y * DANGER_BANNER_CENTER_Y_RATIO, safe_center_y))

	var player_id: String = str(event.get("playerId", ""))
	var lane_count: int = max(1, players_ctx.order.size())
	var lane_index: int = players_ctx.order.find(player_id)
	if lane_index < 0:
		lane_index = 0
	var x: float = layer_size.x * 0.5
	if lane_count > 1:
		x = lerpf(layer_size.x * 0.16, layer_size.x * 0.84, float(lane_index) / float(lane_count - 1))
	var popup_width: float = get_score_popup_size(event_type).x
	x = clampf(x, popup_width * 0.5, layer_size.x - popup_width * 0.5)
	return Vector2(x, layer_size.y * 0.58)

func get_score_event_popup_duration_seconds(event: Dictionary) -> float:
	var event_type: String = str(event.get("type", ""))
	var duration_ms: int = tuning.finish_score_popup_duration_ms
	if event_type == "placement" or event_type == "reinforce":
		duration_ms = tuning.placement_score_popup_duration_ms
	return maxf(0.1, float(duration_ms) / 1000.0)
