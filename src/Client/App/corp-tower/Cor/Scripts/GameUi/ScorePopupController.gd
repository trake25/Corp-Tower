extends Node

const SCORE_POPUP_FLOAT_DISTANCE := 64.0
const SCORE_POPUP_INTRO_SECONDS := 0.16
const SCORE_POPUP_FADE_RATIO := 0.28
const SCORE_POPUP_MIN_FADE_SECONDS := 0.35
const SCORE_POPUP_MAX_FADE_SECONDS := 2.0
const SCORE_POPUP_MIN_HOLD_SECONDS := 0.05
const FINISH_SCORE_POPUP_MIN_HOLD_RATIO := 0.08

var players_ctx
var match_state
var tuning
var score_popup_layer: Control
var seen_score_event_ids: Dictionary = {}

func bind_nodes(binder) -> void:
	score_popup_layer = binder.require_node("ScorePopupLayer") as Control
	if score_popup_layer != null:
		score_popup_layer.visible = true

func setup(players_ref, match_state_ref, tuning_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref

func process_score_events(raw_events: Variant, players: Array) -> float:
	var max_popup_duration_seconds: float = 0.0

	if score_popup_layer == null or typeof(raw_events) != TYPE_ARRAY:
		return max_popup_duration_seconds

	for event_value in raw_events:
		if typeof(event_value) != TYPE_DICTIONARY:
			continue

		var event: Dictionary = event_value
		if str(event.get("type", "")) == "team_total":
			continue

		var event_id: String = str(event.get("id", ""))

		if event_id == "":
			event_id = str(event.get("level", match_state.current_level)) + ":" + str(event.get("type", "")) + ":" + str(seen_score_event_ids.size())

		if seen_score_event_ids.has(event_id):
			continue

		seen_score_event_ids[event_id] = true
		var popup_duration_seconds: float = get_score_event_popup_duration_seconds(event)
		show_score_event_popup(event, players, popup_duration_seconds)
		max_popup_duration_seconds = maxf(
			max_popup_duration_seconds,
			popup_duration_seconds
		)

	return max_popup_duration_seconds

func show_score_event_popup(
	event: Dictionary,
	players: Array,
	popup_duration_seconds: float
) -> void:
	if score_popup_layer == null:
		return

	var event_type: String = str(event.get("type", ""))
	var text: String = get_score_event_text(event, players)

	if text == "":
		return

	var text_color: Color = get_score_event_color(event)
	var is_emphasis: bool = is_emphasis_score_event(event_type)
	var popup_size: Vector2 = get_score_popup_size(event_type)
	var popup: PanelContainer = PanelContainer.new()

	popup.mouse_filter = Control.MOUSE_FILTER_IGNORE
	popup.z_index = 20
	popup.custom_minimum_size = popup_size
	popup.size = popup_size
	popup.pivot_offset = popup_size * 0.5
	popup.modulate.a = 0.0
	popup.scale = Vector2(0.82, 0.82) if is_emphasis else Vector2(0.92, 0.92)
	popup.add_theme_stylebox_override("panel", make_score_popup_style(text_color, is_emphasis))

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 10)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)

	var label: Label = Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	label.add_theme_color_override("font_color", text_color)
	label.add_theme_color_override("font_outline_color", Color(0.0, 0.0, 0.0, 0.72))
	label.add_theme_constant_override("outline_size", 4)
	label.add_theme_font_size_override("font_size", get_score_popup_font_size(event_type))

	margin.add_child(label)
	popup.add_child(margin)
	score_popup_layer.add_child(popup)

	var start_position: Vector2 = get_score_popup_position(event)
	popup.position = start_position - popup_size * 0.5

	var total_duration_seconds: float = maxf(0.1, popup_duration_seconds)
	var intro_duration_seconds: float = minf(SCORE_POPUP_INTRO_SECONDS, total_duration_seconds * 0.3)
	var fade_duration_seconds: float = get_score_popup_fade_duration_seconds(
		total_duration_seconds,
		intro_duration_seconds,
		event_type
	)
	var hold_duration_seconds: float = maxf(
		0.0,
		total_duration_seconds - intro_duration_seconds - fade_duration_seconds
	)

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 1.0, intro_duration_seconds)
	tween.tween_property(popup, "scale", Vector2(1.08, 1.08) if is_emphasis else Vector2.ONE, intro_duration_seconds)
	tween.set_parallel(false)
	tween.tween_interval(hold_duration_seconds)
	tween.set_parallel(true)
	tween.tween_property(popup, "modulate:a", 0.0, fade_duration_seconds)
	tween.tween_property(popup, "position:y", popup.position.y - SCORE_POPUP_FLOAT_DISTANCE, fade_duration_seconds)
	tween.tween_property(popup, "scale", Vector2.ONE, fade_duration_seconds)
	tween.set_parallel(false)
	tween.tween_callback(Callable(popup, "queue_free"))

