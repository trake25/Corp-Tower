extends Control

signal find_match_requested

func _ready() -> void:
	%FindMatchButton.pressed.connect(func(): find_match_requested.emit())
