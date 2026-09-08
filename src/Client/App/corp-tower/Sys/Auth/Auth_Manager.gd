extends Node

const AuthRequestTransportScript = preload("res://Sys/Auth/Auth_Request_Transport.gd")
const SESSION_FILE := "user://corp_tower_auth_session.save"
const VERIFIER_FILE := "user://corp_tower_auth_verifier.save"
const LINK_FLOW_FILE := "user://corp_tower_auth_link_flow.save"
const WEB_VERIFIER_KEY := "corp_tower_auth_verifier"
const WEB_LINK_FLOW_KEY := "corp_tower_auth_link_flow"
const REFRESH_MARGIN_SECONDS := 120
const REFRESH_CHECK_INTERVAL_SECONDS := 30.0
const NATIVE_FACEBOOK_TIMEOUT_SECONDS := 30.0
const VERIFIER_BYTES := 32
const OAUTH_RESUME_GRACE_SECONDS := 2.0

const REDIRECT_ANDROID := "com.galaxxigames.tod://auth-callback"
const DEEPLINK_SCRIPT := "res://addons/DeeplinkPlugin/Deeplink.gd"
const GOOGLE_SIGNIN_SCRIPT := "res://addons/GoogleSignInPlugin/GoogleSignIn.gd"
const FACEBOOK_SIGNIN_SCRIPT := "res://addons/FacebookSignInPlugin/FacebookSignIn.gd"

const PROVIDERS := ["google", "facebook"]

const REASON_NONE := ""
const REASON_UNREACHABLE := "unreachable"
const REASON_REJECTED := "rejected"
const REASON_CANCELLED := "cancelled"
const REASON_BROWSER := "browser"
const REASON_IDENTITY_CONFLICT := "identity_conflict"
const REASON_PROVIDER_UNAVAILABLE := "provider_unavailable"

const NATIVE_CODE_CANCELLED := "cancelled"
const FLOW_SIGN_IN := "sign_in"
const FLOW_LINK := "link"
const FLOW_FACEBOOK_LINK_PREFLIGHT := "facebook_link_preflight"

signal oauth_completed(reason: String)
signal provider_link_completed(reason: String)
signal facebook_link_credential_ready(access_token: String)
signal facebook_link_preflight_failed(reason: String)

var access_token_value := ""
var refresh_token_value := ""
var expires_at_unix := 0
var facebook_access_token_value := ""
var facebook_expires_at_unix := 0
var user_id := ""
var is_anonymous := false
var current_provider := ""
var display_name := ""
var google_email := ""
var refresh_in_flight := false
var oauth_in_flight := false
var last_oauth_reason := ""
var last_provider_link_reason := ""
var last_provider_link_provider := ""
var provider_link_result_pending := false
var pending_link_session: Dictionary = {}
var pending_link_provider_value := ""
var active_flow_purpose := FLOW_SIGN_IN
var deeplink_node: Node = null
var google_signin_node: Node = null
var facebook_signin_node: Node = null
var native_signin_in_flight := false
var native_google_enabled := true
var native_facebook_enabled := true
var auth_transport

func _ready() -> void:
	auth_transport = AuthRequestTransportScript.new()
	auth_transport.bind_nodes(self)
	auth_transport.setup(EndpointConfig.SUPABASE_URL, EndpointConfig.SUPABASE_ANON_KEY)
	_load_session()

	if not is_enabled():
		return

	var refresh_timer := Timer.new()
	refresh_timer.wait_time = REFRESH_CHECK_INTERVAL_SECONDS
	refresh_timer.autostart = true
	refresh_timer.timeout.connect(_on_refresh_timer_timeout)
	add_child(refresh_timer)

	_setup_deeplink()
	_setup_native_google()
	_setup_native_facebook()

func _setup_deeplink() -> void:
	if not is_oauth_enabled() or OS.get_name() != "Android":
		return

	if not ResourceLoader.exists(DEEPLINK_SCRIPT):
		return

	var script: GDScript = load(DEEPLINK_SCRIPT)

	if script == null:
		return

	deeplink_node = script.new()
	deeplink_node.scheme = redirect_android_scheme()
	deeplink_node.host = redirect_android_host()
	deeplink_node.deeplink_received.connect(_on_deeplink_received)
	add_child(deeplink_node)
	deeplink_node.initialize()

func _setup_native_google() -> void:
	if not is_oauth_enabled() or OS.get_name() != "Android":
		return

	if EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID == "":
		return

	if not ResourceLoader.exists(GOOGLE_SIGNIN_SCRIPT):
		return

	var script: GDScript = load(GOOGLE_SIGNIN_SCRIPT)

	if script == null:
		return

	google_signin_node = script.new()
	google_signin_node.sign_in_success.connect(_on_google_sign_in_success)
	google_signin_node.sign_in_failed.connect(_on_google_sign_in_failed)
	add_child(google_signin_node)

