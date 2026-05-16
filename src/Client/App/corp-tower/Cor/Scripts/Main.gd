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
	
	status_label.text = "Disconnected"
	NetworkManager.status_changed.connect(update_status)

	NetworkManager.room_joined.connect(update_room)

func on_connect_pressed():
	NetworkManager.toggle_connection()

func update_status(text):
	
	status_label.text = text

func update_room(data):

	player_label.text = "Player: "+data.playerId

	room_label.text = "Room: " + str(int(data.roomId))

	level_label.text = "Level: " + str(int(data.level))

	var clean_blocks=[]
	
	for block in data.blocks:
		clean_blocks.append(int(block))
	
	block_label.text = "Blocks: "+str(clean_blocks)
