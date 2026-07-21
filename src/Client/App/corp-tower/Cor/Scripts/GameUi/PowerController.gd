extends Node

var network
var popovers
var popover_blocked: Callable = Callable()
var score_popups
var power_popover: Control
var power_trigger: TextureButton
var last_power_inventory: Array = []
var seen_power_event_ids: Dictionary = {}

func bind_nodes(binder) -> void:
	power_trigger = binder.optional_node("PowerTrigger") as TextureButton
	power_popover = binder.optional_node("PowerPopover") as Control
	if power_trigger != null:
		power_trigger.pressed.connect(open_power_popover)

func setup(network_ref, popovers_ref, score_popups_ref, popover_blocked_ref: Callable = Callable()) -> void:
	network = network_ref
	popovers = popovers_ref
	score_popups = score_popups_ref
	popover_blocked = popover_blocked_ref

func open_power_popover() -> void:
	if popover_blocked.is_valid() and bool(popover_blocked.call()):
		return

	if power_popover == null:
		return

	if popovers.is_open(power_popover):
		popovers.close_active()
		return

	power_popover.call("set_title", "Power")
	power_popover.call("clear_rows")

	if last_power_inventory.is_empty():
		power_popover.call("add_row", "No power items")
	else:
		for i in range(last_power_inventory.size()):
			var index: int = i
			var entry: Variant = last_power_inventory[i]
			var power_id: String = str(entry.get("id", "")) if typeof(entry) == TYPE_DICTIONARY else str(entry)
			power_popover.call(
				"add_action_row",
				get_power_row_label(power_id),
				func():
					network.activate_power(index)
					popovers.close_active()
			)

	popovers.present(power_popover)
	position_power_popover_card()

func position_power_popover_card() -> void:
	if power_popover == null or power_trigger == null:
		return
	var trigger_rect: Rect2 = power_trigger.get_global_rect()
	var card_size: Vector2 = power_popover.call("get_card_size")
	power_popover.call("set_card_global_position", Vector2(
		trigger_rect.position.x + trigger_rect.size.x + 2.0 - card_size.x,
		trigger_rect.position.y - 13.0 - card_size.y
	))

func get_power_row_label(power_id: String) -> String:
	if power_id == "refresh":
		return "Refresh team inventory"

	return power_id.replace("_", " ").capitalize()

func process_power_events(raw_events: Variant, players: Array) -> void:
	if typeof(raw_events) != TYPE_ARRAY:
		return
	for raw_event in raw_events:
		if typeof(raw_event) != TYPE_DICTIONARY:
			continue
		var event: Dictionary = raw_event
		var event_id: String = str(event.get("id", ""))
		if event_id == "" or seen_power_event_ids.has(event_id):
			continue
		seen_power_event_ids[event_id] = true

		score_popups.show_score_event_popup({
			"type": "power_activated",
			"label": get_power_toast_text(str(event.get("powerId", "")), str(event.get("label", "Power")))
		}, players, 3.0)

func get_power_toast_text(power_id: String, catalog_label: String) -> String:
	if power_id == "refresh":
		return "All players inventory refreshed"

	return catalog_label + " activated for everyone"
