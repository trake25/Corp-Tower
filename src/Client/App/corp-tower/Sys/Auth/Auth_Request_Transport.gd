extends RefCounted

const REQUEST_TIMEOUT_SECONDS := 12.0
const REASON_NONE := ""
const REASON_UNREACHABLE := "unreachable"
const REASON_REJECTED := "rejected"

var request_host: Node = null
var base_url := ""
var anon_key := ""

func bind_nodes(host: Node) -> void:
	request_host = host

func setup(base_url_value: String, anon_key_value: String) -> void:
	base_url = base_url_value.rstrip("/")
	anon_key = anon_key_value

func post(path: String, body: Dictionary) -> Dictionary:
	if request_host == null or base_url == "" or anon_key == "":
		return {"reason": REASON_UNREACHABLE, "data": {}}

	var http := HTTPRequest.new()
	http.timeout = REQUEST_TIMEOUT_SECONDS
	request_host.add_child(http)

	var headers := PackedStringArray([
		"Content-Type: application/json",
		"apikey: " + anon_key,
		"Authorization: Bearer " + anon_key
	])

	var error := http.request(
		base_url + path, headers, HTTPClient.METHOD_POST, JSON.stringify(body)
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

	if status < 200 or status >= 300:
		return {"reason": REASON_REJECTED, "data": {}}

	var parsed = JSON.parse_string(payload.get_string_from_utf8())

	if typeof(parsed) != TYPE_DICTIONARY:
		return {"reason": REASON_REJECTED, "data": {}}

	return {"reason": REASON_NONE, "data": parsed}
