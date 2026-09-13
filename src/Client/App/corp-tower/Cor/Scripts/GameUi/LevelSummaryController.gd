extends Node

const PlayerRailEntryScript = preload("res://Cor/Scripts/PlayerRailEntry.gd")
const PoppinsBoldFont = preload("res://Cor/Fonts/Poppins/Poppins-Bold.ttf")

var players_ctx
var match_state
var tuning
var level_summary_overlay: Control
var level_summary_panel: PanelContainer
var level_summary_title_label: Label
var level_summary_team_label: Label
var level_summary_mvp_label: Label
var level_summary_quest_label: Label
var level_summary_bot_behavior_label: Label
var level_summary_countdown_label: Label
var level_summary_progress_rail: ProgressBar
var level_summary_players_box: VBoxContainer
var terminal_failure_overlay: Control
var terminal_failure_title_label: Label
var terminal_failure_body_label: Label
var terminal_failure_countdown_label: Label
var quest_text_provider: Callable = Callable()
var on_summary_ended: Callable = Callable()
var last_level_summary_key: String = ""
var pending_level_summary: Dictionary = {}
var pending_level_summary_state: String = ""
var pending_level_summary_key: String = ""
var pending_outcome_ready: Callable = Callable()
var pending_outcome_ack: Callable = Callable()
var pending_results_ready := true
var pending_results_remaining_ms: int = -1
var summary_show_timer: Timer
var summary_hide_timer: Timer
var summary_deadline_ms: int = 0
var summary_countdown_last: int = -1
var terminal_failure_deadline_ms: int = 0
var terminal_failure_countdown_last: int = -1
var spectator_mode := false
var summary_result: String = ""
var summary_is_human_results := false
var summary_has_next_level := true
var summary_safe_level: int = 0
var summary_full_window_ms: int = 1

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
	update_terminal_failure_countdown()

func bind_nodes(binder) -> void:
	level_summary_overlay = binder.require_node("LevelSummaryOverlay") as Control
	level_summary_panel = binder.require_node("LevelSummaryPanel") as PanelContainer
	level_summary_title_label = binder.require_node("LevelSummaryTitleLabel") as Label
	level_summary_team_label = binder.require_node("LevelSummaryTeamLabel") as Label
	level_summary_mvp_label = binder.require_node("LevelSummaryMvpLabel") as Label
	level_summary_quest_label = binder.optional_node("LevelSummaryQuestLabel") as Label
	level_summary_bot_behavior_label = binder.optional_node("LevelSummaryBotBehaviorLabel") as Label
	level_summary_countdown_label = binder.require_node("LevelSummaryCountdownLabel") as Label
	level_summary_progress_rail = binder.optional_node("LevelSummaryProgressRail") as ProgressBar
	level_summary_players_box = binder.require_node("LevelSummaryPlayersBox") as VBoxContainer
	terminal_failure_overlay = binder.require_node("TerminalFailureOverlay") as Control
	terminal_failure_title_label = binder.require_node("TerminalFailureTitleLabel") as Label
	terminal_failure_body_label = binder.require_node("TerminalFailureBodyLabel") as Label
	terminal_failure_countdown_label = binder.require_node("TerminalFailureCountdownLabel") as Label

