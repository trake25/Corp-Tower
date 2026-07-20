extends Node

const QuestIdleTexture = preload("res://Cor/Art/Static/ic-quest-state1.png")
const QuestUnseenTexture = preload("res://Cor/Art/Static/ic-quest-state2.png")
const QuestClearedTexture = preload("res://Cor/Art/Static/ic-quest-state3.png")

var players_ctx
var match_state
var popovers
var quest_chip: TextureButton
var quest_badge: TextureRect
var quest_popover: Control
var quest_seen_level: int = -1
var last_side_quest: Dictionary = {}

func bind_nodes(binder) -> void:
	quest_chip = binder.optional_node("QuestChip") as TextureButton
	quest_badge = binder.optional_node("QuestBadge") as TextureRect
	quest_popover = binder.optional_node("QuestPopover") as Control

func setup(players_ref, match_state_ref, popovers_ref) -> void:
	players_ctx = players_ref
	match_state = match_state_ref
	popovers = popovers_ref

func update_quest_chip(raw_side_quest: Variant) -> void:
	if quest_chip == null:
		return

	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	last_side_quest = side_quest
	var is_unlocked: bool = str(side_quest.get("label", "")) != ""
	var is_cleared: bool = get_quest_claimed_by(side_quest) != ""
	var is_seen: bool = quest_seen_level == match_state.current_level

	quest_chip.visible = true
	if is_cleared:
		quest_chip.texture_normal = QuestClearedTexture
	elif is_unlocked and !is_seen:
		quest_chip.texture_normal = QuestUnseenTexture
	else:
		quest_chip.texture_normal = QuestIdleTexture
	quest_chip.tooltip_text = str(side_quest.get("label", ""))

func get_quest_claimed_by(side_quest: Dictionary) -> String:
	var claimed_by: Variant = side_quest.get("claimedBy", null)
	return claimed_by if typeof(claimed_by) == TYPE_STRING else ""

func on_quest_chip_pressed() -> void:
	quest_seen_level = match_state.current_level
	update_quest_chip(last_side_quest)

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
