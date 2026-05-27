## Main.gd
extends Control

@onready var connect_button = %ConnectButton
@onready var place_block_button1 = %PlaceBlockButton1
@onready var place_block_button2 = %PlaceBlockButton2
@onready var place_block_button3 = %PlaceBlockButton3
@onready var place_block_button4 = %PlaceBlockButton4
@onready var refresh_button = %RefreshButton

@onready var debug_button = %DebugButton
@onready var debug_panel =  %DebugPanel

@onready var bots_toggle = %BotsToggle
@onready var bot_count_label = %BotCountLabel
@onready var bot_count_slider = %BotCountSlider
@onready var bot_delay_min_label = %BotDelayMinLabel
@onready var bot_delay_min_slider = %BotDelayMinSlider
@onready var bot_delay_max_label = %BotDelayMaxLabel
@onready var bot_delay_max_slider = %BotDelayMaxSlider
@onready var cooldown_label = %CooldownLabel
@onready var cooldown_slider = %CooldownSlider
@onready var level_time_label = %LevelTimeLabel
@onready var level_time_slider = %LevelTimeSlider
@onready var start_delay_label = %StartDelayLabel
@onready var start_delay_slider = %StartDelaySlider
@onready var target_multiplier_label = %TargetMultiplierLabel
@onready var target_multiplier_slider = %TargetMultiplierSlider

@onready var status_label = %StatusLabel
@onready var player_label = %PlayerLabel
@onready var score_label = %ScoreLabel
@onready var room_label = %RoomLabel
@onready var level_label = %LevelLabel
@onready var height_label = %HeightLabel
@onready var block_label = %BlockLabel


var inventory_buttons = []
var is_syncing_debug_config := false

func _ready():

	inventory_buttons = [
		place_block_button1,
		place_block_button2,
		place_block_button3,
		place_block_button4
	]

	connect_button.text = "[Connect]"
	
	debug_button.text = "Debug Menu"
	debug_button.disabled = true
	debug_button.pressed.connect(on_debug_pressed)

	bots_toggle.text = "Bots"
	bots_toggle.toggled.connect(on_bots_toggle)

	bot_count_slider.min_value = 0
	bot_count_slider.max_value = 2
	bot_count_slider.step = 1
	bot_count_slider.value_changed.connect(on_bot_count_changed)

	bot_delay_min_slider.min_value = 250
	bot_delay_min_slider.max_value = 10000
	bot_delay_min_slider.step = 250
	bot_delay_min_slider.value_changed.connect(on_bot_delay_min_changed)

	bot_delay_max_slider.min_value = 250
	bot_delay_max_slider.max_value = 10000
	bot_delay_max_slider.step = 250
	bot_delay_max_slider.value_changed.connect(on_bot_delay_max_changed)

	cooldown_slider.min_value = 0
	cooldown_slider.max_value = 5000
	cooldown_slider.step = 250
	cooldown_slider.value_changed.connect(on_cooldown_changed)

	level_time_slider.min_value = 5000
	level_time_slider.max_value = 120000
	level_time_slider.step = 1000
	level_time_slider.value_changed.connect(on_level_time_changed)

	start_delay_slider.min_value = 0
	start_delay_slider.max_value = 10000
	start_delay_slider.step = 500
	start_delay_slider.value_changed.connect(on_start_delay_changed)

	target_multiplier_slider.min_value = 1
	target_multiplier_slider.max_value = 20
	target_multiplier_slider.step = 1
	target_multiplier_slider.value_changed.connect(on_target_multiplier_changed)

	update_debug_labels()

	# disable + reset inventory UI
	for btn in inventory_buttons:
		btn.disabled = true
		btn.text = "-"

	refresh_button.text = "Refresh"
	refresh_button.disabled = true
	refresh_button.pressed.connect(on_refresh_pressed)

	place_block_button1.pressed.connect(func(): on_block_pressed(0))
	place_block_button2.pressed.connect(func(): on_block_pressed(1))
	place_block_button3.pressed.connect(func(): on_block_pressed(2))
	place_block_button4.pressed.connect(func(): on_block_pressed(3))

	connect_button.pressed.connect(on_connect_pressed)

	status_label.text = "Disconnected"

	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)
	NetworkManager.debug_config_updated.connect(update_debug_config)

