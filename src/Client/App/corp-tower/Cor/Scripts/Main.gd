extends Control

@onready var connect_button = %ConnectButton

func _ready():

	connect_button.pressed.connect(
		on_connect_pressed
	)

func on_connect_pressed():
	
	NetworkManager.toggle_connection()
