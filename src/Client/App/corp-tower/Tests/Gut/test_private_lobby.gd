extends GutTest

const JoinScreenScene = preload("res://Cor/Scenes/JoinScreen.tscn")
const MainScene = preload("res://Cor/Scenes/Main.tscn")
const PrivateLobbyScene = preload("res://Cor/Scenes/PrivateLobbyScreen.tscn")
const PrivateServerScene = preload("res://Cor/Scenes/PrivateServerScreen.tscn")
const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

class FakeSocket:
	extends RefCounted

	var sent_messages: Array = []

	func send_text(raw: String) -> Error:
		sent_messages.append(JSON.parse_string(raw))
		return OK

func after_each() -> void:
	NetworkManager.disconnect_server()
	NetworkManager._clear_pending_private_entry()
	NetworkManager._clear_private_lobby_tracking()
	NetworkManager.player_id = ""

func private_lobby_payload(roster: Array, ready_ids: Array = [], countdown := false) -> Dictionary:
	return {
		"roomMode": "private",
		"matchStarted": false,
		"roster": roster,
		"lobby": {
			"readyPlayerIds": ready_ids,
			"startCountdownActive": countdown,
			"startSecondsRemaining": 5 if countdown else 0
		},
		"privateLobby": {
			"serverId": "2345ABCD",
			"password": "7007",
			"hostPlayerId": "host"
		}
	}

