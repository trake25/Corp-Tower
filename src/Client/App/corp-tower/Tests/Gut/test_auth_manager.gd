extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.free()

func test_resolve_expiry_prefers_absolute_expires_at() -> void:
	assert_eq(
		auth._resolve_expiry({"expires_at": 1750000000, "expires_in": 3600}),
		1750000000,
		"An absolute expires_at should win over the relative expires_in."
	)

func test_resolve_expiry_falls_back_to_expires_in() -> void:
	var now := int(Time.get_unix_time_from_system())
	var resolved: int = auth._resolve_expiry({"expires_in": 3600})

	assert_almost_eq(
		resolved,
		now + 3600,
		2,
		"expires_in should resolve to an absolute unix time an hour out."
	)

func test_resolve_expiry_without_either_field_is_zero() -> void:
	assert_eq(
		auth._resolve_expiry({}),
		0,
		"A response carrying no expiry should resolve to 0, not a stale timestamp."
	)

func test_apply_session_rejects_a_payload_missing_tokens() -> void:
	assert_false(
		auth._apply_session({"access_token": "abc"}),
		"A payload without a refresh token must not be accepted as a session."
	)
	assert_eq(auth.access_token_value, "", "A rejected payload must not be stored.")

func test_apply_session_stores_tokens_and_identity() -> void:
	var applied: bool = auth._apply_session({
		"access_token": "access-value",
		"refresh_token": "refresh-value",
		"expires_in": 3600,
		"user": {"id": "user-uuid", "is_anonymous": true}
	})

	assert_true(applied, "A complete payload should be accepted.")
	assert_eq(auth.access_token_value, "access-value")
	assert_eq(auth.refresh_token_value, "refresh-value")
	assert_eq(auth.user_id, "user-uuid")
	assert_true(auth.is_anonymous, "An anonymous guest session should be flagged as such.")

func test_seconds_until_expiry_is_zero_without_a_session() -> void:
	assert_eq(
		auth.seconds_until_expiry(),
		0,
		"With no stored expiry the token must read as already expired."
	)

func test_access_token_is_empty_once_expired() -> void:
	auth._apply_session({
		"access_token": "access-value",
		"refresh_token": "refresh-value",
		"expires_at": int(Time.get_unix_time_from_system()) - 10
	})

	assert_eq(
		auth.access_token(),
		"",
		"An expired token must never reach the wire; the server falls back instead."
	)

func test_disabled_when_build_config_carries_no_supabase_url() -> void:
	if EndpointConfig.SUPABASE_URL != "":
		return

	assert_false(
		auth.is_enabled(),
		"An unconfigured build must leave AuthManager disabled."
	)
	assert_eq(
		auth.access_token(),
		"",
		"A disabled AuthManager must not put a token on the wire."
	)

func test_disabled_build_routes_to_the_sign_in_screen() -> void:
	if EndpointConfig.SUPABASE_URL != "":
		return

	var restored: bool = await auth.restore_session()

	assert_false(
		restored,
		"With auth off the splash must fall through to Sign-in, as it did before."
	)

func test_disabled_build_lets_guest_sign_in_succeed_without_a_network_call() -> void:
	if EndpointConfig.SUPABASE_URL != "":
		return

	var reason: String = await auth.sign_in_guest()

	assert_eq(
		reason,
		auth.REASON_NONE,
		"With auth off Play as Guest must go straight to Home, as it did before."
	)
