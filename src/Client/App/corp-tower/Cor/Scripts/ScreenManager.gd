extends Control

const PlayLoaderScreenScene := preload("res://Cor/Scenes/PlayLoaderScreen.tscn")
const SignInScreenScene := preload("res://Cor/Scenes/SignInScreen.tscn")
const HomeScreenScene := preload("res://Cor/Scenes/HomeScreen.tscn")
const ProfileScreenScene := preload("res://Cor/Scenes/ProfileScreen.tscn")
const ChangeNameScreenScene := preload("res://Cor/Scenes/ChangeNameScreen.tscn")
const RankingsScreenScene := preload("res://Cor/Scenes/RankingsScreen.tscn")
const SettingsScreenScene := preload("res://Cor/Scenes/SettingsScreen.tscn")
const AccountScreenScene := preload("res://Cor/Scenes/AccountScreen.tscn")
const PrivateServerScreenScene := preload("res://Cor/Scenes/PrivateServerScreen.tscn")
const JoinScreenScene := preload("res://Cor/Scenes/JoinScreen.tscn")
const FindMatchScreenScene := preload("res://Cor/Scenes/FindMatchScreen.tscn")
const PublicLobbyScreenScene := preload("res://Cor/Scenes/PublicLobbyScreen.tscn")
const PrivateLobbyScreenScene := preload("res://Cor/Scenes/PrivateLobbyScreen.tscn")
const PlayScreenScene := preload("res://Cor/Scenes/GameUI.tscn")
const MenuScreenScene := preload("res://Cor/Scenes/MenuScreen.tscn")
const DEBUG_CONTEXT_NONE := ""
const DEBUG_CONTEXT_HOME := "home"
const DEBUG_CONTEXT_SIGN_IN := "sign_in"
const DEBUG_CONTEXT_LOBBY := "lobby"
const DEBUG_CONTEXT_PLAY := "play"

const DEBUG_BUTTON_DRAG_THRESHOLD := 6.0
const DEBUG_BUTTON_MARGIN := 12.0
const DRAG_POINTER_MOUSE := -1
const DRAG_POINTER_NONE := -2
const SPECTATOR_PERSONALITIES := ["climber", "engineer", "opportunist"]
const SPECTATOR_PRESET_MIXED := 0
const SPECTATOR_PRESET_THREE_CLIMBERS := 1
const SPECTATOR_PRESET_THREE_ENGINEERS := 2
const SPECTATOR_PRESET_THREE_OPPORTUNISTS := 3
const SPECTATOR_PRESET_CUSTOM := 4
const SPECTATOR_TRAIT_KEYS := ["reactionMs", "skill", "riskTolerance", "greed", "repairAwareness", "powerUse"]
const SPECTATOR_PROFILE_DEFAULTS := {
	"climber": {
		"personality": "climber", "reactionMs": 1400, "skill": 0.78,
		"riskTolerance": 0.45, "greed": 0.76, "repairAwareness": 0.32, "powerUse": 0.30
	},
	"engineer": {
		"personality": "engineer", "reactionMs": 1750, "skill": 0.86,
		"riskTolerance": 0.16, "greed": 0.30, "repairAwareness": 0.90, "powerUse": 0.46
	},
	"opportunist": {
		"personality": "opportunist", "reactionMs": 1250, "skill": 0.72,
		"riskTolerance": 0.58, "greed": 0.92, "repairAwareness": 0.43, "powerUse": 0.74
	}
}

@onready var screen_container: Control = $ScreenContainer
@onready var startup_splash: TextureRect = %StartupSplash
@onready var debug_button: Button = $DebugButton
@onready var auto_dismiss_modal: Control = $AutoDismissModal

var current_overlay: Node = null
var private_entry_loader: Node = null
var profile_entry_loader: Node = null
var play_instance: Node = null
var tutorial_active := false
var find_match_active := false
var resume_unavailable_active := false
var debug_button_dragging := false
var debug_button_pointer_id := DRAG_POINTER_NONE
var debug_button_drag_distance := 0.0
var debug_context := DEBUG_CONTEXT_NONE
var startup_handoff_complete := false
var startup_resume_pending := false
var gameplay_input_blocked := false
var home_spectator_setup: Control = null
var home_spectator_selectors: Array = []
var home_spectator_start_button: Button = null
var home_spectator_status_label: Label = null
var home_spectator_profiles: Array = []
var home_spectator_preset_selector: OptionButton = null
var home_spectator_edit_selector: OptionButton = null
var home_spectator_editing_bot_index := 0
var home_spectator_trait_labels: Dictionary = {}
var home_spectator_trait_sliders: Dictionary = {}
var profile_route_pending := ""
var change_name_entry_context := "profile"
var provider_link_pending_provider := ""
var provider_link_stage := ""

