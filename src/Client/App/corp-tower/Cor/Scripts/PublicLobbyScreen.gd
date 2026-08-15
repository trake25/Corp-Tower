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
var has_readied := false

func _ready() -> void:
	%BackButton.pressed.connect(_on_back_pressed)
	%ReadyButton.pressed.connect(_on_ready_pressed)
	%LeaveLobbyModal.confirmed.connect(_on_leave_confirmed)
	NetworkManager.lobby_updated.connect(_on_lobby_updated)
	_set_all_ready_style(false)

func _exit_tree() -> void:
	if NetworkManager.lobby_updated.is_connected(_on_lobby_updated):
		NetworkManager.lobby_updated.disconnect(_on_lobby_updated)

func apply_lobby_data(data) -> void:
	var roster: Array = data.get("roster", [])
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

	_apply_lobby_state(data.get("lobby", {}))

func _on_lobby_updated(data) -> void:
	_apply_lobby_state(data)

func _apply_lobby_state(lobby_data) -> void:
	if lobby_data == null:
		return

	var ready_ids: Array = lobby_data.get("readyPlayerIds", [])

	for seat in SEAT_COUNT:
		var seat_id: String = roster_ids[seat] if seat < roster_ids.size() else ""
		var is_ready: bool = seat_id != "" and ready_ids.has(seat_id)
		var check: TextureRect = get_node("%%PlayerRow%dCheck" % seat)
		check.texture = CHECK_READY if is_ready else CHECK_WAITING

	ready_deadline_ms = (
		Time.get_ticks_msec()
		+ int(lobby_data.get("readySecondsRemaining", 0)) * 1000
	)
	shown_seconds = -1

	_set_all_ready_style(
		roster_ids.size() > 0 and ready_ids.size() >= roster_ids.size()
	)

func _process(_delta: float) -> void:
	if ready_deadline_ms <= 0:
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
	if %ReadyGradientFill.visible:
		%ReadyLabel.text = READY_LABEL
	else:
		%ReadyLabel.text = READY_COUNTDOWN_FORMAT % shown_seconds

func _set_all_ready_style(all_ready: bool) -> void:
	%ReadyGradientFill.visible = all_ready
	_refresh_ready_label()

func _on_ready_pressed() -> void:
	if has_readied:
		return

	has_readied = true
	%ReadyButton.disabled = true
	NetworkManager.send_ready()

func _on_back_pressed() -> void:
	%LeaveLobbyModal.open_leave_lobby()

func _on_leave_confirmed() -> void:
	leave_lobby_requested.emit()
