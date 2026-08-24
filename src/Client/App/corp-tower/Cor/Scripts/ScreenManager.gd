extends Control

const PlayLoaderScreenScene := preload("res://Cor/Scenes/PlayLoaderScreen.tscn")
const SignInScreenScene := preload("res://Cor/Scenes/SignInScreen.tscn")
const HomeScreenScene := preload("res://Cor/Scenes/HomeScreen.tscn")
const JoinScreenScene := preload("res://Cor/Scenes/JoinScreen.tscn")
const FindMatchScreenScene := preload("res://Cor/Scenes/FindMatchScreen.tscn")
const PublicLobbyScreenScene := preload("res://Cor/Scenes/PublicLobbyScreen.tscn")
const PlayScreenScene := preload("res://Cor/Scenes/GameUI.tscn")
const DEBUG_CONTEXT_NONE := ""
const DEBUG_CONTEXT_SIGN_IN := "sign_in"
const DEBUG_CONTEXT_LOBBY := "lobby"
const DEBUG_CONTEXT_PLAY := "play"

const DEBUG_BUTTON_DRAG_THRESHOLD := 6.0
const DEBUG_BUTTON_MARGIN := 12.0
const DRAG_POINTER_MOUSE := -1
const DRAG_POINTER_NONE := -2

@onready var screen_container: Control = $ScreenContainer
@onready var startup_splash: TextureRect = %StartupSplash
@onready var debug_button: Button = $DebugButton
@onready var auto_dismiss_modal: Control = $AutoDismissModal

var current_overlay: Node = null
var play_instance: Node = null
var tutorial_active := false
var find_match_active := false
var debug_button_dragging := false
var debug_button_pointer_id := DRAG_POINTER_NONE
var debug_button_drag_distance := 0.0
var debug_context := DEBUG_CONTEXT_NONE

func _ready() -> void:
	_show_runtime_android_system_bars()
	NetworkManager.room_joined.connect(_on_room_joined)
	NetworkManager.match_started.connect(_on_match_started)
	NetworkManager.room_closed.connect(_on_room_closed)
	NetworkManager.status_changed.connect(_on_status_changed)
	auto_dismiss_modal.dismissed.connect(_on_auto_dismiss_modal_dismissed)
	debug_button.gui_input.connect(_on_debug_button_gui_input)
	debug_button.visible = EndpointConfig.DEBUG_UI_ENABLED
	reset_debug_button_position()
	_show_initial_screen()

func _show_runtime_android_system_bars() -> void:
	if OS.get_name() != "Android":
		return

	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)

func _show_initial_screen() -> void:
	if EndpointConfig.DEMO_MODE_ENABLED:
		show_home_screen()
		return

	if await AuthManager.restore_session():
		show_home_screen()
		return

	show_sign_in_screen()

func _on_status_changed(text: String) -> void:
	update_debug_button_availability()

	if text == "Disconnected" and find_match_active:
		find_match_active = false
		auto_dismiss_modal.open_disconnected()

func _on_room_joined(data) -> void:
	if bool(data.get("matchStarted", true)):
		_enter_play_instance()
	elif EndpointConfig.DEMO_MODE_ENABLED:
		_enter_play_instance()
		NetworkManager.send_ready()
	else:
		show_public_lobby_screen(data)

func _on_match_started(_data) -> void:
	_enter_play_instance()

func _enter_play_instance() -> void:
	_ensure_play_instance()
	_clear_overlay()
	_set_debug_context(DEBUG_CONTEXT_PLAY)
	reset_debug_button_position()
	update_debug_button_availability()

func _on_room_closed(data) -> void:
	if tutorial_active:
		return

	find_match_active = false
	var reason := str(data.get("reason", ""))
	var destination := str(data.get("destination", ""))

	if reason == "lobby_timeout":
		auto_dismiss_modal.open_time_expired()
		return

	NetworkManager.disconnect_server()

	if EndpointConfig.DEMO_MODE_ENABLED or destination == "home" or reason == "failure_limit_reached":
		_teardown_play_instance()
		show_home_screen()
	else:
		show_join_screen()

func _on_auto_dismiss_modal_dismissed() -> void:
	NetworkManager.disconnect_server()
	_teardown_play_instance()
	show_home_screen()

func show_play_loader_screen() -> void:
	var screen := PlayLoaderScreenScene.instantiate()
	screen.loader_finished.connect(_on_play_loader_finished)
	_set_overlay(screen)

