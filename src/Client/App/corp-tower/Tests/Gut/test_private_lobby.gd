extends GutTest

const JoinScreenScene = preload("res://Cor/Scenes/JoinScreen.tscn")
const MainScene = preload("res://Cor/Scenes/Main.tscn")
const PrivateLobbyScene = preload("res://Cor/Scenes/PrivateLobbyScreen.tscn")
const PrivateServerScene = preload("res://Cor/Scenes/PrivateServerScreen.tscn")
const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

class FakeSocket:
	extends RefCounted

	var sent_messages: Array = []
	var packets: Array = []
	var ready_state := WebSocketPeer.STATE_OPEN
	var close_count := 0
	var connect_result := OK

	func connect_to_url(_url: String) -> Error:
		return connect_result

	func send_text(raw: String) -> Error:
		sent_messages.append(JSON.parse_string(raw))
		return OK

	func poll() -> void:
		pass

	func get_ready_state() -> int:
		return ready_state

	func get_available_packet_count() -> int:
		return packets.size()

	func get_packet() -> PackedByteArray:
		return packets.pop_front()

	func close() -> Error:
		close_count += 1
		ready_state = WebSocketPeer.STATE_CLOSING
		return OK

	func queue_packet(data: Dictionary) -> void:
		packets.append(JSON.stringify(data).to_utf8_buffer())

func after_each() -> void:
	NetworkManager.disconnect_server()
	NetworkManager.abandon_room_identity()
	NetworkManager._clear_pending_private_entry()
	NetworkManager._clear_private_lobby_tracking()
	NetworkManager.player_id = ""

