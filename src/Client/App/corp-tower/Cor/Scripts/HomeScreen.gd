extends Control

const MOBILE_WEB_HORIZONTAL_FIT_META := &"mobile_web_horizontal_fit"
const DESIGN_VIEWPORT_WIDTH := 412.0

signal join_server_requested
signal private_server_requested
signal tutorial_requested
signal rankings_requested
signal settings_requested
signal profile_requested

func _ready() -> void:
	_configure_mobile_web_background()
	%PrivateServerButton.pressed.connect(func(): private_server_requested.emit())
	%JoinServerButton.pressed.connect(func(): join_server_requested.emit())
	%TutorialButton.pressed.connect(func(): tutorial_requested.emit())
	%RankingsButton.pressed.connect(func(): rankings_requested.emit())
	%SettingsButton.pressed.connect(func(): settings_requested.emit())
	%ProfileButton.pressed.connect(func(): profile_requested.emit())

	if EndpointConfig.DEMO_MODE_ENABLED:
		%PrivateServerButton.visible = false
		%CircleRow.visible = false
		%JoinServerLabel.text = "Play Demo"

func _configure_mobile_web_background() -> void:
	if not has_meta(MOBILE_WEB_HORIZONTAL_FIT_META):
		return

	%MobileWebBackgroundBleed.visible = true
	var background := $Background as TextureRect
	background.anchor_left = 0.5
	background.anchor_right = 0.5
	background.offset_left = -DESIGN_VIEWPORT_WIDTH * 0.5
	background.offset_right = DESIGN_VIEWPORT_WIDTH * 0.5
