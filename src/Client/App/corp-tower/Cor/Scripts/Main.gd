extends Control

@onready var connect_button = %ConnectButton
@onready var place_block_button = %PlaceBlockButton
@onready var status_label = %StatusLabel
@onready var player_label = %PlayerLabel
@onready var room_label = %RoomLabel
@onready var level_label = %LevelLabel
@onready var block_label = %BlockLabel

func _ready():

	connect_button.pressed.connect(
		on_connect_pressed
	)
	
	NetworkManager.status_changed.connect(update_status)

	NetworkManager.room_joined.connect(update_room)

func on_connect_pressed():
	NetworkManager.toggle_connection()

func update_status(text):

	status_label.text = text


func update_room(data):

	player_label.text = "Player: "+data.playerId

	room_label.text = "Room: "+str(data.roomId)

	block_label.text = "Blocks: "+str(data.blocks)
