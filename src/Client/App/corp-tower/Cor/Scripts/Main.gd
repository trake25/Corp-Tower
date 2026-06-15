extends Control

const MAX_INVENTORY_SLOTS := 4
const BLOCK_PREVIEW_COLOR := Color(0.25, 0.56, 0.95, 1.0)
const LOCAL_PLAYER_MARKER := "You"

@onready var status_label = %StatusLabel
@onready var player_label = %PlayerLabel
@onready var room_label = %RoomLabel
@onready var level_label = %LevelLabel
@onready var timer_label = %TimerLabel
@onready var score_label = %ScoreLabel
@onready var height_label = %HeightLabel
@onready var tower_value_label = %TowerValueLabel
@onready var tower_status_label = %TowerStatusLabel
@onready var tower_fill = %TowerFill
@onready var tower_stack = %TowerStack
@onready var block_label = %BlockLabel
@onready var connect_button = %ConnectButton
@onready var refresh_button = %RefreshButton
@onready var refresh_token_label = %RefreshTokenLabel
@onready var refresh_uses_label = %RefreshUsesLabel

@onready var place_block_button1 = %PlaceBlockButton1
@onready var place_block_button2 = %PlaceBlockButton2
@onready var place_block_button3 = %PlaceBlockButton3
@onready var place_block_button4 = %PlaceBlockButton4
@onready var block_preview1 = %BlockPreview1
@onready var block_preview2 = %BlockPreview2
@onready var block_preview3 = %BlockPreview3
@onready var block_preview4 = %BlockPreview4
@onready var block_height_label1 = %BlockHeightLabel1
@onready var block_height_label2 = %BlockHeightLabel2
@onready var block_height_label3 = %BlockHeightLabel3
@onready var block_height_label4 = %BlockHeightLabel4
@onready var block_name_label1 = %BlockNameLabel1
@onready var block_name_label2 = %BlockNameLabel2
@onready var block_name_label3 = %BlockNameLabel3
@onready var block_name_label4 = %BlockNameLabel4

var inventory_buttons: Array = []
var block_previews: Array = []
var block_height_labels: Array = []
var block_name_labels: Array = []

func _ready() -> void:
	inventory_buttons = [
		place_block_button1,
		place_block_button2,
		place_block_button3,
		place_block_button4
	]
	block_previews = [
		block_preview1,
		block_preview2,
		block_preview3,
		block_preview4
	]
	block_height_labels = [
		block_height_label1,
		block_height_label2,
		block_height_label3,
		block_height_label4
	]
	block_name_labels = [
		block_name_label1,
		block_name_label2,
		block_name_label3,
		block_name_label4
	]

	for preview in block_previews:
		preview.cell_color = BLOCK_PREVIEW_COLOR

	place_block_button1.pressed.connect(func(): on_block_pressed(0))
	place_block_button2.pressed.connect(func(): on_block_pressed(1))
	place_block_button3.pressed.connect(func(): on_block_pressed(2))
	place_block_button4.pressed.connect(func(): on_block_pressed(3))

	connect_button.pressed.connect(on_connect_pressed)
	refresh_button.pressed.connect(on_refresh_pressed)

	connect_button.text = "Connect"
	refresh_button.text = "Refresh"
	status_label.text = "Disconnected"
	player_label.text = "Player -"
	room_label.text = "Room -"
	level_label.text = "Level -"
	timer_label.text = "Time -"
	score_label.text = "Waiting for players"
	height_label.text = "Height 0/0"
	tower_value_label.text = "0 / 0"
	tower_status_label.text = "Connect to start"
	block_label.text = "Inventory"
	refresh_token_label.text = "Token 0/1"
	refresh_uses_label.text = "Level refreshes 0/2"
	set_tower_progress(0, 0)
	update_inventory_ui([])
	refresh_button.disabled = true

	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.room_closed.connect(update_room_closed)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)

func on_connect_pressed() -> void:
	NetworkManager.toggle_connection()

func on_block_pressed(index: int) -> void:
	NetworkManager.place_block(index)

func on_refresh_pressed() -> void:
	NetworkManager.refresh_blocks()

func update_status(text: String) -> void:
	status_label.text = text

func update_connect_button(status: String) -> void:
	if status == "[Connect]":
		connect_button.text = "Connect"
	elif status == "[Disconnect]":
		connect_button.text = "Disconnect"
	else:
		connect_button.text = status.replace("[", "").replace("]", "").strip_edges()

func update_room(data) -> void:
	connect_button.disabled = true
	player_label.text = LOCAL_PLAYER_MARKER + " " + str(data.playerId)
	room_label.text = "Room " + str(int(data.roomId))
	level_label.text = "Level " + str(int(data.level))
	timer_label.text = "Time -"
	tower_status_label.text = "Match starting"
	set_tower_progress(0, int(data.get("targetHeight", 0)))
	tower_stack.clear_tower()
	update_inventory_ui(data.get("blocks", []))

func update_room_closed(data) -> void:
	room_label.text = "Room closed"
	level_label.text = "Level -"
	timer_label.text = "Time -"
	height_label.text = "Height -"
	score_label.text = "Room closed: " + str(data.get("reason", "unknown"))
	tower_status_label.text = "Room closed"
	block_label.text = "Inventory"
	refresh_button.text = "Refresh"
	refresh_button.disabled = true
	refresh_token_label.text = "Token 0/1"
	refresh_uses_label.text = "Level refreshes 0/2"
	set_tower_progress(0, 0)
	tower_stack.clear_tower()
	update_inventory_ui([])

