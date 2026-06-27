extends Control

const MAX_INVENTORY_SLOTS := 3
const DEFAULT_UI_SKIN := "DefaultSkin"
const SHOW_DEBUG_UI := true
const DRAW_PILE_COLOR := Color(0.95, 0.72, 0.25, 1.0)
const BOT_STRATEGY_COOPERATIVE := "cooperative"
const BOT_STRATEGY_MVP_GREEDY := "mvp_greedy"
const PlayerColors = preload("res://Cor/Scripts/PlayerColors.gd")
const LOCAL_PLAYER_MARKER := "You"
const SKIN_SCENES := {
	"DefaultSkin": "res://Cor/Scenes/Skins/DefaultSkin.tscn",
	"Figma_SkinV1": "res://Cor/Scenes/Skins/Figma_SkinV1.tscn"
}

@onready var skin_root: Control = $SkinRoot

var active_skin: Control
var inventory_buttons: Array = []
var block_previews: Array = []
var block_height_labels: Array = []
var block_name_labels: Array = []
var is_syncing_debug_config: bool = false
var active_skin_name: String = DEFAULT_UI_SKIN
var missing_required_nodes: Array[String] = []
var last_room_data: Variant = null
var last_game_state_data: Variant = null
var last_status_text: String = "Disconnected"
var is_switching_skin: bool = false
var player_color_map: Dictionary = {}
var active_inventory_slots: int = MAX_INVENTORY_SLOTS

var status_label: Label
var player_label: Label
var room_label: Label
var level_label: Label
var timer_label: Label
var score_label: Label
var height_label: Label
var tower_value_label: Label
var tower_status_label: Label
var tower_fill: Panel
var tower_stack: Control
var block_label: Label
var draw_pile_name_label: Label
var draw_pile_count_label: Label
var draw_pile_preview: Control
var connect_button: Button
var refresh_button: Button
var refresh_token_label: Label
var refresh_uses_label: Label
var debug_button: Button
var debug_overlay: Control
var debug_dim_layer: Control
var close_debug_button: Button
var skin_button: Button
var skin_overlay: Control
var skin_dim_layer: Control
var close_skin_button: Button
var default_skin_button: Button
var figma_skin_button: Button
var bots_toggle: CheckButton
var bot_strategy_button: OptionButton
var bot_count_label: Label
var bot_count_slider: HSlider
var bot_delay_min_label: Label
var bot_delay_min_slider: HSlider
var bot_delay_max_label: Label
var bot_delay_max_slider: HSlider
var cooldown_label: Label
var cooldown_slider: HSlider
var level_time_label: Label
var level_time_slider: HSlider
var start_delay_label: Label
var start_delay_slider: HSlider
var target_multiplier_label: Label
var target_multiplier_slider: HSlider

func _ready() -> void:
	load_selected_skin()
	if active_skin == null:
		return

	if !prepare_active_skin():
		return

	setup_inventory_controls()
	setup_debug_controls()
	setup_skin_controls()
	reset_ui()
	connect_network_signals()

func load_selected_skin() -> void:
	var skin_name: String = DEFAULT_UI_SKIN

	if ProjectSettings.has_setting("corp_tower/ui_skin"):
		skin_name = str(ProjectSettings.get_setting("corp_tower/ui_skin"))

	load_skin(skin_name)

func load_skin(skin_name: String) -> void:
	var skin_path: String = str(SKIN_SCENES.get(skin_name, ""))

	if skin_path == "":
		push_error("Unknown UI skin: " + skin_name + ". Falling back to " + DEFAULT_UI_SKIN)
		skin_path = str(SKIN_SCENES[DEFAULT_UI_SKIN])
		skin_name = DEFAULT_UI_SKIN

	var scene: PackedScene = load(skin_path) as PackedScene

	if scene == null and skin_name != DEFAULT_UI_SKIN:
		push_error("Failed to load UI skin: " + skin_name + ". Falling back to " + DEFAULT_UI_SKIN)
		scene = load(str(SKIN_SCENES[DEFAULT_UI_SKIN])) as PackedScene
		skin_name = DEFAULT_UI_SKIN

	if scene == null:
		push_error("Failed to load default UI skin.")
		return

	for child in skin_root.get_children():
		skin_root.remove_child(child)
		child.queue_free()

	active_skin = scene.instantiate() as Control
	active_skin_name = skin_name
	active_skin.name = skin_name
	active_skin.set_anchors_preset(Control.PRESET_FULL_RECT)
	skin_root.add_child(active_skin)

