##Network Manager.gd
extends Node

var ws = WebSocketPeer.new()
var is_conn_estab : bool = false
var is_connecting := false

var player_id := ""

signal status_changed(text)
signal room_joined(data)
signal game_state_updated(data)
signal client_status(status)
signal debug_config_updated(config)

func connect_server():
	var url = "ws://52.221.225.117:3000"
	
	status_changed.emit("Connecting...")

	if is_conn_estab or is_connecting:
		print("Already connecting/connected. Ignoring.")
		return

	is_connecting = true

	var error = ws.connect_to_url(url)

	if error == OK:
		print("Connecting...")
	else:
		print("Failed to start connection")
		is_connecting = false


func disconnect_server():
	
	status_changed.emit("Disconnecting...")
	if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
		print("Disconnecting from server...")
		ws.close()
	else:
		print("Not connected, nothing to disconnect")

## On_connect_pressed
func toggle_connection():
	if is_conn_estab or is_connecting:
		disconnect_server()
	else:
		connect_server()

func place_block(block_index):

	if not is_conn_estab:
		print("Not connected")
		return

	var data = {
		"type":"place_block",
		"blockIndex": block_index
	}

	var json = JSON.stringify(data)

	ws.send_text(json)

	print("place_block sent")

func refresh_blocks():

	if not is_conn_estab:
		print("Not connected")
		return

	var data = {
		"type":"refresh_blocks"
	}

	ws.send_text(
		JSON.stringify(data)
	)

	print("refresh_blocks sent")

func _process(_delta: float) -> void:
	ws.poll()
	
	while ws.get_available_packet_count():
		var packet = ws.get_packet()
		var message = packet.get_string_from_utf8()
		var json = JSON.new()
		var result = json.parse(message)
		if result != OK:
			continue
		var data = json.data
		print(data)
	
		match data.type:
			"room_created":
				player_id = data.playerId
				room_joined.emit(data)
				print("Player ID:", data.playerId)
				print("Room:", data.roomId)
				print("Blocks:", data.blocks)
			"game_state":
				game_state_updated.emit(data)
			"debug_config":
				debug_config_updated.emit(data.config)

	var state = ws.get_ready_state()

	match state:

		WebSocketPeer.STATE_CONNECTING:
			pass # optional debug

		WebSocketPeer.STATE_OPEN:
			if not is_conn_estab:
				is_conn_estab = true
				is_connecting = false
				print("CONNECTED TO SERVER")
				status_changed.emit("Connected")
				client_status.emit("[Disconnect]")

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if is_conn_estab or is_connecting:
				print("DISCONNECTED FROM SERVER")
				status_changed.emit("Disconnected")
				client_status.emit("[Connect]")
			is_conn_estab = false
			is_connecting = false

func update_config(
	key,
	value
):

	if not is_conn_estab:
		print("Not connected")
		return

	var data={

		"type":"update_config",

		"key":key,

		"value":value
	}

	ws.send_text(
		JSON.stringify(data)
	)

	print(
		"Config update:",
		key,
		value
	)
