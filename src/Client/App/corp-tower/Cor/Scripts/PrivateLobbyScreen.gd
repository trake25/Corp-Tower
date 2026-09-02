extends Control

signal leave_lobby_requested

const CHECK_READY := preload("res://Cor/Art/4-Private-lobby/ic-colored-checkmark-green.png")
const CHECK_WAITING := preload("res://Cor/Art/4-Private-lobby/ic-colored-checkmark-grey.png")
const WAITING_NAME := "Waiting for player..."
const SEAT_COUNT := 3
const DISPLAY_NAME_LIMIT := 10
const DISABLED_MODULATE := Color("#cccccc")
const DISCONNECTED_NAME_MODULATE := Color("#d92d20")
const NORMAL_NAME_COLOR := Color("#141418")
const NORMAL_MODULATE := Color.WHITE
const STRIKE_MARK := "\u0336"

var roster_ids: Array = []
var host_player_id := ""
var pending_kick_player_id := ""
var is_locally_ready := false
var start_countdown_active := false
var start_deadline_msec := 0
var shown_seconds := -1

func _ready() -> void:
	%BackButton.pressed.connect(_on_back_pressed)
	%CopyServerIdButton.pressed.connect(_on_copy_server_id_pressed)
	%ReadyButton.pressed.connect(_on_ready_pressed)
	%LeaveLobbyModal.confirmed.connect(_on_leave_confirmed)
	%KickPlayerModal.confirmed.connect(_on_kick_confirmed)
	%CopyToastTimer.timeout.connect(_on_copy_toast_timeout)
	NetworkManager.lobby_updated.connect(_on_lobby_updated)

	for seat in SEAT_COUNT:
		var kick_button: BaseButton = get_node("%%Seat%dKick" % seat)
		kick_button.pressed.connect(_on_kick_pressed.bind(seat))

	_set_room_full(false)
	_apply_ready_style()

func _exit_tree() -> void:
	if NetworkManager.lobby_updated.is_connected(_on_lobby_updated):
		NetworkManager.lobby_updated.disconnect(_on_lobby_updated)

func apply_lobby_data(data) -> void:
	_apply_private_lobby_data(data)
	_apply_roster(data.get("roster", []))
	_apply_lobby_state(data.get("lobby", {}))

func _on_lobby_updated(data) -> void:
	if str(data.get("roomMode", "")) != "private":
		return

	_apply_private_lobby_data(data)
	_apply_roster(data.get("roster", []))
	_apply_lobby_state(data)

func _apply_private_lobby_data(data) -> void:
	var private_lobby: Dictionary = data.get("privateLobby", {})
	host_player_id = str(private_lobby.get("hostPlayerId", host_player_id))
	%ServerIdValue.text = str(private_lobby.get("serverId", ""))
	%PasswordValue.text = str(private_lobby.get("password", ""))

func _apply_roster(roster: Array) -> void:
	roster_ids.clear()

	for seat in SEAT_COUNT:
		var name_label: Label = get_node("%%Seat%dName" % seat)
		var crown: TextureRect = get_node("%%Seat%dCrown" % seat)
		var kick_button: BaseButton = get_node("%%Seat%dKick" % seat)

		if seat < roster.size():
			var entry: Dictionary = roster[seat]
			var player_id := str(entry.get("id", ""))
			var connection_phase := str(entry.get("connectionPhase", "connected"))
			var presence := str(entry.get(
				"presence",
				"connected" if connection_phase == "connected" else "disconnected"
			))
			var is_disconnected := presence == "disconnected"
			var display_name := _truncate_name(str(entry.get("displayName", WAITING_NAME)))
			roster_ids.append(player_id)
			name_label.text = _strikethrough(display_name) if is_disconnected else display_name
			name_label.modulate = NORMAL_MODULATE
			if is_disconnected:
				name_label.add_theme_color_override("font_color", DISCONNECTED_NAME_MODULATE)
			else:
				name_label.add_theme_color_override("font_color", NORMAL_NAME_COLOR)
			crown.visible = player_id == host_player_id
			kick_button.visible = (
				str(NetworkManager.player_id) == host_player_id
				and player_id != ""
				and player_id != host_player_id
			)
		else:
			roster_ids.append("")
			name_label.text = WAITING_NAME
			name_label.modulate = NORMAL_MODULATE
			name_label.add_theme_color_override("font_color", NORMAL_NAME_COLOR)
			crown.visible = false
			kick_button.visible = false

	_set_room_full(roster.size() >= SEAT_COUNT)