func prepare_active_skin() -> bool:
	bind_skin_nodes()
	if !missing_required_nodes.is_empty() and active_skin_name != DEFAULT_UI_SKIN:
		push_error(
			"UI skin " + active_skin_name +
			" is missing required nodes: " + ", ".join(missing_required_nodes) +
			". Falling back to " + DEFAULT_UI_SKIN
		)
		load_skin(DEFAULT_UI_SKIN)
		bind_skin_nodes()

	if !missing_required_nodes.is_empty():
		push_error("Default UI skin is missing required nodes: " + ", ".join(missing_required_nodes))
		return false

	return true

func bind_skin_nodes() -> void:
	missing_required_nodes.clear()
	status_label = require_node("StatusLabel") as Label
	player_label = require_node("PlayerLabel") as Label
	room_label = require_node("RoomLabel") as Label
	level_label = require_node("LevelLabel") as Label
	timer_label = require_node("TimerLabel") as Label
	score_label = require_node("ScoreLabel") as Label
	height_label = require_node("HeightLabel") as Label
	tower_value_label = require_node("TowerValueLabel") as Label
	tower_status_label = require_node("TowerStatusLabel") as Label
	tower_fill = require_node("TowerFill") as Panel
	tower_stack = require_node("TowerStack") as Control
	block_label = require_node("BlockLabel") as Label
	draw_pile_name_label = require_node("DrawPileNameLabel") as Label
	draw_pile_count_label = require_node("DrawPileCountLabel") as Label
	draw_pile_preview = require_node("DrawPilePreview") as Control
	connect_button = require_node("ConnectButton") as Button
	refresh_button = require_node("RefreshButton") as Button
	refresh_token_label = require_node("RefreshTokenLabel") as Label
	refresh_uses_label = require_node("RefreshUsesLabel") as Label

	inventory_buttons = [
		require_node("PlaceBlockButton1") as Button,
		require_node("PlaceBlockButton2") as Button,
		require_node("PlaceBlockButton3") as Button
	]
	block_previews = [
		require_node("BlockPreview1") as Control,
		require_node("BlockPreview2") as Control,
		require_node("BlockPreview3") as Control
	]
	block_height_labels = [
		require_node("BlockHeightLabel1") as Label,
		require_node("BlockHeightLabel2") as Label,
		require_node("BlockHeightLabel3") as Label
	]
	block_name_labels = [
		require_node("BlockNameLabel1") as Label,
		require_node("BlockNameLabel2") as Label,
		require_node("BlockNameLabel3") as Label
	]

	debug_button = optional_node("DebugButton") as Button
	debug_overlay = optional_node("DebugOverlay") as Control
	debug_dim_layer = optional_node("DebugDimLayer") as Control
	close_debug_button = optional_node("CloseDebugButton") as Button
	skin_button = optional_node("SkinButton") as Button
	skin_overlay = optional_node("SkinOverlay") as Control
	skin_dim_layer = optional_node("SkinDimLayer") as Control
	close_skin_button = optional_node("CloseSkinButton") as Button
	default_skin_button = optional_node("DefaultSkinButton") as Button
	figma_skin_button = optional_node("FigmaSkinButton") as Button
	bots_toggle = optional_node("BotsToggle") as CheckButton
	bot_strategy_button = optional_node("BotStrategyButton") as OptionButton
	bot_count_label = optional_node("BotCountLabel") as Label
	bot_count_slider = optional_node("BotCountSlider") as HSlider
	bot_delay_min_label = optional_node("BotDelayMinLabel") as Label
	bot_delay_min_slider = optional_node("BotDelayMinSlider") as HSlider
	bot_delay_max_label = optional_node("BotDelayMaxLabel") as Label
	bot_delay_max_slider = optional_node("BotDelayMaxSlider") as HSlider
	cooldown_label = optional_node("CooldownLabel") as Label
	cooldown_slider = optional_node("CooldownSlider") as HSlider
	level_time_label = optional_node("LevelTimeLabel") as Label
	level_time_slider = optional_node("LevelTimeSlider") as HSlider
	start_delay_label = optional_node("StartDelayLabel") as Label
	start_delay_slider = optional_node("StartDelaySlider") as HSlider
	target_multiplier_label = optional_node("TargetMultiplierLabel") as Label
	target_multiplier_slider = optional_node("TargetMultiplierSlider") as HSlider

