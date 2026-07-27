extends Control

signal find_match_requested
signal tutorial_requested

func _ready() -> void:
	%FindMatchButton.pressed.connect(func(): find_match_requested.emit())
	%TutorialButton.pressed.connect(func(): tutorial_requested.emit())