func private_lobby_payload(roster: Array, ready_ids: Array = [], countdown := false, password := "7007") -> Dictionary:
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
			"password": password,
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
	var host_seat = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0") as HBoxContainer
	var host_crown = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0/Seat0Identity/Seat0Crown") as TextureRect
	var host_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0/Seat0Kick") as BaseButton
	var host_check = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat0/Seat0Check") as TextureRect
	var guest_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat1/Seat1Kick") as BaseButton
	var empty_kick = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Kick") as BaseButton
	var empty_name = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Identity/Seat2Name") as Label
	var normal_name_color := empty_name.get_theme_color("font_color")

	assert_true(ready_button.disabled, "Ready must wait for all three reserved seats.")
	assert_true(host_crown.visible, "The authoritative host id must render the crown.")
	assert_false(host_kick.visible, "The host cannot kick themself.")
	assert_true(guest_kick.visible, "The host can kick an occupied non-host seat.")
	assert_false(empty_kick.visible, "Empty seats never expose a kick control.")
	assert_eq(empty_name.text, "Waiting for player...")
	assert_eq(host_crown.get_parent().name, "Seat0Identity", "The crown belongs beside the host name.")
	assert_eq(host_seat.get_child(host_seat.get_child_count() - 1), host_check, "Ready stays at the far edge of each row.")
	assert_eq(screen.find_children("*Avatar*").size(), 0, "Private waiting-room rows do not render profile avatars.")

	screen.apply_lobby_data(private_lobby_payload([
		{"id": "host", "displayName": "Host", "connectionPhase": "connected"}
	], [], false, ""))
	assert_eq((screen.get_node("SafeArea/Root/ServerInfoCard/CardMargin/Rows/PasswordValue") as Label).text, "")

	var full_payload := private_lobby_payload([
		{"id": "host", "displayName": "Host", "avatarId": "avatar_0", "connectionPhase": "connected"},
		{"id": "guest", "displayName": "Guest", "avatarId": "avatar_1", "connectionPhase": "connected"},
		{"id": "grace", "displayName": "GracefulGuest", "avatarId": "avatar_2", "connectionPhase": "grace", "presence": "disconnected"}
	], ["host"], true)
	screen.apply_lobby_data(full_payload)

	var grace_name = screen.get_node("SafeArea/Root/WaitingRoomCard/CardMargin/Rows/Seat2/Seat2Identity/Seat2Name") as Label
	var ready_label = screen.get_node("SafeArea/Root/ReadyButtonMargin/ReadyButton/ReadyLabel") as Label

	assert_false(ready_button.disabled, "A three-seat private room enables Ready.")
	assert_eq(grace_name.text.replace("\u0336", ""), "Graceful..", "Private names use the shared ten-character display convention.")
	assert_true(grace_name.text.contains("\u0336"), "Disconnected private-lobby names are struck through.")
	var disconnected_name_color := grace_name.get_theme_color("font_color")
	assert_true(
		disconnected_name_color.r > disconnected_name_color.g
		and disconnected_name_color.r > disconnected_name_color.b,
		"Disconnected private-lobby names use a red state."
	)
	assert_eq(ready_label.text, "Cancel (5s)", "The server start deadline drives the local countdown label.")

	screen.apply_lobby_data(private_lobby_payload([
		{"id": "host", "displayName": "Host", "presence": "connected"},
		{"id": "guest", "displayName": "Guest", "presence": "connected"},
		{"id": "grace", "displayName": "GracefulGuest", "presence": "connected"}
	]))
	assert_eq(grace_name.text, "Graceful..", "Reconnect restores the unadorned private-lobby name.")
	assert_eq(grace_name.modulate, Color.WHITE)
	assert_eq(grace_name.get_theme_color("font_color"), normal_name_color)

	var toast = screen.get_node("SafeArea/Root/ServerInfoCard/CardMargin/Rows/ServerIdRow/CopyServerIdButton/CopyToast") as Control
	assert_eq((screen.get_node("SafeArea/Root/ServerInfoCard/CardMargin/Rows/ServerIdRow/Values/ServerIdValue") as Label).text, "2345ABCD")
	screen._on_copy_server_id_pressed()
	assert_true(toast.visible)
	screen._on_copy_toast_timeout()
	assert_false(toast.visible)

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
	var find_match_events: Array = []
	var join_back_events: Array = []
	join_screen.private_join_requested.connect(func(display_name, server_id, password):
		join_events.append([display_name, server_id, password])
	)
	join_screen.find_match_requested.connect(func(): find_match_events.append(true))
	join_screen.back_requested.connect(func(): join_back_events.append(true))
	name_edit.text = "  Guest  "
	server_id_edit.text = "2345abcd"
	assert_eq(join_screen._normalized_password("12a34567890123"), "123456789012")
	password_edit.text = "1234567890123"
	for field in [name_edit, server_id_edit, password_edit]:
		field.grab_focus()
		await get_tree().process_frame
		assert_true(field.has_focus())
		field.text_submitted.emit(field.text)
		assert_false(field.has_focus(), "Done releases the active Join Server field.")
	assert_eq(join_events.size(), 0, "Done never submits a private Join request.")
	assert_eq(find_match_events.size(), 0, "Done never starts public matchmaking.")
	assert_eq(join_back_events.size(), 0, "Done never navigates away from Join Server.")
	join_screen._on_join_pressed()

	assert_true(name_edit.editable)
	assert_true(server_id_edit.editable)
	assert_true(password_edit.editable)
	assert_eq(password_edit.max_length, 12)
	assert_true(password_edit.secret)
	assert_eq(password_edit.secret_character, "*")
	assert_eq(password_edit.get_parent().name, "PasswordRow")
	assert_eq((join_screen.get_node("SafeArea/Root/FieldsColumn/PasswordRow/PasswordVisibilityButton") as TextureButton).get_parent(), password_edit.get_parent())
	assert_eq(join_events, [["Guest", "2345ABCD", "123456789012"]])
	assert_false(join_error.visible, "Private errors stay hidden until a server rejection.")
	join_screen.show_private_error("Wrong password")
	assert_true(join_error.visible)
	assert_eq(join_error.text, "Wrong password")
	var paste_events: Array = []
	join_screen.private_join_requested.connect(func(_display_name, _server_id, _password): paste_events.append(true))
	server_id_edit.text = "2345ABCD"
	server_id_edit.grab_focus()
	server_id_edit.edit()
	join_screen._on_server_id_menu_id_pressed(LineEdit.MENU_PASTE)
	await get_tree().process_frame
	assert_eq(server_id_edit.text, "2345ABCD")
	assert_false(server_id_edit.has_focus(), "Paste completion exits Server ID edit mode.")
	assert_false(server_id_edit.is_editing())
	assert_eq(paste_events.size(), 0, "Pasting Server ID never submits Join.")
	join_screen.show_private_pending()
	join_screen._on_server_id_menu_id_pressed(LineEdit.MENU_PASTE)
	await get_tree().process_frame
	assert_eq(server_id_edit.text, "2345ABCD", "Pending Join prevents Server ID paste interaction.")
	join_screen.clear_private_pending()

	var private_server = PrivateServerScene.instantiate()
	add_child_autofree(private_server)
	await get_tree().process_frame
	var create_events: Array = []
	var create_back_events: Array = []
	private_server.create_requested.connect(func(display_name, password):
		create_events.append([display_name, password])
	)
	private_server.back_requested.connect(func(): create_back_events.append(true))
	var private_name = private_server.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit
	var private_password = private_server.get_node("SafeArea/Root/FieldsColumn/PasswordField/PasswordEdit") as LineEdit
	private_name.text = "  Host  "
	private_password.text = "98x76"
	for field in [private_name, private_password]:
		field.grab_focus()
		await get_tree().process_frame
		assert_true(field.has_focus())
		field.text_submitted.emit(field.text)
		assert_false(field.has_focus(), "Done releases the active Private Server field.")
	assert_eq(create_events.size(), 0, "Done never submits a private Create request.")
	assert_eq(create_back_events.size(), 0, "Done never navigates away from Private Server.")
	private_server._on_create_pressed()

	assert_eq(create_events, [["Host", "9876"]])
	assert_true(private_password.secret)
	assert_eq(private_password.secret_character, "*")
	private_server._toggle_password_visibility()
	assert_false(private_password.secret)
	assert_eq(private_password.text, "9876")

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
	assert_false(bool(public_entry.get("resumeOnly", true)))
	assert_false(public_entry.has("privateDisplayName"))
	assert_false(public_entry.has("privateServerId"))
	assert_false(public_entry.has("privatePassword"))

	network.resume_only_request = true
	network.send_reconnect_request()
	assert_true(bool(socket.sent_messages[3].get("resumeOnly", false)))

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
	assert_true(network.has_signal("private_entry_failed"))
	assert_true(network.has_method("kick_private_player"))
	network.free()