func _native_google_ready() -> bool:
	return google_signin_node != null and google_signin_node.is_available()

func is_native_google_enabled() -> bool:
	return native_google_enabled

func set_native_google_enabled(enabled: bool) -> void:
	native_google_enabled = enabled

func is_native_facebook_enabled() -> bool:
	return native_facebook_enabled

func set_native_facebook_enabled(enabled: bool) -> void:
	native_facebook_enabled = enabled

func _setup_native_facebook() -> void:
	if not is_oauth_enabled() or OS.get_name() != "Android":
		return

	if EndpointConfig.AUTH_FACEBOOK_APP_ID == "" or EndpointConfig.AUTH_FACEBOOK_CLIENT_TOKEN == "":
		return

	if not ResourceLoader.exists(FACEBOOK_SIGNIN_SCRIPT):
		return

	var script: GDScript = load(FACEBOOK_SIGNIN_SCRIPT)

	if script == null:
		return

	facebook_signin_node = script.new()
	facebook_signin_node.sign_in_success.connect(_on_facebook_sign_in_success)
	facebook_signin_node.sign_in_failed.connect(_on_facebook_sign_in_failed)
	add_child(facebook_signin_node)
	facebook_signin_node.configure(
		EndpointConfig.AUTH_FACEBOOK_APP_ID,
		EndpointConfig.AUTH_FACEBOOK_CLIENT_TOKEN
	)

func _native_facebook_ready() -> bool:
	return facebook_signin_node != null and facebook_signin_node.is_available()

func redirect_android_scheme() -> String:
	return REDIRECT_ANDROID.split("://", true, 1)[0]

func redirect_android_host() -> String:
	var parts := REDIRECT_ANDROID.split("://", true, 1)

	if parts.size() < 2:
		return ""

	return parts[1].split("/", true, 1)[0]

func _on_deeplink_received(url) -> void:
	oauth_in_flight = false
	var callback := _parse_callback_query(url.get_query())

	if _has_active_link_flow():
		_record_provider_link_result(await _consume_link_callback(callback))
		return

	if callback["code"] == "":
		_clear_verifier()
		oauth_completed.emit(
			REASON_CANCELLED if callback["error"] != "" else REASON_REJECTED
		)
		return

	var reason := await _exchange_code(callback["code"])

	oauth_completed.emit(reason)

func is_enabled() -> bool:
	return EndpointConfig.SUPABASE_URL != "" and EndpointConfig.SUPABASE_ANON_KEY != ""

func is_signed_in() -> bool:
	return is_enabled() and (refresh_token_value != "" or _has_facebook_access_token())

func has_accepted_provider() -> bool:
	return is_signed_in() and not is_anonymous and PROVIDERS.has(current_provider)

func access_token() -> String:
	if not is_enabled():
		return ""

	if seconds_until_expiry() <= 0:
		return ""

	return access_token_value

func connection_access_token() -> String:
	if _has_facebook_access_token():
		return facebook_access_token_value

	return access_token()

func connection_auth_provider() -> String:
	if _has_facebook_access_token():
		return "facebook"

	if access_token() != "":
		return "supabase"

	return ""

func restore_session() -> bool:
	if not is_enabled():
		return false

	await consume_web_callback()

	if _has_facebook_access_token():
		return true

	if refresh_token_value == "":
		return false

	if seconds_until_expiry() > REFRESH_MARGIN_SECONDS:
		return true

	return await ensure_fresh_token()

func consume_web_callback() -> String:
	if not is_oauth_enabled() or not OS.has_feature("web"):
		return REASON_NONE

	var query := str(JavaScriptBridge.eval("window.location.search", true))
	var callback := _parse_callback_query(query)

	if callback["code"] == "" and callback["error"] == "":
		return REASON_NONE

	JavaScriptBridge.eval(
		"window.history.replaceState({}, '', window.location.pathname)", true
	)

	if _has_active_link_flow():
		var link_reason := await _consume_link_callback(callback)
		_record_provider_link_result(link_reason, false)
		return link_reason

	if callback["code"] == "":
		_clear_verifier()
		last_oauth_reason = REASON_CANCELLED
		return last_oauth_reason

	last_oauth_reason = await _exchange_code(callback["code"])
	return last_oauth_reason

func take_oauth_error() -> String:
	var reason := last_oauth_reason
	last_oauth_reason = REASON_NONE
	return reason

func has_provider_link_result() -> bool:
	return provider_link_result_pending

func take_provider_link_result() -> String:
	var reason := last_provider_link_reason
	provider_link_result_pending = false
	last_provider_link_reason = REASON_NONE
	last_provider_link_provider = ""
	return reason

func provider_link_result_provider() -> String:
	return last_provider_link_provider

func has_pending_provider_link() -> bool:
	return not pending_link_session.is_empty() and pending_link_provider_value != ""

