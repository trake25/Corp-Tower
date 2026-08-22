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
