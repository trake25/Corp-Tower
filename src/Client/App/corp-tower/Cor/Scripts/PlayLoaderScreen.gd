extends Control

signal loader_finished

@onready var advance_timer: Timer = $AdvanceTimer

func _ready() -> void:
	advance_timer.timeout.connect(_on_advance_timer_timeout)

func _on_advance_timer_timeout() -> void:
	loader_finished.emit()
