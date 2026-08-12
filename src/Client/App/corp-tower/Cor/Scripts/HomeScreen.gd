extends Control

signal join_server_requested
signal tutorial_requested

func _ready() -> void:
	%JoinServerButton.pressed.connect(func(): join_server_requested.emit())
	%TutorialButton.pressed.connect(func(): tutorial_requested.emit())