func require_node(node_name: String) -> Node:
	var node: Node = optional_node(node_name)

	if node == null:
		missing_required_nodes.append(node_name)

	return node

func optional_node(node_name: String) -> Node:
	if active_skin == null:
		return null

	return active_skin.find_child(node_name, true, false)

func setup_inventory_controls() -> void:
	for preview in block_previews:
		preview.cell_color = get_local_player_color()

	inventory_buttons[0].pressed.connect(func(): on_block_pressed(0))
	inventory_buttons[1].pressed.connect(func(): on_block_pressed(1))
	inventory_buttons[2].pressed.connect(func(): on_block_pressed(2))

	connect_button.pressed.connect(on_connect_pressed)
	refresh_button.pressed.connect(on_refresh_pressed)

func setup_debug_controls() -> void:
	if debug_button == null:
		return

	debug_button.visible = SHOW_DEBUG_UI
	debug_button.disabled = true
	debug_button.pressed.connect(toggle_debug_overlay)

	if debug_overlay != null:
		set_debug_overlay_open(false)

	if close_debug_button != null:
		close_debug_button.pressed.connect(func(): set_debug_overlay_open(false))

	if debug_dim_layer != null:
		debug_dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
		debug_dim_layer.gui_input.connect(on_debug_dim_layer_input)

	if bots_toggle != null:
		bots_toggle.toggled.connect(on_bots_toggle)

	if bot_strategy_button != null:
		bot_strategy_button.clear()
		bot_strategy_button.add_item("Cooperative", 0)
		bot_strategy_button.add_item("MVP Greedy", 1)
		bot_strategy_button.item_selected.connect(on_bot_strategy_selected)

	configure_slider(bot_count_slider, 0, 2, 1, on_bot_count_changed)
	configure_slider(bot_delay_min_slider, 250, 10000, 250, on_bot_delay_min_changed)
	configure_slider(bot_delay_max_slider, 250, 10000, 250, on_bot_delay_max_changed)
	configure_slider(cooldown_slider, 0, 5000, 250, on_cooldown_changed)
	configure_slider(level_time_slider, 5000, 120000, 1000, on_level_time_changed)
	configure_slider(start_delay_slider, 0, 10000, 500, on_start_delay_changed)
	configure_slider(target_multiplier_slider, 1, 20, 1, on_target_multiplier_changed)
	update_debug_labels()

func setup_skin_controls() -> void:
	if skin_button != null:
		skin_button.pressed.connect(toggle_skin_overlay, CONNECT_DEFERRED)

	if skin_overlay != null:
		set_skin_overlay_open(false)

	if close_skin_button != null:
		close_skin_button.pressed.connect(func(): set_skin_overlay_open(false), CONNECT_DEFERRED)

	if skin_dim_layer != null:
		skin_dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
		skin_dim_layer.gui_input.connect(on_skin_dim_layer_input)

	if default_skin_button != null:
		default_skin_button.pressed.connect(func(): switch_skin(DEFAULT_UI_SKIN), CONNECT_DEFERRED)

	if figma_skin_button != null:
		figma_skin_button.pressed.connect(func(): switch_skin("Figma_SkinV1"), CONNECT_DEFERRED)

	update_skin_button_states()

func configure_slider(slider: HSlider, min_value: float, max_value: float, step: float, callback: Callable) -> void:
	if slider == null:
		return

	slider.min_value = min_value
	slider.max_value = max_value
	slider.step = step
	slider.value_changed.connect(callback)

func reset_ui() -> void:
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
	tower_stack.clear_tower()
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	refresh_button.disabled = true

func connect_network_signals() -> void:
	NetworkManager.status_changed.connect(update_status)
	NetworkManager.room_joined.connect(update_room)
	NetworkManager.room_closed.connect(update_room_closed)
	NetworkManager.client_status.connect(update_connect_button)
	NetworkManager.game_state_updated.connect(update_game_state)
	NetworkManager.debug_config_updated.connect(update_debug_config)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_cancel") and debug_overlay != null and debug_overlay.visible:
		set_debug_overlay_open(false)
	elif event.is_action_pressed("ui_cancel") and skin_overlay != null and skin_overlay.visible:
		set_skin_overlay_open(false)

