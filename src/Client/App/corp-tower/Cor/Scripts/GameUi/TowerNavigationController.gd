extends Node

var tower_stack
var match_state
var inventory
var overlay_blocked: Callable = Callable()
var trouble_button: Button
var back_button: Button
var selected_block_id: String = ""
var was_playing: bool = false

func bind_nodes(binder) -> void:
	trouble_button = binder.require_node("TroubleDownButton") as Button
	back_button = binder.require_node("BackToTopButton") as Button

func setup(
	new_tower_stack,
	new_match_state,
	new_inventory,
	new_overlay_blocked: Callable = Callable()
) -> void:
	tower_stack = new_tower_stack
	match_state = new_match_state
	inventory = new_inventory
	overlay_blocked = new_overlay_blocked
	if trouble_button != null and !trouble_button.pressed.is_connected(_on_trouble_pressed):
		trouble_button.pressed.connect(_on_trouble_pressed)
	if back_button != null and !back_button.pressed.is_connected(_on_back_pressed):
		back_button.pressed.connect(_on_back_pressed)
	refresh()

func _process(_delta: float) -> void:
	refresh()

func refresh() -> void:
	if tower_stack == null or match_state == null:
		_set_visible(false, false)
		return

	var playing: bool = str(match_state.current_match_state) == "playing"
	if !playing:
		if was_playing:
			tower_stack.reset_navigation()
		selected_block_id = ""
		was_playing = false
		_set_visible(false, false)
		return

	was_playing = true
	var presentation_blocked: bool = tower_stack.is_navigation_blocked_by_presentation()
	if overlay_blocked.is_valid():
		presentation_blocked = presentation_blocked or bool(overlay_blocked.call())
	if presentation_blocked:
		_set_visible(false, false)
		return

	if selected_block_id != "" and !tower_stack.is_scroll_navigating():
		selected_block_id = ""
	var trouble: Dictionary = tower_stack.trouble_target()
	var placement_blocked: bool = inventory != null and (
		bool(inventory.is_block_dragging) or bool(inventory.is_armed)
	)
	var show_trouble: bool = !trouble.is_empty() and selected_block_id == ""
	var show_back: bool = tower_stack.is_scroll_manually_displaced()
	_set_visible(show_trouble, show_back)
	if trouble_button != null:
		trouble_button.disabled = placement_blocked
	if back_button != null:
		back_button.disabled = placement_blocked

func reset() -> void:
	selected_block_id = ""
	was_playing = false
	if tower_stack != null:
		tower_stack.reset_navigation()
	_set_visible(false, false)

func _set_visible(show_trouble: bool, show_back: bool) -> void:
	if trouble_button != null:
		trouble_button.visible = show_trouble
	if back_button != null:
		back_button.visible = show_back

func _on_trouble_pressed() -> void:
	if trouble_button == null or trouble_button.disabled:
		return
	var target: Dictionary = tower_stack.trouble_target()
	if target.is_empty():
		return
	var block_id: String = str(target.get("block_id", ""))
	if block_id != "" and tower_stack.navigate_to_trouble(block_id):
		selected_block_id = block_id
	refresh()

func _on_back_pressed() -> void:
	if back_button == null or back_button.disabled:
		return
	selected_block_id = ""
	tower_stack.return_to_auto_scroll()
	refresh()