func setup(players_ref, match_state_ref, tuning_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	tuning = tuning_ref

func is_overlay_visible() -> bool:
	return level_summary_overlay != null and level_summary_overlay.visible

func set_spectator_mode(enabled: bool) -> void:
	spectator_mode = enabled
	if not spectator_mode and level_summary_bot_behavior_label != null:
		level_summary_bot_behavior_label.visible = false
		level_summary_bot_behavior_label.text = ""

func queue_level_summary_after_score_popups(
	summary_value: Variant,
	state: String,
	score_popup_wait_seconds: float,
	outcome_ready: Callable = Callable(),
	results_ready: bool = true,
	outcome_ack: Callable = Callable(),
	results_remaining_ms: int = -1
) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		if results_ready:
			resynchronize_summary_window(results_remaining_ms)
		return

	if (
		summary_key == pending_level_summary_key and
		summary_show_timer != null and
		!summary_show_timer.is_stopped()
	):
		if results_ready:
			pending_results_ready = true
			pending_results_remaining_ms = results_remaining_ms
			summary_show_timer.stop()
			show_pending_level_summary()
		return

	pending_level_summary = summary.duplicate(true)
	pending_level_summary_state = state
	pending_level_summary_key = summary_key
	pending_outcome_ready = outcome_ready
	pending_results_ready = results_ready
	pending_outcome_ack = outcome_ack
	pending_results_remaining_ms = results_remaining_ms

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
	if pending_outcome_ready.is_valid() and !bool(pending_outcome_ready.call()):
		if summary_show_timer != null:
			summary_show_timer.stop()
			summary_show_timer.wait_time = 0.05
			summary_show_timer.start()
		return
	if !pending_results_ready:
		if pending_outcome_ack.is_valid():
			pending_outcome_ack.call()
		pending_level_summary = {}
		pending_level_summary_state = ""
		pending_level_summary_key = ""
		pending_outcome_ready = Callable()
		pending_outcome_ack = Callable()
		pending_results_remaining_ms = -1
		return

	var summary: Dictionary = pending_level_summary
	var state: String = pending_level_summary_state
	var results_remaining_ms: int = pending_results_remaining_ms

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""
	pending_outcome_ready = Callable()
	pending_outcome_ack = Callable()
	pending_results_ready = true
	pending_results_remaining_ms = -1

	show_level_summary(summary, state, results_remaining_ms)

func cancel_pending_level_summary() -> void:
	if summary_show_timer != null:
		summary_show_timer.stop()

	pending_level_summary = {}
	pending_level_summary_state = ""
	pending_level_summary_key = ""
	pending_outcome_ready = Callable()
	pending_outcome_ack = Callable()
	pending_results_ready = true
	pending_results_remaining_ms = -1

func show_level_summary(summary_value: Variant, state: String, results_remaining_ms: int = -1) -> void:
	if level_summary_overlay == null or typeof(summary_value) != TYPE_DICTIONARY:
		return

	var summary: Dictionary = summary_value

	if summary.is_empty():
		return

	var summary_key: String = get_level_summary_key(summary)

	if summary_key == last_level_summary_key and level_summary_overlay.visible:
		resynchronize_summary_window(results_remaining_ms)
		return

	last_level_summary_key = summary_key
	level_summary_overlay.visible = true
	level_summary_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	level_summary_overlay.modulate.a = 0.0

	var result: String = str(summary.get("result", state))
	var level_number: int = int(summary.get("level", match_state.current_level))
	var failure_status: Dictionary = get_failure_status(summary)
	summary_result = result
	summary_is_human_results = !spectator_mode and (result == "completed" or result == "failed")
	summary_has_next_level = bool(summary.get("hasNextLevel", true))
	summary_safe_level = get_safe_level(summary)
	configure_summary_presentation(summary_is_human_results)

	if summary_is_human_results:
		configure_human_results_content(summary, result, level_number, failure_status)
	else:
		level_summary_title_label.text = "Level " + str(level_number) + (" Completed" if result == "completed" else " Failed")
		level_summary_team_label.text = get_failure_message(summary) if result != "completed" else ""
		level_summary_team_label.visible = result != "completed"
		level_summary_mvp_label.text = "Failures remaining: " + str(int(failure_status.get("retriesRemaining", 0))) if result != "completed" else ""
		level_summary_mvp_label.visible = result != "completed"
	update_level_summary_quest_row(summary, summary_is_human_results)
	update_level_summary_bot_behavior(summary)
	show_terminal_failure_popup(summary, result)

	clear_children(level_summary_players_box)

	var players: Array = []
	for player_value in summary.get("players", []):
		if typeof(player_value) == TYPE_DICTIONARY:
			players.append(player_value)

	players.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return int(a.get("levelScore", 0)) > int(b.get("levelScore", 0))
	)

	var rank := 1
	for player_summary in players:
		level_summary_players_box.add_child(create_level_summary_player_row(
			player_summary,
			result,
			rank,
			summary_is_human_results,
			get_impact_met_for_player(summary, str(player_summary.get("id", "")))
		))
		rank += 1
	if summary_is_human_results:
		configure_summary_presentation(true)

	var tween: Tween = create_tween()
	tween.tween_property(level_summary_overlay, "modulate:a", 1.0, 0.16)
	if summary_is_human_results and level_summary_panel != null:
		var sheet_position := level_summary_panel.position
		level_summary_panel.position += Vector2(0, 18)
		tween.parallel().tween_property(level_summary_panel, "position", sheet_position, 0.18)

	resynchronize_summary_window(results_remaining_ms)