func on_connect_pressed() -> void:
	NetworkManager.toggle_connection()

func on_block_pressed(index: int) -> void:
	NetworkManager.place_block(index)

func on_refresh_pressed() -> void:
	NetworkManager.refresh_blocks()

func toggle_debug_overlay() -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("toggle"):
		debug_overlay.call("toggle")
	else:
		debug_overlay.visible = !debug_overlay.visible

func set_debug_overlay_open(open: bool) -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("set_open"):
		debug_overlay.call("set_open", open)
	else:
		debug_overlay.visible = open

func on_debug_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_debug_overlay_open(false)

func toggle_skin_overlay() -> void:
	if skin_overlay == null:
		return

	set_skin_overlay_open(!skin_overlay.visible)

func set_skin_overlay_open(open: bool) -> void:
	if skin_overlay == null:
		return

	skin_overlay.visible = open
	if skin_dim_layer != null:
		skin_dim_layer.visible = open

func on_skin_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_skin_overlay_open(false)

func switch_skin(skin_name: String) -> void:
	if is_switching_skin or skin_name == active_skin_name:
		set_skin_overlay_open(false)
		return

	is_switching_skin = true
	load_skin(skin_name)
	if active_skin == null or !prepare_active_skin():
		is_switching_skin = false
		return

	setup_inventory_controls()
	setup_debug_controls()
	setup_skin_controls()
	reset_ui()
	update_status(last_status_text)

	if typeof(last_room_data) == TYPE_DICTIONARY:
		update_room(last_room_data)

	if typeof(last_game_state_data) == TYPE_DICTIONARY:
		update_game_state(last_game_state_data)

	ProjectSettings.set_setting("corp_tower/ui_skin", active_skin_name)
	set_skin_overlay_open(false)
	is_switching_skin = false

func update_skin_button_states() -> void:
	if default_skin_button != null:
		default_skin_button.disabled = active_skin_name == DEFAULT_UI_SKIN

	if figma_skin_button != null:
		figma_skin_button.disabled = active_skin_name == "Figma_SkinV1"

func update_status(text: String) -> void:
	last_status_text = text
	status_label.text = text

	if debug_button == null:
		return

	debug_button.disabled = text != "Connected"

func update_connect_button(status: String) -> void:
	if status == "[Connect]":
		connect_button.text = "Connect"
	elif status == "[Disconnect]":
		connect_button.text = "Disconnect"
	else:
		connect_button.text = status.replace("[", "").replace("]", "").strip_edges()

func update_room(data) -> void:
	if !is_switching_skin:
		last_room_data = data

	connect_button.disabled = true
	player_label.text = LOCAL_PLAYER_MARKER + " " + str(data.playerId)
	room_label.text = "Room " + str(int(data.roomId))
	level_label.text = "Level " + str(int(data.level))
	timer_label.text = "Time -"
	tower_status_label.text = "Match starting"
	set_tower_progress(0, int(data.get("targetHeight", 0)))
	tower_stack.clear_tower()
	update_inventory_ui(
		data.get("blocks", []),
		int(data.get("activeInventorySlots", MAX_INVENTORY_SLOTS))
	)
	update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)

func update_room_closed(data) -> void:
	last_room_data = null
	last_game_state_data = null
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
	update_inventory_ui([], MAX_INVENTORY_SLOTS)
	update_draw_pile_ui(0, null)
	set_debug_overlay_open(false)

