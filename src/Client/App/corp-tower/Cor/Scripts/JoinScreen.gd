extends Control

signal find_match_requested
signal back_requested

func _ready() -> void:
	%FindMatchButton.pressed.connect(func(): find_match_requested.emit())
	%BackButton.pressed.connect(func(): back_requested.emit())