func hide_level_summary() -> void:
	if summary_hide_timer != null:
		summary_hide_timer.stop()

	if level_summary_overlay != null:
		level_summary_overlay.visible = false
		level_summary_overlay.modulate.a = 1.0

	hide_terminal_failure_popup()

	summary_deadline_ms = 0
	summary_countdown_last = -1

	if on_summary_ended.is_valid():
		on_summary_ended.call()

func get_level_summary_key(summary: Dictionary) -> String:
	var key := (
		str(summary.get("level", match_state.current_level)) + ":" +
		str(summary.get("result", "")) + ":" +
		str(summary.get("teamLevelScore", 0)) + ":" +
		str(summary.get("mvpId", "")) + ":" +
		str(summary.get("exactFinish", false)) + ":" +
		str(summary.get("overbuildHeight", 0))
	)
	var failure_status: Dictionary = get_failure_status(summary)

	if !failure_status.is_empty():
		key += ":" + str(failure_status.get("failureCount", -1)) + ":" + str(failure_status.get("retriesRemaining", -1))

	return key

func get_failure_status(summary: Dictionary) -> Dictionary:
	var raw_status: Variant = summary.get("failureStatus", {})

	if typeof(raw_status) == TYPE_DICTIONARY and !raw_status.is_empty():
		return raw_status

	raw_status = summary.get("impactScoreStatus", {})

	if typeof(raw_status) == TYPE_DICTIONARY:
		var impact_status: Dictionary = raw_status
		if impact_status.has("retriesRemaining"):
			return impact_status

	return {}

func get_failure_message(summary: Dictionary) -> String:
	var failure_reason := str(summary.get("failureReason", summary.get("reason", "")))

	return "Fill impact bars!" if failure_reason == "impact_score_requirement" else "Reach the top!"

func configure_summary_presentation(use_human_sheet: bool) -> void:
	if level_summary_panel == null or level_summary_overlay == null:
		return

	var viewport_size := level_summary_overlay.size
	if viewport_size.x <= 0.0 or viewport_size.y <= 0.0:
		viewport_size = level_summary_overlay.get_viewport_rect().size
	level_summary_panel.set_anchors_preset(Control.PRESET_TOP_LEFT)

	if use_human_sheet:
		var sheet_width := minf(520.0, maxf(280.0, viewport_size.x - 24.0))
		var sheet_height := maxf(
			clampf(viewport_size.y * 0.42, 330.0, 410.0),
			level_summary_panel.get_combined_minimum_size().y
		)
		level_summary_panel.custom_minimum_size = Vector2.ZERO
		level_summary_panel.size = Vector2(sheet_width, sheet_height)
		level_summary_panel.position = Vector2(
			(viewport_size.x - sheet_width) * 0.5,
			viewport_size.y - sheet_height - 10.0
		)
		if level_summary_progress_rail != null:
			level_summary_progress_rail.visible = true
		return

	var legacy_size := Vector2(360, 420)
	level_summary_panel.custom_minimum_size = legacy_size
	level_summary_panel.size = legacy_size
	level_summary_panel.position = (viewport_size - legacy_size) * 0.5
	if level_summary_progress_rail != null:
		level_summary_progress_rail.visible = false

func configure_human_results_content(
	summary: Dictionary,
	result: String,
	level_number: int,
	failure_status: Dictionary
) -> void:
	level_summary_title_label.text = "LEVEL " + str(level_number) + (" CLEARED" if result == "completed" else " FAILED")
	level_summary_team_label.visible = false
	level_summary_mvp_label.visible = false

	if result == "completed":
		if bool(summary.get("exactFinish", false)):
			level_summary_team_label.text = "PERFECT BUILD · " + display_result_player(str(summary.get("finisherId", "")))
			level_summary_team_label.visible = true
		return

	level_summary_team_label.text = get_human_failure_reason(summary)
	level_summary_team_label.visible = true
	level_summary_mvp_label.text = (
		str(int(failure_status.get("retriesRemaining", 0))) + " RETRIES REMAINING\n" +
		"RETURNING TO SAFE LEVEL " + str(summary_safe_level)
	)
	level_summary_mvp_label.visible = true