func update_game_state(data) -> void:
	if !is_switching_skin:
		last_game_state_data = data

	var state: String = str(data.get("state", "playing"))
	var seconds_remaining: int = int(data.get("secondsRemaining", 0))
	var current_height: int = int(data.get("currentHeight", 0))
	var target_height: int = int(data.get("targetHeight", 0))
	var players: Array = data.get("players", [])

	update_player_color_map(players)
	if tower_stack.has_method("set_player_color_map"):
		tower_stack.call("set_player_color_map", player_color_map)

	level_label.text = "Level " + str(int(data.get("level", 0))) + " - " + state.capitalize()
	timer_label.text = "Time " + str(seconds_remaining) + "s"
	height_label.text = "Height " + str(current_height) + "/" + str(target_height)
	tower_value_label.text = str(current_height) + " / " + str(target_height)
	tower_status_label.text = get_tower_status(state, current_height, target_height)
	set_tower_progress(current_height, target_height)
	tower_stack.set_tower(data.get("towerBlocks", []), current_height, target_height)
	update_draw_pile_ui(
		int(data.get("drawPileCount", 0)),
		data.get("nextDrawBlock", null)
	)

	var scores_text: String = ""
	var my_refresh_tokens: int = 0
	var my_refresh_uses_remaining: int = 0
	var max_refresh_tokens: int = int(data.get("maxRefreshTokens", 1))
	var max_uses_per_level: int = int(data.get("maxRefreshUsesPerLevel", 2))
	var my_blocks: Array = []

	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", "P?"))
		var prefix: String = LOCAL_PLAYER_MARKER if player_id == NetworkManager.player_id else player_id
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

	var level_refreshes_used: int = max_uses_per_level - my_refresh_uses_remaining
	refresh_uses_label.text = "Level refreshes " + str(level_refreshes_used) + "/" + str(max_uses_per_level)

	var in_lockout: bool = seconds_remaining <= 10 and state == "playing"
	refresh_button.text = "Refresh"
	refresh_button.disabled = (
		my_refresh_tokens <= 0 or
		my_refresh_uses_remaining <= 0 or
		in_lockout or
		state == "failed" or
		state == "finished" or
		state == "game_completed"
	)

	update_inventory_ui(
		my_blocks,
		int(data.get("activeInventorySlots", MAX_INVENTORY_SLOTS))
	)

func update_inventory_ui(blocks: Array, active_slots: int = MAX_INVENTORY_SLOTS) -> void:
	var clean_blocks: Array = []
	var local_player_color: Color = get_local_player_color()
	active_inventory_slots = clampi(active_slots, 1, MAX_INVENTORY_SLOTS)

	for i in range(blocks.size()):
		clean_blocks.append(normalize_block(blocks[i], i))

	block_label.text = "Inventory " + str(clean_blocks.size()) + "/" + str(active_inventory_slots)

	for i in range(inventory_buttons.size()):
		var button: Button = inventory_buttons[i]
		var preview: Control = block_previews[i]
		var slot_height_label: Label = block_height_labels[i]
		var name_label: Label = block_name_labels[i]
		preview.cell_color = local_player_color

		if i >= active_inventory_slots:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			slot_height_label.text = "Locked"
			name_label.text = "Level " + str(get_slot_unlock_level(i))
		elif i < clean_blocks.size():
			var block: Dictionary = clean_blocks[i]
			button.disabled = false
			button.text = ""
			preview.set_block(block)
			slot_height_label.text = "Height " + str(int(block.get("height", 0)))
			name_label.text = str(block.get("shapeId", "BLOCK"))
		else:
			button.disabled = true
			button.text = ""
			preview.clear_block()
			slot_height_label.text = "Empty"
			name_label.text = "Slot " + str(i + 1)

func get_slot_unlock_level(slot_index: int) -> int:
	if slot_index <= 0:
		return 1
	if slot_index == 1:
		return 2

	return 4

func update_draw_pile_ui(draw_pile_count: int, raw_next_block: Variant) -> void:
	if draw_pile_preview == null:
		return

	draw_pile_preview.cell_color = DRAW_PILE_COLOR

	if draw_pile_count <= 0 or raw_next_block == null:
		draw_pile_name_label.text = "Next Draw"
		draw_pile_count_label.text = "0 left"
		draw_pile_preview.clear_block()
		return

	var next_block: Dictionary = normalize_block(raw_next_block, 0)
	draw_pile_name_label.text = "Next " + str(next_block.get("shapeId", "BLOCK"))
	draw_pile_count_label.text = str(draw_pile_count) + " left"
	draw_pile_preview.set_block(next_block)

func get_local_player_color() -> Color:
	var player_id: String = str(NetworkManager.player_id)
	if player_color_map.has(player_id):
		return player_color_map[player_id]

	return PlayerColors.color_for_player_id(player_id)

func update_player_color_map(players: Array) -> void:
	var updated_map: Dictionary = {}

	for i in range(players.size()):
		var player: Dictionary = players[i]
		var player_id: String = str(player.get("id", ""))
		if player_id != "":
			updated_map[player_id] = PlayerColors.color_for_player_index(i)

	player_color_map = updated_map

