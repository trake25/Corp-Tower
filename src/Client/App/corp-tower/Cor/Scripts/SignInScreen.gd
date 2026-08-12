extends Control

signal guest_login_requested

func _ready() -> void:
	%GuestButton.pressed.connect(func(): guest_login_requested.emit())