func _ready() -> void:
	NetworkManager.room_joined.connect(_on_room_joined)
	NetworkManager.match_started.connect(_on_match_started)
	NetworkManager.room_closed.connect(_on_room_closed)
	NetworkManager.game_left.connect(_on_game_left)
	NetworkManager.private_join_failed.connect(_on_private_join_failed)
	NetworkManager.private_entry_failed.connect(_on_private_entry_failed)
	NetworkManager.status_changed.connect(_on_status_changed)
	NetworkManager.recovery_started.connect(_on_recovery_started)
	NetworkManager.recovery_recovered.connect(_on_recovery_recovered)
	NetworkManager.recovery_unavailable.connect(_on_recovery_unavailable)
	NetworkManager.resume_only_failed.connect(_on_resume_only_failed)
	NetworkManager.spectator_start_rejected.connect(_on_spectator_start_rejected)
	NetworkManager.profile_snapshot_received.connect(_on_profile_snapshot_received)
	NetworkManager.profile_name_changed.connect(_on_profile_name_changed)
	NetworkManager.profile_name_rejected.connect(_on_profile_name_rejected)
	NetworkManager.profile_connection_changed.connect(_on_profile_connection_changed)
	NetworkManager.provider_link_preflight_result.connect(_on_provider_link_preflight_result)
	NetworkManager.provider_link_commit_result.connect(_on_provider_link_commit_result)
	AuthManager.provider_link_completed.connect(_on_provider_link_completed)
	AuthManager.facebook_link_credential_ready.connect(_on_facebook_link_credential_ready)
	AuthManager.facebook_link_preflight_failed.connect(_on_facebook_link_preflight_failed)
	auto_dismiss_modal.dismissed.connect(_on_auto_dismiss_modal_dismissed)
	auto_dismiss_modal.confirmed.connect(_on_auto_dismiss_modal_dismissed)
	debug_button.gui_input.connect(_on_debug_button_gui_input)
	debug_button.visible = EndpointConfig.DEBUG_UI_ENABLED
	reset_debug_button_position()
	_configure_runtime_android_splash()
	_show_initial_screen()

func _configure_runtime_android_splash() -> void:
	if OS.get_name() != "Android":
		return

	startup_splash.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED

func _show_runtime_android_system_bars() -> void:
	if OS.get_name() != "Android":
		return

	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)

func _show_initial_screen() -> void:
	if EndpointConfig.DEMO_MODE_ENABLED:
		show_home_screen()
		return

	var restored := await AuthManager.restore_session()

	if AuthManager.has_provider_link_result():
		_resume_provider_link_callback()
		return

	if restored:
		_begin_authenticated_startup()
		return

	show_sign_in_screen()

func _begin_authenticated_startup() -> void:
	if NetworkManager.has_saved_room_identity():
		startup_resume_pending = true
		NetworkManager.connect_server(false, false, true)
		return

	profile_route_pending = "startup"
	if not NetworkManager.connect_profile_server():
		profile_route_pending = ""
		show_home_screen()

func _on_status_changed(text: String) -> void:
	update_debug_button_availability()

	if text == "Disconnected" and find_match_active:
		find_match_active = false
		auto_dismiss_modal.open_disconnected()

func _on_room_joined(data) -> void:
	startup_resume_pending = false

	if bool(data.get("matchStarted", true)):
		_enter_play_instance()
	elif EndpointConfig.DEMO_MODE_ENABLED:
		_enter_play_instance()
		NetworkManager.send_ready()
	elif str(data.get("roomMode", "public")) == "private":
		show_private_lobby_screen(data)
	else:
		show_public_lobby_screen(data)

func _on_match_started(_data) -> void:
	_enter_play_instance()

func _on_recovery_started() -> void:
	if tutorial_active:
		return

	auto_dismiss_modal.open_recovering()
	update_debug_button_availability()

func _on_recovery_recovered() -> void:
	resume_unavailable_active = false
	auto_dismiss_modal.dismiss_recovery()
	_set_menu_leave_pending(false)
	update_debug_button_availability()

func _on_recovery_unavailable(data) -> void:
	if tutorial_active:
		return

	resume_unavailable_active = bool(data.get("resumeUnavailable", false))
	_set_menu_leave_pending(false)
	auto_dismiss_modal.open_recovery_failed()
	update_debug_button_availability()

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
	startup_resume_pending = false
	resume_unavailable_active = false
	auto_dismiss_modal.dismiss_recovery()
	var reason := str(data.get("reason", ""))
	var destination := str(data.get("destination", ""))

	if reason == "lobby_timeout":
		auto_dismiss_modal.open_time_expired()
		return

	NetworkManager.disconnect_server()

	if EndpointConfig.DEMO_MODE_ENABLED or destination == "home" or reason == "failure_limit_reached":
		_teardown_play_instance()
		show_home_screen()
	elif destination == "private_server":
		_teardown_play_instance()
		show_private_server_screen()
	else:
		show_join_screen()

func _on_game_left(data) -> void:
	if str(data.get("destination", "")) != "home":
		return

	find_match_active = false
	startup_resume_pending = false
	resume_unavailable_active = false
	auto_dismiss_modal.dismiss_recovery()
	_clear_overlay()
	NetworkManager.disconnect_server()
	_teardown_play_instance()
	show_home_screen()

func _on_resume_only_failed(_data) -> void:
	if not startup_resume_pending:
		return

	startup_resume_pending = false
	NetworkManager.disconnect_server()
	show_home_screen()

