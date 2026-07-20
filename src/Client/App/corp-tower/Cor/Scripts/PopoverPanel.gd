extends Control

signal dismissed

@export var auto_close_seconds: float = 4.0

@onready var outside_catcher: Control = %OutsideCatcher
@onready var card: PanelContainer = %Card
@onready var title_label: Label = %TitleLabel
@onready var rows_box: VBoxContainer = %RowsBox
@onready var close_timer: Timer = %CloseTimer

func _ready() -> void:
	visible = false
	outside_catcher.gui_input.connect(_on_outside_catcher_gui_input)
	close_timer.wait_time = auto_close_seconds
	close_timer.one_shot = true
	close_timer.timeout.connect(close)

func set_title(text: String) -> void:
	title_label.text = text

func clear_rows() -> void:
	for child in rows_box.get_children():
		child.queue_free()

func add_row(text: String) -> Label:
	var row := Label.new()
	row.theme_type_variation = &"PopoverBodyLabel"
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.text = text
	rows_box.add_child(row)

	if rows_box.get_child_count() > 1:
		var rule := HSeparator.new()
		rows_box.add_child(rule)
		rows_box.move_child(rule, rows_box.get_child_count() - 2)

	return row

func add_icon_row(icon: Control, text: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 12)
	row.add_child(icon)

	var label := Label.new()
	label.theme_type_variation = &"PopoverBodyLabel"
	label.text = text
	row.add_child(label)

	rows_box.add_child(row)
	if rows_box.get_child_count() > 1:
		var rule := HSeparator.new()
		rows_box.add_child(rule)
		rows_box.move_child(rule, rows_box.get_child_count() - 2)

	return row

func add_action_row(text: String, on_pressed: Callable) -> Button:
	var row := Button.new()
	row.theme_type_variation = &"PopoverRowButton"
	row.text = text
	row.focus_mode = Control.FOCUS_NONE
	row.alignment = HORIZONTAL_ALIGNMENT_LEFT
	row.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.custom_minimum_size = Vector2(0, 34)
	row.pressed.connect(on_pressed)
	rows_box.add_child(row)

	return row

func open() -> void:
	visible = true
	if auto_close_seconds > 0.0:
		close_timer.start(auto_close_seconds)

func get_card_size() -> Vector2:
	var min_size: Vector2 = card.get_combined_minimum_size()
	return Vector2(
		maxf(min_size.x, card.custom_minimum_size.x),
		maxf(min_size.y, card.custom_minimum_size.y)
	)

func set_card_global_position(target: Vector2) -> void:
	var card_size: Vector2 = get_card_size()
	card.anchor_left = 0.0
	card.anchor_top = 0.0
	card.anchor_right = 0.0
	card.anchor_bottom = 0.0
	card.size = card_size
	var bounds: Rect2 = get_global_rect()
	var max_x: float = maxf(bounds.position.x, bounds.position.x + bounds.size.x - card_size.x)
	var max_y: float = maxf(bounds.position.y, bounds.position.y + bounds.size.y - card_size.y)
	card.global_position = Vector2(
		clampf(target.x, bounds.position.x, max_x),
		clampf(target.y, bounds.position.y, max_y)
	)

func close() -> void:
	if not visible:
		return
	visible = false
	close_timer.stop()
	dismissed.emit()

func _on_outside_catcher_gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		close()
	elif event is InputEventScreenTouch and event.pressed:
		close()