func _on_play_loader_finished() -> void:
	if EndpointConfig.DEMO_MODE_ENABLED:
		show_home_screen()
		return

	if await AuthManager.restore_session():
		show_home_screen()
	else:
		show_sign_in_screen()

func show_sign_in_screen() -> void:
	var screen := SignInScreenScene.instantiate()
	screen.guest_login_requested.connect(_on_guest_login_requested)
	screen.provider_login_requested.connect(_on_provider_login_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_SIGN_IN)

	var pending: String = AuthManager.take_oauth_error()

	if pending != AuthManager.REASON_NONE:
		screen.call("show_error", pending)

func _on_guest_login_requested() -> void:
	var screen := current_overlay
	_set_sign_in_busy(screen, true)

	var reason: String = await AuthManager.sign_in_guest()

	if reason == AuthManager.REASON_NONE:
		show_home_screen()
		return

	_show_sign_in_error(screen, reason)

func _on_provider_login_requested(provider: String) -> void:
	var screen := current_overlay
	_set_sign_in_busy(screen, true)

	var launch_reason: String = AuthManager.sign_in_with_provider(provider)

	if launch_reason != AuthManager.REASON_NONE:
		_show_sign_in_error(screen, launch_reason)
		return

	if OS.has_feature("web"):
		return

	var reason: String = await AuthManager.oauth_completed

	if reason == AuthManager.REASON_NONE:
		show_home_screen()
		return

	_show_sign_in_error(screen, reason)

func _set_sign_in_busy(screen: Node, busy: bool) -> void:
	if screen != null and is_instance_valid(screen) and screen.has_method("set_busy"):
		screen.call("set_busy", busy)

func _show_sign_in_error(screen: Node, reason: String) -> void:
	if screen == null or not is_instance_valid(screen) or screen != current_overlay:
		return

	screen.call("set_busy", false)
	screen.call("show_error", reason)

