extends Node

const PlayerRailEntryScript = preload("res://Cor/Scripts/PlayerRailEntry.gd")
const PoppinsBoldFont = preload("res://Cor/Fonts/Poppins/Poppins-Bold.ttf")

var players_ctx
var match_state
var tuning
var level_summary_overlay: Control
var level_summary_title_label: Label
var level_summary_result_label: Label
var level_summary_team_label: Label
var level_summary_mvp_label: Label
var level_summary_quest_label: Label
var level_summary_countdown_label: Label
var level_summary_players_box: VBoxContainer
var quest_text_provider: Callable = Callable()
var on_summary_ended: Callable = Callable()
var last_level_summary_key: String = ""
var pending_level_summary: Dictionary = {}
var pending_level_summary_state: String = ""
var pending_level_summary_key: String = ""
var summary_show_timer: Timer
var summary_hide_timer: Timer
var summary_deadline_ms: int = 0
var summary_countdown_last: int = -1

func _ready() -> void:
	summary_show_timer = Timer.new()
	summary_show_timer.one_shot = true
	summary_show_timer.timeout.connect(show_pending_level_summary)
	add_child(summary_show_timer)

	summary_hide_timer = Timer.new()
	summary_hide_timer.one_shot = true
	summary_hide_timer.timeout.connect(hide_level_summary)
	add_child(summary_hide_timer)

func _process(_delta: float) -> void:
	update_summary_countdown()

func bind_nodes(binder) -> void:
	level_summary_overlay = binder.require_node("LevelSummaryOverlay") as Control
	level_summary_title_label = binder.require_node("LevelSummaryTitleLabel") as Label
	level_summary_result_label = binder.require_node("LevelSummaryResultLabel") as Label
	level_summary_team_label = binder.require_node("LevelSummaryTeamLabel") as Label
	level_summary_mvp_label = binder.require_node("LevelSummaryMvpLabel") as Label
	level_summary_quest_label = binder.optional_node("LevelSummaryQuestLabel") as Label
	level_summary_countdown_label = binder.require_node("LevelSummaryCountdownLabel") as Label
	level_summary_players_box = binder.require_node("LevelSummaryPlayersBox") as VBoxContainer

func setup(players_ref, match_state_ref, tuning_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref

func is_overlay_visible() -> bool:
	return level_summary_overlay != null and level_summary_overlay.visible

func queue_level_summary_after_score_popups(
	summary_value: Variant,
	state: String,
	score_popup_wait_seconds: float
) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		return

	if (
		summary_key == pending_level_summary_key and
		summary_show_timer != null and
		!summary_show_timer.is_stopped()
	):
		return

	pending_level_summary = summary.duplicate(true)
	pending_level_summary_state = state
	pending_level_summary_key = summary_key

	if score_popup_wait_seconds > 0.0:
		if summary_hide_timer != null:
			summary_hide_timer.stop()

		if level_summary_overlay != null:
			level_summary_overlay.visible = false

		if summary_show_timer != null:
			summary_show_timer.stop()
			summary_show_timer.wait_time = score_popup_wait_seconds
			summary_show_timer.start()

		return

	show_pending_level_summary()

func show_pending_level_summary() -> void:
	if pending_level_summary.is_empty():
		return

	var summary: Dictionary = pending_level_summary
	var state: String = pending_level_summary_state

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""

	show_level_summary(summary, state)

func cancel_pending_level_summary() -> void:
	if summary_show_timer != null:
		summary_show_timer.stop()

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""

func show_level_summary(summary_value: Variant, state: String) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		return

	last_level_summary_key = summary_key
	level_summary_overlay.visible = true
	level_summary_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	level_summary_overlay.modulate.a = 0.0

	var result: String = str(summary.get("result", state))
	var level_number: int = int(summary.get("level", match_state.current_level))
	level_summary_title_label.text = "Level " + str(level_number) + (" Completed" if result == "completed" else " Failed")
	level_summary_result_label.text = get_level_summary_result_text(summary, result)
	level_summary_result_label.visible = false
	level_summary_team_label.visible = false
	level_summary_team_label.text = ""
	level_summary_mvp_label.text = get_level_summary_mvp_text(summary)
	level_summary_mvp_label.visible = false
	update_level_summary_quest_row(summary)

	clear_children(level_summary_players_box)

	var players: Array = []
	for player_value in summary.get("players", []):
		if typeof(player_value) == TYPE_DICTIONARY:
			players.append(player_value)

	players.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("levelScore", 0)) > int(b.get("levelScore", 0))
	)

	for player_summary in players:
		level_summary_players_box.add_child(create_level_summary_player_row(player_summary, result))

	var tween: Tween = create_tween()
	tween.tween_property(level_summary_overlay, "modulate:a", 1.0, 0.16)

	if summary_hide_timer != null:
		summary_hide_timer.stop()
		summary_hide_timer.wait_time = clamp(
			float(tuning.level_summary_delay_ms) / 1000.0,
			1.0,
			10.0
		)
		summary_deadline_ms = Time.get_ticks_msec() + int(summary_hide_timer.wait_time * 1000.0)
		summary_countdown_last = -1
		update_summary_countdown()
		summary_hide_timer.start()

