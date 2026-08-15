extends Control

signal leave_lobby_requested

const CHECK_READY := preload("res://Cor/Art/8-Public-lobby/ic-colored-checkmark-green.svg")
const CHECK_WAITING := preload("res://Cor/Art/8-Public-lobby/ic-colored-checkmark-grey.svg")
const WAITING_NAME := "Waiting for player..."
const READY_COUNTDOWN_FORMAT := "Ready (%ds)"
const READY_LABEL := "Ready"
const SEAT_COUNT := 3

var roster_ids: Array = []
var ready_deadline_ms: int = 0
var shown_seconds: int = -1
var timer_active := false
var is_locally_ready := false

func _ready() -> void:
	%BackButton.pressed.connect(_on_back_pressed)
	%ReadyButton.pressed.connect(_on_ready_pressed)
	%LeaveLobbyModal.confirmed.connect(_on_leave_confirmed)
	NetworkManager.lobby_updated.connect(_on_lobby_updated)
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

func _apply_lobby_state(lobby_data) -> void:
	if lobby_data == null:
		return

	var ready_ids: Array = lobby_data.get("readyPlayerIds", [])

	for seat in SEAT_COUNT:
		var seat_id: String = roster_ids[seat] if seat < roster_ids.size() else ""
		var is_ready: bool = seat_id != "" and ready_ids.has(seat_id)
		var check: TextureRect = get_node("%%PlayerRow%dCheck" % seat)
		check.texture = CHECK_READY if is_ready else CHECK_WAITING

	timer_active = bool(lobby_data.get("timerActive", false))
	ready_deadline_ms = (
		Time.get_ticks_msec()
		+ int(lobby_data.get("readySecondsRemaining", 0)) * 1000
	)
	shown_seconds = -1

	is_locally_ready = ready_ids.has(str(NetworkManager.player_id))
	_apply_local_ready_style()

func _process(_delta: float) -> void:
	if not timer_active:
		return

	var remaining := maxi(
		0,
		ceili(float(ready_deadline_ms - Time.get_ticks_msec()) / 1000.0)
	)

	if remaining == shown_seconds:
		return

	shown_seconds = remaining
	_refresh_ready_label()

func _refresh_ready_label() -> void:
	if is_locally_ready or not timer_active:
		%ReadyLabel.text = READY_LABEL
	else:
		%ReadyLabel.text = READY_COUNTDOWN_FORMAT % shown_seconds

func _apply_local_ready_style() -> void:
	%ReadyGradientFill.visible = is_locally_ready
	_refresh_ready_label()

func _on_ready_pressed() -> void:
	is_locally_ready = !is_locally_ready
	_apply_local_ready_style()
	NetworkManager.send_ready()

func _on_back_pressed() -> void:
	%LeaveLobbyModal.open_leave_lobby()

func _on_leave_confirmed() -> void:
	leave_lobby_requested.emit()
