extends Control

@onready var connect_button = %ConnectButton
@onready var place_block_button = %PlaceBlockButton
@onready var status_label = %StatusLabel
@onready var player_label = %PlayerLabel
@onready var score_label = %ScoreLabel
@onready var room_label = %RoomLabel
@onready var level_label = %LevelLabel
@onready var block_label = %BlockLabel

func _ready():
	
	connect_button.text = "[Connect]"
	place_block_button.disabled = true
	place_block_button.text = "[Place Block]"
	
	place_block_button.pressed.connect(on_place_button_pressed)
	
	connect_button.pressed.connect(
		on_connect_pressed
	)
	
	status_label.text = "Disconnected"
	NetworkManager.status_changed.connect(update_status)

	NetworkManager.room_joined.connect(update_room)
	
	NetworkManager.client_status.connect(update_connect_button)
	
	NetworkManager.game_state_updated.connect(update_game_state)

func on_connect_pressed():
	NetworkManager.toggle_connection()

func on_place_button_pressed():
	NetworkManager.place_block()

func update_status(text):
	
	status_label.text = text

func update_connect_button(status):
	
	connect_button.text = status

func update_room(data):
	
	connect_button.disabled = true
	place_block_button.disabled = false

	player_label.text = "Player: "+ data.playerId

	room_label.text = "Room: " + str(int(data.roomId))

	level_label.text = "Level: " + str(int(data.level))

	var clean_blocks=[]
	
	for block in data.blocks:
		clean_blocks.append(int(block))
	
	block_label.text = "Blocks: "+str(clean_blocks)

func update_game_state(data):

	level_label.text = \
		"Level: " + str(int(data.level))

	var scores_text = ""

	for player in data.players:

		scores_text += \
			player.id \
			+ " Score:" \
			+ str(
				int(player.score)
			) \
			+ "\n"

	score_label.text = scores_text
