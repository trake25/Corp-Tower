extends Node

const AuthRequestTransportScript = preload("res://Sys/Auth/Auth_Request_Transport.gd")
const SESSION_FILE := "user://corp_tower_auth_session.save"
const VERIFIER_FILE := "user://corp_tower_auth_verifier.save"
const LINK_FLOW_FILE := "user://corp_tower_auth_link_flow.save"
const WEB_VERIFIER_KEY := "corp_tower_auth_verifier"
const WEB_LINK_FLOW_KEY := "corp_tower_auth_link_flow"
const WEB_FACEBOOK_FLOW_KEY := "corp_tower_facebook_web_flow"
const REFRESH_MARGIN_SECONDS := 120
const REFRESH_CHECK_INTERVAL_SECONDS := 30.0
const NATIVE_FACEBOOK_TIMEOUT_SECONDS := 30.0
const VERIFIER_BYTES := 32
const FACEBOOK_WEB_STATE_BYTES := 32
const OAUTH_RESUME_GRACE_SECONDS := 2.0
const WEB_FACEBOOK_FLOW_TTL_SECONDS := 600
const FACEBOOK_WEB_AUTH_URL := "https://www.facebook.com/v22.0/dialog/oauth"
const FACEBOOK_WEB_EXCHANGE_PATH := "/api/auth/facebook/exchange"

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
const FACEBOOK_LINK_ROUTE_WEB_PC := "web_pc"
const FACEBOOK_LINK_ROUTE_WEB_MOBILE := "web_mobile"
const FACEBOOK_LINK_ROUTE_NATIVE := "native"

signal oauth_completed(reason: String)
signal provider_link_completed(reason: String)
signal web_oauth_navigation_started(provider: String, purpose: String)
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
var pending_native_facebook_access_token_value := ""
var pending_native_facebook_expires_at_unix := 0
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
	# Route any retained Facebook callback record through its own fail-closed
	# consumer, including malformed or expired records. Otherwise an expired
	# Facebook code could be misinterpreted as a generic Supabase callback.
	var facebook_flow_present := not _load_web_facebook_flow().is_empty()

	if callback["code"] == "" and callback["error"] == "":
		if facebook_flow_present:
			return _finish_abandoned_web_facebook_flow()
		return REASON_NONE

	oauth_in_flight = false
	JavaScriptBridge.eval(
		"window.history.replaceState({}, '', window.location.pathname)", true
	)

	if facebook_flow_present:
		return await _consume_web_facebook_callback(callback)

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
	return (
		(not pending_link_session.is_empty() and pending_link_provider_value != "")
		or has_pending_native_facebook_link()
	)

func has_pending_native_facebook_link() -> bool:
	return (
		pending_link_provider_value == "facebook"
		and pending_native_facebook_access_token_value != ""
		and pending_native_facebook_expires_at_unix > int(Time.get_unix_time_from_system())
	)

func pending_link_provider() -> String:
	return pending_link_provider_value

func pending_link_access_token() -> String:
	return str(pending_link_session.get("access_token", ""))

func pending_native_facebook_credential() -> String:
	if not has_pending_native_facebook_link():
		return ""

	return pending_native_facebook_access_token_value

func finish_provider_link() -> bool:
	if pending_link_session.is_empty() or pending_link_provider_value == "":
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

func finish_native_facebook_provider_link() -> bool:
	if not has_pending_native_facebook_link():
		return false

	var native_access_token := pending_native_facebook_access_token_value
	var native_expires_at_unix := pending_native_facebook_expires_at_unix

	if not _apply_facebook_session(native_access_token, native_expires_at_unix):
		return false

	access_token_value = ""
	refresh_token_value = ""
	expires_at_unix = 0
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