func normalize_block(raw_block, index: int) -> Dictionary:
	if typeof(raw_block) == TYPE_DICTIONARY:
		var dictionary_cells: Array = raw_block.get("cells", [])
		var block_height: int = int(raw_block.get("height", calculate_block_height(dictionary_cells)))
		return {
			"id": str(raw_block.get("id", "slot-" + str(index))),
			"shapeId": str(raw_block.get("shapeId", "BLOCK")),
			"cells": dictionary_cells,
			"height": block_height
		}

	var legacy_height: int = max(0, int(raw_block))
	var legacy_cells: Array = []

	for y in range(legacy_height):
		legacy_cells.append([0, y])

	return {
		"id": "legacy-" + str(index),
		"shapeId": "LEGACY",
		"cells": legacy_cells,
		"height": legacy_height
	}

func calculate_block_height(cells: Array) -> int:
	if cells.is_empty():
		return 0

	var min_y: int = 999999
	var max_y: int = -999999

	for cell in cells:
		var y: int = 0

		if typeof(cell) == TYPE_DICTIONARY:
			y = int(cell.get("y", 0))
		else:
			y = int(cell[1])

		min_y = mini(min_y, y)
		max_y = maxi(max_y, y)

	return max_y - min_y + 1

func set_tower_progress(current_height: int, target_height: int) -> void:
	var ratio: float = 0.0

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

func on_bots_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	NetworkManager.update_config("debugBotsEnabled", enabled)

func on_bot_strategy_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	var strategy: String = BOT_STRATEGY_COOPERATIVE
	if index == 1:
		strategy = BOT_STRATEGY_MVP_GREEDY

	NetworkManager.update_config("debugBotStrategy", strategy)

func on_bot_count_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("debugBotCount", int(value))

func on_bot_delay_min_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("debugBotDelayMin", int(value))

func on_bot_delay_max_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("debugBotDelayMax", int(value))

func on_cooldown_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("placementCooldown", int(value))

func on_level_time_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("levelTimeLimitMs", int(value))

func on_start_delay_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("startDelayMs", int(value))

func on_target_multiplier_changed(value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	NetworkManager.update_config("targetHeightMultiplier", int(value))

func update_debug_config(config) -> void:
	if bots_toggle == null:
		return

	is_syncing_debug_config = true
	bots_toggle.set_pressed_no_signal(bool(config.get("debugBotsEnabled", false)))
	if bot_strategy_button != null:
		var strategy: String = str(config.get("debugBotStrategy", BOT_STRATEGY_COOPERATIVE))
		var selected_strategy_index: int = 1 if strategy == BOT_STRATEGY_MVP_GREEDY else 0
		bot_strategy_button.select(selected_strategy_index)
	bot_count_slider.set_value_no_signal(float(config.get("debugBotCount", 0)))
	bot_delay_min_slider.set_value_no_signal(float(config.get("debugBotDelayMin", 2000)))
	bot_delay_max_slider.set_value_no_signal(float(config.get("debugBotDelayMax", 5000)))
	cooldown_slider.set_value_no_signal(float(config.get("placementCooldown", 3000)))
	level_time_slider.set_value_no_signal(float(config.get("levelTimeLimitMs", 30000)))
	start_delay_slider.set_value_no_signal(float(config.get("startDelayMs", 3000)))
	target_multiplier_slider.set_value_no_signal(float(config.get("targetHeightMultiplier", 3)))
	update_debug_labels()
	is_syncing_debug_config = false

func update_debug_labels() -> void:
	if bot_count_label == null:
		return

	bot_count_label.text = "Bot Count: " + str(int(bot_count_slider.value))
	bot_delay_min_label.text = "Bot Delay Min: " + str(int(bot_delay_min_slider.value)) + " ms"
	bot_delay_max_label.text = "Bot Delay Max: " + str(int(bot_delay_max_slider.value)) + " ms"
	cooldown_label.text = "Placement Cooldown: " + str(int(cooldown_slider.value)) + " ms"
	level_time_label.text = "Level Time: " + str(int(level_time_slider.value / 1000.0)) + " sec"
	start_delay_label.text = "Start Delay: " + str(int(start_delay_slider.value)) + " ms"
	target_multiplier_label.text = "Target Multiplier: " + str(int(target_multiplier_slider.value))