func pending_link_provider() -> String:
	return pending_link_provider_value

func pending_link_access_token() -> String:
	return str(pending_link_session.get("access_token", ""))

func finish_provider_link() -> bool:
	if not has_pending_provider_link():
		return false

	var provider := pending_link_provider_value
	var session := pending_link_session.duplicate(true)
	var user = session.get("user", {})

	if not _apply_session(session):
		return false

	is_anonymous = false
	current_provider = provider
	_apply_link_presentation_metadata(user if user is Dictionary else {}, provider)
	_save_session()
	_clear_pending_link_state()
	return true

func reject_provider_link() -> void:
	_clear_pending_link_state()

func can_link_provider(provider: String) -> bool:
	return (
		PROVIDERS.has(provider)
		and is_oauth_enabled()
		and is_signed_in()
		and is_anonymous
		and current_provider == ""
		and user_id != ""
		and access_token() != ""
	)

func _save_verifier(verifier: String) -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"window.sessionStorage.setItem(%s, %s)" % [
				JSON.stringify(WEB_VERIFIER_KEY), JSON.stringify(verifier)
			], true
		)
		return

	var file := FileAccess.open(VERIFIER_FILE, FileAccess.WRITE)

	if file != null:
		file.store_string(verifier)

func _load_verifier() -> String:
	if OS.has_feature("web"):
		return str(JavaScriptBridge.eval(
			"window.sessionStorage.getItem(%s) || ''" % JSON.stringify(WEB_VERIFIER_KEY), true
		))

	if not FileAccess.file_exists(VERIFIER_FILE):
		return ""

	return FileAccess.get_file_as_string(VERIFIER_FILE).strip_edges()

func _clear_verifier() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"window.sessionStorage.removeItem(%s)" % JSON.stringify(WEB_VERIFIER_KEY), true
		)
		return

	if FileAccess.file_exists(VERIFIER_FILE):
		DirAccess.remove_absolute(VERIFIER_FILE)

func _save_link_flow(provider: String, pre_link_user_id: String, state: String) -> void:
	var payload := JSON.stringify({
		"purpose": FLOW_LINK,
		"provider": provider,
		"pre_link_user_id": pre_link_user_id,
		"state": state
	})

	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"window.sessionStorage.setItem(%s, %s)" % [
				JSON.stringify(WEB_LINK_FLOW_KEY), JSON.stringify(payload)
			], true
		)
		return

	var file := FileAccess.open(LINK_FLOW_FILE, FileAccess.WRITE)

	if file != null:
		file.store_string(payload)

func _load_link_flow() -> Dictionary:
	var raw := ""

	if OS.has_feature("web"):
		raw = str(JavaScriptBridge.eval(
			"window.sessionStorage.getItem(%s) || ''" % JSON.stringify(WEB_LINK_FLOW_KEY), true
		))
	elif FileAccess.file_exists(LINK_FLOW_FILE):
		raw = FileAccess.get_file_as_string(LINK_FLOW_FILE)

	var parsed = JSON.parse_string(raw)

	if typeof(parsed) != TYPE_DICTIONARY:
		return {}

	return parsed

func _clear_link_flow() -> void:
	if OS.has_feature("web"):
		JavaScriptBridge.eval(
			"window.sessionStorage.removeItem(%s)" % JSON.stringify(WEB_LINK_FLOW_KEY), true
		)
		return

	if FileAccess.file_exists(LINK_FLOW_FILE):
		DirAccess.remove_absolute(LINK_FLOW_FILE)

func _has_active_link_flow() -> bool:
	var flow := _load_link_flow()
	return (
		str(flow.get("purpose", "")) == FLOW_LINK
		and PROVIDERS.has(str(flow.get("provider", "")))
		and str(flow.get("pre_link_user_id", "")) != ""
		and str(flow.get("state", "")) != ""
	)

func _clear_pending_link_state() -> void:
	pending_link_session = {}
	pending_link_provider_value = ""
	provider_link_result_pending = false
	last_provider_link_reason = REASON_NONE
	last_provider_link_provider = ""
	active_flow_purpose = FLOW_SIGN_IN
	_clear_verifier()
	_clear_link_flow()

func _record_provider_link_result(reason: String, emit_completion: bool = true) -> void:
	var result_provider := pending_link_provider_value
	if result_provider == "":
		result_provider = str(_load_link_flow().get("provider", ""))
	if not PROVIDERS.has(result_provider):
		result_provider = ""

	if reason != REASON_NONE:
		_clear_verifier()
		_clear_link_flow()
		pending_link_session = {}
		pending_link_provider_value = ""

	active_flow_purpose = FLOW_SIGN_IN
	last_provider_link_reason = reason
	last_provider_link_provider = result_provider
	provider_link_result_pending = true
	if emit_completion:
		provider_link_completed.emit(reason)

