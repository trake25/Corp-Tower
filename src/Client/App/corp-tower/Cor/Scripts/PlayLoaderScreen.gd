extends Control

signal loader_finished

@onready var advance_timer: Timer = $AdvanceTimer
@onready var loading_progress_bar: ProgressBar = %LoadingProgressBar

func _ready() -> void:
	advance_timer.timeout.connect(_on_advance_timer_timeout)
	loading_progress_bar.value = 0.0

func _process(_delta: float) -> void:
	if advance_timer.is_stopped():
		return

	loading_progress_bar.value = 1.0 - (advance_timer.time_left / advance_timer.wait_time)

func _on_advance_timer_timeout() -> void:
	loading_progress_bar.value = 1.0
	loader_finished.emit()