func test_private_lobby_renders_authoritative_roster_ready_and_grace_state() -> void:
	NetworkManager.player_id = "host"
	var screen = PrivateLobbyScene.instantiate()
	add_child_autofree(screen)
	await get_tree().process_frame

	var first_payload := private_lobby_payload([
		{"id": "host", "displayName": "Host", "avatarId": "avatar_0", "connectionPhase": "connected"},
		{"id": "guest", "displayName": "Guest", "avatarId": "avatar_1", "connectionPhase": "connected"}
	])
	screen.apply_lobby_data(first_payload)

	var ready_button = screen.get_node("SafeArea/Root/ReadyButtonMargin/ReadyButton") as Button
	var host_crown = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0/Seat0Crown") as TextureRect
	var host_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0/Seat0Kick") as BaseButton
	var guest_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat1/Seat1Kick") as BaseButton
	var empty_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Kick") as BaseButton
	var empty_name = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Name") as Label

	assert_true(ready_button.disabled, "Ready must wait for all three reserved seats.")
	assert_true(host_crown.visible, "The authoritative host id must render the crown.")
	assert_false(host_kick.visible, "The host cannot kick themself.")
	assert_true(guest_kick.visible, "The host can kick an occupied non-host seat.")
	assert_false(empty_kick.visible, "Empty seats never expose a kick control.")
	assert_eq(empty_name.text, "Waiting for player...")

	var full_payload := private_lobby_payload([
		{"id": "host", "displayName": "Host", "avatarId": "avatar_0", "connectionPhase": "connected"},
		{"id": "guest", "displayName": "Guest", "avatarId": "avatar_1", "connectionPhase": "connected"},
		{"id": "grace", "displayName": "GracefulGuest", "avatarId": "avatar_2", "connectionPhase": "grace"}
	], ["host"], true)
	screen.apply_lobby_data(full_payload)

	var grace_name = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Name") as Label
	var grace_avatar = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Avatar") as Control
	var ready_label = screen.get_node("SafeArea/Root/ReadyButtonMargin/ReadyButton/ReadyLabel") as Label

	assert_false(ready_button.disabled, "A three-seat private room enables Ready.")
	assert_eq(grace_name.text, "Graceful..", "Private names use the shared ten-character display convention.")
	assert_lt(grace_name.modulate.a, 1.0, "Only the server grace phase greys a disconnected name.")
	assert_lt(grace_avatar.modulate.a, 1.0, "Only the server grace phase greys the profile image.")
	assert_not_null(
		(screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Avatar/Seat2AvatarTexture") as TextureRect).texture,
		"Occupied seats render their roster avatar."
	)
	assert_eq(ready_label.text, "Cancel (5s)", "The server start deadline drives the local countdown label.")

func test_private_lobby_reuses_confirmation_modals_for_leave_and_kick() -> void:
	NetworkManager.player_id = "host"
	var screen = PrivateLobbyScene.instantiate()
	add_child_autofree(screen)
	await get_tree().process_frame
	screen.apply_lobby_data(private_lobby_payload([
		{"id": "host", "displayName": "Host", "avatarId": "avatar_0", "connectionPhase": "connected"},
		{"id": "guest", "displayName": "Guest", "avatarId": "avatar_1", "connectionPhase": "connected"}
	]))

	var leave_events: Array = []
	screen.leave_lobby_requested.connect(func(): leave_events.append(true))
	screen._on_back_pressed()
	assert_true(screen.get_node("LeaveLobbyModal").visible, "Back opens the existing Leave Lobby modal.")
	screen._on_leave_confirmed()
	assert_eq(leave_events.size(), 1, "Confirming Leave delegates navigation to the authoritative lifecycle route.")

	screen._on_kick_pressed(1)
	assert_true(screen.get_node("KickPlayerModal").visible, "A host kick opens the reused confirmation modal.")
	assert_eq(screen.pending_kick_player_id, "guest")

func test_join_and_private_server_emit_private_entry_without_touching_public_matchmaking() -> void:
	var join_screen = JoinScreenScene.instantiate()
	add_child_autofree(join_screen)
	await get_tree().process_frame

	var name_edit = join_screen.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit
	var server_id_edit = join_screen.get_node("SafeArea/Root/FieldsColumn/ServerIdEdit") as LineEdit
	var password_edit = join_screen.get_node("SafeArea/Root/FieldsColumn/PasswordRow/PasswordEdit") as LineEdit
	var join_error = join_screen.get_node("SafeArea/Root/PrivateJoinError") as Label
	var join_events: Array = []
	join_screen.private_join_requested.connect(func(display_name, server_id, password):
		join_events.append([display_name, server_id, password])
	)
	name_edit.text = "  Guest  "
	server_id_edit.text = "2345abcd"
	assert_eq(join_screen._normalized_password("12a34567890123"), "123456789012")
	password_edit.text = "1234567890123"
	join_screen._on_join_pressed()

	assert_true(name_edit.editable)
	assert_true(server_id_edit.editable)
	assert_true(password_edit.editable)
	assert_eq(password_edit.max_length, 12)
	assert_eq(join_events, [["Guest", "2345ABCD", "123456789012"]])
	assert_false(join_error.visible, "Private errors stay hidden until a server rejection.")
	join_screen.show_private_error("Wrong password")
	assert_true(join_error.visible)
	assert_eq(join_error.text, "Wrong password")

	var private_server = PrivateServerScene.instantiate()
	add_child_autofree(private_server)
	await get_tree().process_frame
	var create_events: Array = []
	private_server.create_requested.connect(func(display_name, password):
		create_events.append([display_name, password])
	)
	(private_server.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit).text = "  Host  "
	(private_server.get_node("SafeArea/Root/FieldsColumn/PasswordField/PasswordEdit") as LineEdit).text = "98x76"
	private_server._on_create_pressed()

	assert_eq(create_events, [["Host", "9876"]])

func test_network_manager_keeps_private_entry_and_waits_for_server_lifecycle_destination() -> void:
	var network = NetworkManagerScript.new()
	var socket = FakeSocket.new()
	network.ws = socket
	network.profile_id = "profile"
	var room_closed_events: Array = []
	network.room_closed.connect(func(data): room_closed_events.append(data))
	network._set_private_entry("private_join", "Guest", "2345abcd", "1234")
	network.send_reconnect_request()
	var private_entry: Dictionary = socket.sent_messages[0]
	assert_eq(private_entry.get("entryMode"), "private_join")
	assert_eq(private_entry.get("privateDisplayName"), "Guest")
	assert_eq(private_entry.get("privateServerId"), "2345ABCD")
	assert_eq(private_entry.get("privatePassword"), "1234")

	network.is_conn_estab = true
	network.kick_private_player("guest")
	assert_eq(socket.sent_messages[1], {
		"type": "kick_private_player",
		"targetPlayerId": "guest"
	})

	network._clear_pending_private_entry()
	network.send_reconnect_request()
	var public_entry: Dictionary = socket.sent_messages[2]
	assert_eq(public_entry.get("entryMode"), "public")
	assert_false(public_entry.has("privateDisplayName"))
	assert_false(public_entry.has("privateServerId"))
	assert_false(public_entry.has("privatePassword"))

	network._set_private_entry("private_join", "Guest", "2345abcd", "1234")
	network.player_id = "host"
	network._update_private_lobby_tracking({
		"roomMode": "private",
		"matchStarted": false,
		"privateLobby": {"hostPlayerId": "host"}
	})
	network.private_lobby_reconnect_deadline_msec = Time.get_ticks_msec() - 1
	network.schedule_private_lobby_reconnect()

	assert_eq(network.pending_entry_mode, "private_join")
	assert_eq(network.pending_private_server_id, "2345ABCD")
	assert_true(network.is_private_lobby_active())
	assert_true(network.private_lobby_is_host)
	assert_gte(network.auto_reconnect_delay_remaining, 0.0)
	assert_eq(room_closed_events.size(), 0, "Only the server can decide a private-lobby shell destination.")
	assert_true(network.has_signal("private_join_failed"))
	assert_true(network.has_method("kick_private_player"))
	network.free()

func test_screen_manager_routes_private_room_and_authoritative_destinations() -> void:
	var screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

	screen_manager._on_room_joined(private_lobby_payload([
		{"id": "host", "displayName": "Host", "avatarId": "avatar_0", "connectionPhase": "connected"}
	]))
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/PrivateLobbyScreen.tscn"),
		"Private room payloads render the dedicated Private Lobby rather than Public Lobby."
	)

	screen_manager._on_room_joined({
		"roomMode": "public",
		"matchStarted": false,
		"roster": [],
		"lobby": {}
	})
	assert_true(
		screen_manager.current_overlay.scene_file_path.ends_with("/PublicLobbyScreen.tscn"),
		"Public matchmaking retains the existing Public Lobby route."
	)

	var join_errors := {
		"full": "Full room",
		"playing": "Room playing",
		"not_found": "Room not found",
		"wrong_password": "Wrong password"
	}
	for reason in join_errors:
		screen_manager.show_join_screen()
		screen_manager._on_private_join_failed({"reason": reason})
		var error_label = screen_manager.current_overlay.get_node("SafeArea/Root/PrivateJoinError") as Label
		assert_true(error_label.visible)
		assert_eq(error_label.text, join_errors[reason])

	screen_manager._on_room_closed({"destination": "private_server"})
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/PrivateServerScreen.tscn"))
	screen_manager._on_room_closed({"destination": "join_server"})
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/JoinScreen.tscn"))
	screen_manager._on_room_closed({"destination": "home"})
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/HomeScreen.tscn"))