func on_debug_pressed():

	debug_panel.visible=\
		!debug_panel.visible


func on_bots_toggle(enabled):

	if is_syncing_debug_config:
		return

	NetworkManager.update_config(
		"debugBotsEnabled",
		enabled
	)


func on_bot_count_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"debugBotCount",
		int(value)
	)


func on_cooldown_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"placementCooldown",
		int(value)
	)

func on_bot_delay_min_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"debugBotDelayMin",
		int(value)
	)

func on_bot_delay_max_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"debugBotDelayMax",
		int(value)
	)

func on_level_time_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"levelTimeLimitMs",
		int(value)
	)

func on_start_delay_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"startDelayMs",
		int(value)
	)

func on_target_multiplier_changed(value):

	if is_syncing_debug_config:
		return

	update_debug_labels()

	NetworkManager.update_config(
		"targetHeightMultiplier",
		int(value)
	)

func on_connect_pressed():
	NetworkManager.toggle_connection()

func on_block_pressed(index):
	NetworkManager.place_block(index)

func on_refresh_pressed():
	NetworkManager.refresh_blocks()


func update_status(text):
	status_label.text = text
	if text == "Connected":
		debug_button.disabled = false
	else:
		debug_button.disabled = true


func update_connect_button(status):
	connect_button.text = status
	
func update_debug_config(config):

	is_syncing_debug_config = true

	bots_toggle.set_pressed_no_signal(
		bool(config.get("debugBotsEnabled", false))
	)

	bot_count_slider.set_value_no_signal(
		float(config.get("debugBotCount", 0))
	)

	bot_delay_min_slider.set_value_no_signal(
		float(config.get("debugBotDelayMin", 2000))
	)

	bot_delay_max_slider.set_value_no_signal(
		float(config.get("debugBotDelayMax", 5000))
	)

	cooldown_slider.set_value_no_signal(
		float(config.get("placementCooldown", 3000))
	)

	level_time_slider.set_value_no_signal(
		float(config.get("levelTimeLimitMs", 30000))
	)

	start_delay_slider.set_value_no_signal(
		float(config.get("startDelayMs", 3000))
	)

	target_multiplier_slider.set_value_no_signal(
		float(config.get("targetHeightMultiplier", 3))
	)

	update_debug_labels()

	is_syncing_debug_config = false

func update_debug_labels():

	bot_count_label.text = "Bot Count: " + str(int(bot_count_slider.value))
	bot_delay_min_label.text = "Bot Delay Min: " + str(int(bot_delay_min_slider.value)) + " ms"
	bot_delay_max_label.text = "Bot Delay Max: " + str(int(bot_delay_max_slider.value)) + " ms"
	cooldown_label.text = "Placement Cooldown: " + str(int(cooldown_slider.value)) + " ms"
	level_time_label.text = "Level Time: " + str(int(level_time_slider.value / 1000.0)) + " sec"
	start_delay_label.text = "Start Delay: " + str(int(start_delay_slider.value)) + " ms"
	target_multiplier_label.text = "Target Multiplier: " + str(int(target_multiplier_slider.value))



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

	var state = str(data.get("state", "playing"))
	var seconds_remaining = int(data.get("secondsRemaining", 0))

	level_label.text = "Level: " + str(int(data.level)) + " [" + state + "]"

	height_label.text = \
		"Height: " + str(int(data.currentHeight)) + "/" + str(int(data.targetHeight)) + \
		"   Time: " + str(seconds_remaining)

	var scores_text = ""
	var my_refresh_tokens = 0
	var my_refresh_uses = 0

	for i in range(data.players.size()):
		var player = data.players[i]

		scores_text += player.id + \
			" Score:" + str(int(player.score)) + \
			" Level:" + str(int(player.get("levelScore", 0)))

		if player.id == NetworkManager.player_id:
			my_refresh_tokens = int(player.get("refreshTokens", 0))
			my_refresh_uses = int(player.get("refreshUsesRemaining", 0))

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

	refresh_button.text = \
		"Refresh (" + str(my_refresh_tokens) + "/" + str(my_refresh_uses) + ")"

	refresh_button.disabled = \
		my_refresh_tokens <= 0 or \
		my_refresh_uses <= 0 or \
		state == "failed" or \
		state == "finished" or \
		state == "game_completed"


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
