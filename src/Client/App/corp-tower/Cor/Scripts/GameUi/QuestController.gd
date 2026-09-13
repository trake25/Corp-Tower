extends Node

const QuestActiveTexture = preload("res://Cor/Art/9-Play/play-quest-active.png")
const QuestCompletedTexture = preload("res://Cor/Art/9-Play/play-quest-completed.png")

var players_ctx
var match_state
var popovers
var popover_blocked: Callable = Callable()
var quest_chip: TextureButton
var quest_popover: Control
var last_side_quest: Dictionary = {}
var score_popups
var presentation_identity := ""
var presentation_initialized := false
var presentation_claimed_by := ""
var claim_tween: Tween

const REWARD_LABELS := {
	"replenish": "Replenish",
	"refresh": "Refresh",
	"score_cap": "Score Cap",
	"copy_score": "Copy Score"
}

func bind_nodes(binder) -> void:
	quest_chip = binder.optional_node("QuestChip") as TextureButton
	quest_popover = binder.optional_node("QuestPopover") as Control
	if quest_chip != null:
		quest_chip.pressed.connect(on_quest_chip_pressed)

func setup(
	players_ref,
	match_state_ref,
	popovers_ref,
	popover_blocked_ref: Callable = Callable(),
	score_popups_ref = null
) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	popovers = popovers_ref
	popover_blocked = popover_blocked_ref
	score_popups = score_popups_ref

func update_quest_chip(raw_side_quest: Variant) -> void:
	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	last_side_quest = side_quest
	_apply_chip_visual(get_quest_claimed_by(side_quest) != "")

func apply_state(raw_side_quest: Variant, level: int, is_snapshot: bool) -> void:
	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	var claimed_by := get_quest_claimed_by(side_quest)
	var next_identity := _presentation_identity_for(level, side_quest)
	var is_new_quest := !presentation_initialized or next_identity != presentation_identity
	last_side_quest = side_quest

	if is_new_quest or is_snapshot:
		_stop_claim_tween()
		presentation_identity = next_identity
		presentation_initialized = true
		presentation_claimed_by = claimed_by
		_apply_chip_visual(claimed_by != "")
		_refresh_open_quest_popover()
		return

	var became_claimed := presentation_claimed_by == "" and claimed_by != ""
	presentation_claimed_by = claimed_by
	if became_claimed:
		_play_claim_transition(next_identity)
		_show_claim_toast(claimed_by)
	else:
		_apply_chip_visual(claimed_by != "")
	_refresh_open_quest_popover()

func reset_presentation() -> void:
	_stop_claim_tween()
	if popovers != null and popovers.is_open(quest_popover):
		popovers.close_active()
	presentation_identity = ""
	presentation_initialized = false
	presentation_claimed_by = ""
	last_side_quest = {}
	if quest_chip != null:
		quest_chip.scale = Vector2.ONE
		quest_chip.pivot_offset = quest_chip.size * 0.5
		quest_chip.texture_normal = QuestActiveTexture
		quest_chip.tooltip_text = ""

func _presentation_identity_for(level: int, side_quest: Dictionary) -> String:
	return str(level) + ":" + str(side_quest.get("id", ""))

func _apply_chip_visual(is_cleared: bool) -> void:
	if quest_chip == null:
		return

	quest_chip.visible = true
	quest_chip.texture_normal = QuestCompletedTexture if is_cleared else QuestActiveTexture
	quest_chip.tooltip_text = str(last_side_quest.get("label", ""))

func _play_claim_transition(identity: String) -> void:
	if quest_chip == null:
		return
	_stop_claim_tween()
	quest_chip.pivot_offset = quest_chip.size * 0.5
	quest_chip.scale = Vector2.ONE
	quest_chip.texture_normal = QuestActiveTexture
	claim_tween = create_tween()
	claim_tween.tween_property(quest_chip, "scale", Vector2(0.94, 0.94), 0.10)
	claim_tween.tween_callback(func():
		if quest_chip != null and presentation_identity == identity:
			quest_chip.texture_normal = QuestCompletedTexture
	)
	claim_tween.tween_property(quest_chip, "scale", Vector2(1.08, 1.08), 0.14)
	claim_tween.tween_property(quest_chip, "scale", Vector2.ONE, 0.12)

