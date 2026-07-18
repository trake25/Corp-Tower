extends Control

signal cancel_requested

func _ready() -> void:
	%BackButton.pressed.connect(_on_cancel_pressed)
	%CancelButton.pressed.connect(_on_cancel_pressed)
	NetworkManager.status_changed.connect(_on_status_changed)

func _on_cancel_pressed() -> void:
	cancel_requested.emit()

func _on_status_changed(text: String) -> void:
	%StatusLabel.text = text

func _exit_tree() -> void:
	if NetworkManager.status_changed.is_connected(_on_status_changed):
		NetworkManager.status_changed.disconnect(_on_status_changed)