func test_private_entry_is_single_flight_until_authoritative_room_success() -> void:
	var network = NetworkManagerScript.new()
	var socket = FakeSocket.new()
	network.ws = socket
	network.is_conn_estab = true
	var room_joined_events: Array = []
	network.room_joined.connect(func(data): room_joined_events.append(data))

	assert_true(network.create_private_server("Host", "1234"))
	assert_false(network.join_private_server("Guest", "2345ABCD", "5678"))
	assert_eq(socket.close_count, 1, "A repeated private entry cannot restart the active socket lifecycle.")
	assert_true(network.private_entry_in_flight)
	assert_eq(network.pending_entry_mode, "private_create")
	assert_eq(network.pending_private_display_name, "Host")

	socket.ready_state = WebSocketPeer.STATE_OPEN
	network.is_conn_estab = true
	socket.queue_packet({
		"type": "room_created",
		"roomMode": "private",
		"matchStarted": false,
		"privateLobby": {"hostPlayerId": ""}
	})
	network._process(0.0)

	assert_eq(room_joined_events.size(), 1)
	assert_false(network.private_entry_in_flight)
	assert_eq(network.pending_entry_mode, "public")
	assert_true(network.join_private_server("Guest", "2345ABCD", "5678"))
	assert_eq(socket.close_count, 2, "A terminal room result releases the next private entry attempt.")
	network.free()

func test_private_entry_rejection_and_transport_close_release_the_lock() -> void:
	var rejection_network = NetworkManagerScript.new()
	var rejection_socket = FakeSocket.new()
	rejection_network.ws = rejection_socket
	rejection_network.is_conn_estab = true
	rejection_network._set_private_entry("private_join", "Guest", "2345ABCD", "1234")
	rejection_network.private_entry_in_flight = true
	var rejection_states: Array = []
	rejection_network.private_join_failed.connect(func(_data): rejection_states.append(rejection_network.private_entry_in_flight))
	rejection_socket.queue_packet({"type": "private_join_rejected", "reason": "wrong_password"})
	rejection_network._process(0.0)

	assert_true(rejection_states[0], "The rejection data reaches the screen before the private lock clears.")
	assert_false(rejection_network.private_entry_in_flight)
	assert_eq(rejection_network.pending_entry_mode, "public")
	rejection_network.free()

	var failure_network = NetworkManagerScript.new()
	var failure_socket = FakeSocket.new()
	failure_socket.ready_state = WebSocketPeer.STATE_CLOSED
	failure_network.ws = failure_socket
	failure_network.is_connecting = true
	failure_network._set_private_entry("private_create", "Host", "", "")
	failure_network.private_entry_in_flight = true
	var failure_events: Array = []
	failure_network.private_entry_failed.connect(func(data): failure_events.append(data))
	failure_network._process(0.0)
	failure_network._process(0.0)

	assert_eq(failure_events.size(), 1, "A pre-room transport close reports one local private-entry failure.")
	assert_eq(failure_events[0].get("entryMode"), "private_create")
	assert_false(failure_network.private_entry_in_flight)
	failure_network.free()

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

