extends Control

signal join_server_requested
signal private_server_requested
signal tutorial_requested

func _ready() -> void:
	%PrivateServerButton.pressed.connect(func(): private_server_requested.emit())
	%JoinServerButton.pressed.connect(func(): join_server_requested.emit())
	%TutorialButton.pressed.connect(func(): tutorial_requested.emit())

	if EndpointConfig.DEMO_MODE_ENABLED:
		%PrivateServerButton.visible = false
		%CircleRow.visible = false
		%JoinServerLabel.text = "Play Demo"