func sign_in_guest() -> String:
	if not is_enabled():
		return REASON_NONE

	var response := await _post_auth("/auth/v1/signup", {})

	if response["reason"] != REASON_NONE:
		return response["reason"]

	if not _store_session(response["data"]):
		return REASON_REJECTED

	return REASON_NONE

func is_oauth_enabled() -> bool:
	return is_enabled() and EndpointConfig.AUTH_OAUTH_ENABLED and redirect_uri() != ""

func redirect_uri() -> String:
	if OS.has_feature("web"):
		return EndpointConfig.AUTH_REDIRECT_WEB

	if OS.get_name() == "Android":
		return REDIRECT_ANDROID

	return ""

func sign_in_with_provider(provider: String) -> String:
	if not PROVIDERS.has(provider):
		return REASON_REJECTED

	if not is_oauth_enabled():
		return REASON_REJECTED

	if provider == "google" and native_google_enabled and _native_google_ready():
		return _sign_in_with_native_google()

	if provider == "facebook" and native_facebook_enabled and _native_facebook_ready():
		return _sign_in_with_native_facebook()

	return _sign_in_with_browser(provider)

func _sign_in_with_native_google() -> String:
	active_flow_purpose = FLOW_SIGN_IN
	native_signin_in_flight = true
	google_signin_node.sign_in(EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID)
	return REASON_NONE

func _on_google_sign_in_success(id_token: String) -> void:
	if not native_signin_in_flight:
		return
	native_signin_in_flight = false

	if active_flow_purpose == FLOW_LINK:
		_record_provider_link_result(await _exchange_link_id_token(id_token))
		return

	oauth_completed.emit(await _exchange_id_token(id_token))

func _on_google_sign_in_failed(code: String, message: String) -> void:
	if not native_signin_in_flight:
		return
	native_signin_in_flight = false

	if active_flow_purpose == FLOW_LINK:
		if code == NATIVE_CODE_CANCELLED:
			_record_provider_link_result(REASON_CANCELLED)
			return

		var link_browser_reason := await _begin_browser_link("google")
		if link_browser_reason != REASON_NONE:
			_record_provider_link_result(link_browser_reason)
		return

	if code == NATIVE_CODE_CANCELLED:
		oauth_completed.emit(REASON_CANCELLED)
		return

	var browser_reason := _sign_in_with_browser("google")

	if browser_reason != REASON_NONE:
		oauth_completed.emit(browser_reason)

func _sign_in_with_native_facebook() -> String:
	active_flow_purpose = FLOW_SIGN_IN
	native_signin_in_flight = true

	if not facebook_signin_node.sign_in():
		native_signin_in_flight = false
		return REASON_REJECTED

	_expire_native_facebook_sign_in()
	return REASON_NONE

func _on_facebook_sign_in_success(access_token: String, native_expires_at_unix: int) -> void:
	if not native_signin_in_flight:
		return
	native_signin_in_flight = false

	if active_flow_purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		active_flow_purpose = FLOW_SIGN_IN
		facebook_link_credential_ready.emit(access_token)
		return

	if not _store_facebook_session(access_token, native_expires_at_unix):
		oauth_completed.emit(REASON_REJECTED)
		return

	oauth_completed.emit(REASON_NONE)

func _on_facebook_sign_in_failed(code: String, _message: String) -> void:
	if not native_signin_in_flight:
		return
	native_signin_in_flight = false

	if active_flow_purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		active_flow_purpose = FLOW_SIGN_IN
		facebook_link_preflight_failed.emit(
			REASON_CANCELLED if code == NATIVE_CODE_CANCELLED else REASON_REJECTED
		)
		return

	if code == NATIVE_CODE_CANCELLED:
		oauth_completed.emit(REASON_CANCELLED)
		return

	var browser_reason := _sign_in_with_browser("facebook")

	if browser_reason != REASON_NONE:
		oauth_completed.emit(browser_reason)

func _expire_native_facebook_sign_in() -> void:
	await get_tree().create_timer(NATIVE_FACEBOOK_TIMEOUT_SECONDS).timeout

	if not native_signin_in_flight:
		return

	native_signin_in_flight = false
	if active_flow_purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		active_flow_purpose = FLOW_SIGN_IN
		facebook_link_preflight_failed.emit(REASON_REJECTED)
		return

	oauth_completed.emit(REASON_REJECTED)

func _sign_in_with_browser(provider: String) -> String:
	var verifier := _generate_code_verifier()
	_save_verifier(verifier)

	var url := _build_authorize_url(provider, redirect_uri(), _code_challenge(verifier))

	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.location.replace(%s)" % JSON.stringify(url), true)
		return REASON_NONE

	if OS.shell_open(url) != OK:
		_clear_verifier()
		return REASON_BROWSER

	oauth_in_flight = true
	return REASON_NONE