func test_accepted_private_join_stays_on_form_until_rejection() -> void:
	var screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

	screen_manager.show_join_screen()
	var join_screen = screen_manager.current_overlay
	var join_name = join_screen.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit
	var join_server_id = join_screen.get_node("SafeArea/Root/FieldsColumn/ServerIdEdit") as LineEdit
	var join_password = join_screen.get_node("SafeArea/Root/FieldsColumn/PasswordRow/PasswordEdit") as LineEdit
	var password_eye = join_screen.get_node("SafeArea/Root/FieldsColumn/PasswordRow/PasswordVisibilityButton") as TextureButton
	var join_button = join_screen.get_node("SafeArea/Root/JoinButtonMargin/JoinButton") as Button
	var back_button = join_screen.get_node("SafeArea/Root/Header/HeaderMargin/HeaderRow/BackButton") as TextureButton
	var find_match_button = join_screen.get_node("SafeArea/Root/PublicPanel/PublicMargin/PublicRows/FindMatchMargin/FindMatchButton") as Button
	var status_label = join_screen.get_node("SafeArea/Root/PrivateJoinError") as Label
	var join_events: Array = []
	var back_events: Array = []
	var find_match_events: Array = []
	join_screen.private_join_requested.connect(func(_name, _server_id, _password): join_events.append(true))
	join_screen.back_requested.connect(func(): back_events.append(true))
	join_screen.find_match_requested.connect(func(): find_match_events.append(true))
	join_name.text = "Guest"
	join_server_id.text = "2345ABCD"
	join_password.text = "1234"
	var original_socket = NetworkManager.ws
	NetworkManager.ws = FakeSocket.new()
	NetworkManager.is_conn_estab = true
	NetworkManager.is_connecting = false
	join_screen._on_join_pressed()

	assert_eq(screen_manager.current_overlay, join_screen)
	assert_eq(screen_manager.private_entry_loader, null, "Accepted Join never opens Play Loader.")
	assert_true(join_screen.private_join_pending)
	assert_true(status_label.visible)
	assert_eq(status_label.text, "Connecting...")
	assert_true(join_button.disabled)
	assert_true(back_button.disabled)
	assert_true(find_match_button.disabled)
	assert_false(join_name.editable)
	assert_false(join_server_id.editable)
	assert_false(join_password.editable)
	assert_true(password_eye.disabled)
	assert_eq(join_events.size(), 1)

	var password_was_secret: bool = join_password.secret
	join_screen._on_join_pressed()
	join_screen._on_back_pressed()
	join_screen._on_find_match_pressed()
	join_screen._toggle_password_visibility()
	assert_eq(join_events.size(), 1, "Pending blocks repeated private Join requests.")
	assert_eq(back_events.size(), 0, "Pending blocks Back navigation.")
	assert_eq(find_match_events.size(), 0, "Pending blocks public matchmaking.")
	assert_eq(join_password.secret, password_was_secret, "Pending blocks password visibility changes.")

	var join_errors := {
		"full": "Full room",
		"playing": "Room playing",
		"not_found": "Room not found",
		"wrong_password": "Wrong password"
	}
	for reason in join_errors:
		join_screen.show_private_pending()
		screen_manager._on_private_join_failed({"reason": reason})
		assert_eq(screen_manager.current_overlay, join_screen)
		assert_eq(status_label.text, join_errors[reason])
		assert_true(status_label.visible)
		assert_false(join_screen.private_join_pending)
		assert_false(join_button.disabled)
		assert_false(back_button.disabled)
		assert_false(find_match_button.disabled)
		assert_true(join_name.editable)
		assert_true(join_server_id.editable)
		assert_true(join_password.editable)
		assert_false(password_eye.disabled)
		assert_eq(join_name.text, "Guest")
		assert_eq(join_server_id.text, "2345ABCD")
		assert_eq(join_password.text, "1234")
	join_screen.clear_private_pending()
	assert_true(status_label.visible, "Clearing inactive pending state preserves the current rejection presentation.")

	NetworkManager.disconnect_server()
	NetworkManager.ws = original_socket