func _truncate_name(value: String) -> String:
	if value.length() <= DISPLAY_NAME_LIMIT:
		return value

	return value.left(DISPLAY_NAME_LIMIT - 2) + ".."

func _strikethrough(value: String) -> String:
	var result := ""

	for character in value:
		result += character + STRIKE_MARK

	return result

func _set_room_full(is_room_full: bool) -> void:
	%ReadyButton.disabled = not is_room_full
	%ReadyButton.modulate = NORMAL_MODULATE if is_room_full else DISABLED_MODULATE

func _apply_lobby_state(lobby_data) -> void:
	if lobby_data == null:
		return

	var ready_ids: Array = lobby_data.get("readyPlayerIds", [])

	for seat in SEAT_COUNT:
		var seat_id := str(roster_ids[seat]) if seat < roster_ids.size() else ""
		var check: TextureRect = get_node("%%Seat%dCheck" % seat)
		check.texture = CHECK_READY if seat_id != "" and ready_ids.has(seat_id) else CHECK_WAITING

	is_locally_ready = ready_ids.has(str(NetworkManager.player_id))
	start_countdown_active = bool(lobby_data.get("startCountdownActive", false))
	start_deadline_msec = (
		Time.get_ticks_msec()
		+ int(lobby_data.get("startSecondsRemaining", 0)) * 1000
	)
	shown_seconds = maxi(
		0,
		ceili(float(start_deadline_msec - Time.get_ticks_msec()) / 1000.0)
	) if start_countdown_active else -1
	_apply_ready_style()

func _process(_delta: float) -> void:
	if not start_countdown_active:
		return

	var remaining := maxi(
		0,
		ceili(float(start_deadline_msec - Time.get_ticks_msec()) / 1000.0)
	)

	if remaining == shown_seconds:
		return

	shown_seconds = remaining
	_refresh_ready_label()

func _apply_ready_style() -> void:
	%ReadyGradientFill.visible = is_locally_ready
	_refresh_ready_label()

func _refresh_ready_label() -> void:
	if not is_locally_ready:
		%ReadyLabel.text = "Ready"
	elif start_countdown_active:
		%ReadyLabel.text = "Cancel (%ds)" % maxi(0, shown_seconds)
	else:
		%ReadyLabel.text = "Cancel"

func _on_ready_pressed() -> void:
	if %ReadyButton.disabled:
		return

	is_locally_ready = not is_locally_ready
	_apply_ready_style()
	NetworkManager.send_ready()

func _on_back_pressed() -> void:
	%LeaveLobbyModal.open_leave_lobby()

func _on_leave_confirmed() -> void:
	leave_lobby_requested.emit()

func _on_copy_server_id_pressed() -> void:
	DisplayServer.clipboard_set(%ServerIdValue.text)
	%CopyToast.visible = true
	%CopyToastTimer.start()

func _on_copy_toast_timeout() -> void:
	%CopyToast.visible = false

func _on_kick_pressed(seat: int) -> void:
	if seat >= roster_ids.size():
		return

	pending_kick_player_id = str(roster_ids[seat])

	if pending_kick_player_id == "" or pending_kick_player_id == host_player_id:
		return

	%KickPlayerModal.open_kick_player()

func _on_kick_confirmed() -> void:
	if pending_kick_player_id == "":
		return

	NetworkManager.kick_private_player(pending_kick_player_id)
	pending_kick_player_id = ""
