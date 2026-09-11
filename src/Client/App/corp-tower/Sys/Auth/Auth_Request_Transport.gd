extends RefCounted

const REQUEST_TIMEOUT_SECONDS := 12.0
const REASON_NONE := ""
const REASON_UNREACHABLE := "unreachable"
const REASON_REJECTED := "rejected"
const ERROR_IDENTITY_CONFLICT := "identity_conflict"
const ERROR_IDENTITY_ALREADY_EXISTS := "identity_already_exists"

var request_host: Node = null
var base_url := ""
var anon_key := ""

func bind_nodes(host: Node) -> void:
	request_host = host

func setup(base_url_value: String, anon_key_value: String) -> void:
	base_url = base_url_value.rstrip("/")
	anon_key = anon_key_value

func post(path: String, body: Dictionary, bearer_token: String = "") -> Dictionary:
	return await _request(HTTPClient.METHOD_POST, path, body, bearer_token)

func get_request(path: String, bearer_token: String = "") -> Dictionary:
	return await _request(HTTPClient.METHOD_GET, path, {}, bearer_token)

func _request(
	method: HTTPClient.Method,
	path: String,
	body: Dictionary,
	bearer_token: String
) -> Dictionary:
	if request_host == null or base_url == "" or anon_key == "":
		return _result(REASON_UNREACHABLE)

	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT_SECONDS
	request_host.add_child(http)

	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + anon_key,
		"Authorization: Bearer " + (bearer_token if bearer_token != "" else anon_key)
	])

	var error := http.request(
		base_url + path,
		headers,
		method,
		JSON.stringify(body) if method != HTTPClient.METHOD_GET else ""
	)

	if error != OK:
		http.queue_free()
		return _result(REASON_UNREACHABLE)

	var result: Array = await http.request_completed
	http.queue_free()

	if int(result[0]) != HTTPRequest.RESULT_SUCCESS:
		return _result(REASON_UNREACHABLE)

	var status := int(result[1])
	var payload: PackedByteArray = result[3]
	var parsed = JSON.parse_string(payload.get_string_from_utf8())

	if status < 200 or status >= 300:
		return _result(REASON_REJECTED, {}, _sanitized_error_code(parsed))

	if typeof(parsed) != TYPE_DICTIONARY:
		return _result(REASON_REJECTED)

	return _result(REASON_NONE, parsed)

func _result(reason: String, data: Dictionary = {}, error_code: String = "") -> Dictionary:
	return {"reason": reason, "data": data, "error_code": error_code}

func _sanitized_error_code(payload: Variant) -> String:
	if typeof(payload) != TYPE_DICTIONARY:
		return ""

	var candidates := [
		str(payload.get("code", "")),
		str(payload.get("error_code", "")),
		str(payload.get("error", ""))
	]

	for candidate in candidates:
		var normalized: String = str(candidate).strip_edges().to_lower()
		if normalized == ERROR_IDENTITY_ALREADY_EXISTS:
			return ERROR_IDENTITY_ALREADY_EXISTS
		if ["identity_already_linked", ERROR_IDENTITY_CONFLICT].has(normalized):
			return ERROR_IDENTITY_CONFLICT

	return ""