func get_score_popup_fade_duration_seconds(
	total_duration_seconds: float,
	intro_duration_seconds: float,
	event_type: String
) -> float:
	var available_duration_seconds: float = maxf(
		0.01,
		total_duration_seconds - intro_duration_seconds
	)
	if event_type != "placement":
		var finish_hold_seconds: float = minf(
			available_duration_seconds * FINISH_SCORE_POPUP_MIN_HOLD_RATIO,
			0.5
		)

		return maxf(0.01, available_duration_seconds - finish_hold_seconds)

	var minimum_hold_seconds: float = minf(
		SCORE_POPUP_MIN_HOLD_SECONDS,
		available_duration_seconds * 0.5
	)
	var maximum_fade_seconds: float = maxf(
		0.01,
		available_duration_seconds - minimum_hold_seconds
	)
	var scaled_fade_seconds: float = clampf(
		total_duration_seconds * SCORE_POPUP_FADE_RATIO,
		SCORE_POPUP_MIN_FADE_SECONDS,
		SCORE_POPUP_MAX_FADE_SECONDS
	)

	return minf(maximum_fade_seconds, scaled_fade_seconds)

func clear_score_popups() -> void:
	if score_popup_layer == null:
		return

	for child in score_popup_layer.get_children():
		child.queue_free()

func get_score_event_text(event: Dictionary, _players: Array) -> String:
	var event_type: String = str(event.get("type", ""))
	var points: int = int(event.get("points", 0))
	var player_id: String = str(event.get("playerId", ""))

	match event_type:
		"placement":
			return "+" + str(points)
		"finisher_bonus":
			return "FINISH +" + str(points)
		"precision_bonus":
			return "PRECISION +" + str(points)
		"team_exact_bonus":
			return "TEAM +" + str(points)
		"assist_bonus":
			return "ASSIST +" + str(points)
		"exact_finish":
			return "PERFECT FIT"
		"overbuild_finish":
			return "TARGET REACHED +" + str(get_event_overbuild_height(event))
		"mvp":
			return "MVP " + players_ctx.display_name(player_id) + " +" + str(points)
		"impact_failed":
			return "IMPACT FAILED"
		"tower_warning":
			return "TOWER WOBBLING"
		"tower_critical":
			return "TOWER CRITICAL"

	return str(event.get("label", "")).strip_edges()

func get_event_overbuild_height(event: Dictionary) -> int:
	var meta: Variant = event.get("meta", {})

	if typeof(meta) == TYPE_DICTIONARY:
		return int(meta.get("overbuildHeight", event.get("points", 0)))

	return int(event.get("points", 0))

func get_score_event_color(event: Dictionary) -> Color:
	var event_type: String = str(event.get("type", ""))
	var player_id: String = str(event.get("playerId", ""))

	if player_id != "" and players_ctx.color_map.has(player_id):
		return players_ctx.color_map[player_id]

	if event_type == "exact_finish":
		return Color(1.0, 0.84, 0.26, 1.0)

	if event_type == "team_exact_bonus":
		return Color(0.42, 0.84, 1.0, 1.0)

	if event_type == "impact_failed":
		return Color(1.0, 0.38, 0.28, 1.0)

	if event_type == "tower_warning" or event_type == "tower_critical":
		return Color(1.0, 0.55, 0.2, 1.0)

	return Color(1.0, 1.0, 1.0, 1.0)

func is_emphasis_score_event(event_type: String) -> bool:
	return (
		event_type == "exact_finish" or
		event_type == "mvp" or
		event_type == "impact_failed"
	)

func get_score_popup_size(event_type: String) -> Vector2:
	if event_type == "exact_finish":
		return Vector2(240, 54)

	if event_type == "power_activated":
		return Vector2(300, 36)

	if (
		event_type == "mvp" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return Vector2(220, 48)

	return Vector2(128, 38)

func get_score_popup_font_size(event_type: String) -> int:
	if event_type == "exact_finish":
		return 24

	if (
		event_type == "mvp" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return 20

	return 16

func make_score_popup_style(accent_color: Color, is_emphasis: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(0.03, 0.035, 0.045, 0.88 if is_emphasis else 0.78)
	style.border_color = Color(accent_color.r, accent_color.g, accent_color.b, 0.95)
	style.border_width_left = 2 if is_emphasis else 1
	style.border_width_top = 2 if is_emphasis else 1
	style.border_width_right = 2 if is_emphasis else 1
	style.border_width_bottom = 2 if is_emphasis else 1
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

	if event_type == "mvp":
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.25)

	if event_type == "power_activated":
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.816)

	if (
		event_type == "exact_finish" or
		event_type == "overbuild_finish" or
		event_type == "impact_failed"
	):
		return Vector2(layer_size.x * 0.5, layer_size.y * 0.4)

	var player_id: String = str(event.get("playerId", ""))
	var lane_count: int = max(1, players_ctx.order.size())
	var lane_index: int = players_ctx.order.find(player_id)

	if lane_index < 0:
		lane_index = 0

	var x: float = layer_size.x * 0.5

	if lane_count > 1:
		x = lerpf(layer_size.x * 0.22, layer_size.x * 0.78, float(lane_index) / float(lane_count - 1))

	var y_offsets: Dictionary = {
		"placement": 0.58,
		"finisher_bonus": 0.5,
		"precision_bonus": 0.44,
		"team_exact_bonus": 0.38,
		"assist_bonus": 0.52
	}
	var y_ratio: float = float(y_offsets.get(event_type, 0.52))

	return Vector2(x, layer_size.y * y_ratio)

func get_score_event_popup_duration_seconds(event: Dictionary) -> float:
	var event_type: String = str(event.get("type", ""))
	var duration_ms: int = tuning.finish_score_popup_duration_ms

	if event_type == "placement":
		duration_ms = tuning.placement_score_popup_duration_ms

	return max(0.1, float(duration_ms) / 1000.0)
