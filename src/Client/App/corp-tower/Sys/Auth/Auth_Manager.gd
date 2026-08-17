extends Node

const SESSION_FILE := "user://corp_tower_auth_session.save"
const VERIFIER_FILE := "user://corp_tower_auth_verifier.save"
const REFRESH_MARGIN_SECONDS := 120
const REFRESH_CHECK_INTERVAL_SECONDS := 30.0
const REQUEST_TIMEOUT_SECONDS := 12.0
const VERIFIER_BYTES := 32
const OAUTH_RESUME_GRACE_SECONDS := 2.0

const REDIRECT_ANDROID := "com.galaxxigames.tod://auth-callback"
const DEEPLINK_SCRIPT := "res://addons/DeeplinkPlugin/Deeplink.gd"

const PROVIDERS := ["google"]

const REASON_NONE := ""
const REASON_UNREACHABLE := "unreachable"
const REASON_REJECTED := "rejected"
const REASON_CANCELLED := "cancelled"
const REASON_BROWSER := "browser"

signal oauth_completed(reason: String)

var access_token_value := ""
var refresh_token_value := ""
var expires_at_unix := 0
var user_id := ""
var is_anonymous := false
var refresh_in_flight := false
var oauth_in_flight := false
var last_oauth_reason := ""
var deeplink_node: Node = null

func _ready() -> void:
	_load_session()

	if not is_enabled():
		return

	var refresh_timer := Timer.new()
	refresh_timer.wait_time = REFRESH_CHECK_INTERVAL_SECONDS
	refresh_timer.autostart = true
	refresh_timer.timeout.connect(_on_refresh_timer_timeout)
	add_child(refresh_timer)

	_setup_deeplink()

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

	if callback["code"] == "":
		_clear_verifier()
		oauth_completed.emit(
			REASON_CANCELLED if callback["error"] != "" else REASON_REJECTED
		)
		return

	oauth_completed.emit(await _exchange_code(callback["code"]))

func is_enabled() -> bool:
	return EndpointConfig.SUPABASE_URL != "" and EndpointConfig.SUPABASE_ANON_KEY != ""

func is_signed_in() -> bool:
	return is_enabled() and refresh_token_value != ""

func access_token() -> String:
	if not is_enabled():
		return ""

	if seconds_until_expiry() <= 0:
		return ""

	return access_token_value

func restore_session() -> bool:
	if not is_enabled():
		return false

	await consume_web_callback()

	if not is_signed_in():
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

func _save_verifier(verifier: String) -> void:
	var file := FileAccess.open(VERIFIER_FILE, FileAccess.WRITE)

	if file != null:
		file.store_string(verifier)

func _load_verifier() -> String:
	if not FileAccess.file_exists(VERIFIER_FILE):
		return ""

	return FileAccess.get_file_as_string(VERIFIER_FILE).strip_edges()

func _clear_verifier() -> void:
	if FileAccess.file_exists(VERIFIER_FILE):
		DirAccess.remove_absolute(VERIFIER_FILE)

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
	if not is_oauth_enabled() or not PROVIDERS.has(provider):
		return REASON_REJECTED

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

func _expire_oauth_after_grace() -> void:
	await get_tree().create_timer(OAUTH_RESUME_GRACE_SECONDS).timeout

	if not oauth_in_flight:
		return

	oauth_in_flight = false
	_clear_verifier()
	oauth_completed.emit(REASON_CANCELLED)

func _build_authorize_url(provider: String, redirect_to: String, challenge: String) -> String:
	return "%s?provider=%s&redirect_to=%s&code_challenge=%s&code_challenge_method=s256" % [
		_auth_url("/auth/v1/authorize"),
		provider.uri_encode(),
		redirect_to.uri_encode(),
		challenge.uri_encode()
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
	var result := {"code": "", "error": ""}

	for pair in query.trim_prefix("?").split("&", false):
		var parts := pair.split("=", true, 1)

		if parts.size() != 2:
			continue

		match parts[0]:
			"code":
				result["code"] = parts[1].uri_decode()
			"error":
				result["error"] = parts[1].uri_decode()

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

func ensure_fresh_token() -> bool:
	if not is_signed_in():
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
	access_token_value = ""
	refresh_token_value = ""
	expires_at_unix = 0
	user_id = ""
	is_anonymous = false

	_clear_verifier()

	if FileAccess.file_exists(SESSION_FILE):
		DirAccess.remove_absolute(SESSION_FILE)

func seconds_until_expiry() -> int:
	if expires_at_unix <= 0:
		return 0

	return expires_at_unix - int(Time.get_unix_time_from_system())

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
	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT_SECONDS
	add_child(http)

	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + EndpointConfig.SUPABASE_ANON_KEY,
		"Authorization: Bearer " + EndpointConfig.SUPABASE_ANON_KEY
	])

	var error := http.request(
		_auth_url(path), headers, HTTPClient.METHOD_POST, JSON.stringify(body)
	)

	if error != OK:
		http.queue_free()
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var result: Array = await http.request_completed
	http.queue_free()

	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var status := int(result[1])

	if status < 200 or status >= 300:
		return {"reason": REASON_REJECTED, "data": {}}

	var payload: PackedByteArray = result[3]
	var parsed = JSON.parse_string(payload.get_string_from_utf8())

	if typeof(parsed) != TYPE_DICTIONARY:
		return {"reason": REASON_REJECTED, "data": {}}

	return {"reason": REASON_NONE, "data": parsed}

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

	return true

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
		"user_id": user_id,
		"is_anonymous": is_anonymous
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
	user_id = str(parsed.get("user_id", ""))
	is_anonymous = bool(parsed.get("is_anonymous", false))
