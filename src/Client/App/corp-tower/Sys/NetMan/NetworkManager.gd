##Network Manager.gd
extends Node

var ws = WebSocketPeer.new()
var is_conn_estab : bool = false
var is_connecting := false

signal status_changed(text)
signal room_joined(data)

func connect_server():
	var url = "ws://13.229.227.24:3000"

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


func _process(_delta: float) -> void:
	ws.poll()
	
	while ws.get_available_packet_count():
		var data = ws.get_packet()
		var message = data.get_string_from_utf8()
		var json = JSON.new()

		var result = json.parse(message)

		if result == OK:
			data = json.data
			print(data)
			room_joined.emit(data)

			if data.type == "room_created":
				print("Player ID: ", data.playerId)
				print("Room: ",data.roomId)
				print("Blocks: ",data.blocks)

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

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if is_conn_estab or is_connecting:
				print("DISCONNECTED FROM SERVER")
				status_changed.emit("Disconnected")
			is_conn_estab = false
			is_connecting = false
