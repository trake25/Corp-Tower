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
var freeze_popover_active: bool = false
var freeze_popover_prev_auto_close: float = -1.0

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

func setup(players_ref, match_state_ref, popovers_ref, popover_blocked_ref: Callable = Callable()) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	popovers = popovers_ref
	popover_blocked = popover_blocked_ref

func update_quest_chip(raw_side_quest: Variant) -> void:
	if quest_chip == null:
		return

	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	last_side_quest = side_quest
	var is_cleared: bool = get_quest_claimed_by(side_quest) != ""

	quest_chip.visible = true
	quest_chip.texture_normal = QuestCompletedTexture if is_cleared else QuestActiveTexture
	quest_chip.tooltip_text = str(side_quest.get("label", ""))

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

func update_freeze_quest_popover(state: String, raw_side_quest: Variant) -> void:
	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	var label: String = str(side_quest.get("label", ""))
	var should_be_active: bool = state == "starting" and label != ""

	if should_be_active == freeze_popover_active:
		return

	freeze_popover_active = should_be_active

	if should_be_active:
		open_freeze_quest_popover()
	else:
		close_freeze_quest_popover()

func reset_freeze_quest_popover() -> void:
	freeze_popover_active = false
	close_freeze_quest_popover()

func open_freeze_quest_popover() -> void:
	if quest_popover == null or popovers == null:
		return

	freeze_popover_prev_auto_close = float(quest_popover.get("auto_close_seconds"))
	quest_popover.set("auto_close_seconds", 0.0)
	open_quest_popover()

func close_freeze_quest_popover() -> void:
	if quest_popover == null:
		return

	if freeze_popover_prev_auto_close >= 0.0:
		quest_popover.set("auto_close_seconds", freeze_popover_prev_auto_close)
		freeze_popover_prev_auto_close = -1.0

	if popovers != null and popovers.is_open(quest_popover):
		popovers.close_active()

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

	quest_popover.call("set_title", "Quest")
	quest_popover.call("clear_rows")

	var label: String = str(last_side_quest.get("label", ""))
	var claimed_by: String = get_quest_claimed_by(last_side_quest)

	if label == "":
		quest_popover.call("add_row", "No active quest yet")
	else:
		quest_popover.call("add_row", label)
		if claimed_by != "":
			var claim_row: Label = quest_popover.call(
				"add_row",
				"Claimed by " + players_ctx.display_name(claimed_by)
			)
			if claim_row != null:
				claim_row.add_theme_color_override("font_color", players_ctx.color_for(claimed_by))

	popovers.present(quest_popover)
	position_quest_popover_card()

func position_quest_popover_card() -> void:
	if quest_popover == null or quest_chip == null:
		return
	var chip_rect: Rect2 = quest_chip.get_global_rect()
	quest_popover.call("set_card_global_position", Vector2(
		chip_rect.position.x + chip_rect.size.x + 5.0,
		chip_rect.position.y
	))
