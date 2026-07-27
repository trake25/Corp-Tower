extends Node

const TutorialLessonsScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd")
const TutorialGatesScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialGates.gd")
const TutorialSceneScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialScene.gd")
const TutorialProgressScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialProgress.gd")

# lesson_id, completed -- emitted whenever a lesson stops running for any
# reason (finished, skipped, or exited early), so the menu knows to reappear.
signal lesson_ended(lesson_id: StringName, completed: bool)

const OBSERVE_DEFAULT_SECONDS := 3.0
const FADE_SECONDS := 0.16
const CARD_TARGET_GAP := 10.0
const CARD_MARGIN := 8.0
const POPOVER_GATES: Array[StringName] = [
	TutorialGatesScript.OPEN_QUEST, TutorialGatesScript.OPEN_POWER,
	TutorialGatesScript.ACTIVATE_POWER, TutorialGatesScript.OPEN_CHAT,
	TutorialGatesScript.SEND_CHAT
]

var node_binder = null
var progress
var scene

var overlay: Control
var dim_top: Control
var dim_bottom: Control
var dim_left: Control
var dim_right: Control
var card: Control
var title_label: Label
var body_label: Label
var step_dots: Control
var back_button: Button
var skip_step_button: Button
var skip_lesson_button: Button
var next_button: Button
var exit_button: Button
var quest_chip: Control
var power_trigger: Control
var quick_chat_trigger: Control

var observe_timer: Timer

var current_lesson: Dictionary = {}
var current_step_index: int = -1
var active: bool = false

func bind_nodes(binder) -> void:
	node_binder = binder
	overlay = binder.optional_node("TutorialOverlay") as Control
	dim_top = binder.optional_node("DimTop") as Control
	dim_bottom = binder.optional_node("DimBottom") as Control
	dim_left = binder.optional_node("DimLeft") as Control
	dim_right = binder.optional_node("DimRight") as Control
	card = binder.optional_node("TutorialCard") as Control
	title_label = binder.optional_node("TutorialTitleLabel") as Label
	body_label = binder.optional_node("TutorialBodyLabel") as Label
	step_dots = binder.optional_node("TutorialStepDots") as Control
	back_button = binder.optional_node("TutorialBackButton") as Button
	skip_step_button = binder.optional_node("TutorialSkipStepButton") as Button
	skip_lesson_button = binder.optional_node("TutorialSkipLessonButton") as Button
	next_button = binder.optional_node("TutorialNextButton") as Button
	exit_button = binder.optional_node("TutorialExitButton") as Button
	quest_chip = binder.optional_node("QuestChip") as Control
	power_trigger = binder.optional_node("PowerTrigger") as Control
	quick_chat_trigger = binder.optional_node("QuickChatTrigger") as Control

func setup(deps: Dictionary) -> void:
	progress = TutorialProgressScript.new()
	scene = TutorialSceneScript.new()
	scene.setup(
		deps.get("tower_stack"), deps.get("inventory"), deps.get("top_bar"),
		deps.get("roster"), deps.get("quest"), deps.get("power"), deps.get("chat"),
		deps.get("score_popups"), deps.get("players_ctx")
	)

	observe_timer = Timer.new()
	observe_timer.one_shot = true
	observe_timer.timeout.connect(_on_observe_timeout)
	add_child(observe_timer)

	if overlay != null:
		overlay.visible = false

	if back_button != null:
		back_button.pressed.connect(back)
	if skip_step_button != null:
		skip_step_button.pressed.connect(skip_step)
	if skip_lesson_button != null:
		skip_lesson_button.pressed.connect(skip_lesson)
	if next_button != null:
		next_button.pressed.connect(advance)
	if exit_button != null:
		exit_button.pressed.connect(_on_exit_pressed)

	if quest_chip != null:
		quest_chip.pressed.connect(func(): _dispatch_action({"type": TutorialGatesScript.OPEN_QUEST}))
	if power_trigger != null:
		power_trigger.pressed.connect(func(): _dispatch_action({"type": TutorialGatesScript.OPEN_POWER}))
	if quick_chat_trigger != null:
		quick_chat_trigger.pressed.connect(func(): _dispatch_action({"type": TutorialGatesScript.OPEN_CHAT}))

func is_active() -> bool:
	return active

func blocks_popovers() -> bool:
	if !active:
		return false

	var steps: Array = current_lesson.get("steps", [])
	if current_step_index < 0 or current_step_index >= steps.size():
		return true

	var gate: StringName = steps[current_step_index].get("gate", TutorialGatesScript.INFO)
	return !POPOVER_GATES.has(gate)

