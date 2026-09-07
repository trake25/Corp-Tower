extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const MainScene := preload("res://Cor/Scenes/Main.tscn")
const NetworkManagerScript := preload("res://Sys/NetMan/NetworkManager.gd")
const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

class FakeSocket:
	extends RefCounted

	var sent_messages: Array = []
	var ready_state := WebSocketPeer.STATE_OPEN

	func send_text(raw: String) -> Error:
		sent_messages.append(JSON.parse_string(raw))
		return OK

	func get_ready_state() -> int:
		return ready_state

	func close() -> Error:
		ready_state = WebSocketPeer.STATE_CLOSING
		return OK

class NetworkStub:
	var is_conn_estab := true
	var placed: Array = []

	func place_block(index: int, _column: int = -1, _origin_y: int = -1) -> void:
		placed.append(index)

var auth
var screen_manager
var harness

func before_each() -> void:
	NetworkManager.disconnect_server()
	NetworkManager.abandon_room_identity()
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.sign_out()
	auth.free()
	NetworkManager.disconnect_server()
	NetworkManager.abandon_room_identity()

func test_authenticated_session_keeps_the_player_identity_available() -> void:
	assert_true(auth._apply_session({
		"access_token": "access-value",
		"refresh_token": "refresh-value",
		"expires_in": 3600,
		"user": {"id": "player-uuid", "is_anonymous": false}
	}))
	assert_eq(auth.access_token_value, "access-value")
	assert_eq(auth.user_id, "player-uuid")

func test_authenticated_startup_routes_a_resumed_private_lobby_then_play() -> void:
	screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame
	NetworkManager.player_id = "saved-player"
	NetworkManager.reconnect_token = "saved-token"
	screen_manager._clear_overlay()
	screen_manager.startup_splash.visible = true
	NetworkManager.is_connecting = true
	screen_manager._begin_authenticated_startup()
	assert_true(screen_manager.startup_resume_pending)
	assert_true(NetworkManager.resume_only_request)
	NetworkManager.is_connecting = false
	screen_manager._on_room_joined({
		"matchStarted": false,
		"roomMode": "private",
		"roster": [],
		"lobby": {},
		"privateLobby": {"serverId": "2345ABCD", "hostPlayerId": "saved-player"}
	})
	await get_tree().process_frame
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/PrivateLobbyScreen.tscn"))
	screen_manager._on_room_joined({"matchStarted": true, "roomMode": "private"})
	await get_tree().process_frame
	assert_not_null(screen_manager.play_instance)

func test_private_entry_uses_the_authoritative_private_room_wire_contract() -> void:
	var network = NetworkManagerScript.new()
	var socket = FakeSocket.new()
	network.ws = socket
	network.profile_id = "profile"
	network._set_private_entry("private_join", "Guest", "2345abcd", "1234")
	network.send_reconnect_request()
	var entry: Dictionary = socket.sent_messages[0]
	assert_eq(entry.get("entryMode"), "private_join")
	assert_eq(entry.get("privateDisplayName"), "Guest")
	assert_eq(entry.get("privateServerId"), "2345ABCD")
	assert_eq(entry.get("privatePassword"), "1234")
	network.free()

func test_authoritative_recovery_progress_resumes_the_live_match() -> void:
	var network = NetworkManagerScript.new()
	network.recovery_state = "resyncing"
	network.recovery_start_revision = 11
	network.last_state_revision = 11
	network.recovery_deadline_msec = Time.get_ticks_msec() - 1
	network.recovery_expiry_msec = Time.get_ticks_msec() + 1000
	network.is_conn_estab = true
	var state := {"state": "playing", "stateRevision": 12}
	assert_true(network.accept_game_state(state))
	network.settle_recovery(state)
	network.check_recovery_deadlines(Time.get_ticks_msec())
	assert_eq(network.recovery_state, "healthy")
	assert_true(network.is_conn_estab)
	network.free()

func test_play_renders_authoritative_state_and_sends_a_placement() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var network = NetworkStub.new()
	harness.main.inventory.network = network
	harness.main.update_game_state({
		"state": "playing",
		"secondsRemaining": 25,
		"currentHeight": 2,
		"targetHeight": 12,
		"level": 1,
		"players": [
			{"id": "P1", "score": 10, "levelScore": 4, "blocks": [{"id": "b1", "shapeId": "L2", "cells": [[0, 0], [0, 1]], "height": 2}], "powerInventory": []},
			{"id": "P2", "score": 8, "levelScore": 2, "blocks": [], "powerInventory": []},
			{"id": "P3", "score": 0, "levelScore": 0, "blocks": [], "powerInventory": []}
		],
		"towerBlocks": []
	})
	assert_true((harness.main.missing_required_nodes as Array).is_empty())
	assert_eq(harness.main.roster.player_rail_entries.size(), 3)
	harness.main.inventory.update_inventory_ui([{"id": "b1", "shapeId": "L2", "cells": [[0, 0], [0, 1]], "height": 2}], 3)
	var inventory = harness.main.inventory
	assert_true(inventory.can_place_block(0))
	inventory._on_inventory_card_gui_input(HarnessScript.touch_press(harness.center_of("PlaceBlockButton1"), 0), 0)
	var release := InputEventScreenTouch.new()
	release.pressed = false
	release.index = 0
	release.position = (harness.find("TowerDropZone") as Control).get_global_rect().get_center()
	inventory.handle_input(release)
	assert_eq(network.placed, [0])