func _on_auto_dismiss_modal_dismissed() -> void:
	NetworkManager.disconnect_server()
	_teardown_play_instance()

	if resume_unavailable_active:
		resume_unavailable_active = false
		show_join_screen()
	else:
		show_home_screen()

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
		_begin_authenticated_startup()
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
		_begin_authenticated_startup()
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
	screen.private_server_requested.connect(_on_home_private_server_requested)
	screen.join_server_requested.connect(_on_home_join_server_requested)
	screen.tutorial_requested.connect(_on_home_tutorial_requested)
	screen.rankings_requested.connect(_on_home_rankings_requested)
	screen.settings_requested.connect(_on_home_settings_requested)
	screen.profile_requested.connect(_on_home_profile_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_HOME)

func _on_home_private_server_requested() -> void:
	show_private_server_screen()

func _on_home_join_server_requested() -> void:
	if EndpointConfig.DEMO_MODE_ENABLED:
		NetworkManager.connect_server()
	else:
		show_join_screen()

func _on_home_tutorial_requested() -> void:
	start_tutorial(&"")

func _on_home_rankings_requested() -> void:
	show_rankings_screen()

func _on_home_settings_requested() -> void:
	show_settings_screen()

func _on_home_profile_requested() -> void:
	if profile_route_pending != "":
		return

	profile_route_pending = "profile"
	if NetworkManager.connect_profile_server():
		_show_profile_entry_loader()
	else:
		profile_route_pending = ""

func _on_profile_snapshot_received(data: Dictionary) -> void:
	if profile_route_pending == "startup":
		profile_route_pending = ""
		if bool(data.get("nameOnboardingSeen", true)):
			NetworkManager.disconnect_profile_server()
			show_home_screen()
		else:
			show_change_name_screen("onboarding")
			NetworkManager.mark_profile_onboarding_seen()
		return

	if profile_route_pending == "profile":
		profile_route_pending = ""
		_clear_profile_entry_loader()
		show_profile_screen(data)
		return

	if current_overlay != null and current_overlay.has_method("set_profile"):
		current_overlay.call("set_profile", data)

func show_profile_screen(data: Dictionary = {}) -> void:
	var profile := data if not data.is_empty() else NetworkManager.profile_snapshot
	if profile.is_empty():
		return
	var screen := ProfileScreenScene.instantiate()
	screen.back_requested.connect(_on_profile_back_requested)
	screen.change_name_requested.connect(_on_profile_change_name_requested)
	_set_overlay(screen)
	screen.set_profile(profile)
	screen.set_online(NetworkManager.is_profile_connected())
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_profile_back_requested() -> void:
	NetworkManager.disconnect_profile_server()
	show_home_screen()

func _on_profile_change_name_requested() -> void:
	show_change_name_screen("profile")

func show_change_name_screen(entry_context: String) -> void:
	if NetworkManager.profile_snapshot.is_empty():
		return
	change_name_entry_context = entry_context
	var screen := ChangeNameScreenScene.instantiate()
	screen.back_requested.connect(_on_change_name_back_requested)
	screen.name_change_requested.connect(_on_name_change_requested)
	_set_overlay(screen)
	screen.configure(NetworkManager.profile_snapshot)
	screen.set_online(NetworkManager.is_profile_connected())
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_change_name_back_requested() -> void:
	if change_name_entry_context == "onboarding":
		NetworkManager.disconnect_profile_server()
		show_home_screen()
	else:
		show_profile_screen()

func _on_name_change_requested(candidate: String) -> void:
	if NetworkManager.send_profile_name_change(candidate):
		return
	if current_overlay != null and current_overlay.has_method("show_rejection"):
		current_overlay.call("show_rejection", "server_error")

func _on_profile_name_changed(data: Dictionary) -> void:
	if change_name_entry_context == "onboarding":
		NetworkManager.disconnect_profile_server()
		show_home_screen()
	else:
		show_profile_screen(data)

func _on_profile_name_rejected(data: Dictionary) -> void:
	if current_overlay != null and current_overlay.has_method("show_rejection"):
		current_overlay.call("show_rejection", str(data.get("reason", "server_error")))

func _on_profile_connection_changed(online: bool) -> void:
	if current_overlay != null and current_overlay.has_method("set_online"):
		current_overlay.call("set_online", online)

	if online and provider_link_pending_provider != "":
		_continue_provider_link_over_profile_connection()
		return

	if (
		not online
		and provider_link_pending_provider != ""
		and not NetworkManager.is_connecting
	):
		_finish_provider_link_error(AuthManager.REASON_UNREACHABLE)
		return

	if online or NetworkManager.is_connecting or profile_route_pending == "":
		return
	var failed_route := profile_route_pending
	profile_route_pending = ""
	_clear_profile_entry_loader()
	if failed_route == "startup":
		show_home_screen()

func _on_spectator_start_rejected(data) -> void:
	if home_spectator_setup == null or not is_instance_valid(home_spectator_setup):
		return

	if home_spectator_status_label != null:
		home_spectator_status_label.text = "Could not start: " + str(data.get("reason", "rejected"))
	_set_home_spectator_setup_enabled(true)

