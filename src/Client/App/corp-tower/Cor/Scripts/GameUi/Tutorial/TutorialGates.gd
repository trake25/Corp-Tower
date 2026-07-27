extends RefCounted

const INFO := &"info"
const OBSERVE := &"observe"
const PLACE_BLOCK := &"place_block"
const PLACE_BLOCK_AT := &"place_block_at"
const OPEN_QUEST := &"open_quest"
const OPEN_POWER := &"open_power"
const ACTIVATE_POWER := &"activate_power"
const OPEN_CHAT := &"open_chat"
const SEND_CHAT := &"send_chat"

const ALL: Array[StringName] = [
	INFO, OBSERVE, PLACE_BLOCK, PLACE_BLOCK_AT,
	OPEN_QUEST, OPEN_POWER, ACTIVATE_POWER, OPEN_CHAT, SEND_CHAT
]

static func is_gate(gate: StringName) -> bool:
	return ALL.has(gate)

# `action` describes what the player (or a scripted event) just did, e.g.
# {"type": "place_block", "column": 3}. Types are compared as strings so a
# caller may pass either a String or a StringName literal without desyncing.
static func is_satisfied(gate: StringName, gate_arg: Variant, action: Dictionary) -> bool:
	if gate == INFO:
		return true

	if action.is_empty():
		return false

	var action_type: String = str(action.get("type", ""))

	if gate == OBSERVE:
		return action_type == str(OBSERVE)

	if gate == PLACE_BLOCK:
		return action_type == str(PLACE_BLOCK)

	if gate == PLACE_BLOCK_AT:
		if action_type != str(PLACE_BLOCK):
			return false
		if gate_arg == null:
			return true
		return int(action.get("column", -1)) == int(gate_arg)

	if gate == OPEN_QUEST:
		return action_type == str(OPEN_QUEST)

	if gate == OPEN_POWER:
		return action_type == str(OPEN_POWER)

	if gate == ACTIVATE_POWER:
		return action_type == str(ACTIVATE_POWER)

	if gate == OPEN_CHAT:
		return action_type == str(OPEN_CHAT)

	if gate == SEND_CHAT:
		return action_type == str(SEND_CHAT)

	return false
