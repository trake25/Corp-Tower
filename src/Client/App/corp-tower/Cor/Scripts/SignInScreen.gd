extends Control

signal guest_login_requested

const GUEST_LABEL_IDLE := "Play as Guest"
const GUEST_LABEL_BUSY := "Signing in..."
const ERROR_MESSAGES := {
	"unreachable": "Servers unavailable. Check your connection and try again.",
	"rejected": "Sign-in failed. Please try again."
}

func _ready() -> void:
	%GuestButton.pressed.connect(func(): guest_login_requested.emit())
	%ErrorLabel.visible = false

func set_busy(busy: bool) -> void:
	%GuestButton.disabled = busy
	%GuestLabel.text = GUEST_LABEL_BUSY if busy else GUEST_LABEL_IDLE

	if busy:
		%ErrorLabel.visible = false

func show_error(reason: String) -> void:
	%ErrorLabel.text = ERROR_MESSAGES.get(reason, ERROR_MESSAGES["rejected"])
	%ErrorLabel.visible = true
