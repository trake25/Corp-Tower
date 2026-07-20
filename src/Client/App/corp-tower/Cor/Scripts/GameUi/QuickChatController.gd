extends Node

const CHAT_BUBBLE_MAX_WIDTH := 240.0
const ScorePopupControllerScript = preload("res://Cor/Scripts/GameUi/ScorePopupController.gd")

var match_state
var network
var popovers
var popover_blocked: Callable = Callable()
var roster
var score_popups
var chat_popover: Control
var quick_chat_trigger: TextureButton
var quick_chat_templates: Array = []
var quick_chat_cooldown_ms: int = 6000
var last_quick_chat_sent_at_ms: int = 0
var seen_quick_chat_event_ids: Dictionary = {}

func bind_nodes(binder) -> void:
	quick_chat_trigger = binder.optional_node("QuickChatTrigger") as TextureButton
	chat_popover = binder.optional_node("ChatPopover") as Control
	if quick_chat_trigger != null:
		quick_chat_trigger.pressed.connect(open_quick_chat_popover)

func setup(match_state_ref, network_ref, popovers_ref, roster_ref, score_popups_ref, popover_blocked_ref: Callable = Callable()) -> void:
	match_state = match_state_ref
	network = network_ref
	popovers = popovers_ref
	roster = roster_ref
	score_popups = score_popups_ref
	popover_blocked = popover_blocked_ref

func on_quick_chat_pressed(slot: int) -> void:
	if !network.is_conn_estab or match_state.current_match_state != "playing":
		return
	if slot < 0 or slot >= quick_chat_templates.size():
		return
	if Time.get_ticks_msec() - last_quick_chat_sent_at_ms < quick_chat_cooldown_ms:
		return
	last_quick_chat_sent_at_ms = Time.get_ticks_msec()
	network.send_quick_chat(slot)

func open_quick_chat_popover() -> void:
	if popover_blocked.is_valid() and bool(popover_blocked.call()):
		return

	if chat_popover == null:
		return

	if popovers.is_open(chat_popover):
		popovers.close_active()
		return

	chat_popover.call("set_title", "Quick Chat")
	chat_popover.call("clear_rows")

	if quick_chat_templates.is_empty():
		chat_popover.call("add_row", "No quick chat available")
	else:
		for i in range(quick_chat_templates.size()):
			var index: int = i
			chat_popover.call(
				"add_action_row",
				str(quick_chat_templates[i]),
				func():
					on_quick_chat_pressed(index)
					popovers.close_active()
			)

	popovers.present(chat_popover)
	position_chat_popover_card()

func position_chat_popover_card() -> void:
	if chat_popover == null or quick_chat_trigger == null:
		return
	var trigger_rect: Rect2 = quick_chat_trigger.get_global_rect()
	var card_size: Vector2 = chat_popover.call("get_card_size")
	chat_popover.call("set_card_global_position", Vector2(
		trigger_rect.position.x + trigger_rect.size.x + 2.0 - card_size.x,
		trigger_rect.position.y - 13.0 - card_size.y
	))

func process_quick_chat_events(raw_events: Variant) -> void:
	if typeof(raw_events) != TYPE_ARRAY:
		return

	for raw_event in raw_events:
		if typeof(raw_event) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = raw_event
		var event_id: String = str(event.get("id", ""))
		if event_id == "" or seen_quick_chat_event_ids.has(event_id):
			continue
		seen_quick_chat_event_ids[event_id] = true
		var player_id: String = str(event.get("playerId", ""))
		show_quick_chat_bubble(player_id, str(event.get("text", "")), 3.0)

func show_quick_chat_bubble(player_id: String, text: String, duration_seconds: float) -> void:
	if score_popups.score_popup_layer == null or text == "":
		return

	var entry: Control = roster.player_rail_entries.get(player_id, null)
	if entry == null or roster.player_rail_box == null:
		score_popups.show_score_event_popup({
			"type": "quick_chat",
			"playerId": player_id,
			"label": text
		}, [], duration_seconds)
		return

	var bubble: PanelContainer = PanelContainer.new()
	bubble.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bubble.z_index = 20
	bubble.modulate.a = 0.0
	bubble.add_theme_stylebox_override("panel", make_chat_bubble_style())

	var margin: MarginContainer = MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 12)
	margin.add_theme_constant_override("margin_top", 8)
	margin.add_theme_constant_override("margin_right", 12)
	margin.add_theme_constant_override("margin_bottom", 8)

	var label: Label = Label.new()
	label.text = text
	label.theme_type_variation = &"PopoverBodyLabel"
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size = Vector2(CHAT_BUBBLE_MAX_WIDTH, 0)

	margin.add_child(label)
	bubble.add_child(margin)
	score_popups.score_popup_layer.add_child(bubble)

	bubble.size = bubble.get_combined_minimum_size()
	bubble.pivot_offset = bubble.size * 0.5
	bubble.scale = Vector2(0.9, 0.9)

	var rail_right: float = roster.player_rail_box.global_position.x + roster.player_rail_box.size.x
	var row_center_y: float = entry.global_position.y + entry.size.y * 0.5
	bubble.position = Vector2(rail_right + 8.0, row_center_y - bubble.size.y * 0.5)

	var total_duration: float = maxf(0.1, duration_seconds)
	var intro_duration: float = minf(ScorePopupControllerScript.SCORE_POPUP_INTRO_SECONDS, total_duration * 0.3)
	var fade_duration: float = minf(0.35, total_duration * 0.3)
	var hold_duration: float = maxf(0.0, total_duration - intro_duration - fade_duration)

	var tween: Tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(bubble, "modulate:a", 1.0, intro_duration)
	tween.tween_property(bubble, "scale", Vector2.ONE, intro_duration)
	tween.set_parallel(false)
	tween.tween_interval(hold_duration)
	tween.tween_property(bubble, "modulate:a", 0.0, fade_duration)
	tween.tween_callback(Callable(bubble, "queue_free"))

func make_chat_bubble_style() -> StyleBoxFlat:
	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = Color(1, 1, 1, 1)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_right = 14
	style.corner_radius_bottom_left = 4
	style.shadow_color = Color(0.42, 0.55, 0.6, 0.22)
	style.shadow_size = 8
	style.shadow_offset = Vector2(0, 4)
	return style
