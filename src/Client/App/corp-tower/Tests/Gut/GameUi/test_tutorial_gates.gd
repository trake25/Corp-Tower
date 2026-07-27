extends GutTest

const TutorialGatesScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialGates.gd")

func test_info_gate_is_always_satisfied() -> void:
	assert_true(TutorialGatesScript.is_satisfied(TutorialGatesScript.INFO, null, {}), "info must advance even with no action at all.")

func test_observe_gate_requires_observe_action() -> void:
	assert_false(TutorialGatesScript.is_satisfied(TutorialGatesScript.OBSERVE, null, {}), "observe must not be satisfied with no action yet.")
	assert_true(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.OBSERVE, null, {"type": "observe"}),
		"observe must be satisfied once the scripted animation reports done."
	)
	assert_false(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.OBSERVE, null, {"type": "place_block"}),
		"observe must ignore an unrelated action type."
	)

func test_place_block_gate_accepts_any_placement() -> void:
	assert_true(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK, null, {"type": "place_block", "column": 3}),
		"place_block must be satisfied by any placement, regardless of column."
	)
	assert_false(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK, null, {"type": "open_quest"}),
		"place_block must not be satisfied by an unrelated action."
	)

func test_place_block_at_without_arg_accepts_any_column() -> void:
	assert_true(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK_AT, null, {"type": "place_block", "column": 2}),
		"A null gate_arg should accept a placement at any column."
	)

func test_place_block_at_with_arg_requires_matching_column() -> void:
	assert_true(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK_AT, 4, {"type": "place_block", "column": 4}),
		"The exact required column should satisfy the gate."
	)
	assert_false(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK_AT, 4, {"type": "place_block", "column": 5}),
		"A different column must not satisfy a column-specific gate."
	)
	assert_false(
		TutorialGatesScript.is_satisfied(TutorialGatesScript.PLACE_BLOCK_AT, 4, {"type": "observe"}),
		"place_block_at must require a real placement action, not just any action."
	)

func test_popover_gates_match_their_own_action_type_only() -> void:
	var cases: Array = [
		[TutorialGatesScript.OPEN_QUEST, "open_quest"],
		[TutorialGatesScript.OPEN_POWER, "open_power"],
		[TutorialGatesScript.ACTIVATE_POWER, "activate_power"],
		[TutorialGatesScript.OPEN_CHAT, "open_chat"],
		[TutorialGatesScript.SEND_CHAT, "send_chat"]
	]

	for case in cases:
		var gate: StringName = case[0]
		var action_type: String = case[1]
		assert_true(
			TutorialGatesScript.is_satisfied(gate, null, {"type": action_type}),
			"%s must be satisfied by its own action type." % action_type
		)
		assert_false(
			TutorialGatesScript.is_satisfied(gate, null, {"type": "not_" + action_type}),
			"%s must not be satisfied by an unrelated action type." % action_type
		)

func test_unknown_gate_is_never_satisfied() -> void:
	assert_false(
		TutorialGatesScript.is_satisfied(&"not_a_real_gate", null, {"type": "place_block"}),
		"An unrecognized gate must never report satisfied."
	)

func test_all_constant_covers_every_gate() -> void:
	var expected: Array[StringName] = [
		TutorialGatesScript.INFO, TutorialGatesScript.OBSERVE,
		TutorialGatesScript.PLACE_BLOCK, TutorialGatesScript.PLACE_BLOCK_AT,
		TutorialGatesScript.OPEN_QUEST, TutorialGatesScript.OPEN_POWER,
		TutorialGatesScript.ACTIVATE_POWER, TutorialGatesScript.OPEN_CHAT,
		TutorialGatesScript.SEND_CHAT
	]

	for gate in expected:
		assert_true(TutorialGatesScript.is_gate(gate), "ALL must include every declared gate constant.")

	assert_eq(TutorialGatesScript.ALL.size(), expected.size(), "ALL must not silently grow or shrink apart from the declared gates.")
