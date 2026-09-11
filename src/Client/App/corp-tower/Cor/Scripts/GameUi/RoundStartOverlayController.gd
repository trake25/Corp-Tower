extends Node

const READY_FEEDBACK_THROTTLE_MS := 500
const WAIT_FOR_BUILD_VISIBLE_MS := 750
const COUNTDOWN_WINDOW_MS := 3000
const READY_BRIEFING_FADE_MS := 180
const READY_BRIEFING_MIN_HEIGHT := 88.0

var round_start_overlay: Control
var briefing_card: Control
var heading_label: Label
var level_target_label: Label
var quest_label: Label
var countdown_label: Label
var wait_for_build_label: Label
var ready_lock_overlays: Array[Control] = []

var ready_active := false
var last_state := ""
var last_level := -1
var presentation_deadline_ms := 0
var wait_for_build_deadline_ms := 0
var feedback_last_at_ms := [-READY_FEEDBACK_THROTTLE_MS, -READY_FEEDBACK_THROTTLE_MS, -READY_FEEDBACK_THROTTLE_MS]
var feedback_count := [0, 0, 0]
var briefing_tween: Tween
var build_tween: Tween
var wait_tween: Tween

func bind_nodes(binder) -> void:
	round_start_overlay = binder.require_node("RoundStartOverlay") as Control
	briefing_card = binder.require_node("ReadyBriefingCard") as Control
	heading_label = binder.require_node("ReadyHeadingLabel") as Label
	level_target_label = binder.require_node("ReadyLevelTargetLabel") as Label
	quest_label = binder.require_node("ReadyQuestLabel") as Label
	countdown_label = binder.require_node("StartCountdownLabel") as Label
	wait_for_build_label = binder.require_node("WaitForBuildLabel") as Label
	ready_lock_overlays = [
		binder.require_node("ReadyLockOverlay1") as Control,
		binder.require_node("ReadyLockOverlay2") as Control,
		binder.require_node("ReadyLockOverlay3") as Control
	]
	for node in [round_start_overlay, briefing_card, countdown_label, wait_for_build_label]:
		if node != null:
			node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for lock_overlay in ready_lock_overlays:
		if lock_overlay != null:
			lock_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	reset()

func reset() -> void:
	ready_active = false
	last_state = ""
	last_level = -1
	presentation_deadline_ms = 0
	_clear_ready_rejection_feedback()
	_stop_tween(briefing_tween)
	_stop_tween(build_tween)
	if briefing_card != null:
		briefing_card.visible = false
		briefing_card.modulate = Color.WHITE
		briefing_card.scale = Vector2.ONE
		briefing_card.size.y = READY_BRIEFING_MIN_HEIGHT
	if countdown_label != null:
		countdown_label.visible = false
		countdown_label.text = ""
		countdown_label.modulate = Color.WHITE
		countdown_label.scale = Vector2.ONE
	update_ready_locks([false, false, false])

func apply_state(
	state: String,
	level: int,
	target_height: int,
	raw_side_quest: Variant,
	state_remaining_ms: int,
	_level_duration_ms: int
) -> void:
	var now := Time.get_ticks_msec()
	var is_starting := state == "starting"
	var was_same_ready := last_state == "starting" and last_level == level

	if is_starting:
		ready_active = true
		_update_briefing(level, target_height, raw_side_quest)
		var incoming_deadline := now + maxi(0, state_remaining_ms)
		if !was_same_ready or presentation_deadline_ms <= 0:
			presentation_deadline_ms = incoming_deadline
		elif abs(incoming_deadline - presentation_deadline_ms) > 250:
			presentation_deadline_ms = incoming_deadline
		_update_starting_presentation()
	else:
		var show_build := state == "playing" and last_state == "starting" and last_level == level
		ready_active = false
		presentation_deadline_ms = 0
		_clear_ready_rejection_feedback()
		if briefing_card != null:
			briefing_card.visible = false
		if countdown_label != null:
			countdown_label.visible = false
			countdown_label.text = ""
		if show_build:
			_show_build_cue()

	last_state = state
	last_level = level

func update_presentation() -> void:
	if ready_active:
		_update_starting_presentation()
	if wait_for_build_deadline_ms > 0 and Time.get_ticks_msec() >= wait_for_build_deadline_ms:
		_clear_ready_rejection_feedback()

func _process(_delta: float) -> void:
	update_presentation()

func _update_briefing(level: int, target_height: int, raw_side_quest: Variant) -> void:
	if heading_label != null:
		heading_label.text = "READY"
	if level_target_label != null:
		level_target_label.text = "LEVEL %d · TARGET %d" % [level, target_height]
	var side_quest: Dictionary = raw_side_quest if typeof(raw_side_quest) == TYPE_DICTIONARY else {}
	var quest_text := str(side_quest.get("label", ""))
	if quest_label != null:
		quest_label.visible = quest_text != ""
		quest_label.text = "QUEST · " + quest_text if quest_text != "" else ""
		call_deferred("_fit_briefing_card_height")

func _fit_briefing_card_height() -> void:
	if briefing_card == null:
		return
	briefing_card.size.y = maxf(READY_BRIEFING_MIN_HEIGHT, briefing_card.get_combined_minimum_size().y)

