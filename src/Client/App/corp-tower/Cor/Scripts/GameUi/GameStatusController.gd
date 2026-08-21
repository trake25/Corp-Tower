extends Node

var connection_banner: Control
var status_label: Label
var session_panel: Control
var player_label: Label
var room_label: Label

func bind_nodes(binder) -> void:
	connection_banner = binder.require_node("ConnectionBanner") as Control
	status_label = binder.require_node("StatusLabel") as Label
	session_panel = binder.require_node("SessionPanel") as Control
	player_label = binder.require_node("PlayerLabel") as Label
	room_label = binder.require_node("RoomLabel") as Label

func reset() -> void:
	update_connection_status("Disconnected")
	player_label.text = "PLAYER -"
	room_label.text = "ROOM -"
	session_panel.visible = false

func update_connection_status(text: String) -> void:
	var normalized := text.strip_edges()
	status_label.text = normalized.to_upper()
	connection_banner.visible = normalized.to_lower() != "connected"

func update_session(player_id: String, room_id: int) -> void:
	player_label.text = "PLAYER " + player_id
	room_label.text = "ROOM " + str(room_id)
	session_panel.visible = true

func update_room_closed() -> void:
	room_label.text = "ROOM CLOSED"
	session_panel.visible = true