func link_with_provider(provider: String) -> String:
	if not can_link_provider(provider):
		return REASON_REJECTED

	if provider == "facebook":
		return REASON_PROVIDER_UNAVAILABLE

	_save_link_flow(provider, user_id, _generate_code_verifier())
	active_flow_purpose = FLOW_LINK

	if provider == "google" and native_google_enabled and _native_google_ready():
		native_signin_in_flight = true
		if not _begin_native_google_link_selection():
			native_signin_in_flight = false
			_clear_pending_link_state()
			return REASON_REJECTED
		return REASON_NONE

	return await _begin_browser_link(provider)

func begin_facebook_link_preflight() -> String:
	if not can_link_provider("facebook"):
		return REASON_REJECTED

	if not native_facebook_enabled or not _native_facebook_ready():
		return REASON_PROVIDER_UNAVAILABLE

	active_flow_purpose = FLOW_FACEBOOK_LINK_PREFLIGHT
	native_signin_in_flight = true

	if not _begin_native_facebook_link_selection():
		native_signin_in_flight = false
		active_flow_purpose = FLOW_SIGN_IN
		return REASON_REJECTED

	_expire_native_facebook_sign_in()
	return REASON_NONE

func complete_facebook_link_after_preflight() -> String:
	if not can_link_provider("facebook"):
		return REASON_REJECTED

	_save_link_flow("facebook", user_id, _generate_code_verifier())
	active_flow_purpose = FLOW_LINK
	return await _begin_browser_link("facebook")

func _begin_browser_link(provider: String) -> String:
	var flow := _load_link_flow()
	var expected_provider := str(flow.get("provider", ""))

	if expected_provider != provider or not _has_active_link_flow():
		_clear_pending_link_state()
		return REASON_REJECTED

	var verifier := _generate_code_verifier()
	_save_verifier(verifier)
	var path := _build_link_authorize_path(
		provider,
		redirect_uri(),
		_code_challenge(verifier),
		str(flow.get("state", ""))
	)
	var response := await _get_auth_authenticated(path, access_token())
	var response_reason := _link_response_reason(response)

	if response_reason != REASON_NONE:
		_clear_pending_link_state()
		return response_reason

	var url := str(response.get("data", {}).get("url", ""))

	if url == "":
		_clear_pending_link_state()
		return REASON_REJECTED

	if OS.has_feature("web"):
		JavaScriptBridge.eval("window.location.replace(%s)" % JSON.stringify(url), true)
		return REASON_NONE

	if OS.shell_open(url) != OK:
		_clear_pending_link_state()
		return REASON_BROWSER

	oauth_in_flight = true
	return REASON_NONE

func _expire_oauth_after_grace() -> void:
	await get_tree().create_timer(OAUTH_RESUME_GRACE_SECONDS).timeout

	if not oauth_in_flight:
		return

	oauth_in_flight = false

	if _has_active_link_flow():
		_record_provider_link_result(REASON_CANCELLED)
		return

	_clear_verifier()
	oauth_completed.emit(REASON_CANCELLED)

func _build_authorize_url(provider: String, redirect_to: String, challenge: String) -> String:
	return "%s?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256" % [
		_auth_url("/auth/v1/authorize"),
		provider.uri_encode(),
		redirect_to.uri_encode(),
		challenge.uri_encode()
	]

func _build_link_authorize_path(
	provider: String,
	redirect_to: String,
	challenge: String,
	state: String
) -> String:
	return "/auth/v1/user/identities/authorize?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256&state=%s&skip_http_redirect=true" % [
		provider.uri_encode(),
		redirect_to.uri_encode(),
		challenge.uri_encode(),
		state.uri_encode()
	]

func _generate_code_verifier() -> String:
	return _base64url(Crypto.new().generate_random_bytes(VERIFIER_BYTES))

func _code_challenge(verifier: String) -> String:
	var context := HashingContext.new()
	context.start(HashingContext.HASH_SHA256)
	context.update(verifier.to_utf8_buffer())
	return _base64url(context.finish())

func _base64url(bytes: PackedByteArray) -> String:
	return Marshalls.raw_to_base64(bytes).replace("+", "-").replace("/", "_").rstrip("=")

func _parse_callback_query(query: String) -> Dictionary:
	var result := {"code": "", "error": "", "state": ""}

	for pair in query.trim_prefix("?").split("&", false):
		var parts := pair.split("=", true, 1)

		if parts.size() != 2:
			continue

		match parts[0]:
			"code":
				result["code"] = parts[1].uri_decode()
			"error":
				result["error"] = parts[1].uri_decode()
			"state":
				result["state"] = parts[1].uri_decode()

	return result