func _update_starting_presentation() -> void:
	if presentation_deadline_ms <= 0:
		return
	var remaining_ms := maxi(0, presentation_deadline_ms - Time.get_ticks_msec())
	var countdown_active := remaining_ms <= COUNTDOWN_WINDOW_MS
	if briefing_card != null:
		var countdown_elapsed_ms := COUNTDOWN_WINDOW_MS - remaining_ms
		var fade_progress := clampf(float(countdown_elapsed_ms) / READY_BRIEFING_FADE_MS, 0.0, 1.0)
		briefing_card.visible = remaining_ms > 0 and fade_progress < 1.0
		briefing_card.modulate = Color(1.0, 1.0, 1.0, 1.0 - fade_progress) if briefing_card.visible else Color.WHITE
		briefing_card.scale = Vector2.ONE
	if countdown_label == null:
		return
	if !countdown_active:
		countdown_label.visible = false
		return
	var countdown := clampi(int(ceil(float(remaining_ms) / 1000.0)), 1, 3)
	var next_text := str(countdown)
	if countdown_label.text != next_text:
		countdown_label.text = next_text
		_punch_countdown_label()
	countdown_label.visible = true

func _punch_countdown_label() -> void:
	_stop_tween(build_tween)
	if countdown_label == null:
		return
	countdown_label.scale = Vector2(0.88, 0.88)
	countdown_label.modulate = Color(1.0, 1.0, 1.0, 0.82)
	build_tween = create_tween()
	build_tween.set_parallel(true)
	build_tween.tween_property(countdown_label, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	build_tween.tween_property(countdown_label, "modulate", Color.WHITE, 0.12)

func _show_build_cue() -> void:
	if countdown_label == null:
		return
	_stop_tween(build_tween)
	countdown_label.visible = true
	countdown_label.text = "BUILD!"
	countdown_label.scale = Vector2(0.82, 0.82)
	countdown_label.modulate = Color(0.78, 0.96, 1.0, 0.0)
	build_tween = create_tween()
	build_tween.set_parallel(true)
	build_tween.tween_property(countdown_label, "scale", Vector2(1.08, 1.08), 0.16).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	build_tween.tween_property(countdown_label, "modulate", Color(0.78, 0.96, 1.0, 1.0), 0.10)
	build_tween.chain().tween_property(countdown_label, "scale", Vector2.ONE, 0.12)
	build_tween.chain().tween_property(countdown_label, "modulate", Color(0.78, 0.96, 1.0, 0.0), 0.30)
	build_tween.chain().tween_callback(func():
		if countdown_label != null and countdown_label.text == "BUILD!":
			countdown_label.visible = false
	)

func update_ready_locks(filled_ready_slots: Array) -> void:
	for i in range(ready_lock_overlays.size()):
		var lock_overlay: Control = ready_lock_overlays[i]
		if lock_overlay == null:
			continue
		var should_lock := i < filled_ready_slots.size() and bool(filled_ready_slots[i])
		if lock_overlay.has_method("set_ready_locked"):
			lock_overlay.call("set_ready_locked", should_lock)
		else:
			lock_overlay.visible = should_lock

func reject_placement_attempt(index: int) -> void:
	if !ready_active or index < 0 or index >= feedback_last_at_ms.size():
		return
	var now := Time.get_ticks_msec()
	if now - int(feedback_last_at_ms[index]) < READY_FEEDBACK_THROTTLE_MS:
		return
	feedback_last_at_ms[index] = now
	feedback_count[index] = int(feedback_count[index]) + 1
	if index < ready_lock_overlays.size() and ready_lock_overlays[index] != null:
		var lock_overlay := ready_lock_overlays[index]
		if lock_overlay.has_method("pulse"):
			lock_overlay.call("pulse")
	_show_wait_for_build()

func ready_feedback_count(index: int) -> int:
	if index < 0 or index >= feedback_count.size():
		return 0
	return int(feedback_count[index])

func clear_ready_rejection_feedback() -> void:
	_clear_ready_rejection_feedback()

func _show_wait_for_build() -> void:
	if wait_for_build_label == null:
		return
	wait_for_build_deadline_ms = Time.get_ticks_msec() + WAIT_FOR_BUILD_VISIBLE_MS
	_stop_tween(wait_tween)
	wait_for_build_label.visible = true
	wait_for_build_label.modulate = Color(1.0, 1.0, 1.0, 0.0)
	wait_tween = create_tween()
	wait_tween.tween_property(wait_for_build_label, "modulate", Color.WHITE, 0.10)

func _clear_ready_rejection_feedback() -> void:
	wait_for_build_deadline_ms = 0
	feedback_last_at_ms = [-READY_FEEDBACK_THROTTLE_MS, -READY_FEEDBACK_THROTTLE_MS, -READY_FEEDBACK_THROTTLE_MS]
	_stop_tween(wait_tween)
	if wait_for_build_label != null:
		wait_for_build_label.visible = false
		wait_for_build_label.modulate = Color.WHITE

func _stop_tween(tween: Tween) -> void:
	if tween != null and is_instance_valid(tween):
		tween.kill()