func show_home_screen() -> void:
	var screen := HomeScreenScene.instantiate()
	screen.join_server_requested.connect(_on_home_join_server_requested)
	screen.tutorial_requested.connect(_on_home_tutorial_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_home_join_server_requested() -> void:
	if EndpointConfig.DEMO_MODE_ENABLED:
		NetworkManager.connect_server()
	else:
		show_join_screen()

func _on_home_tutorial_requested() -> void:
	start_tutorial(&"")

func show_join_screen() -> void:
	_teardown_play_instance()
	var screen := JoinScreenScene.instantiate()
	screen.find_match_requested.connect(_on_find_match_requested)
	screen.back_requested.connect(_on_join_screen_back_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_join_screen_back_requested() -> void:
	show_home_screen()

func start_tutorial(lesson_id: StringName = &"") -> void:
	tutorial_active = true

	if NetworkManager.is_conn_estab:
		NetworkManager.disconnect_server()

	_ensure_play_instance()
	_clear_overlay()
	_set_debug_context(DEBUG_CONTEXT_NONE)

	if play_instance != null and is_instance_valid(play_instance) and play_instance.has_method("start_tutorial"):
		play_instance.call("start_tutorial", lesson_id)

func _on_play_instance_tutorial_requested(lesson_id) -> void:
	start_tutorial(lesson_id)

func _on_play_instance_tutorial_exited() -> void:
	tutorial_active = false
	show_home_screen()

func show_find_match_screen() -> void:
	_ensure_play_instance()

	var screen := FindMatchScreenScene.instantiate()
	screen.cancel_requested.connect(_on_cancel_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)
	find_match_active = true

func _on_find_match_requested() -> void:
	NetworkManager.connect_server()
	show_find_match_screen()

func _on_cancel_requested() -> void:
	NetworkManager.disconnect_server()
	show_join_screen()

func show_public_lobby_screen(data) -> void:
	_ensure_play_instance()

	var screen := PublicLobbyScreenScene.instantiate()
	screen.leave_lobby_requested.connect(_on_leave_lobby_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_LOBBY)
	screen.apply_lobby_data(data)

func _on_leave_lobby_requested() -> void:
	NetworkManager.leave_lobby()
	NetworkManager.disconnect_server()
	_teardown_play_instance()
	show_home_screen()

func _ensure_play_instance() -> void:
	if play_instance != null and is_instance_valid(play_instance):
		return

	play_instance = PlayScreenScene.instantiate()
	screen_container.add_child(play_instance)

	if play_instance.has_signal("tutorial_requested"):
		play_instance.connect("tutorial_requested", _on_play_instance_tutorial_requested)
	if play_instance.has_signal("tutorial_exited"):
		play_instance.connect("tutorial_exited", _on_play_instance_tutorial_exited)

	update_debug_button_availability()

func _teardown_play_instance() -> void:
	if play_instance != null and is_instance_valid(play_instance):
		play_instance.queue_free()

	play_instance = null
	update_debug_button_availability()

func _set_debug_context(context: String) -> void:
	debug_context = context
	if play_instance != null and is_instance_valid(play_instance) and play_instance.has_method("set_debug_context"):
		play_instance.call("set_debug_context", DEBUG_CONTEXT_LOBBY if context == DEBUG_CONTEXT_LOBBY else DEBUG_CONTEXT_PLAY)
	update_debug_button_availability()

func _set_overlay(screen: Node) -> void:
	_clear_overlay()
	current_overlay = screen
	screen_container.add_child(screen)
	startup_splash.visible = false

func _clear_overlay() -> void:
	find_match_active = false

	if current_overlay != null and is_instance_valid(current_overlay):
		current_overlay.queue_free()

	current_overlay = null

func update_debug_button_availability() -> void:
	var has_play_instance: bool = (
		play_instance != null
		and is_instance_valid(play_instance)
		and play_instance.has_method("toggle_debug_overlay")
	)
	var sign_in_debug_available := (
		debug_context == DEBUG_CONTEXT_SIGN_IN
		and current_overlay != null
		and is_instance_valid(current_overlay)
		and current_overlay.has_method("toggle_debug_overlay")
	)
	var game_debug_available := (
		(debug_context == DEBUG_CONTEXT_LOBBY or debug_context == DEBUG_CONTEXT_PLAY)
		and has_play_instance
		and NetworkManager.is_conn_estab
	)
	debug_button.disabled = not sign_in_debug_available and not game_debug_available

func reset_debug_button_position() -> void:
	debug_button.position = Vector2(
		size.x - debug_button.size.x - DEBUG_BUTTON_MARGIN,
		DEBUG_BUTTON_MARGIN
	)

func _on_debug_button_gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var touch := event as InputEventScreenTouch
		if touch.pressed:
			_begin_debug_button_gesture(touch.index)
		elif touch.index == debug_button_pointer_id:
			_end_debug_button_gesture()
	elif event is InputEventMouseButton:
		var mouse := event as InputEventMouseButton
		if mouse.button_index != MOUSE_BUTTON_LEFT:
			return
		if mouse.pressed:
			_begin_debug_button_gesture(DRAG_POINTER_MOUSE)
		elif debug_button_pointer_id == DRAG_POINTER_MOUSE:
			_end_debug_button_gesture()
	elif event is InputEventScreenDrag:
		var drag := event as InputEventScreenDrag
		if drag.index != debug_button_pointer_id:
			return
		_move_debug_button(drag.relative)
	elif event is InputEventMouseMotion:
		if debug_button_pointer_id != DRAG_POINTER_MOUSE:
			return
		_move_debug_button((event as InputEventMouseMotion).relative)

func _begin_debug_button_gesture(pointer_id: int) -> void:
	debug_button_pointer_id = pointer_id
	debug_button_dragging = false
	debug_button_drag_distance = 0.0

func _end_debug_button_gesture() -> void:
	debug_button_pointer_id = DRAG_POINTER_NONE

	if debug_button_drag_distance < DEBUG_BUTTON_DRAG_THRESHOLD:
		_on_debug_button_tapped()

	debug_button_dragging = false

func _move_debug_button(relative: Vector2) -> void:
	debug_button_drag_distance += relative.length()
	debug_button_dragging = true

	var target_position: Vector2 = debug_button.position + relative
	debug_button.position = Vector2(
		clamp(target_position.x, 0.0, size.x - debug_button.size.x),
		clamp(target_position.y, 0.0, size.y - debug_button.size.y)
	)

func _on_debug_button_tapped() -> void:
	if debug_button.disabled:
		return

	if debug_context == DEBUG_CONTEXT_SIGN_IN and current_overlay != null and is_instance_valid(current_overlay) and current_overlay.has_method("toggle_debug_overlay"):
		current_overlay.call("toggle_debug_overlay")
	elif play_instance != null and is_instance_valid(play_instance) and play_instance.has_method("toggle_debug_overlay"):
		play_instance.call("toggle_debug_overlay")
