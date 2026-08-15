extends Control

signal cancel_requested

func _ready() -> void:
	%CancelButton.pressed.connect(_on_cancel_pressed)
	NetworkManager.status_changed.connect(_on_status_changed)
	NetworkManager.queue_status_updated.connect(_on_queue_status_updated)

func _on_cancel_pressed() -> void:
	cancel_requested.emit()

func _on_status_changed(text: String) -> void:
	%StatusLabel.text = text

func _on_queue_status_updated(data) -> void:
	var needed := maxi(1, int(data.get("playersNeeded", 3)))
	%QueueProgressBar.max_value = needed
	%QueueProgressBar.value = clampi(int(data.get("playersWaiting", 0)), 0, needed)

func _exit_tree() -> void:
	if NetworkManager.status_changed.is_connected(_on_status_changed):
		NetworkManager.status_changed.disconnect(_on_status_changed)
	if NetworkManager.queue_status_updated.is_connected(_on_queue_status_updated):
		NetworkManager.queue_status_updated.disconnect(_on_queue_status_updated)
