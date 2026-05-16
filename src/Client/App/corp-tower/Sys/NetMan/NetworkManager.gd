##Network Manager.gd
extends Node

var ws = WebSocketPeer.new()
var is_connected := false
var is_connecting := false

func connect_server():
	var url = "ws://13.229.227.24:3000"

	if is_connected or is_connecting:
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
	if is_connected or is_connecting:
		disconnect_server()
	else:
		connect_server()


func _process(delta: float) -> void:
	ws.poll()
	
	while ws.get_available_packet_count():
		var data = ws.get_packet()
		var message = data.get_string_from_utf8()
		print(message)

	var state = ws.get_ready_state()

	match state:

		WebSocketPeer.STATE_CONNECTING:
			pass # optional debug

		WebSocketPeer.STATE_OPEN:
			if not is_connected:
				is_connected = true
				is_connecting = false
				print("CONNECTED TO SERVER (REAL)")

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if is_connected or is_connecting:
				print("DISCONNECTED FROM SERVER")
			is_connected = false
			is_connecting = false