func start_lesson(lesson_id: StringName) -> void:
	var lesson: Dictionary = TutorialLessonsScript.lesson_by_id(lesson_id)
	if lesson.is_empty():
		return

	current_lesson = lesson
	active = true
	scene.load_seed(lesson.get("seed", {}))
	_show_overlay()

	# A lesson can start the same frame a brand-new GameUI instance was just
	# added to the tree (fresh app launch, or Debug Menu -> How to Play), before
	# its containers (ActionRow, etc.) have completed a layout pass -- spotlighting
	# immediately can read a stale/degenerate get_global_rect() for the target.
	# Two frames matches GameUiHarness's own settle wait.
	await get_tree().process_frame
	await get_tree().process_frame

	if !active or current_lesson.get("id", &"") != lesson_id:
		return

	_go_to_step(0)

func teardown() -> void:
	if scene != null:
		scene.teardown()

func on_tutorial_place(index: int, column: int) -> void:
	if scene == null:
		return

	var result: Dictionary = scene.apply_placement(index, column)
	_dispatch_action({
		"type": TutorialGatesScript.PLACE_BLOCK,
		"column": int(result.get("column", column))
	})

func on_power_activated(action: Dictionary) -> void:
	if scene != null and str(action.get("powerId", "")) == "refresh":
		scene.apply_script({"type": "refresh_hand"})
	_dispatch_action(action)

func on_chat_sent(action: Dictionary) -> void:
	if scene != null:
		scene.apply_script({"type": "quick_chat", "slot": action.get("slot", -1)})
	_dispatch_action(action)

func advance() -> void:
	if !active:
		return
	_go_to_step(current_step_index + 1)

func back() -> void:
	if !active or current_step_index <= 0:
		return
	_go_to_step(current_step_index - 1)

func skip_step() -> void:
	if !active:
		return
	_go_to_step(current_step_index + 1)

func skip_lesson() -> void:
	if !active:
		return
	_end_lesson(true)

func _on_exit_pressed() -> void:
	if !active:
		return
	_end_lesson(false)

func _go_to_step(index: int) -> void:
	var steps: Array = current_lesson.get("steps", [])
	if index >= steps.size():
		_end_lesson(true)
		return
	_enter_step(index)

func _enter_step(index: int) -> void:
	var steps: Array = current_lesson.get("steps", [])
	if index < 0 or index >= steps.size():
		return

	current_step_index = index
	var step: Dictionary = steps[index]

	if title_label != null:
		title_label.text = str(step.get("title", ""))
	if body_label != null:
		body_label.text = str(step.get("body", ""))

	_update_step_dots(steps.size(), index)

	var target: Control = _resolve_target(step.get("target", &""))
	_spotlight(target, str(step.get("card", "auto")))

	var gate: StringName = step.get("gate", TutorialGatesScript.INFO)

	if back_button != null:
		back_button.disabled = index <= 0
	if next_button != null:
		# observe steps get a manual way to move on too -- the timer is a
		# fallback so nobody is stuck, not the only way to proceed.
		next_button.visible = gate == TutorialGatesScript.INFO or gate == TutorialGatesScript.OBSERVE
		next_button.text = "Continue" if gate == TutorialGatesScript.OBSERVE else "Next"

	observe_timer.stop()
	if gate == TutorialGatesScript.OBSERVE:
		observe_timer.wait_time = maxf(0.1, float(step.get("observe_seconds", OBSERVE_DEFAULT_SECONDS)))
		observe_timer.start()

	if scene != null:
		scene.apply_script(step.get("on_enter", {}))

func _on_observe_timeout() -> void:
	_dispatch_action({"type": TutorialGatesScript.OBSERVE})

func _dispatch_action(action: Dictionary) -> void:
	if !active:
		return

	var steps: Array = current_lesson.get("steps", [])
	if current_step_index < 0 or current_step_index >= steps.size():
		return

	var step: Dictionary = steps[current_step_index]
	var gate: StringName = step.get("gate", TutorialGatesScript.INFO)

	# info only ever advances via the Next button (advance()) -- is_satisfied
	# would otherwise report true for *any* dispatched action (a stray
	# placement, an incidental popover open, ...) and silently skip the step.
	if gate == TutorialGatesScript.INFO:
		return

	var gate_arg: Variant = step.get("gate_arg", null)

	if TutorialGatesScript.is_satisfied(gate, gate_arg, action):
		observe_timer.stop()
		_go_to_step(current_step_index + 1)

func _end_lesson(completed: bool) -> void:
	var lesson_id: StringName = current_lesson.get("id", &"")

	active = false
	observe_timer.stop()
	_hide_overlay()
	current_lesson = {}
	current_step_index = -1

	if completed and lesson_id != &"":
		progress.mark_complete(lesson_id)

	lesson_ended.emit(lesson_id, completed)

