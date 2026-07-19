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
		rows_box.move_child(rule, rows_box.get_child_count() - 2)

	return row

func open() -> void:
	visible = true
	if auto_close_seconds > 0.0:
		close_timer.start(auto_close_seconds)

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