func test_private_entry_terminal_routes_keep_join_direct_and_create_loading() -> void:
	var screen_manager = MainScene.instantiate()
	add_child_autofree(screen_manager)
	await get_tree().process_frame
	await get_tree().process_frame

	screen_manager.show_join_screen()
	var failed_join_screen = screen_manager.current_overlay
	var failed_join_name = failed_join_screen.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit
	var failed_join_server_id = failed_join_screen.get_node("SafeArea/Root/FieldsColumn/ServerIdEdit") as LineEdit
	var failed_join_password = failed_join_screen.get_node("SafeArea/Root/FieldsColumn/PasswordRow/PasswordEdit") as LineEdit
	var failed_join_status = failed_join_screen.get_node("SafeArea/Root/PrivateJoinError") as Label
	failed_join_name.text = "Guest"
	failed_join_server_id.text = "2345ABCD"
	failed_join_password.text = "1234"
	var original_network_socket = NetworkManager.ws
	var immediate_failure_socket = FakeSocket.new()
	immediate_failure_socket.connect_result = ERR_CANT_CONNECT
	NetworkManager.ws = immediate_failure_socket
	NetworkManager.is_conn_estab = false
	NetworkManager.is_connecting = false
	failed_join_screen._on_join_pressed()

	assert_false(failed_join_screen.private_join_pending, "A synchronous transport failure cannot reapply Connecting after restoration.")
	assert_false(failed_join_status.visible)
	assert_true(failed_join_name.editable)
	assert_true(failed_join_server_id.editable)
	assert_true(failed_join_password.editable)
	assert_eq(failed_join_name.text, "Guest")
	assert_eq(failed_join_server_id.text, "2345ABCD")
	assert_eq(failed_join_password.text, "1234")
	NetworkManager.ws = original_network_socket

	failed_join_screen.show_private_pending()
	screen_manager._on_private_entry_failed({"reason": "transport_closed", "entryMode": "private_join"})

	assert_eq(screen_manager.current_overlay, failed_join_screen)
	assert_eq(screen_manager.private_entry_loader, null)
	assert_false(failed_join_status.visible, "Transport failure clears Connecting status.")
	assert_true(failed_join_name.editable)
	assert_true(failed_join_server_id.editable)
	assert_true(failed_join_password.editable)
	assert_eq(failed_join_name.text, "Guest")
	assert_eq(failed_join_server_id.text, "2345ABCD")
	assert_eq(failed_join_password.text, "1234")

	failed_join_screen.show_private_pending()
	screen_manager._on_room_joined(private_lobby_payload([
		{"id": "guest", "displayName": "Guest", "connectionPhase": "connected"}
	]))
	assert_eq(screen_manager.private_entry_loader, null, "Successful Join goes directly to Private Lobby.")
	assert_true(screen_manager.current_overlay.scene_file_path.ends_with("/PrivateLobbyScreen.tscn"))

	screen_manager.show_private_server_screen()
	var create_screen = screen_manager.current_overlay
	var create_name = create_screen.get_node("SafeArea/Root/FieldsColumn/PlayerNameEdit") as LineEdit
	create_name.text = "Host"
	var original_socket = NetworkManager.ws
	NetworkManager.ws = FakeSocket.new()
	NetworkManager.is_conn_estab = true
	NetworkManager.is_connecting = false
	create_screen._on_create_pressed()
	assert_eq(screen_manager.current_overlay, create_screen)
	assert_ne(screen_manager.private_entry_loader, null, "Accepted Create keeps the Play Loader flow.")
	screen_manager._on_private_entry_failed({"reason": "transport_closed", "entryMode": "private_create"})

	assert_eq(screen_manager.current_overlay, create_screen)
	assert_eq(create_name.text, "Host")
	assert_eq(screen_manager.private_entry_loader, null)
	NetworkManager.disconnect_server()
	NetworkManager.ws = original_socket