func update_game_state(data) -> void:
	var state := str(data.get("state", "playing"))
	var seconds_remaining := int(data.get("secondsRemaining", 0))
	var current_height := int(data.get("currentHeight", 0))
	var target_height := int(data.get("targetHeight", 0))

	level_label.text = "Level " + str(int(data.get("level", 0))) + " - " + state.capitalize()
	timer_label.text = "Time " + str(seconds_remaining) + "s"
	height_label.text = "Height " + str(current_height) + "/" + str(target_height)
	tower_value_label.text = str(current_height) + " / " + str(target_height)
	tower_status_label.text = get_tower_status(state, current_height, target_height)
	set_tower_progress(current_height, target_height)
	tower_stack.set_tower(data.get("towerBlocks", []), current_height, target_height)

	var scores_text := ""
	var my_refresh_tokens := 0
	var my_refresh_uses_remaining := 0
	var max_refresh_tokens := int(data.get("maxRefreshTokens", 1))
	var max_uses_per_level := int(data.get("maxRefreshUsesPerLevel", 2))
	var my_blocks: Array = []
	var players: Array = data.get("players", [])

	for i in range(players.size()):
		var player = players[i]
		var player_id := str(player.get("id", "P?"))
		var prefix := LOCAL_PLAYER_MARKER if player_id == NetworkManager.player_id else player_id
		scores_text += prefix + ": " + str(int(player.get("score", 0)))
		scores_text += " total / " + str(int(player.get("levelScore", 0))) + " level"

		if player_id == NetworkManager.player_id:
			my_refresh_tokens = int(player.get("refreshTokens", 0))
			my_refresh_uses_remaining = int(player.get("refreshUsesRemaining", 0))
			my_blocks = player.get("blocks", [])

		if i < players.size() - 1:
			scores_text += "\n"

	score_label.text = scores_text if scores_text != "" else "Waiting for players"
	refresh_token_label.text = "Token " + str(my_refresh_tokens) + "/" + str(max_refresh_tokens)

	var level_refreshes_used := max_uses_per_level - my_refresh_uses_remaining
	refresh_uses_label.text = "Level refreshes " + str(level_refreshes_used) + "/" + str(max_uses_per_level)

	var in_lockout := seconds_remaining <= 10 and state == "playing"
	refresh_button.text = "Refresh"
	refresh_button.disabled = (
		my_refresh_tokens <= 0 or
		my_refresh_uses_remaining <= 0 or
		in_lockout or
		state == "failed" or
		state == "finished" or
		state == "game_completed"
	)

	update_inventory_ui(my_blocks)

func update_inventory_ui(blocks: Array) -> void:
	var clean_blocks: Array = []

	for i in range(blocks.size()):
		clean_blocks.append(normalize_block(blocks[i], i))

	block_label.text = "Inventory " + str(clean_blocks.size()) + "/" + str(MAX_INVENTORY_SLOTS)

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		var preview = block_previews[i]
		var height_label: Label = block_height_labels[i]
		var name_label: Label = block_name_labels[i]

		if i < clean_blocks.size():
			var block: Dictionary = clean_blocks[i]
			button.disabled = false
			button.text = ""
			preview.set_block(block)
			height_label.text = "Height " + str(int(block.get("height", 0)))
			name_label.text = str(block.get("shapeId", "BLOCK"))
		else:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			height_label.text = "Empty"
			name_label.text = "Slot " + str(i + 1)

func normalize_block(raw_block, index: int) -> Dictionary:
	if typeof(raw_block) == TYPE_DICTIONARY:
		var cells: Array = raw_block.get("cells", [])
		var height := int(raw_block.get("height", calculate_block_height(cells)))
		return {
			"id": str(raw_block.get("id", "slot-" + str(index))),
			"shapeId": str(raw_block.get("shapeId", "BLOCK")),
			"cells": cells,
			"height": height
		}

	var legacy_height: int = max(0, int(raw_block))
	var cells: Array = []

	for y in range(legacy_height):
		cells.append([0, y])

	return {
		"id": "legacy-" + str(index),
		"shapeId": "LEGACY",
		"cells": cells,
		"height": legacy_height
	}

func calculate_block_height(cells: Array) -> int:
	if cells.is_empty():
		return 0

	var min_y := 999999
	var max_y := -999999

	for cell in cells:
		var y := 0

		if typeof(cell) == TYPE_DICTIONARY:
			y = int(cell.get("y", 0))
		else:
			y = int(cell[1])

		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	return max_y - min_y + 1

func set_tower_progress(current_height: int, target_height: int) -> void:
	var ratio := 0.0

	if target_height > 0:
		ratio = clamp(float(current_height) / float(target_height), 0.0, 1.0)

	tower_fill.anchor_top = 1.0 - ratio
	tower_fill.anchor_bottom = 1.0
	tower_fill.offset_top = 0.0
	tower_fill.offset_bottom = 0.0
	tower_fill.offset_left = 0.0
	tower_fill.offset_right = 0.0

func get_tower_status(state: String, current_height: int, target_height: int) -> String:
	if state == "starting":
		return "Get ready"

	if state == "failed":
		return "Level failed"

	if state == "finished":
		return "Target reached"

	if state == "game_completed":
		return "Tower complete"

	if target_height <= 0:
		return "Waiting"

	var remaining: int = max(0, target_height - current_height)
	return str(remaining) + " height to target"