func _resolve_target(target_name: StringName) -> Control:
	if node_binder == null or str(target_name) == "":
		return null
	return node_binder.optional_node(str(target_name)) as Control

func _update_step_dots(step_count: int, current_index: int) -> void:
	if step_dots == null:
		return

	for child in step_dots.get_children():
		child.queue_free()

	for i in range(step_count):
		var dot := ColorRect.new()
		dot.custom_minimum_size = Vector2(7, 7)
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		dot.color = Color(1, 1, 1, 1.0 if i == current_index else 0.35)
		step_dots.add_child(dot)

func _show_overlay() -> void:
	if overlay == null:
		return

	overlay.visible = true
	overlay.modulate.a = 0.0
	var tween: Tween = create_tween()
	tween.tween_property(overlay, "modulate:a", 1.0, FADE_SECONDS)

func _hide_overlay() -> void:
	if overlay == null:
		return

	var tween: Tween = create_tween()
	tween.tween_property(overlay, "modulate:a", 0.0, FADE_SECONDS)
	tween.tween_callback(func():
		if overlay != null:
			overlay.visible = false
	)

func _spotlight(target: Control, card_mode: String) -> void:
	if overlay == null:
		return

	if target == null or !is_instance_valid(target):
		_set_rect(dim_top, Vector2.ZERO, overlay.size)
		_set_rect(dim_bottom, Vector2.ZERO, Vector2.ZERO)
		_set_rect(dim_left, Vector2.ZERO, Vector2.ZERO)
		_set_rect(dim_right, Vector2.ZERO, Vector2.ZERO)
		_position_card(Rect2(overlay.size * 0.5, Vector2.ZERO), "center")
		return

	var global_rect: Rect2 = target.get_global_rect()
	var origin: Vector2 = overlay.get_global_position()
	var local_rect := Rect2(global_rect.position - origin, global_rect.size)
	var bounds: Vector2 = overlay.size

	_set_rect(dim_top, Vector2.ZERO, Vector2(bounds.x, maxf(0.0, local_rect.position.y)))
	_set_rect(
		dim_bottom,
		Vector2(0.0, local_rect.position.y + local_rect.size.y),
		Vector2(bounds.x, maxf(0.0, bounds.y - (local_rect.position.y + local_rect.size.y)))
	)
	_set_rect(
		dim_left,
		Vector2(0.0, local_rect.position.y),
		Vector2(maxf(0.0, local_rect.position.x), local_rect.size.y)
	)
	_set_rect(
		dim_right,
		Vector2(local_rect.position.x + local_rect.size.x, local_rect.position.y),
		Vector2(maxf(0.0, bounds.x - (local_rect.position.x + local_rect.size.x)), local_rect.size.y)
	)

	_position_card(local_rect, card_mode)

func _set_rect(rect_node: Control, pos: Vector2, size: Vector2) -> void:
	if rect_node == null:
		return
	rect_node.position = pos
	rect_node.size = size

func _card_size() -> Vector2:
	# Mirrors PopoverPanel.get_card_size(): the design size set as
	# custom_minimum_size wins for typical copy, and only genuinely oversized
	# content grows past it. A pure get_combined_minimum_size() read is what
	# PopoverPanel's own card sizing rejected -- a wrapping label's minimum
	# size depends on a width the label may not have been laid out with yet,
	# which is what pushed the card off-screen on a fresh instantiation.
	var min_size: Vector2 = card.get_combined_minimum_size()
	return Vector2(
		maxf(min_size.x, card.custom_minimum_size.x),
		maxf(min_size.y, card.custom_minimum_size.y)
	)

func _position_card(local_rect: Rect2, card_mode: String) -> void:
	if card == null or overlay == null:
		return

	card.size = _card_size()
	var card_size: Vector2 = card.size
	var bounds: Vector2 = overlay.size
	var resolved_mode: String = card_mode

	if resolved_mode == "auto" or resolved_mode == "":
		resolved_mode = "below" if local_rect.position.y < bounds.y * 0.5 else "above"

	var target_pos: Vector2

	match resolved_mode:
		"above":
			target_pos = Vector2(local_rect.position.x, local_rect.position.y - CARD_TARGET_GAP - card_size.y)
		"below":
			target_pos = Vector2(local_rect.position.x, local_rect.position.y + local_rect.size.y + CARD_TARGET_GAP)
		_:
			target_pos = (bounds - card_size) * 0.5

	var max_x: float = maxf(CARD_MARGIN, bounds.x - card_size.x - CARD_MARGIN)
	var max_y: float = maxf(CARD_MARGIN, bounds.y - card_size.y - CARD_MARGIN)

	card.position = Vector2(
		clampf(target_pos.x, CARD_MARGIN, max_x),
		clampf(target_pos.y, CARD_MARGIN, max_y)
	)