func get_human_failure_reason(summary: Dictionary) -> String:
	match str(summary.get("failureReason", summary.get("reason", ""))):
		"time_expired":
			return "TIME EXPIRED"
		"impact_score_requirement":
			return "IMPACT MISSED"
		"all_blocks_used":
			return "SUPPLY EXHAUSTED"
		"not_enough_height_remaining":
			return "TARGET NOT REACHED"
		_:
			return "LEVEL FAILED"

func get_safe_level(summary: Dictionary) -> int:
	var impact_status: Variant = summary.get("impactScoreStatus", {})
	if typeof(impact_status) == TYPE_DICTIONARY:
		return int((impact_status as Dictionary).get("impactLevel", summary.get("blockedLevel", 0)))
	return int(summary.get("blockedLevel", 0))

func display_result_player(player_id: String) -> String:
	if player_id != "" and players_ctx.is_local(player_id):
		return "YOU"

	var player_name := str(players_ctx.display_name(player_id))
	return player_name if player_name != "" else player_id

func get_impact_met_for_player(summary: Dictionary, player_id: String) -> Variant:
	if str(summary.get("failureReason", summary.get("reason", ""))) != "impact_score_requirement":
		return null

	var impact_status: Variant = summary.get("impactScoreStatus", {})
	if typeof(impact_status) != TYPE_DICTIONARY:
		return null

	for status_value in (impact_status as Dictionary).get("players", []):
		if typeof(status_value) == TYPE_DICTIONARY and str((status_value as Dictionary).get("id", "")) == player_id:
			return bool((status_value as Dictionary).get("met", false))

	return null

func update_level_summary_quest_row(summary: Dictionary, use_completed_quest: bool = false) -> void:
	if level_summary_quest_label == null:
		return

	if use_completed_quest:
		var side_quest: Variant = summary.get("sideQuest", null)
		if typeof(side_quest) != TYPE_DICTIONARY or (side_quest as Dictionary).is_empty():
			level_summary_quest_label.text = ""
			level_summary_quest_label.visible = false
			return

		var claimed_by := str((side_quest as Dictionary).get("claimedBy", ""))
		level_summary_quest_label.text = (
			"QUEST COMPLETE · " + display_result_player(claimed_by)
			if claimed_by != ""
			else "QUEST MISSED"
		)
		level_summary_quest_label.visible = true
		return

	var quest_text: String = ""
	if quest_text_provider.is_valid():
		quest_text = str(quest_text_provider.call(summary.get("sideQuest", {})))
	level_summary_quest_label.text = "Next Level Quest\n" + quest_text
	level_summary_quest_label.visible = quest_text != ""

func update_level_summary_bot_behavior(summary: Dictionary) -> void:
	if level_summary_bot_behavior_label == null:
		return

	if not spectator_mode:
		level_summary_bot_behavior_label.visible = false
		level_summary_bot_behavior_label.text = ""
		return

	var lines: PackedStringArray = []
	for behavior_value in summary.get("botBehavior", []):
		if typeof(behavior_value) != TYPE_DICTIONARY:
			continue

		var behavior: Dictionary = behavior_value
		var bot_id := str(behavior.get("id", "Bot"))
		var bot_name: String = str(players_ctx.display_name(bot_id))
		if bot_name == "":
			bot_name = bot_id
		var impact_text := "met" if bool(behavior.get("impactMet", false)) else "missed"
		var collapse_count := int(behavior.get("causedCollapse", 0))
		var collapse_text := " collapse %d" % collapse_count if collapse_count > 0 else ""
		lines.append(
			"%s (%s): %d pts H%d · rec %d reinf %d save %d · impact %d %s · risk %d bad %d%s · wait %d power %d" % [
				bot_name,
				str(behavior.get("personality", "bot")).capitalize(),
				int(behavior.get("score", 0)),
				int(behavior.get("height", 0)),
				int(behavior.get("recovery", 0)),
				int(behavior.get("reinforcement", 0)),
				int(behavior.get("criticalSaves", 0)),
				int(behavior.get("impactContribution", 0)),
				impact_text,
				int(behavior.get("riskyDecisions", 0)),
				int(behavior.get("badDecisions", 0)),
				collapse_text,
				int(behavior.get("waits", 0)),
				int(behavior.get("powerUses", 0))
			]
		)

	level_summary_bot_behavior_label.text = "BOT BEHAVIOR\n" + "\n".join(lines)
	level_summary_bot_behavior_label.visible = not lines.is_empty()

