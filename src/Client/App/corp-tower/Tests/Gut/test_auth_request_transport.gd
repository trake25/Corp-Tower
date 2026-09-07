extends GutTest

const AuthRequestTransportScript := preload("res://Sys/Auth/Auth_Request_Transport.gd")

func test_post_without_bound_request_host_is_unreachable() -> void:
	var transport = AuthRequestTransportScript.new()
	transport.setup("https://example.invalid", "anon-key")

	var result: Dictionary = await transport.post("/token", {"grant_type": "test"})

	assert_eq(result.get("reason", ""), "unreachable")
	assert_eq(result.get("data", null), {})

func test_setup_normalizes_trailing_slashes() -> void:
	var transport = AuthRequestTransportScript.new()
	transport.setup("https://example.invalid///", "anon-key")

	assert_eq(transport.base_url, "https://example.invalid")

func test_identity_conflict_is_retained_as_a_sanitized_auth_error_code() -> void:
	var transport = AuthRequestTransportScript.new()

	assert_eq(
		transport._sanitized_error_code({"code": "identity_already_exists"}),
		"identity_conflict"
	)
	assert_eq(transport._sanitized_error_code({"message": "sensitive raw response"}), "")