func _exchange_code(code: String) -> String:
	var verifier := _load_verifier()
	_clear_verifier()

	if code == "" or verifier == "":
		return REASON_REJECTED

	var response := await _post_auth(
		"/auth/v1/token?grant_type=pkce",
		{"auth_code": code, "code_verifier": verifier}
	)

	if response["reason"] != REASON_NONE:
		return response["reason"]

	if not _store_session(response["data"]):
		return REASON_REJECTED

	return REASON_NONE

func _consume_link_callback(callback: Dictionary) -> String:
	var flow := _load_link_flow()

	if not _has_active_link_flow():
		return REASON_REJECTED

	if str(callback.get("state", "")) != str(flow.get("state", "")):
		return REASON_REJECTED

	if str(callback.get("code", "")) == "":
		return REASON_CANCELLED if str(callback.get("error", "")) != "" else REASON_REJECTED

	return await _exchange_link_code(str(callback["code"]), flow)

func _exchange_link_code(code: String, flow: Dictionary) -> String:
	var verifier := _load_verifier()
	_clear_verifier()

	if code == "" or verifier == "":
		return REASON_REJECTED

	var response := await _post_auth_authenticated(
		"/auth/v1/token?grant_type=pkce",
		{"auth_code": code, "code_verifier": verifier},
		access_token()
	)
	var response_reason := _link_response_reason(response)

	if response_reason != REASON_NONE:
		return response_reason

	return _stage_link_session(response.get("data", {}), flow)

func _build_id_token_body(id_token: String, provider: String = "google") -> Dictionary:
	var body := {"provider": provider, "id_token": id_token}

	if provider == "google":
		body["client_id"] = EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID

	return body

func _exchange_id_token(id_token: String, provider: String = "google") -> String:
	if id_token == "":
		return REASON_REJECTED

	var response := await _post_auth(
		"/auth/v1/token?grant_type=id_token", _build_id_token_body(id_token, provider)
	)

	if response["reason"] != REASON_NONE:
		return response["reason"]

	if not _store_session(response["data"]):
		return REASON_REJECTED

	return REASON_NONE

func _exchange_link_id_token(id_token: String) -> String:
	if id_token == "":
		return REASON_REJECTED

	var flow := _load_link_flow()

	if not _has_active_link_flow() or str(flow.get("provider", "")) != "google":
		return REASON_REJECTED

	var body := _build_link_id_token_body(id_token)
	var response := await _post_auth_authenticated(
		"/auth/v1/token?grant_type=id_token", body, access_token()
	)
	var response_reason := _link_response_reason(response)

	if response_reason != REASON_NONE:
		return response_reason

	return _stage_link_session(response.get("data", {}), flow)

func _build_link_id_token_body(id_token: String) -> Dictionary:
	var body := _build_id_token_body(id_token, "google")
	body["link_identity"] = true
	return body

func _stage_link_session(data: Variant, flow: Dictionary) -> String:
	if typeof(data) != TYPE_DICTIONARY:
		return REASON_REJECTED

	var access := str(data.get("access_token", ""))
	var refresh := str(data.get("refresh_token", ""))
	var user = data.get("user", {})

	if access == "" or refresh == "" or typeof(user) != TYPE_DICTIONARY:
		return REASON_REJECTED

	if str(user.get("id", "")) != str(flow.get("pre_link_user_id", "")):
		return REASON_REJECTED

	pending_link_session = data.duplicate(true)
	pending_link_provider_value = str(flow.get("provider", ""))

	if not PROVIDERS.has(pending_link_provider_value):
		pending_link_session = {}
		pending_link_provider_value = ""
		return REASON_REJECTED

	return REASON_NONE

func ensure_fresh_token() -> bool:
	if refresh_token_value == "":
		return _has_facebook_access_token()

	if not is_enabled():
		return false

	if seconds_until_expiry() > REFRESH_MARGIN_SECONDS:
		return true

	if refresh_in_flight:
		return access_token_value != ""

	refresh_in_flight = true
	var response := await _post_auth(
		"/auth/v1/token?grant_type=refresh_token",
		{"refresh_token": refresh_token_value}
	)
	refresh_in_flight = false

	if response["reason"] == REASON_REJECTED:
		sign_out()
		return false

	if response["reason"] != REASON_NONE:
		return false

	return _store_session(response["data"])

func sign_out() -> void:
	_reset_native_provider_sessions()
	native_signin_in_flight = false
	oauth_in_flight = false
	access_token_value = ""
	refresh_token_value = ""
	expires_at_unix = 0
	facebook_access_token_value = ""
	facebook_expires_at_unix = 0
	user_id = ""
	is_anonymous = false
	current_provider = ""
	display_name = ""
	google_email = ""

	_clear_pending_link_state()

	if FileAccess.file_exists(SESSION_FILE):
		DirAccess.remove_absolute(SESSION_FILE)

func _begin_native_google_link_selection() -> bool:
	if google_signin_node == null or not google_signin_node.has_method("sign_in_fresh"):
		return false

	return bool(google_signin_node.sign_in_fresh(EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID))