func hide_level_summary() -> void:
	if summary_hide_timer != null:
		summary_hide_timer.stop()

	if level_summary_overlay != null:
		level_summary_overlay.visible = false
		level_summary_overlay.modulate.a = 1.0

	summary_deadline_ms = 0
	summary_countdown_last = -1

	if on_summary_ended.is_valid():
		on_summary_ended.call()

func get_level_summary_key(summary: Dictionary) -> String:
	return (
		str(summary.get("level", match_state.current_level)) + ":" +
		str(summary.get("result", "")) + ":" +
		str(summary.get("teamLevelScore", 0)) + ":" +
		str(summary.get("mvpId", "")) + ":" +
		str(summary.get("exactFinish", false)) + ":" +
		str(summary.get("overbuildHeight", 0))
	)

func get_level_summary_result_text(summary: Dictionary, result: String) -> String:
	if result == "completed":
		var result_text: String = "Perfect Fit" if bool(summary.get("exactFinish", false)) else "Overbuilt +" + str(int(summary.get("overbuildHeight", 0)))
		var finisher_id: String = str(summary.get("finisherId", ""))

		if finisher_id != "":
			result_text += " | Finisher " + players_ctx.display_name(finisher_id)

		return result_text

	var reason: String = str(summary.get("reason", "failed"))

	if reason == "impact_score_requirement":
		return get_impact_failure_summary_text(summary)

	return "Reason: " + format_summary_reason(reason)

func get_impact_failure_summary_text(summary: Dictionary) -> String:
	var status: Dictionary = {}
	var raw_status: Variant = summary.get("impactScoreStatus", {})

	if typeof(raw_status) == TYPE_DICTIONARY:
		status = raw_status

	var blocked_level: int = int(summary.get(
		"blockedLevel",
		status.get("nextImpactLevel", 0)
	))
	var player_statuses: Array = status.get("players", [])
	var player_count: int = 0
	var ready_count: int = 0
	var local_status: Dictionary = {}
	var goal_texts: Array[String] = []

	for raw_player_status in player_statuses:
		if typeof(raw_player_status) != TYPE_DICTIONARY:
			continue

		var player_status: Dictionary = raw_player_status
		var player_id: String = str(player_status.get("id", ""))
		var is_local_player: bool = players_ctx.is_local(player_id)
		player_count += 1

		if is_local_player:
			local_status = player_status

		if bool(player_status.get("met", false)):
			ready_count += 1
			continue

		if !is_local_player:
			goal_texts.append(
				players_ctx.display_name(player_id) +
				" " + str(int(player_status.get("requiredScore", 0)))
			)

	if player_count == 0:
		return get_impact_failure_fallback_text(summary, blocked_level)

	var lines: Array[String] = [
		"Impact L" + str(blocked_level) + "  |  " + str(ready_count) + "/" + str(player_count) + " ready"
	]

	if !local_status.is_empty():
		lines.append(
			"You: " +
			str(int(local_status.get("score", 0))) +
			" / " +
			str(int(local_status.get("requiredScore", 0)))
		)

	if !goal_texts.is_empty():
		lines.append("Goals: " + ", ".join(goal_texts))
	elif ready_count == player_count:
		lines.append("All ready")

	return "\n".join(lines)

func get_impact_failure_fallback_text(summary: Dictionary, blocked_level: int) -> String:
	var failure_texts: Array[String] = []

	for raw_failure in summary.get("impactScoreFailures", []):
		if typeof(raw_failure) != TYPE_DICTIONARY:
			continue

		var failure: Dictionary = raw_failure
		var player_id: String = str(failure.get("id", ""))
		failure_texts.append(
			players_ctx.display_name(player_id) +
			" " + str(int(failure.get("requiredScore", 0)))
		)

	if failure_texts.is_empty():
		return "Impact L" + str(blocked_level) + " failed"

	return "Impact L" + str(blocked_level) + "\nGoals: " + ", ".join(failure_texts)

func update_level_summary_quest_row(summary: Dictionary) -> void:
	if level_summary_quest_label == null:
		return

	var quest_text: String = ""

	if quest_text_provider.is_valid():
		quest_text = str(quest_text_provider.call(summary.get("sideQuest", {})))

	level_summary_quest_label.text = "Next Level Quest\n" + quest_text
	level_summary_quest_label.visible = quest_text != ""

func update_summary_countdown() -> void:
	if (
		level_summary_countdown_label == null or
		level_summary_overlay == null or
		!level_summary_overlay.visible or
		summary_deadline_ms <= 0
	):
		return

	var remaining_seconds: int = maxi(0, int(ceil(
		float(summary_deadline_ms - Time.get_ticks_msec()) / 1000.0
	)))

	if remaining_seconds == summary_countdown_last:
		return

	summary_countdown_last = remaining_seconds
	level_summary_countdown_label.text = (
		"Next level is starting in " + str(remaining_seconds) + "s..."
	)