func show_rankings_screen() -> void:
	var screen := RankingsScreenScene.instantiate()
	screen.back_requested.connect(show_home_screen)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func show_settings_screen() -> void:
	var screen := SettingsScreenScene.instantiate()
	screen.back_requested.connect(show_home_screen)
	screen.account_requested.connect(show_account_screen)
	screen.sign_out_requested.connect(_on_settings_sign_out_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func show_account_screen() -> void:
	var screen := AccountScreenScene.instantiate()
	screen.back_requested.connect(show_settings_screen)
	screen.provider_link_requested.connect(_on_provider_link_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _resume_provider_link_callback() -> void:
	var reason := AuthManager.take_provider_link_result()
	show_account_screen()

	if reason != AuthManager.REASON_NONE:
		_finish_provider_link_error(reason)
		return

	if not AuthManager.has_pending_provider_link():
		_finish_provider_link_error(AuthManager.REASON_REJECTED)
		return

	provider_link_pending_provider = AuthManager.pending_link_provider()
	provider_link_stage = "commit"
	_set_account_link_busy(true)
	_ensure_provider_link_profile_connection()

func _on_provider_link_requested(provider: String) -> void:
	if provider_link_pending_provider != "":
		return

	if AuthManager.has_pending_provider_link():
		if AuthManager.pending_link_provider() != provider:
			_finish_provider_link_error(AuthManager.REASON_REJECTED)
			return
		provider_link_pending_provider = provider
		provider_link_stage = "commit"
		_set_account_link_busy(true)
		_ensure_provider_link_profile_connection()
		return

	provider_link_pending_provider = provider
	provider_link_stage = "eligibility"
	_set_account_link_busy(true)
	_ensure_provider_link_profile_connection()

func _ensure_provider_link_profile_connection() -> void:
	if provider_link_pending_provider == "":
		return

	if NetworkManager.is_profile_connected():
		_continue_provider_link_over_profile_connection()
		return

	if not NetworkManager.connect_profile_server():
		_finish_provider_link_error(AuthManager.REASON_UNREACHABLE)

func _continue_provider_link_over_profile_connection() -> void:
	if provider_link_pending_provider == "":
		return

	if provider_link_stage == "eligibility":
		if not NetworkManager.send_provider_link_preflight(provider_link_pending_provider):
			_finish_provider_link_error(AuthManager.REASON_UNREACHABLE)
		return

	if provider_link_stage == "commit":
		if not NetworkManager.send_provider_link_commit(
			provider_link_pending_provider,
			AuthManager.pending_link_access_token()
		):
			_finish_provider_link_error(AuthManager.REASON_UNREACHABLE)

func _on_provider_link_preflight_result(data: Dictionary) -> void:
	if str(data.get("provider", "")) != provider_link_pending_provider:
		return

	var result := str(data.get("result", "rejected"))
	if result != "allowed":
		_finish_provider_link_error(result)
		return

	if provider_link_stage == "eligibility":
		if provider_link_pending_provider == "facebook":
			provider_link_stage = "facebook_credential"
			var facebook_reason := AuthManager.begin_facebook_link_preflight()
			if facebook_reason != AuthManager.REASON_NONE:
				_finish_provider_link_error(facebook_reason)
			return

		provider_link_stage = "launch"
		var launch_reason := await AuthManager.link_with_provider(provider_link_pending_provider)
		if launch_reason != AuthManager.REASON_NONE:
			_finish_provider_link_error(launch_reason)
		return

	if provider_link_stage == "facebook_subject":
		provider_link_stage = "launch"
		var link_reason := await AuthManager.complete_facebook_link_after_preflight()
		if link_reason != AuthManager.REASON_NONE:
			_finish_provider_link_error(link_reason)

func _on_facebook_link_credential_ready(access_token: String) -> void:
	if provider_link_pending_provider != "facebook" or provider_link_stage != "facebook_credential":
		return

	provider_link_stage = "facebook_subject"
	if not NetworkManager.send_provider_link_preflight("facebook", access_token):
		_finish_provider_link_error(AuthManager.REASON_UNREACHABLE)

func _on_facebook_link_preflight_failed(reason: String) -> void:
	if provider_link_pending_provider == "facebook" and provider_link_stage == "facebook_credential":
		_finish_provider_link_error(reason)

func _on_provider_link_completed(reason: String) -> void:
	if not AuthManager.has_provider_link_result():
		return

	var completion_reason := AuthManager.take_provider_link_result()
	if completion_reason != reason:
		completion_reason = reason

	if completion_reason != AuthManager.REASON_NONE:
		_finish_provider_link_error(completion_reason)
		return

	if not AuthManager.has_pending_provider_link():
		_finish_provider_link_error(AuthManager.REASON_REJECTED)
		return

	provider_link_pending_provider = AuthManager.pending_link_provider()
	provider_link_stage = "commit"
	_set_account_link_busy(true)
	_ensure_provider_link_profile_connection()

func _on_provider_link_commit_result(data: Dictionary) -> void:
	if (
		provider_link_stage != "commit"
		or str(data.get("provider", "")) != provider_link_pending_provider
	):
		return

	var result := str(data.get("result", "rejected"))
	if result != "accepted":
		AuthManager.reject_provider_link()
		_finish_provider_link_error(result)
		return

	if not AuthManager.finish_provider_link():
		_finish_provider_link_error(AuthManager.REASON_REJECTED)
		return

	provider_link_pending_provider = ""
	provider_link_stage = ""
	_set_account_link_busy(false)
	if current_overlay != null and current_overlay.has_method("refresh_account_state"):
		current_overlay.call("refresh_account_state")
	NetworkManager.disconnect_profile_server()

func _set_account_link_busy(busy: bool) -> void:
	if current_overlay != null and current_overlay.has_method("set_busy"):
		current_overlay.call("set_busy", busy)

func _finish_provider_link_error(reason: String) -> void:
	if AuthManager.has_pending_provider_link() and reason != AuthManager.REASON_UNREACHABLE:
		AuthManager.reject_provider_link()

	provider_link_pending_provider = ""
	provider_link_stage = ""
	_set_account_link_busy(false)
	if current_overlay != null and current_overlay.has_method("show_error"):
		current_overlay.call("show_error", reason)
	if NetworkManager.is_profile_connected():
		NetworkManager.disconnect_profile_server()

func _on_settings_sign_out_requested() -> void:
	NetworkManager.disconnect_server()
	NetworkManager.abandon_room_identity()
	AuthManager.sign_out()
	show_sign_in_screen()

func show_private_server_screen() -> void:
	_teardown_play_instance()
	var screen := PrivateServerScreenScene.instantiate()
	screen.back_requested.connect(_on_private_server_back_requested)
	screen.create_requested.connect(_on_private_server_create_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_private_server_back_requested() -> void:
	show_home_screen()

func _on_private_server_create_requested(display_name: String, password: String) -> void:
	if NetworkManager.create_private_server(display_name, password):
		_show_private_entry_loader()

func show_join_screen() -> void:
	_teardown_play_instance()
	var screen := JoinScreenScene.instantiate()
	screen.find_match_requested.connect(_on_find_match_requested)
	screen.back_requested.connect(_on_join_screen_back_requested)
	screen.private_join_requested.connect(_on_private_join_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)

func _on_join_screen_back_requested() -> void:
	show_home_screen()

func _on_private_join_requested(display_name: String, server_id: String, password: String) -> void:
	if NetworkManager.join_private_server(display_name, server_id, password) and NetworkManager.private_entry_in_flight:
		if current_overlay != null and is_instance_valid(current_overlay) and current_overlay.has_method("show_private_pending"):
			current_overlay.call("show_private_pending")

func _on_private_join_failed(data) -> void:
	var reason := str(data.get("reason", "not_found"))
	var message: String = {
		"full": "Full room",
		"playing": "Room playing",
		"not_found": "Room not found",
		"wrong_password": "Wrong password"
	}.get(reason, "Room not found")

	if current_overlay != null and is_instance_valid(current_overlay) and current_overlay.has_method("show_private_error"):
		current_overlay.call("show_private_error", message)

	NetworkManager.disconnect_server()

func _on_private_entry_failed(data) -> void:
	if str(data.get("entryMode", "")) == "private_join":
		if current_overlay != null and is_instance_valid(current_overlay) and current_overlay.has_method("clear_private_pending"):
			current_overlay.call("clear_private_pending")
	else:
		_clear_private_entry_loader()

	NetworkManager.disconnect_server()

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

func _on_play_instance_menu_requested() -> void:
	if (
		tutorial_active
		or current_overlay != null
		or play_instance == null
		or not is_instance_valid(play_instance)
	):
		return

	var screen := MenuScreenScene.instantiate()
	screen.close_requested.connect(_on_menu_close_requested)
	screen.leave_game_requested.connect(_on_menu_leave_requested)
	_set_overlay(screen)
	_set_gameplay_input_blocked(true)
	update_debug_button_availability()

func _on_menu_close_requested() -> void:
	if current_overlay == null or current_overlay.scene_file_path != MenuScreenScene.resource_path:
		return

	_clear_overlay()
	_set_debug_context(DEBUG_CONTEXT_PLAY)

func _on_menu_leave_requested() -> void:
	if current_overlay == null or current_overlay.scene_file_path != MenuScreenScene.resource_path:
		return

	if not NetworkManager.leave_game():
		_set_menu_leave_pending(false)

func _set_menu_leave_pending(pending: bool) -> void:
	if (
		current_overlay != null
		and is_instance_valid(current_overlay)
		and current_overlay.scene_file_path == MenuScreenScene.resource_path
		and current_overlay.has_method("set_leave_pending")
	):
		current_overlay.call("set_leave_pending", pending)

func show_find_match_screen() -> void:
	_teardown_play_instance()

	var screen := FindMatchScreenScene.instantiate()
	screen.cancel_requested.connect(_on_cancel_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)
	find_match_active = true

func _on_find_match_requested() -> void:
	NetworkManager.abandon_room_identity()
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

func show_private_lobby_screen(data) -> void:
	_teardown_play_instance()
	var screen := PrivateLobbyScreenScene.instantiate()
	screen.leave_lobby_requested.connect(_on_private_leave_lobby_requested)
	_set_overlay(screen)
	_set_debug_context(DEBUG_CONTEXT_NONE)
	screen.apply_lobby_data(data)

func _on_private_leave_lobby_requested() -> void:
	NetworkManager.leave_lobby()

func _on_leave_lobby_requested() -> void:
	NetworkManager.leave_lobby()
	NetworkManager.abandon_room_identity()
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
	if play_instance.has_signal("menu_requested"):
		play_instance.connect("menu_requested", _on_play_instance_menu_requested)

	update_debug_button_availability()

func _teardown_play_instance() -> void:
	_set_gameplay_input_blocked(false)

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
	_complete_startup_handoff()

func _complete_startup_handoff() -> void:
	if startup_handoff_complete:
		return

	startup_handoff_complete = true
	_show_runtime_android_system_bars()

func _clear_overlay() -> void:
	if profile_route_pending == "profile":
		profile_route_pending = ""
		_clear_profile_entry_loader()
		NetworkManager.disconnect_profile_server()

	find_match_active = false
	_clear_private_entry_loader()
	_clear_home_spectator_setup()

	if current_overlay != null and is_instance_valid(current_overlay):
		current_overlay.queue_free()

	current_overlay = null
	_set_gameplay_input_blocked(false)

func _set_gameplay_input_blocked(blocked: bool) -> void:
	gameplay_input_blocked = blocked

	if (
		play_instance != null
		and is_instance_valid(play_instance)
		and play_instance.has_method("set_external_overlay_input_blocked")
	):
		play_instance.call("set_external_overlay_input_blocked", blocked)

func _show_private_entry_loader() -> void:
	if private_entry_loader != null and is_instance_valid(private_entry_loader):
		return

	private_entry_loader = PlayLoaderScreenScene.instantiate()
	screen_container.add_child(private_entry_loader)

func _clear_private_entry_loader() -> void:
	if private_entry_loader != null and is_instance_valid(private_entry_loader):
		private_entry_loader.queue_free()

	private_entry_loader = null

func _show_profile_entry_loader() -> void:
	if profile_entry_loader != null and is_instance_valid(profile_entry_loader):
		return

	profile_entry_loader = PlayLoaderScreenScene.instantiate()
	screen_container.add_child(profile_entry_loader)

func _clear_profile_entry_loader() -> void:
	if profile_entry_loader != null and is_instance_valid(profile_entry_loader):
		profile_entry_loader.queue_free()

	profile_entry_loader = null

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
		and not NetworkManager.spectator_active
		and not NetworkManager.is_recovering()
		and not gameplay_input_blocked
	)
	var home_debug_available := (
		EndpointConfig.DEBUG_UI_ENABLED
		and debug_context == DEBUG_CONTEXT_HOME
		and current_overlay != null
		and is_instance_valid(current_overlay)
		and current_overlay.scene_file_path == HomeScreenScene.resource_path
	)
	debug_button.disabled = not sign_in_debug_available and not game_debug_available and not home_debug_available

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

	if debug_context == DEBUG_CONTEXT_HOME:
		_toggle_home_spectator_setup()
	elif debug_context == DEBUG_CONTEXT_SIGN_IN and current_overlay != null and is_instance_valid(current_overlay) and current_overlay.has_method("toggle_debug_overlay"):
		current_overlay.call("toggle_debug_overlay")
	elif play_instance != null and is_instance_valid(play_instance) and play_instance.has_method("toggle_debug_overlay"):
		play_instance.call("toggle_debug_overlay")

func _toggle_home_spectator_setup() -> void:
	if not EndpointConfig.DEBUG_UI_ENABLED:
		return

	if home_spectator_setup != null and is_instance_valid(home_spectator_setup):
		_clear_home_spectator_setup()
		return

	if current_overlay == null or not is_instance_valid(current_overlay) or current_overlay.scene_file_path != HomeScreenScene.resource_path:
		return

	var panel := PanelContainer.new()
	panel.name = "HomeSpectatorSetup"
	panel.set_anchors_preset(Control.PRESET_CENTER_TOP)
	panel.position = Vector2(-185, 64)
	panel.size = Vector2(370, 520)
	panel.z_index = 100
	panel.mouse_filter = Control.MOUSE_FILTER_STOP

	var margin := MarginContainer.new()
	margin.add_theme_constant_override("margin_left", 16)
	margin.add_theme_constant_override("margin_top", 14)
	margin.add_theme_constant_override("margin_right", 16)
	margin.add_theme_constant_override("margin_bottom", 14)
	panel.add_child(margin)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	margin.add_child(scroll)

	var rows := VBoxContainer.new()
	rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rows.add_theme_constant_override("separation", 8)
	scroll.add_child(rows)

	var title := Label.new()
	title.text = "Bot Spectator Match"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 20)
	rows.add_child(title)

	var help := Label.new()
	help.text = "Choose a lineup, then fine-tune one bot at a time."
	help.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	help.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	rows.add_child(help)

	home_spectator_profiles = _spectator_default_lineup()
	var preset_row := HBoxContainer.new()
	var preset_label := Label.new()
	preset_label.text = "Preset"
	preset_label.custom_minimum_size.x = 68
	preset_row.add_child(preset_label)
	home_spectator_preset_selector = OptionButton.new()
	home_spectator_preset_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	home_spectator_preset_selector.add_item("Mixed")
	home_spectator_preset_selector.add_item("Three Climbers")
	home_spectator_preset_selector.add_item("Three Engineers")
	home_spectator_preset_selector.add_item("Three Opportunists")
	home_spectator_preset_selector.add_item("Custom")
	home_spectator_preset_selector.select(SPECTATOR_PRESET_MIXED)
	home_spectator_preset_selector.item_selected.connect(_on_home_spectator_preset_selected)
	preset_row.add_child(home_spectator_preset_selector)
	rows.add_child(preset_row)

	home_spectator_selectors = []
	for i in range(3):
		var selector_row := HBoxContainer.new()
		var selector_label := Label.new()
		selector_label.text = "Bot " + str(i + 1)
		selector_label.custom_minimum_size.x = 68
		selector_row.add_child(selector_label)
		var selector := OptionButton.new()
		selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		for personality in SPECTATOR_PERSONALITIES:
			selector.add_item(_spectator_personality_title(personality))
		selector.select(i)
		selector.item_selected.connect(_on_home_spectator_personality_selected.bind(i))
		selector_row.add_child(selector)
		rows.add_child(selector_row)
		home_spectator_selectors.append(selector)

	var editor_rule := HSeparator.new()
	rows.add_child(editor_rule)
	var edit_row := HBoxContainer.new()
	var edit_label := Label.new()
	edit_label.text = "Edit traits"
	edit_label.custom_minimum_size.x = 68
	edit_row.add_child(edit_label)
	home_spectator_edit_selector = OptionButton.new()
	home_spectator_edit_selector.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	for i in range(3):
		home_spectator_edit_selector.add_item("Bot " + str(i + 1))
	home_spectator_edit_selector.select(0)
	home_spectator_edit_selector.item_selected.connect(_on_home_spectator_edit_bot_selected)
	edit_row.add_child(home_spectator_edit_selector)
	rows.add_child(edit_row)

	home_spectator_trait_labels = {}
	home_spectator_trait_sliders = {}
	_add_home_spectator_trait_row(rows, "Reaction", "reactionMs", 250.0, 10000.0, 50.0)
	_add_home_spectator_trait_row(rows, "Skill", "skill", 0.0, 1.0, 0.01)
	_add_home_spectator_trait_row(rows, "Risk", "riskTolerance", 0.0, 1.0, 0.01)
	_add_home_spectator_trait_row(rows, "Greed", "greed", 0.0, 1.0, 0.01)
	_add_home_spectator_trait_row(rows, "Repair", "repairAwareness", 0.0, 1.0, 0.01)
	_add_home_spectator_trait_row(rows, "Power", "powerUse", 0.0, 1.0, 0.01)
	_refresh_home_spectator_trait_editor()

	home_spectator_status_label = Label.new()
	home_spectator_status_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	home_spectator_status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rows.add_child(home_spectator_status_label)

	var actions := HBoxContainer.new()
	actions.alignment = BoxContainer.ALIGNMENT_CENTER
	actions.add_theme_constant_override("separation", 10)
	var cancel_button := Button.new()
	cancel_button.text = "Cancel"
	cancel_button.pressed.connect(_clear_home_spectator_setup)
	actions.add_child(cancel_button)
	home_spectator_start_button = Button.new()
	home_spectator_start_button.text = "Start Spectating"
	home_spectator_start_button.pressed.connect(_on_home_spectator_start_pressed)
	actions.add_child(home_spectator_start_button)
	rows.add_child(actions)

	home_spectator_setup = panel
	screen_container.add_child(panel)

func _clear_home_spectator_setup() -> void:
	if home_spectator_setup != null and is_instance_valid(home_spectator_setup):
		home_spectator_setup.queue_free()

	home_spectator_setup = null
	home_spectator_selectors = []
	home_spectator_start_button = null
	home_spectator_status_label = null
	home_spectator_profiles = []
	home_spectator_preset_selector = null
	home_spectator_edit_selector = null
	home_spectator_editing_bot_index = 0
	home_spectator_trait_labels = {}
	home_spectator_trait_sliders = {}

func _on_home_spectator_start_pressed() -> void:
	var profiles := _selected_spectator_profiles()
	if not NetworkManager.start_bot_spectator_match(profiles):
		if home_spectator_status_label != null:
			home_spectator_status_label.text = "Unable to begin spectator setup."
		return

	if home_spectator_status_label != null:
		home_spectator_status_label.text = "Starting spectator match..."
	_set_home_spectator_setup_enabled(false)

func _selected_spectator_profiles() -> Array:
	if home_spectator_profiles.size() != 3:
		return []

	var profiles: Array = []
	for profile_value in home_spectator_profiles:
		if typeof(profile_value) != TYPE_DICTIONARY:
			return []
		profiles.append((profile_value as Dictionary).duplicate(true))

	return profiles

func _spectator_personality_title(personality: String) -> String:
	return personality.capitalize()

func _spectator_default_lineup() -> Array:
	return [
		_spectator_default_profile("climber"),
		_spectator_default_profile("engineer"),
		_spectator_default_profile("opportunist")
	]

func _spectator_default_profile(personality: String) -> Dictionary:
	var defaults: Dictionary = SPECTATOR_PROFILE_DEFAULTS.get(personality, {})
	return defaults.duplicate(true)

func _on_home_spectator_preset_selected(preset_index: int) -> void:
	if preset_index == SPECTATOR_PRESET_CUSTOM:
		return

	var personality := ""
	match preset_index:
		SPECTATOR_PRESET_MIXED:
			home_spectator_profiles = _spectator_default_lineup()
		SPECTATOR_PRESET_THREE_CLIMBERS:
			personality = "climber"
		SPECTATOR_PRESET_THREE_ENGINEERS:
			personality = "engineer"
		SPECTATOR_PRESET_THREE_OPPORTUNISTS:
			personality = "opportunist"
		_:
			return

	if personality != "":
		home_spectator_profiles = [
			_spectator_default_profile(personality),
			_spectator_default_profile(personality),
			_spectator_default_profile(personality)
		]

	_sync_home_spectator_personality_selectors()
	_refresh_home_spectator_trait_editor()

func _on_home_spectator_personality_selected(personality_index: int, bot_index: int) -> void:
	if bot_index < 0 or bot_index >= home_spectator_profiles.size():
		return

	var index: int = clampi(personality_index, 0, SPECTATOR_PERSONALITIES.size() - 1)
	home_spectator_profiles[bot_index] = _spectator_default_profile(SPECTATOR_PERSONALITIES[index])
	_mark_home_spectator_profiles_custom()
	if bot_index == home_spectator_editing_bot_index:
		_refresh_home_spectator_trait_editor()

func _on_home_spectator_edit_bot_selected(bot_index: int) -> void:
	home_spectator_editing_bot_index = clampi(bot_index, 0, 2)
	_refresh_home_spectator_trait_editor()

func _add_home_spectator_trait_row(
	rows: VBoxContainer,
	title: String,
	key: String,
	minimum: float,
	maximum: float,
	step: float
) -> void:
	var row := HBoxContainer.new()
	var label := Label.new()
	label.custom_minimum_size.x = 116
	label.text = title
	row.add_child(label)
	var slider := HSlider.new()
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = step
	slider.value_changed.connect(_on_home_spectator_trait_changed.bind(key))
	row.add_child(slider)
	rows.add_child(row)
	home_spectator_trait_labels[key] = label
	home_spectator_trait_sliders[key] = slider

func _on_home_spectator_trait_changed(value: float, key: String) -> void:
	if home_spectator_editing_bot_index < 0 or home_spectator_editing_bot_index >= home_spectator_profiles.size():
		return

	var profile: Dictionary = home_spectator_profiles[home_spectator_editing_bot_index]
	profile[key] = int(roundi(value)) if key == "reactionMs" else clampf(value, 0.0, 1.0)
	home_spectator_profiles[home_spectator_editing_bot_index] = profile
	_mark_home_spectator_profiles_custom()
	_refresh_home_spectator_trait_editor()

func _refresh_home_spectator_trait_editor() -> void:
	if home_spectator_editing_bot_index < 0 or home_spectator_editing_bot_index >= home_spectator_profiles.size():
		return

	var profile: Dictionary = home_spectator_profiles[home_spectator_editing_bot_index]
	for key in SPECTATOR_TRAIT_KEYS:
		var slider: HSlider = home_spectator_trait_sliders.get(key, null) as HSlider
		var label: Label = home_spectator_trait_labels.get(key, null) as Label
		if slider != null:
			slider.set_value_no_signal(float(profile.get(key, 0.0)))
		if label != null:
			label.text = _home_spectator_trait_label(key, profile.get(key, 0.0))

func _home_spectator_trait_label(key: String, value: Variant) -> String:
	var title: String = {
		"reactionMs": "Reaction",
		"skill": "Skill",
		"riskTolerance": "Risk",
		"greed": "Greed",
		"repairAwareness": "Repair",
		"powerUse": "Power"
	}.get(key, key)
	return title + ": " + (str(int(value)) + " ms" if key == "reactionMs" else "%.2f" % float(value))

func _sync_home_spectator_personality_selectors() -> void:
	for i in range(mini(home_spectator_selectors.size(), home_spectator_profiles.size())):
		var selector: OptionButton = home_spectator_selectors[i]
		var profile: Dictionary = home_spectator_profiles[i]
		var personality_index := SPECTATOR_PERSONALITIES.find(str(profile.get("personality", "")))
		if selector != null and personality_index >= 0:
			selector.select(personality_index)

func _mark_home_spectator_profiles_custom() -> void:
	if home_spectator_preset_selector != null:
		home_spectator_preset_selector.select(SPECTATOR_PRESET_CUSTOM)

func _set_home_spectator_setup_enabled(enabled: bool) -> void:
	if home_spectator_start_button != null:
		home_spectator_start_button.disabled = not enabled
	if home_spectator_preset_selector != null:
		home_spectator_preset_selector.disabled = not enabled
	if home_spectator_edit_selector != null:
		home_spectator_edit_selector.disabled = not enabled
	for selector in home_spectator_selectors:
		if selector != null:
			selector.disabled = not enabled
	for slider in home_spectator_trait_sliders.values():
		if slider != null:
			slider.disabled = not enabled
