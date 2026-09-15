extends Control

signal leave_lobby_requested

const CHECK_READY := preload("res://Cor/Art/8-Public-lobby/ic-colored-checkmark-green.png")
const CHECK_WAITING := preload("res://Cor/Art/8-Public-lobby/ic-colored-checkmark-grey.png")
const WAITING_NAME := "Waiting for player..."
const READY_LABEL := "Ready"
const CANCEL_LABEL := "Cancel"
const SEAT_COUNT := 3
const DISABLED_MODULATE := Color("#cccccc")

var roster_ids: Array = []
var is_locally_ready := false
var ready_pending := false

func _ready() -> void:
	%BackButton.pressed.connect(_on_back_pressed)
	%ReadyButton.pressed.connect(_on_ready_pressed)
	%LeaveLobbyModal.confirmed.connect(_on_leave_confirmed)
	NetworkManager.lobby_updated.connect(_on_lobby_updated)
	_set_room_full(false)
	_apply_local_ready_style()

func _exit_tree() -> void:
	if NetworkManager.lobby_updated.is_connected(_on_lobby_updated):
		NetworkManager.lobby_updated.disconnect(_on_lobby_updated)

func apply_lobby_data(data) -> void:
	_apply_roster(data.get("roster", []))
	_apply_lobby_state(data.get("lobby", {}))

func _on_lobby_updated(data) -> void:
	_apply_roster(data.get("roster", []))
	_apply_lobby_state(data)

func _apply_roster(roster: Array) -> void:
	roster_ids.clear()

	for seat in SEAT_COUNT:
		var name_label: Label = get_node("%%PlayerRow%dName" % seat)

		if seat < roster.size():
			var entry = roster[seat]
			roster_ids.append(str(entry.get("id", "")))
			name_label.text = str(entry.get("displayName", WAITING_NAME))
		else:
			roster_ids.append("")
			name_label.text = WAITING_NAME

	_set_room_full(roster.size() >= SEAT_COUNT)

func _set_room_full(is_room_full: bool) -> void:
	%ReadyButton.disabled = not is_room_full or ready_pending
	%ReadyButton.modulate = Color.WHITE if is_room_full else DISABLED_MODULATE

func _apply_lobby_state(lobby_data) -> void:
	if lobby_data == null:
		return

	var ready_ids: Array = lobby_data.get("readyPlayerIds", [])

	for seat in SEAT_COUNT:
		var seat_id: String = roster_ids[seat] if seat < roster_ids.size() else ""
		var is_ready: bool = seat_id != "" and ready_ids.has(seat_id)
		var check: TextureRect = get_node("%%PlayerRow%dCheck" % seat)
		check.texture = CHECK_READY if is_ready else CHECK_WAITING

	is_locally_ready = ready_ids.has(str(NetworkManager.player_id))
	ready_pending = false
	_set_room_full(not roster_ids.has(""))
	_apply_local_ready_style()

func _process(_delta: float) -> void:
	if NetworkManager.lobby_controls_blocked():
		%ReadyButton.disabled = true

func _refresh_ready_label() -> void:
	if is_locally_ready:
		%ReadyLabel.text = CANCEL_LABEL
	else:
		%ReadyLabel.text = READY_LABEL

func _apply_local_ready_style() -> void:
	%ReadyGradientFill.visible = is_locally_ready
	_refresh_ready_label()

func _on_ready_pressed() -> void:
	if ready_pending or not NetworkManager.can_change_lobby_state():
		return
	if NetworkManager.send_ready():
		ready_pending = true
		_set_room_full(not roster_ids.has(""))

func _on_back_pressed() -> void:
	%LeaveLobbyModal.open_leave_lobby()

func _on_leave_confirmed() -> void:
	leave_lobby_requested.emit()
