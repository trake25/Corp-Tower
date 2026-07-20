extends RefCounted

var active_popover: Control
var shared_popover_mode: String = ""

func is_open(popover: Control, mode: String = "") -> bool:
	if popover == null:
		return false

	if mode != "" and shared_popover_mode != mode:
		return false

	return active_popover == popover and popover.visible

func present(popover: Control, mode: String = "") -> void:
	close_active()
	active_popover = popover
	shared_popover_mode = mode
	popover.call("open")

func close_active() -> void:
	if active_popover != null:
		active_popover.call("close")
		active_popover = null
	shared_popover_mode = ""
