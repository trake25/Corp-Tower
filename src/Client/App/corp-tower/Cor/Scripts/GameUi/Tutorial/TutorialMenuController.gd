extends Node

const TutorialLessonsScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd")

var tutorial
var on_exit: Callable = Callable()

var menu_root: Control
var menu_dim: Control
var list_box: VBoxContainer
var start_button: Button
var exit_button: Button

func bind_nodes(binder) -> void:
	menu_root = binder.optional_node("TutorialMenu") as Control
	menu_dim = binder.optional_node("TutorialMenuDim") as Control
	list_box = binder.optional_node("TutorialMenuList") as VBoxContainer
	start_button = binder.optional_node("TutorialMenuStartButton") as Button
	exit_button = binder.optional_node("TutorialMenuExitButton") as Button

func setup(tutorial_ref, on_exit_ref: Callable = Callable()) -> void:
	tutorial = tutorial_ref
	on_exit = on_exit_ref

	if menu_root != null:
		menu_root.visible = false
	if menu_dim != null:
		menu_dim.visible = false
	if start_button != null:
		start_button.pressed.connect(_on_start_pressed)
	if exit_button != null:
		exit_button.pressed.connect(_on_exit_pressed)
	if tutorial != null and tutorial.has_signal("lesson_ended"):
		tutorial.lesson_ended.connect(_on_lesson_ended)

func show_menu() -> void:
	if menu_root == null:
		return

	_rebuild_rows()
	if menu_dim != null:
		menu_dim.visible = true
	menu_root.visible = true
	menu_root.modulate.a = 0.0
	var tween: Tween = create_tween()
	tween.tween_property(menu_root, "modulate:a", 1.0, 0.16)

func hide_menu() -> void:
	if menu_root != null:
		menu_root.visible = false
	if menu_dim != null:
		menu_dim.visible = false

func is_menu_visible() -> bool:
	return menu_root != null and menu_root.visible

func _on_lesson_ended(_lesson_id: StringName, _completed: bool) -> void:
	show_menu()

func _rebuild_rows() -> void:
	if list_box == null:
		return

	for child in list_box.get_children():
		child.queue_free()

	for lesson_id in TutorialLessonsScript.lesson_ids():
		list_box.add_child(_build_row(TutorialLessonsScript.lesson_by_id(lesson_id)))

	_refresh_start_button()

func _build_row(lesson: Dictionary) -> Control:
	var lesson_id: StringName = lesson.get("id", &"")
	var is_complete: bool = tutorial != null and tutorial.progress.is_complete(lesson_id)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 8)

	var check_label := Label.new()
	check_label.text = "✓" if is_complete else "-"
	check_label.custom_minimum_size = Vector2(20, 0)
	check_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(check_label)

	var title_label := Label.new()
	title_label.text = str(lesson.get("title", ""))
	title_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(title_label)

	var action_button := Button.new()
	action_button.text = "Replay" if is_complete else "Start"
	action_button.focus_mode = Control.FOCUS_NONE
	action_button.pressed.connect(func(): _on_lesson_row_pressed(lesson_id))
	row.add_child(action_button)

	return row

func _refresh_start_button() -> void:
	if start_button == null:
		return

	var ids: Array[StringName] = TutorialLessonsScript.lesson_ids()
	var any_complete: bool = false
	var all_complete: bool = true

	for lesson_id in ids:
		if tutorial != null and tutorial.progress.is_complete(lesson_id):
			any_complete = true
		else:
			all_complete = false

	if !ids.is_empty() and all_complete:
		start_button.text = "Replay All"
	elif any_complete:
		start_button.text = "Resume"
	else:
		start_button.text = "Start"

func _first_incomplete_lesson_id() -> StringName:
	var ids: Array[StringName] = TutorialLessonsScript.lesson_ids()

	for lesson_id in ids:
		if tutorial == null or !tutorial.progress.is_complete(lesson_id):
			return lesson_id

	return ids[0] if !ids.is_empty() else &""

func _on_lesson_row_pressed(lesson_id: StringName) -> void:
	hide_menu()
	tutorial.start_lesson(lesson_id)

func _on_start_pressed() -> void:
	var next_id: StringName = _first_incomplete_lesson_id()
	if next_id == &"":
		return
	hide_menu()
	tutorial.start_lesson(next_id)

func _on_exit_pressed() -> void:
	hide_menu()
	if on_exit.is_valid():
		on_exit.call()