func _save_link_flow(provider: String, pre_link_user_id: String) -> void:
	var payload := JSON.stringify({
		"purpose": FLOW_LINK,
		"provider": provider,
		"pre_link_user_id": pre_link_user_id
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

	if raw == "":
		return {}

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
	)

func _save_web_facebook_flow_for_redirect(
	purpose: String,
	state: String,
	redirect_to: String
) -> void:
	if not OS.has_feature("web"):
		return

	var now := int(Time.get_unix_time_from_system())
	var payload := {
		"purpose": purpose,
		"state": state,
		"redirect_uri": redirect_to,
		"origin": _web_url_origin(redirect_to),
		"created_at_unix": now,
		"expires_at_unix": now + WEB_FACEBOOK_FLOW_TTL_SECONDS
	}
	if purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		payload["pre_link_user_id"] = user_id

	JavaScriptBridge.eval(
		"window.sessionStorage.setItem(%s, %s)" % [
			JSON.stringify(WEB_FACEBOOK_FLOW_KEY), JSON.stringify(JSON.stringify(payload))
		], true
	)

func _load_web_facebook_flow() -> Dictionary:
	if not OS.has_feature("web"):
		return {}

	var raw := str(JavaScriptBridge.eval(
		"window.sessionStorage.getItem(%s) || ''" % JSON.stringify(WEB_FACEBOOK_FLOW_KEY), true
	))
	if raw == "":
		return {}

	var parsed = JSON.parse_string(raw)
	return parsed if typeof(parsed) == TYPE_DICTIONARY else {}

func _clear_web_facebook_flow() -> void:
	if not OS.has_feature("web"):
		return

	JavaScriptBridge.eval(
		"window.sessionStorage.removeItem(%s)" % JSON.stringify(WEB_FACEBOOK_FLOW_KEY), true
	)

func _has_active_web_facebook_flow() -> bool:
	var flow := _load_web_facebook_flow()
	return (
		(
			str(flow.get("purpose", "")) == FLOW_SIGN_IN
			or str(flow.get("purpose", "")) == FLOW_FACEBOOK_LINK_PREFLIGHT
		)
		and str(flow.get("state", "")) != ""
		and str(flow.get("redirect_uri", "")) != ""
		and str(flow.get("origin", "")) != ""
		and not _web_facebook_flow_expired(flow)
	)

func _web_facebook_flow_expired(flow: Dictionary) -> bool:
	return int(flow.get("expires_at_unix", 0)) <= int(Time.get_unix_time_from_system())

func _clear_pending_link_state() -> void:
	pending_link_session = {}
	pending_link_provider_value = ""
	pending_native_facebook_access_token_value = ""
	pending_native_facebook_expires_at_unix = 0
	provider_link_result_pending = false
	last_provider_link_reason = REASON_NONE
	last_provider_link_provider = ""
	active_flow_purpose = FLOW_SIGN_IN
	_clear_verifier()
	_clear_link_flow()
	_clear_web_facebook_flow()

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
		pending_native_facebook_access_token_value = ""
		pending_native_facebook_expires_at_unix = 0

	active_flow_purpose = FLOW_SIGN_IN
	last_provider_link_reason = reason
	last_provider_link_provider = result_provider
	provider_link_result_pending = true
	if emit_completion:
		provider_link_completed.emit(reason)

func _record_web_facebook_link_result(reason: String, emit_completion: bool = false) -> void:
	if reason != REASON_NONE:
		pending_link_session = {}
		pending_link_provider_value = ""
		pending_native_facebook_access_token_value = ""
		pending_native_facebook_expires_at_unix = 0

	active_flow_purpose = FLOW_SIGN_IN
	last_provider_link_reason = reason
	last_provider_link_provider = "facebook"
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

func _current_web_origin() -> String:
	if not OS.has_feature("web"):
		return ""

	return str(JavaScriptBridge.eval("window.location.origin || ''", true)).rstrip("/")

func _web_url_origin(url: String) -> String:
	if not OS.has_feature("web") or url.strip_edges() == "":
		return ""

	return str(JavaScriptBridge.eval(
		"""
(function (value) {
  try {
    return new URL(value).origin;
  } catch (_) {
    return "";
  }
})(%s)
""" % JSON.stringify(url),
		true
	)).rstrip("/")

func _is_mobile_web_runtime() -> bool:
	if not OS.has_feature("web"):
		return false

	var raw := str(JavaScriptBridge.eval(
		"""
JSON.stringify({
  mobile: Boolean(navigator.userAgentData && navigator.userAgentData.mobile),
  userAgent: navigator.userAgent || "",
  platform: navigator.platform || "",
  maxTouchPoints: Number(navigator.maxTouchPoints || 0)
})
""",
		true
	))
	var parsed = JSON.parse_string(raw)
	if typeof(parsed) != TYPE_DICTIONARY:
		return false

	return _is_mobile_web_for_user_agent(
		str(parsed.get("userAgent", "")),
		bool(parsed.get("mobile", false)),
		str(parsed.get("platform", "")),
		int(parsed.get("maxTouchPoints", 0))
	)

func _is_mobile_web_for_user_agent(
	user_agent: String,
	client_hint_mobile: bool = false,
	platform: String = "",
	max_touch_points: int = 0
) -> bool:
	if client_hint_mobile:
		return true

	var normalized := user_agent.to_lower()
	var mobile_markers := [
		"android", "iphone", "ipod", "ipad", "iemobile", "opera mini",
		"mobile", "fennec", "blackberry", "webos"
	]
	for marker in mobile_markers:
		if normalized.contains(marker):
			return true

	return platform == "MacIntel" and max_touch_points > 1

func sign_in_with_provider(provider: String) -> String:
	if not PROVIDERS.has(provider):
		return REASON_REJECTED

	if not is_oauth_enabled():
		return REASON_REJECTED

	if provider == "google" and native_google_enabled and _native_google_ready():
		return _sign_in_with_native_google()

	if provider == "facebook" and native_facebook_enabled and _native_facebook_ready():
		return _sign_in_with_native_facebook()

	if provider == "facebook" and OS.has_feature("web"):
		if _is_mobile_web_runtime():
			return _sign_in_with_browser(provider)
		return _sign_in_with_web_facebook()

	return _sign_in_with_browser(provider)

func facebook_link_route() -> String:
	return _facebook_link_route_for_runtime(
		OS.has_feature("web"), OS.get_name(), _is_mobile_web_runtime()
	)

func _facebook_link_route_for_runtime(
	is_web: bool,
	platform_name: String,
	is_mobile_web: bool = false
) -> String:
	if is_web:
		return FACEBOOK_LINK_ROUTE_WEB_MOBILE if is_mobile_web else FACEBOOK_LINK_ROUTE_WEB_PC

	if platform_name == "Android":
		return FACEBOOK_LINK_ROUTE_NATIVE

	return ""

func _sign_in_with_web_facebook() -> String:
	active_flow_purpose = FLOW_SIGN_IN
	return _begin_web_facebook_login(FLOW_SIGN_IN)

func _begin_web_facebook_login(purpose: String) -> String:
	if (
		not OS.has_feature("web")
		or EndpointConfig.AUTH_FACEBOOK_APP_ID == ""
		or redirect_uri() == ""
	):
		return REASON_PROVIDER_UNAVAILABLE

	if purpose != FLOW_SIGN_IN and purpose != FLOW_FACEBOOK_LINK_PREFLIGHT:
		return REASON_REJECTED

	var state := _base64url(Crypto.new().generate_random_bytes(FACEBOOK_WEB_STATE_BYTES))
	if state == "":
		return REASON_REJECTED

	var redirect_to := redirect_uri()
	if redirect_to == "":
		return REASON_PROVIDER_UNAVAILABLE

	_save_web_facebook_flow_for_redirect(purpose, state, redirect_to)
	if not _has_active_web_facebook_flow():
		_clear_web_facebook_flow()
		return REASON_REJECTED

	var authorize_url := _build_web_facebook_authorize_url(
		EndpointConfig.AUTH_FACEBOOK_APP_ID,
		redirect_to,
		state
	)
	_mark_web_oauth_navigation_started(
		"facebook", FLOW_LINK if purpose == FLOW_FACEBOOK_LINK_PREFLIGHT else FLOW_SIGN_IN
	)
	JavaScriptBridge.eval(
		_web_oauth_navigation_script(authorize_url),
		true
	)
	return REASON_NONE

func _build_web_facebook_authorize_url(app_id: String, redirect_to: String, state: String) -> String:
	return "%s?client_id=%s&redirect_uri=%s&state=%s&response_type=code&scope=public_profile" % [
		FACEBOOK_WEB_AUTH_URL,
		app_id.uri_encode(),
		redirect_to.uri_encode(),
		state.uri_encode()
	]

func _facebook_exchange_url(primary: String = EndpointConfig.PRIMARY) -> String:
	var base := primary.strip_edges().rstrip("/")
	if base.begins_with("wss://"):
		base = "https://" + base.substr(6)
	elif base.begins_with("ws://"):
		base = "http://" + base.substr(5)
	else:
		return ""

	var scheme_index := base.find("://")
	var path_index := base.find("/", scheme_index + 3)
	if path_index >= 0:
		base = base.left(path_index)

	return base + FACEBOOK_WEB_EXCHANGE_PATH

func _exchange_web_facebook_code(code: String, redirect_to: String) -> Dictionary:
	if code == "" or redirect_to == "":
		return {"reason": REASON_REJECTED, "data": {}}

	var exchange_url := _facebook_exchange_url()
	if exchange_url == "":
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var http := HTTPRequest.new()
	http.timeout = 12.0
	add_child(http)
	var error := http.request(
		exchange_url,
		PackedStringArray(["Content-Type: application/json"]),
		HTTPClient.METHOD_POST,
		JSON.stringify({"code": code, "redirectUri": redirect_to})
	)
	if error != OK:
		http.queue_free()
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var result: Array = await http.request_completed
	http.queue_free()
	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var status := int(result[1])
	var payload: PackedByteArray = result[3]
	var parsed = JSON.parse_string(payload.get_string_from_utf8())
	if status < 200 or status >= 300:
		return {
			"reason": REASON_REJECTED if status < 500 else REASON_UNREACHABLE,
			"data": {}
		}
	if typeof(parsed) != TYPE_DICTIONARY:
		return {"reason": REASON_REJECTED, "data": {}}

	var access_token := str(parsed.get("access_token", ""))
	var expires_in := int(parsed.get("expires_in", 0))
	if access_token == "" or expires_in <= 0:
		return {"reason": REASON_REJECTED, "data": {}}

	return {
		"reason": REASON_NONE,
		"data": {"access_token": access_token, "expires_in": expires_in}
	}

func _consume_web_facebook_callback(
	callback: Dictionary,
	emit_completion: bool = false
) -> String:
	var flow := _load_web_facebook_flow()
	var purpose := str(flow.get("purpose", ""))
	var expected_state := str(flow.get("state", ""))
	var callback_state := str(callback.get("state", ""))
	var redirect_to := str(flow.get("redirect_uri", ""))
	var expected_origin := str(flow.get("origin", ""))
	var pre_link_user_id := str(flow.get("pre_link_user_id", ""))
	var flow_expired := _web_facebook_flow_expired(flow)
	var current_origin := _current_web_origin()
	_clear_web_facebook_flow()

	if (
		expected_state == ""
		or callback_state == ""
		or callback_state != expected_state
		or redirect_to == ""
		or expected_origin == ""
		or flow_expired
		or _web_url_origin(redirect_to) != expected_origin
		or current_origin != expected_origin
	):
		return _finish_web_facebook_callback(purpose, REASON_REJECTED, emit_completion)

	var code := str(callback.get("code", ""))
	if code == "":
		return _finish_web_facebook_callback(
			purpose,
			REASON_CANCELLED if str(callback.get("error", "")) != "" else REASON_REJECTED,
			emit_completion
		)

	var exchange := await _exchange_web_facebook_code(code, redirect_to)
	var reason := str(exchange.get("reason", REASON_REJECTED))
	if reason != REASON_NONE:
		return _finish_web_facebook_callback(purpose, reason, emit_completion)

	var data = exchange.get("data", {})
	var access_token := str(data.get("access_token", ""))
	var expires_in := int(data.get("expires_in", 0))
	var expires_at := int(Time.get_unix_time_from_system()) + expires_in

	if purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		if (
			pre_link_user_id == ""
			or pre_link_user_id != user_id
			or not is_anonymous
			or current_provider != ""
		):
			return _finish_web_facebook_callback(purpose, REASON_REJECTED, emit_completion)
		if not _stage_native_facebook_link_credential(access_token, expires_at):
			return _finish_web_facebook_callback(purpose, REASON_REJECTED, emit_completion)
		return _finish_web_facebook_callback(purpose, REASON_NONE, emit_completion)

	if purpose != FLOW_SIGN_IN:
		return _finish_web_facebook_callback(purpose, REASON_REJECTED, emit_completion)

	return _finish_web_facebook_callback(
		purpose,
		REASON_NONE if _store_facebook_session(access_token, expires_at) else REASON_REJECTED,
		emit_completion
	)

func _finish_web_facebook_callback(
	purpose: String,
	reason: String,
	emit_completion: bool = false
) -> String:
	oauth_in_flight = false
	active_flow_purpose = FLOW_SIGN_IN
	if purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
		_record_web_facebook_link_result(reason, emit_completion)
		return reason

	last_oauth_reason = reason
	if emit_completion:
		oauth_completed.emit(reason)
	return reason

func _finish_abandoned_web_facebook_flow(emit_completion: bool = false) -> String:
	var purpose := str(_load_web_facebook_flow().get("purpose", ""))
	_clear_web_facebook_flow()
	return _finish_web_facebook_callback(purpose, REASON_BROWSER, emit_completion)

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
		if not _stage_native_facebook_link_credential(access_token, native_expires_at_unix):
			facebook_link_preflight_failed.emit(REASON_REJECTED)
			return
		facebook_link_credential_ready.emit(pending_native_facebook_access_token_value)
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

	var url := _build_authorize_url(
		provider,
		redirect_uri(),
		_code_challenge(verifier),
		OS.has_feature("web")
	)

	if OS.has_feature("web"):
		_mark_web_oauth_navigation_started(provider, FLOW_SIGN_IN)
		JavaScriptBridge.eval(_web_oauth_navigation_script(url), true)
		return REASON_NONE

	if OS.shell_open(url) != OK:
		_clear_verifier()
		return REASON_BROWSER

	oauth_in_flight = true
	return REASON_NONE

func link_with_provider(provider: String) -> String:
	if not can_link_provider(provider):
		return REASON_REJECTED

	_save_link_flow(provider, user_id)
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

	if facebook_link_route() == FACEBOOK_LINK_ROUTE_WEB_PC:
		_clear_pending_link_state()
		active_flow_purpose = FLOW_FACEBOOK_LINK_PREFLIGHT
		var web_reason := _begin_web_facebook_login(FLOW_FACEBOOK_LINK_PREFLIGHT)
		if web_reason != REASON_NONE:
			active_flow_purpose = FLOW_SIGN_IN
		return web_reason

	if facebook_link_route() != FACEBOOK_LINK_ROUTE_NATIVE:
		return REASON_PROVIDER_UNAVAILABLE

	if not native_facebook_enabled or not _native_facebook_ready():
		return REASON_PROVIDER_UNAVAILABLE

	_clear_pending_link_state()
	active_flow_purpose = FLOW_FACEBOOK_LINK_PREFLIGHT
	native_signin_in_flight = true

	if not _begin_native_facebook_link_selection():
		native_signin_in_flight = false
		active_flow_purpose = FLOW_SIGN_IN
		return REASON_REJECTED

	_expire_native_facebook_sign_in()
	return REASON_NONE

func complete_facebook_link_after_preflight() -> String:
	return REASON_PROVIDER_UNAVAILABLE

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
		OS.has_feature("web")
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
		_mark_web_oauth_navigation_started(provider, FLOW_LINK)
		JavaScriptBridge.eval(_web_oauth_navigation_script(url), true)
		return REASON_NONE

	if OS.shell_open(url) != OK:
		_clear_pending_link_state()
		return REASON_BROWSER

	oauth_in_flight = true
	return REASON_NONE

func _expire_oauth_after_grace() -> void:
	await get_tree().create_timer(OAUTH_RESUME_GRACE_SECONDS).timeout
	_reject_unresolved_oauth_after_resume(OS.has_feature("web"))

func _reject_unresolved_oauth_after_resume(is_web: bool) -> String:
	if not oauth_in_flight:
		return REASON_NONE

	oauth_in_flight = false
	var reason := REASON_BROWSER if is_web else REASON_CANCELLED

	if _has_active_web_facebook_flow():
		var purpose := str(_load_web_facebook_flow().get("purpose", ""))
		_clear_web_facebook_flow()
		if purpose == FLOW_FACEBOOK_LINK_PREFLIGHT:
			_record_web_facebook_link_result(reason)
			return reason
		last_oauth_reason = reason
		oauth_completed.emit(reason)
		return reason

	if _has_active_link_flow():
		_record_provider_link_result(reason)
		return reason

	_clear_verifier()
	oauth_completed.emit(reason)
	return reason

func _mark_web_oauth_navigation_started(provider: String, purpose: String) -> void:
	oauth_in_flight = true
	web_oauth_navigation_started.emit(provider, purpose)

func _web_oauth_navigation_script(url: String) -> String:
	return "window.location.replace(%s)" % JSON.stringify(url)

func _provider_account_selection_query(provider: String) -> String:
	return "&prompt=select_account" if provider == "google" else ""

func _build_authorize_url(
	provider: String,
	redirect_to: String,
	challenge: String,
	is_web: bool = false
) -> String:
	return "%s?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256%s" % [
		_auth_url("/auth/v1/authorize"),
		provider.uri_encode(),
		redirect_to.uri_encode(),
		challenge.uri_encode(),
		_provider_account_selection_query(provider)
	]

func _build_link_authorize_path(
	provider: String,
	redirect_to: String,
	challenge: String,
	is_web: bool = false
) -> String:
	return "/auth/v1/user/identities/authorize?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256&skip_http_redirect=true%s" % [
		provider.uri_encode(),
		redirect_to.uri_encode(),
		challenge.uri_encode(),
		_provider_account_selection_query(provider)
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
	var result := {"code": "", "error": "", "error_code": "", "state": ""}

	for pair in query.trim_prefix("?").split("&", false):
		var parts := pair.split("=", true, 1)

		if parts.size() != 2:
			continue

		match parts[0]:
			"code":
				result["code"] = parts[1].uri_decode()
			"error":
				result["error"] = parts[1].uri_decode()
			"error_code":
				result["error_code"] = parts[1].uri_decode()
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

	if str(callback.get("code", "")) == "":
		var error_code := str(callback.get("error_code", "")).strip_edges().to_lower()
		if error_code == AuthRequestTransportScript.ERROR_IDENTITY_ALREADY_EXISTS:
			if str(flow.get("provider", "")) == "google":
				return await _recover_existing_google_link(flow)
			return REASON_IDENTITY_CONFLICT
		if error_code == AuthRequestTransportScript.ERROR_IDENTITY_CONFLICT:
			return REASON_IDENTITY_CONFLICT
		return REASON_CANCELLED if str(callback.get("error", "")) != "" else REASON_REJECTED

	return await _exchange_link_code(str(callback["code"]), flow)

func _recover_existing_google_link(flow: Dictionary) -> String:
	if (
		str(flow.get("provider", "")) != "google"
		or str(flow.get("pre_link_user_id", "")) == ""
	):
		return REASON_IDENTITY_CONFLICT

	var response := await _get_auth_authenticated("/auth/v1/user", access_token())
	if str(response.get("reason", REASON_REJECTED)) != REASON_NONE:
		return str(response.get("reason", REASON_REJECTED))

	var user = response.get("data", {})
	if typeof(user) != TYPE_DICTIONARY or not _is_recoverable_google_link_user(user, flow):
		return REASON_IDENTITY_CONFLICT

	return _stage_link_session({
		"access_token": access_token_value,
		"refresh_token": refresh_token_value,
		"expires_at": expires_at_unix,
		"user": user
	}, flow)

func _is_recoverable_google_link_user(user: Dictionary, flow: Dictionary) -> bool:
	return (
		str(flow.get("provider", "")) == "google"
		and str(flow.get("pre_link_user_id", "")) != ""
		and str(user.get("id", "")) == str(flow.get("pre_link_user_id", ""))
		and _supported_providers_from_user(user) == ["google"]
	)

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
	pending_native_facebook_access_token_value = ""
	pending_native_facebook_expires_at_unix = 0

	if not PROVIDERS.has(pending_link_provider_value):
		pending_link_session = {}
		pending_link_provider_value = ""
		return REASON_REJECTED

	return REASON_NONE

func _stage_native_facebook_link_credential(
	access_token: String, native_expires_at_unix: int
) -> bool:
	if access_token == "" or native_expires_at_unix <= int(Time.get_unix_time_from_system()):
		return false

	pending_link_session = {}
	pending_link_provider_value = "facebook"
	pending_native_facebook_access_token_value = access_token
	pending_native_facebook_expires_at_unix = native_expires_at_unix
	return true

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
	var providers := _supported_providers_from_user(user)

	if providers.size() == 1:
		return str(providers[0])

	if providers.has(current_provider):
		return current_provider

	return ""

func _supported_providers_from_user(user: Dictionary) -> Array:
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

	return providers

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