func resynchronize_summary_window(results_remaining_ms: int) -> void:
	if summary_hide_timer == null:
		return

	summary_full_window_ms = maxi(1, int(tuning.level_summary_delay_ms))
	var remaining_ms := (
		maxi(0, results_remaining_ms)
		if results_remaining_ms >= 0
		else summary_full_window_ms
	)
	summary_hide_timer.stop()
	summary_hide_timer.wait_time = maxf(0.05, float(remaining_ms) / 1000.0)
	summary_deadline_ms = Time.get_ticks_msec() + remaining_ms
	summary_countdown_last = -1
	update_summary_countdown()
	summary_hide_timer.start()

func update_summary_countdown() -> void:
	if (
		level_summary_countdown_label == null or
		level_summary_overlay == null or
		!level_summary_overlay.visible or
		summary_deadline_ms <= 0
	):
		return

	var remaining_ms := maxi(0, summary_deadline_ms - Time.get_ticks_msec())
	if level_summary_progress_rail != null and summary_is_human_results:
		level_summary_progress_rail.value = clampf(
			float(remaining_ms) / float(maxi(1, summary_full_window_ms)),
			0.0,
			1.0
		)

	var remaining_seconds: int = maxi(0, int(ceil(float(remaining_ms) / 1000.0)))

	if remaining_seconds == summary_countdown_last:
		return

	summary_countdown_last = remaining_seconds
	if summary_is_human_results:
		if summary_result == "completed":
			level_summary_countdown_label.text = (
				"NEXT LEVEL IN " + str(remaining_seconds)
				if summary_has_next_level
				else "RUN COMPLETE"
			)
		else:
			level_summary_countdown_label.text = (
				"RETRYING FROM SAFE LEVEL " + str(summary_safe_level) + " IN " + str(remaining_seconds)
			)
		return

	level_summary_countdown_label.text = "Next level is starting in " + str(remaining_seconds) + "s..."

func show_terminal_failure_popup(summary: Dictionary, result: String) -> void:
	if terminal_failure_overlay == null:
		return

	var failure_status: Dictionary = get_failure_status(summary)
	var is_terminal_failure: bool = result == "game_over" or bool(failure_status.get("gameOver", false))

	if !is_terminal_failure:
		hide_terminal_failure_popup()
		return

	terminal_failure_title_label.text = "Team Failed"
	terminal_failure_body_label.text = "Your team failed and will be sent Home."
	terminal_failure_overlay.visible = true
	terminal_failure_overlay.mouse_filter = Control.MOUSE_FILTER_STOP
	terminal_failure_overlay.modulate.a = 0.0
	terminal_failure_deadline_ms = Time.get_ticks_msec() + 3000
	terminal_failure_countdown_last = -1
	update_terminal_failure_countdown()

	var tween: Tween = create_tween()
	tween.tween_property(terminal_failure_overlay, "modulate:a", 1.0, 0.16)

func hide_terminal_failure_popup() -> void:
	if terminal_failure_overlay != null:
		terminal_failure_overlay.visible = false
		terminal_failure_overlay.modulate.a = 1.0

	terminal_failure_deadline_ms = 0
	terminal_failure_countdown_last = -1

