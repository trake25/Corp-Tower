extends Control

signal cancel_requested

const SWEEP_SECONDS := 1.4

var sweep_phase := 0.0

func _ready() -> void:
	%CancelButton.pressed.connect(_on_cancel_pressed)

func _process(delta: float) -> void:
	sweep_phase = fmod(sweep_phase + delta / SWEEP_SECONDS, 2.0)
	var t := sweep_phase if sweep_phase <= 1.0 else 2.0 - sweep_phase
	%QueueProgressBar.value = t * %QueueProgressBar.max_value

func _on_cancel_pressed() -> void:
	cancel_requested.emit()