func _begin_native_facebook_link_selection() -> bool:
	if facebook_signin_node == null or not facebook_signin_node.has_method("sign_in_fresh"):
		return false

	return bool(facebook_signin_node.sign_in_fresh())

func _reset_native_provider_sessions() -> void:
	if google_signin_node != null and google_signin_node.has_method("reset_session"):
		google_signin_node.reset_session(EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID)

	if facebook_signin_node != null and facebook_signin_node.has_method("reset_session"):
		facebook_signin_node.reset_session()

func seconds_until_expiry() -> int:
	if expires_at_unix <= 0:
		return 0

	return expires_at_unix - int(Time.get_unix_time_from_system())

func _has_facebook_access_token() -> bool:
	return facebook_access_token_value != "" and facebook_expires_at_unix > int(Time.get_unix_time_from_system())

func _apply_facebook_session(access_token: String, native_expires_at_unix: int) -> bool:
	if access_token == "" or native_expires_at_unix <= int(Time.get_unix_time_from_system()):
		return false

	facebook_access_token_value = access_token
	facebook_expires_at_unix = native_expires_at_unix
	is_anonymous = false
	current_provider = "facebook"
	display_name = ""
	google_email = ""
	return true

func _store_facebook_session(access_token: String, native_expires_at_unix: int) -> bool:
	if not _apply_facebook_session(access_token, native_expires_at_unix):
		return false

	_save_session()
	return true

func _on_refresh_timer_timeout() -> void:
	if not is_signed_in():
		return

	if seconds_until_expiry() > REFRESH_MARGIN_SECONDS:
		return

	await ensure_fresh_token()

func _notification(what: int) -> void:
	if what != NOTIFICATION_APPLICATION_RESUMED and what != NOTIFICATION_APPLICATION_FOCUS_IN:
		return

	if oauth_in_flight:
		_expire_oauth_after_grace()

	if not is_signed_in():
		return

	if seconds_until_expiry() > REFRESH_MARGIN_SECONDS:
		return

	ensure_fresh_token()

func _auth_url(path: String) -> String:
	return EndpointConfig.SUPABASE_URL.rstrip("/") + path

func _post_auth(path: String, body: Dictionary) -> Dictionary:
	if auth_transport == null:
		auth_transport = AuthRequestTransportScript.new()
		auth_transport.bind_nodes(self)
		auth_transport.setup(EndpointConfig.SUPABASE_URL, EndpointConfig.SUPABASE_ANON_KEY)

	return await auth_transport.post(path, body)

func _post_auth_authenticated(
	path: String,
	body: Dictionary,
	bearer_token: String
) -> Dictionary:
	if bearer_token == "":
		return {"reason": REASON_REJECTED, "data": {}, "error_code": ""}

	if auth_transport == null:
		auth_transport = AuthRequestTransportScript.new()
		auth_transport.bind_nodes(self)
		auth_transport.setup(EndpointConfig.SUPABASE_URL, EndpointConfig.SUPABASE_ANON_KEY)

	return await auth_transport.post(path, body, bearer_token)

func _get_auth_authenticated(path: String, bearer_token: String) -> Dictionary:
	if bearer_token == "":
		return {"reason": REASON_REJECTED, "data": {}, "error_code": ""}

	if auth_transport == null:
		auth_transport = AuthRequestTransportScript.new()
		auth_transport.bind_nodes(self)
		auth_transport.setup(EndpointConfig.SUPABASE_URL, EndpointConfig.SUPABASE_ANON_KEY)

	return await auth_transport.get_request(path, bearer_token)

func _link_response_reason(response: Dictionary) -> String:
	if str(response.get("error_code", "")) == AuthRequestTransportScript.ERROR_IDENTITY_CONFLICT:
		return REASON_IDENTITY_CONFLICT

	return str(response.get("reason", REASON_REJECTED))

func _apply_session(data: Dictionary) -> bool:
	var access := str(data.get("access_token", ""))
	var refresh := str(data.get("refresh_token", ""))

	if access == "" or refresh == "":
		return false

	access_token_value = access
	refresh_token_value = refresh
	expires_at_unix = _resolve_expiry(data)

	var user = data.get("user", {})

	if typeof(user) == TYPE_DICTIONARY:
		user_id = str(user.get("id", user_id))
		is_anonymous = bool(user.get("is_anonymous", is_anonymous))
		_apply_presentation_metadata(user)

	return true

func _apply_presentation_metadata(user: Dictionary) -> void:
	if is_anonymous:
		current_provider = ""
		display_name = ""
		google_email = ""
		return

	var provider := _provider_from_user(user)

	if provider != "":
		current_provider = provider

	display_name = _display_name_from_user(user) if current_provider == "google" else ""
	google_email = _google_email_from_user(user) if current_provider == "google" else ""