func get_level_summary_mvp_text(summary: Dictionary) -> String:
	var mvp_id: String = str(summary.get("mvpId", ""))

	if mvp_id == "":
		return "MVP -"

	return "MVP " + players_ctx.display_name(mvp_id) + " +" + str(int(summary.get("mvpScore", 0)))

func create_level_summary_player_row(player_summary: Dictionary, _result: String) -> Control:
	var player_id: String = str(player_summary.get("id", ""))
	var is_mvp: bool = bool(player_summary.get("isMvp", false))
	var player_color: Color = players_ctx.color_for(player_id)
	var row_panel: PanelContainer = PanelContainer.new()

	row_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row_panel.custom_minimum_size = Vector2(0, 54)
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.add_theme_stylebox_override("panel", make_summary_row_style(player_color, is_mvp))

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 9)
	margin.add_theme_constant_override("margin_top", 6)
	margin.add_theme_constant_override("margin_right", 10)
	margin.add_theme_constant_override("margin_bottom", 6)

	var row: HBoxContainer = HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var avatar_wrap := Control.new()
	avatar_wrap.custom_minimum_size = Vector2(42, 42)
	avatar_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE

	var avatar_ring := Panel.new()
	avatar_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar_ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	avatar_ring.add_theme_stylebox_override("panel", make_summary_avatar_style(player_color, is_mvp))

	var avatar_texture := TextureRect.new()
	avatar_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar_texture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	avatar_texture.offset_left = 3.0
	avatar_texture.offset_top = 3.0
	avatar_texture.offset_right = -3.0
	avatar_texture.offset_bottom = -3.0
	avatar_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	avatar_texture.texture = PlayerRailEntryScript.load_avatar_texture(
		players_ctx.avatar_id(player_id)
	)

	var name_label: Label = Label.new()
	name_label.text = players_ctx.display_name(player_id)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.add_theme_color_override("font_color", Color(0.08, 0.08, 0.09, 1.0))
	name_label.add_theme_font_size_override("font_size", 17)

	var mvp_label := Label.new()
	mvp_label.visible = is_mvp
	mvp_label.text = "MVP"
	mvp_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	mvp_label.add_theme_font_override("font", PoppinsBoldFont)
	mvp_label.add_theme_color_override("font_color", Color(1.0, 0.82, 0.08, 1.0))
	mvp_label.add_theme_color_override("font_outline_color", Color(0.08, 0.08, 0.09, 1.0))
	mvp_label.add_theme_constant_override("outline_size", 2)
	mvp_label.add_theme_font_size_override("font_size", 16)

	var score_label_node: Label = Label.new()
	score_label_node.text = str(int(player_summary.get("levelScore", 0)))
	score_label_node.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	score_label_node.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	score_label_node.custom_minimum_size.x = 56
	score_label_node.add_theme_font_override("font", PoppinsBoldFont)
	score_label_node.add_theme_color_override("font_color", Color(0.08, 0.08, 0.09, 1.0))
	score_label_node.add_theme_font_size_override("font_size", 18)

	avatar_wrap.add_child(avatar_ring)
	avatar_wrap.add_child(avatar_texture)
	row.add_child(avatar_wrap)
	row.add_child(name_label)
	row.add_child(mvp_label)
	row.add_child(score_label_node)
	margin.add_child(row)
	row_panel.add_child(margin)

	return row_panel

func make_summary_row_style(player_color: Color, is_mvp: bool) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = (
		Color(1.0, 0.98, 0.84, 0.94)
		if is_mvp
		else Color(1.0, 1.0, 1.0, 0.9)
	)
	style.border_color = (
		Color(1.0, 0.82, 0.04, 1.0)
		if is_mvp
		else Color(0.86, 0.86, 0.86, 0.92)
	)
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_left = 14
	style.corner_radius_bottom_right = 14
	style.shadow_color = Color(player_color.r, player_color.g, player_color.b, 0.12)
	style.shadow_size = 3
	style.shadow_offset = Vector2(0, 2)
	return style

func make_summary_avatar_style(player_color: Color, is_mvp: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = player_color
	style.border_color = Color(1.0, 0.82, 0.04, 1.0) if is_mvp else Color(1, 1, 1, 1)
	style.border_width_left = 2
	style.border_width_top = 2
	style.border_width_right = 2
	style.border_width_bottom = 2
	style.corner_radius_top_left = 21
	style.corner_radius_top_right = 21
	style.corner_radius_bottom_left = 21
	style.corner_radius_bottom_right = 21
	return style

func clear_children(container: Node) -> void:
	if container == null:
		return

	for child in container.get_children():
		child.queue_free()

func format_summary_reason(reason: String) -> String:
	if reason == "impact_score_requirement":
		return "Impact contribution requirement"

	return reason.replace("_", " ").capitalize()