func update_terminal_failure_countdown() -> void:
	if (
		terminal_failure_countdown_label == null or
		terminal_failure_overlay == null or
		!terminal_failure_overlay.visible or
		terminal_failure_deadline_ms <= 0
	):
		return

	var remaining_seconds: int = maxi(0, int(ceil(
		float(terminal_failure_deadline_ms - Time.get_ticks_msec()) / 1000.0
	)))

	if remaining_seconds <= 0:
		hide_terminal_failure_popup()
		return

	if remaining_seconds == terminal_failure_countdown_last:
		return

	terminal_failure_countdown_last = remaining_seconds
	terminal_failure_countdown_label.text = "Returning Home in " + str(remaining_seconds) + "s..."

func get_level_summary_mvp_text(summary: Dictionary) -> String:
	var mvp_id: String = str(summary.get("mvpId", ""))

	if mvp_id == "":
		return "MVP -"

	return "MVP " + players_ctx.display_name(mvp_id) + " +" + str(int(summary.get("mvpScore", 0)))

func create_level_summary_player_row(
	player_summary: Dictionary,
	result: String,
	rank: int = 0,
	use_human_sheet: bool = false,
	impact_met: Variant = null
) -> Control:
	if use_human_sheet:
		return create_human_results_player_row(player_summary, result, rank, impact_met)
	return create_legacy_level_summary_player_row(player_summary)

func create_human_results_player_row(
	player_summary: Dictionary,
	result: String,
	rank: int,
	impact_met: Variant
) -> Control:
	var player_id := str(player_summary.get("id", ""))
	var is_local: bool = bool(players_ctx.is_local(player_id))
	var is_mvp: bool = result == "completed" and bool(player_summary.get("isMvp", false))
	var player_color: Color = players_ctx.color_for(player_id)
	var level_score := int(player_summary.get("levelScore", 0))
	var final_total := int(player_summary.get("finalTotalScore", 0))
	var rollback_total := int(player_summary.get("rollbackTotalScore", final_total))
	var rollback_loss := maxi(0, final_total - rollback_total)
	var row_panel := PanelContainer.new()
	row_panel.name = "LevelSummaryPlayerRow_" + player_id
	row_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row_panel.custom_minimum_size = Vector2(0, 54)
	row_panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row_panel.add_theme_stylebox_override("panel", make_summary_row_style(player_color, is_mvp, is_local))

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 8)
	margin.add_theme_constant_override("margin_top", 5)
	margin.add_theme_constant_override("margin_right", 9)
	margin.add_theme_constant_override("margin_bottom", 5)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 7)

	var rank_label := Label.new()
	rank_label.name = "SummaryRank_" + player_id
	rank_label.text = "#" + str(rank)
	rank_label.custom_minimum_size = Vector2(26, 0)
	rank_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rank_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	rank_label.add_theme_font_override("font", PoppinsBoldFont)
	rank_label.add_theme_font_size_override("font_size", 14)

	var avatar_wrap := Control.new()
	avatar_wrap.custom_minimum_size = Vector2(38, 38)
	avatar_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var avatar_ring := Panel.new()
	avatar_ring.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar_ring.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	avatar_ring.add_theme_stylebox_override("panel", make_summary_avatar_style(player_color, is_mvp, is_local))
	var avatar_texture := TextureRect.new()
	avatar_texture.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar_texture.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	avatar_texture.offset_left = 3.0
	avatar_texture.offset_top = 3.0
	avatar_texture.offset_right = -3.0
	avatar_texture.offset_bottom = -3.0
	avatar_texture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	avatar_texture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	avatar_texture.texture = PlayerRailEntryScript.load_avatar_texture(players_ctx.avatar_id(player_id))
	avatar_wrap.add_child(avatar_ring)
	avatar_wrap.add_child(avatar_texture)

	var identity := VBoxContainer.new()
	identity.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	identity.add_theme_constant_override("separation", 0)
	var identity_line := HBoxContainer.new()
	identity_line.add_theme_constant_override("separation", 4)
	var name_label := Label.new()
	name_label.name = "SummaryPlayerName_" + player_id
	var player_name := str(players_ctx.display_name(player_id))
	name_label.text = player_name if player_name != "" else player_id
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	name_label.clip_text = true
	name_label.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	name_label.add_theme_color_override("font_color", Color(0.08, 0.08, 0.09, 1.0))
	name_label.add_theme_font_size_override("font_size", 15)
	var you_label := make_results_tag("YOU", player_color)
	you_label.name = "SummaryYouTag_" + player_id
	you_label.visible = is_local
	var mvp_label := make_results_tag("MVP", Color(1.0, 0.72, 0.02, 1.0))
	mvp_label.name = "SummaryMvpTag_" + player_id
	mvp_label.visible = is_mvp
	identity_line.add_child(name_label)
	identity_line.add_child(you_label)
	identity_line.add_child(mvp_label)
	if impact_met != null:
		var impact_label := Label.new()
		impact_label.name = "SummaryImpactStatus_" + player_id
		impact_label.text = "IMPACT ✓" if bool(impact_met) else "IMPACT MISSED"
		impact_label.add_theme_color_override(
			"font_color",
			Color(0.08, 0.56, 0.28, 1.0) if bool(impact_met) else Color(0.78, 0.17, 0.16, 1.0)
		)
		impact_label.add_theme_font_size_override("font_size", 11)
		identity_line.add_child(impact_label)
	var status_label := Label.new()
	status_label.name = "SummaryPlayerStatus_" + player_id
	status_label.text = (
		"ROLLBACK −%d" % rollback_loss
		if result == "failed" and rollback_loss > 0
		else "CHECKPOINT UNCHANGED"
		if result == "failed"
		else ""
	)
	status_label.add_theme_color_override(
		"font_color",
		Color(0.78, 0.17, 0.16, 1.0) if result == "failed" and rollback_loss > 0 else player_color
	)
	status_label.add_theme_font_size_override("font_size", 10)
	identity.add_child(identity_line)
	identity.add_child(status_label)

	var score_label := Label.new()
	score_label.name = "SummaryPlayerScore_" + player_id
	if result == "completed":
		score_label.text = "+%d · %d TOTAL" % [level_score, final_total]
	else:
		score_label.text = "+%d ATTEMPT\n%d → %d" % [
			level_score,
			final_total,
			rollback_total
		]
	score_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	score_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	score_label.custom_minimum_size = Vector2(150, 0)
	score_label.add_theme_font_override("font", PoppinsBoldFont)
	score_label.add_theme_color_override("font_color", Color(0.08, 0.08, 0.09, 1.0))
	score_label.add_theme_font_size_override("font_size", 11)

	row.add_child(rank_label)
	row.add_child(avatar_wrap)
	row.add_child(identity)
	row.add_child(score_label)
	margin.add_child(row)
	row_panel.add_child(margin)

	if is_local or is_mvp:
		row_panel.modulate = Color(1.0, 1.0, 1.0, 0.78)
		var emphasis := row_panel.create_tween()
		emphasis.tween_property(row_panel, "modulate", Color.WHITE, 0.18)

	return row_panel