func _apply_link_presentation_metadata(user: Dictionary, provider: String) -> void:
	current_provider = provider
	display_name = _display_name_from_user(user) if provider == "google" else ""
	google_email = _google_email_from_user(user) if provider == "google" else ""

func _provider_from_user(user: Dictionary) -> String:
	var providers: Array = []
	var app_metadata = user.get("app_metadata", {})

	if typeof(app_metadata) == TYPE_DICTIONARY:
		var configured_providers = app_metadata.get("providers", [])
		if configured_providers is Array:
			for provider_value in configured_providers:
				var provider := str(provider_value).strip_edges().to_lower()
				if PROVIDERS.has(provider) and not providers.has(provider):
					providers.append(provider)
		var primary := str(app_metadata.get("provider", "")).strip_edges().to_lower()
		if PROVIDERS.has(primary) and not providers.has(primary):
			providers.append(primary)

	var identities = user.get("identities", [])
	if identities is Array:
		for identity in identities:
			if identity is Dictionary:
				var identity_provider := str(identity.get("provider", "")).strip_edges().to_lower()
				if PROVIDERS.has(identity_provider) and not providers.has(identity_provider):
					providers.append(identity_provider)

	if providers.size() == 1:
		return str(providers[0])

	if providers.has(current_provider):
		return current_provider

	return ""

func _display_name_from_user(user: Dictionary) -> String:
	var user_metadata = user.get("user_metadata", {})

	if typeof(user_metadata) == TYPE_DICTIONARY:
		for key in ["display_name", "full_name", "name", "user_name", "preferred_username"]:
			var value := str(user_metadata.get(key, "")).strip_edges()

			if value != "":
				return value

	var identities = user.get("identities", [])
	if identities is Array:
		for identity in identities:
			if not (identity is Dictionary) or str(identity.get("provider", "")) != "google":
				continue
			var identity_data = identity.get("identity_data", {})
			if identity_data is Dictionary:
				for key in ["full_name", "name", "preferred_username"]:
					var value := str(identity_data.get(key, "")).strip_edges()
					if value != "":
						return value

	return ""

func _google_email_from_user(user: Dictionary) -> String:
	var identities = user.get("identities", [])
	if identities is Array:
		for identity in identities:
			if not (identity is Dictionary) or str(identity.get("provider", "")) != "google":
				continue
			var identity_data = identity.get("identity_data", {})
			if identity_data is Dictionary:
				var identity_email := str(identity_data.get("email", "")).strip_edges()
				if identity_email != "":
					return identity_email
			var identity_row_email := str(identity.get("email", "")).strip_edges()
			if identity_row_email != "":
				return identity_row_email

	var email := str(user.get("email", "")).strip_edges()
	if email != "":
		return email

	var user_metadata = user.get("user_metadata", {})
	if user_metadata is Dictionary:
		return str(user_metadata.get("email", "")).strip_edges()

	return ""

func _store_session(data: Dictionary) -> bool:
	if not _apply_session(data):
		return false

	_save_session()
	return true

func _resolve_expiry(data: Dictionary) -> int:
	var expires_at := int(data.get("expires_at", 0))

	if expires_at > 0:
		return expires_at

	var expires_in := int(data.get("expires_in", 0))

	if expires_in > 0:
		return int(Time.get_unix_time_from_system()) + expires_in

	return 0

func _save_session() -> void:
	var file := FileAccess.open(SESSION_FILE, FileAccess.WRITE)

	if file == null:
		return

	file.store_string(JSON.stringify({
		"access_token": access_token_value,
		"refresh_token": refresh_token_value,
		"expires_at": expires_at_unix,
		"facebook_access_token": facebook_access_token_value,
		"facebook_expires_at": facebook_expires_at_unix,
		"user_id": user_id,
		"is_anonymous": is_anonymous,
		"current_provider": current_provider,
		"display_name": display_name,
		"google_email": google_email
	}))

func _load_session() -> void:
	if not FileAccess.file_exists(SESSION_FILE):
		return

	var parsed = JSON.parse_string(FileAccess.get_file_as_string(SESSION_FILE))

	if typeof(parsed) != TYPE_DICTIONARY:
		return

	access_token_value = str(parsed.get("access_token", ""))
	refresh_token_value = str(parsed.get("refresh_token", ""))
	expires_at_unix = int(parsed.get("expires_at", 0))
	facebook_access_token_value = str(parsed.get("facebook_access_token", ""))
	facebook_expires_at_unix = int(parsed.get("facebook_expires_at", 0))
	user_id = str(parsed.get("user_id", ""))
	is_anonymous = bool(parsed.get("is_anonymous", false))
	current_provider = str(parsed.get("current_provider", ""))
	display_name = str(parsed.get("display_name", ""))
	google_email = str(parsed.get("google_email", ""))
