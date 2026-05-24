## Main.gd
extends Control

@onready var connect_button = %ConnectButton
@onready var place_block_button1 = %PlaceBlockButton1
@onready var place_block_button2 = %PlaceBlockButton2
@onready var place_block_button3 = %PlaceBlockButton3

@onready var debug_button = %DebugButton
@onready var debug_panel =  %DebugPanel

@onready var bots_toggle = %BotsToggle
@onready var bot_count_slider = %BotCountSlider
@onready var cooldown_slider = %CooldownSlider

@onready var status_label = %StatusLabel
@onready var player_label = %PlayerLabel
@onready var score_label = %ScoreLabel
@onready var room_label = %RoomLabel
@onready var level_label = %LevelLabel
@onready var height_label = %HeightLabel
@onready var block_label = %BlockLabel


var inventory_buttons = []

func _ready():

	inventory_buttons = [
		place_block_button1,
		place_block_button2,
		place_block_button3
	]

	connect_button.text = "[Connect]"
	
	debug_button.text = "Debug Menu"
	debug_button.disabled = true
	debug_button.pressed.connect(on_debug_pressed)

	bots_toggle.text = "Bots"
	bots_toggle.toggled.connect(on_bots_toggle)

	bot_count_slider.value_changed.connect(on_bot_count_changed)

	cooldown_slider.value_changed.connect(on_cooldown_changed)

	# disable + reset inventory UI
	for btn in inventory_buttons:
		btn.disabled = true
		btn.text = "-"

	place_block_button1.pressed.connect(func(): on_block_pressed(0))
	place_block_button2.pressed.connect(func(): on_block_pressed(1))
	place_block_button3.pressed.connect(func(): on_block_pressed(2))

	connect_button.pressed.connect(on_connect_pressed)

	status_label.text = "Disconnected"

	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)

func on_debug_pressed():

	debug_panel.visible=\
		!debug_panel.visible


func on_bots_toggle(enabled):

	NetworkManager.update_config(
		"debugBotsEnabled",
		enabled
	)


func on_bot_count_changed(value):

	NetworkManager.update_config(
		"debugBotCount",
		int(value)
	)


func on_cooldown_changed(value):

	NetworkManager.update_config(
		"placementCooldown",
		int(value)
	)

func on_connect_pressed():
	NetworkManager.toggle_connection()

func on_block_pressed(index):
	NetworkManager.place_block(index)


func update_status(text):
	status_label.text = text
	if text == "Connected":
		debug_button.disabled = false
	else:
		debug_button.disabled = true


func update_connect_button(status):
	connect_button.text = status
	


# =========================
# ROOM INIT (ONE TIME)
# =========================
func update_room(data):

	connect_button.disabled = true

	player_label.text = "Player: " + data.playerId
	room_label.text = "Room: " + str(int(data.roomId))
	level_label.text = "Level: " + str(int(data.level))

	update_inventory_ui(data.blocks)


# =========================
# LIVE GAME STATE
# =========================
func update_game_state(data):

	level_label.text = "Level: " + str(int(data.level))

	height_label.text = \
		"Height: " + str(int(data.currentHeight)) + "/" + str(int(data.targetHeight))

	var scores_text = ""

	for i in range(data.players.size()):
		var player = data.players[i]

		scores_text += player.id + " Score:" + str(int(player.score))

		if i < data.players.size() - 1:
			scores_text += "\n"

	score_label.text = scores_text


	# find local player
	var my_blocks = []

	for player in data.players:
		if player.id == NetworkManager.player_id:
			my_blocks = player.blocks
			break

	update_inventory_ui(my_blocks)


## Update Inventory System

func update_inventory_ui(blocks: Array):

	var clean_blocks = []

	for b in blocks:
		clean_blocks.append(int(b))

	block_label.text = "Blocks: " + str(clean_blocks)

	for i in range(inventory_buttons.size()):

		if i < clean_blocks.size():
			inventory_buttons[i].text = str(clean_blocks[i])
			inventory_buttons[i].disabled = false
		else:
			inventory_buttons[i].text = "-"
			inventory_buttons[i].disabled = true
