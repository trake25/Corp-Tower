extends Control

@onready var loading_progress_bar: ProgressBar = %LoadingProgressBar

var loading_elapsed := 0.0

func _ready() -> void:
	loading_progress_bar.value = 0.0

func _process(delta: float) -> void:
	loading_elapsed += delta
	loading_progress_bar.value = 0.2 + 0.7 * (0.5 + 0.5 * sin(loading_elapsed * 3.0))