func _stop_claim_tween() -> void:
	if claim_tween != null and is_instance_valid(claim_tween):
		claim_tween.kill()
	if quest_chip != null:
		quest_chip.scale = Vector2.ONE
		quest_chip.pivot_offset = quest_chip.size * 0.5

func get_quest_claimed_by(side_quest: Dictionary) -> String:
	var claimed_by: Variant = side_quest.get("claimedBy", null)
	return claimed_by if typeof(claimed_by) == TYPE_STRING else ""

func get_reward_label(reward_id: String) -> String:
	if REWARD_LABELS.has(reward_id):
		return str(REWARD_LABELS[reward_id])

	return reward_id.replace("_", " ").capitalize()

func get_quest_summary_text(raw_side_quest: Variant) -> String:
	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	var label: String = str(side_quest.get("label", ""))

	if label == "":
		return ""

	var lines: Array[String] = ["QUEST  " + label]
	var claimed_by: String = get_quest_claimed_by(side_quest)

	if claimed_by != "":
		lines.append("Claimed by " + players_ctx.display_name(claimed_by))
	else:
		lines.append("Unclaimed | Reward: " + get_reward_label(str(side_quest.get("rewardId", ""))))

	return "\n".join(lines)

func _show_claim_toast(claimed_by: String) -> void:
	if score_popups == null or !score_popups.has_method("show_quest_claim_toast"):
		return
	var display_name: String = "You" if players_ctx.is_local(claimed_by) else str(players_ctx.display_name(claimed_by))
	if display_name == "":
		display_name = claimed_by
	score_popups.call(
		"show_quest_claim_toast",
		display_name,
		get_reward_label(str(last_side_quest.get("rewardId", ""))),
		players_ctx.color_for(claimed_by)
	)

func on_quest_chip_pressed() -> void:
	if popover_blocked.is_valid() and bool(popover_blocked.call()):
		return

	if popovers.is_open(quest_popover):
		popovers.close_active()
		return

	open_quest_popover()

func open_quest_popover() -> void:
	if quest_popover == null:
		return
	_populate_quest_popover()

	popovers.present(quest_popover)
	position_quest_popover_card()

func _refresh_open_quest_popover() -> void:
	if popovers == null or !popovers.is_open(quest_popover):
		return
	_populate_quest_popover()
	position_quest_popover_card()

func _populate_quest_popover() -> void:
	if quest_popover == null:
		return
	quest_popover.call("set_title", "Quest")
	quest_popover.call("clear_rows")
	quest_popover.call("set_rows_separation", 2)

	var label: String = str(last_side_quest.get("label", ""))
	var claimed_by: String = get_quest_claimed_by(last_side_quest)
	if label == "":
		quest_popover.call("add_row", "No active quest yet")
		return

	var objective_row: Label = quest_popover.call("add_row", label, true, 2)
	if objective_row != null:
		objective_row.add_theme_font_size_override("font_size", 16)
	var reward_row: Label = quest_popover.call(
		"add_row",
		"REWARD · " + get_reward_label(str(last_side_quest.get("rewardId", ""))),
		false,
		1,
		true
	)
	if reward_row != null:
		reward_row.add_theme_font_size_override("font_size", 13)
	var status_text := "UNCLAIMED"
	if claimed_by != "":
		var display_name: String = "You" if players_ctx.is_local(claimed_by) else str(players_ctx.display_name(claimed_by))
		if display_name == "":
			display_name = claimed_by
		status_text = "Claimed by " + display_name
	var status_row: Label = quest_popover.call("add_row", status_text, false, 1, false)
	if status_row != null:
		status_row.add_theme_font_size_override("font_size", 13)
	if status_row != null and claimed_by != "":
		status_row.add_theme_color_override("font_color", players_ctx.color_for(claimed_by))

func position_quest_popover_card() -> void:
	if quest_popover == null or quest_chip == null:
		return
	var chip_rect: Rect2 = quest_chip.get_global_rect()
	quest_popover.call("set_card_global_position", Vector2(
		chip_rect.position.x + chip_rect.size.x + 5.0,
		chip_rect.position.y
	))