func make_results_tag(tag_text: String, tag_color: Color) -> Label:
	var tag := Label.new()
	tag.text = tag_text
	tag.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	tag.add_theme_font_override("font", PoppinsBoldFont)
	tag.add_theme_color_override("font_color", tag_color)
	tag.add_theme_font_size_override("font_size", 11)
	return tag

func create_legacy_level_summary_player_row(player_summary: Dictionary) -> Control:
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

func make_summary_row_style(player_color: Color, is_mvp: bool, is_local: bool = false) -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = (
		Color(1.0, 0.98, 0.84, 0.94)
		if is_mvp
		else Color(player_color.r, player_color.g, player_color.b, 0.14)
		if is_local
		else Color(1.0, 1.0, 1.0, 0.9)
	)
	style.border_color = (
		Color(1.0, 0.82, 0.04, 1.0)
		if is_mvp
		else player_color
		if is_local
		else Color(0.86, 0.86, 0.86, 0.92)
	)
	style.border_width_left = 4 if is_local else 2
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

func make_summary_avatar_style(player_color: Color, is_mvp: bool, is_local: bool = false) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = player_color
	style.border_color = (
		Color(1.0, 0.82, 0.04, 1.0)
		if is_mvp
		else player_color
		if is_local
		else Color(1, 1, 1, 1)
	)
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
