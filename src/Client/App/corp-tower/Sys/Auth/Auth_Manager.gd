extends Node

const SESSION_FILE := "user://corp_tower_auth_session.save"
const REFRESH_MARGIN_SECONDS := 120
const REFRESH_CHECK_INTERVAL_SECONDS := 30.0
const REQUEST_TIMEOUT_SECONDS := 12.0

const REASON_NONE := ""
const REASON_UNREACHABLE := "unreachable"
const REASON_REJECTED := "rejected"

var access_token_value := ""
var refresh_token_value := ""
var expires_at_unix := 0
var user_id := ""
var is_anonymous := false
var refresh_in_flight := false

func _ready() -> void:
	_load_session()

	if not is_enabled():
		return

	var refresh_timer := Timer.new()
	refresh_timer.wait_time = REFRESH_CHECK_INTERVAL_SECONDS
	refresh_timer.autostart = true
	refresh_timer.timeout.connect(_on_refresh_timer_timeout)
	add_child(refresh_timer)

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
	if not is_signed_in():
		return false

	if seconds_until_expiry() > REFRESH_MARGIN_SECONDS:
		return true

	return await ensure_fresh_token()

func sign_in_guest() -> String:
	if not is_enabled():
		return REASON_NONE

	var response := await _post_auth("/auth/v1/signup", {})

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
