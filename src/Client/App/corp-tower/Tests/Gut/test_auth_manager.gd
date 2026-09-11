extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const WebFacebookAuthScript := preload("res://Sys/Auth/Web_Facebook_Auth.gd")

class FakeGoogleProviderSession extends Node:
	var reset_calls := 0
	var fresh_selection_calls := 0

	func reset_session(_server_client_id: String) -> bool:
		reset_calls += 1
		return true

	func sign_in_fresh(_server_client_id: String) -> bool:
		fresh_selection_calls += 1
		return true

class FakeFacebookProviderSession extends Node:
	var reset_calls := 0
	var fresh_selection_calls := 0

	func reset_session() -> bool:
		reset_calls += 1
		return true

	func sign_in_fresh() -> bool:
		fresh_selection_calls += 1
		return true

class FakeWebFacebookAuth extends WebFacebookAuthScript:
	var login_result: Dictionary = {}

	func take_login_result() -> Dictionary:
		return login_result

class WebFacebookLinkPreflightAuthManager extends AuthManagerScript:
	var web_launch_reason := REASON_NONE
	var native_readiness_calls := 0
	var native_selection_calls := 0

	func can_link_provider(provider: String) -> bool:
		return provider == "facebook"

	func facebook_link_route() -> String:
		return FACEBOOK_LINK_ROUTE_WEB_SDK

	func _begin_web_facebook_login(purpose: String) -> String:
		if web_launch_reason == REASON_NONE:
			web_facebook_login_purpose = purpose
			web_facebook_login_in_flight = true
		return web_launch_reason

	func _native_facebook_ready() -> bool:
		native_readiness_calls += 1
		return true

	func _begin_native_facebook_link_selection() -> bool:
		native_selection_calls += 1
		return true

class RecoveryAuthManager extends AuthManagerScript:
	func access_token() -> String:
		return access_token_value

class FakeCurrentProjectTransport extends RefCounted:
	var requests: Array = []
	var response: Dictionary = {}

	func get_request(path: String, bearer_token: String) -> Dictionary:
		requests.append({"path": path, "bearer_token": bearer_token})
		await Engine.get_main_loop().process_frame
		return response

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.sign_out()
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

func test_apply_session_retains_linked_provider_and_profile_name() -> void:
	var applied: bool = auth._apply_session({
		"access_token": "access-value",
		"refresh_token": "refresh-value",
		"expires_in": 3600,
		"user": {
			"id": "linked-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "google"},
			"user_metadata": {"full_name": "Ada Player"}
		}
	})

	assert_true(applied)
	assert_eq(auth.current_provider, "google")
	assert_eq(auth.display_name, "Ada Player")

func test_google_provider_email_is_retained_only_for_google_presentation() -> void:
	auth._apply_session({
		"access_token": "access-value",
		"refresh_token": "refresh-value",
		"expires_in": 3600,
		"user": {
			"id": "linked-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "google"},
			"identities": [{
				"provider": "google",
				"identity_data": {"email": "enriqueta@gmail.com"}
			}]
		}
	})

	assert_eq(auth.google_email, "enriqueta@gmail.com")

	auth._apply_session({
		"access_token": "facebook-access",
		"refresh_token": "facebook-refresh",
		"expires_in": 3600,
		"user": {
			"id": "facebook-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "facebook"},
			"user_metadata": {"email": "do-not-show@example.com"}
		}
	})

	assert_eq(auth.google_email, "")

func test_anonymous_session_clears_linked_presentation_metadata() -> void:
	auth.current_provider = "facebook"
	auth.display_name = "Previous Player"
	auth.google_email = "previous@example.com"

	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})

	assert_eq(auth.current_provider, "")
	assert_eq(auth.display_name, "")
	assert_eq(auth.google_email, "")

func test_sign_out_clears_presentation_metadata() -> void:
	auth.current_provider = "google"
	auth.display_name = "Ada Player"
	auth.google_email = "ada@example.com"
	auth.sign_out()

	assert_eq(auth.current_provider, "")
	assert_eq(auth.display_name, "")
	assert_eq(auth.google_email, "")

func test_native_provider_session_reset_preserves_the_current_guest_session() -> void:
	var google = FakeGoogleProviderSession.new()
	var facebook = FakeFacebookProviderSession.new()
	auth.google_signin_node = google
	auth.facebook_signin_node = facebook
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "durable-guest-user", "is_anonymous": true}
	})

	auth._reset_native_provider_sessions()

	assert_eq(google.reset_calls, 1)
	assert_eq(facebook.reset_calls, 1)
	assert_eq(google.fresh_selection_calls, 0)
	assert_eq(facebook.fresh_selection_calls, 0)
	assert_eq(auth.user_id, "durable-guest-user")
	assert_true(auth.is_anonymous)
	assert_eq(auth.current_provider, "")

	auth.google_signin_node = null
	auth.facebook_signin_node = null
	google.free()
	facebook.free()

func test_sign_out_resets_provider_sessions_without_launching_provider_selection() -> void:
	var google = FakeGoogleProviderSession.new()
	var facebook = FakeFacebookProviderSession.new()
	auth.google_signin_node = google
	auth.facebook_signin_node = facebook
	auth.native_signin_in_flight = true
	auth.oauth_in_flight = true
	auth.pending_link_session = {"access_token": "staged-access"}
	auth.pending_link_provider_value = "google"

	auth.sign_out()

	assert_eq(google.reset_calls, 1)
	assert_eq(facebook.reset_calls, 1)
	assert_eq(google.fresh_selection_calls, 0)
	assert_eq(facebook.fresh_selection_calls, 0)
	assert_false(auth.native_signin_in_flight)
	assert_false(auth.oauth_in_flight)
	assert_false(auth.has_pending_provider_link())

	auth.google_signin_node = null
	auth.facebook_signin_node = null
	google.free()
	facebook.free()

func test_presentation_metadata_restores_with_the_saved_session() -> void:
	auth.access_token_value = "access-value"
	auth.refresh_token_value = "refresh-value"
	auth.expires_at_unix = int(Time.get_unix_time_from_system()) + 3600
	auth.current_provider = "google"
	auth.display_name = "Ada Player"
	auth.google_email = "ada@example.com"
	auth._save_session()
	var restored = AuthManagerScript.new()
	restored._load_session()

	assert_eq(restored.current_provider, "google")
	assert_eq(restored.display_name, "Ada Player")
	assert_eq(restored.google_email, "ada@example.com")
	restored.free()

func test_link_id_token_body_uses_authenticated_manual_linking_semantics() -> void:
	var body: Dictionary = auth._build_link_id_token_body("google-id-token")

	assert_eq(body["provider"], "google")
	assert_eq(body["id_token"], "google-id-token")
	assert_eq(body["link_identity"], true)
	assert_eq(body["client_id"], EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID)

func test_link_session_staging_requires_the_original_guest_user() -> void:
	var flow := {
		"purpose": auth.FLOW_LINK,
		"provider": "google",
		"pre_link_user_id": "guest-user"
	}

	assert_eq(auth._stage_link_session({
		"access_token": "linked-access",
		"refresh_token": "linked-refresh",
		"user": {"id": "another-user", "is_anonymous": false}
	}, flow), auth.REASON_REJECTED)
	assert_false(auth.has_pending_provider_link())

	assert_eq(auth._stage_link_session({
		"access_token": "linked-access",
		"refresh_token": "linked-refresh",
		"user": {
			"id": "guest-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "google"},
			"user_metadata": {"full_name": "Provider Name"}
		}
	}, flow), auth.REASON_NONE)
	assert_true(auth.has_pending_provider_link())
	assert_eq(auth.pending_link_provider(), "google")

func test_link_intent_persists_only_the_provider_and_original_guest_identity() -> void:
	auth._save_link_flow("google", "guest-user")
	var restored = AuthManagerScript.new()
	var flow := restored._load_link_flow()

	assert_eq(flow.get("purpose", ""), auth.FLOW_LINK)
	assert_eq(flow.get("provider", ""), "google")
	assert_eq(flow.get("pre_link_user_id", ""), "guest-user")
	assert_false(flow.has("state"), "Supabase owns callback state for manual linking.")
	assert_eq(
		await restored._consume_link_callback({
			"code": "",
			"error": "access_denied"
		}),
		auth.REASON_CANCELLED
	)
	restored.free()

func test_partial_google_link_recovery_requires_current_guest_and_only_google() -> void:
	var flow := {
		"purpose": auth.FLOW_LINK,
		"provider": "google",
		"pre_link_user_id": "guest-user"
	}

	assert_true(auth._is_recoverable_google_link_user({
		"id": "guest-user",
		"identities": [{"provider": "google"}]
	}, flow))
	assert_false(auth._is_recoverable_google_link_user({
		"id": "other-user",
		"identities": [{"provider": "google"}]
	}, flow))
	assert_false(auth._is_recoverable_google_link_user({
		"id": "guest-user",
		"identities": [{"provider": "google"}, {"provider": "facebook"}]
	}, flow))

func test_partial_google_link_recovery_uses_only_the_current_auth_transport() -> void:
	var recovery = RecoveryAuthManager.new()
	var transport = FakeCurrentProjectTransport.new()
	transport.response = {
		"reason": recovery.REASON_NONE,
		"data": {
			"id": "guest-user",
			"is_anonymous": false,
			"identities": [{"provider": "google"}]
		}
	}
	recovery.auth_transport = transport
	recovery._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})

	assert_eq(await recovery._recover_existing_google_link({
		"purpose": recovery.FLOW_LINK,
		"provider": "google",
		"pre_link_user_id": "guest-user"
	}), recovery.REASON_NONE)
	assert_eq(transport.requests, [{
		"path": "/auth/v1/user", "bearer_token": "guest-access"
	}])
	assert_true(recovery.has_pending_provider_link())
	assert_eq(recovery.pending_link_provider(), "google")
	assert_true(recovery.is_anonymous, "Recovery must stage rather than finalize the Guest locally.")
	recovery.free()

func test_web_oauth_navigation_marks_sign_in_and_link_attempts_in_flight() -> void:
	var starts: Array = []
	auth.web_oauth_navigation_started.connect(
		func(provider: String, purpose: String): starts.append([provider, purpose])
	)

	auth._mark_web_oauth_navigation_started("google", auth.FLOW_SIGN_IN)
	assert_true(auth.oauth_in_flight)
	assert_eq(starts, [["google", auth.FLOW_SIGN_IN]])

	auth.oauth_in_flight = false
	auth._mark_web_oauth_navigation_started("google", auth.FLOW_LINK)
	assert_true(auth.oauth_in_flight)
	assert_eq(starts, [
		["google", auth.FLOW_SIGN_IN],
		["google", auth.FLOW_LINK]
	])

func test_interrupted_web_sign_in_is_a_browser_failure_and_clears_pkce_state() -> void:
	var completions: Array[String] = []
	auth.oauth_completed.connect(func(reason: String): completions.append(reason))
	auth._save_verifier("web-sign-in-verifier")
	auth.oauth_in_flight = true

	assert_eq(auth._reject_unresolved_oauth_after_resume(true), auth.REASON_BROWSER)

	assert_false(auth.oauth_in_flight)
	assert_eq(completions, [auth.REASON_BROWSER])
	assert_eq(auth._load_verifier(), "")

func test_interrupted_web_link_preserves_guest_and_clears_callback_authority() -> void:
	var completions: Array[String] = []
	auth.provider_link_completed.connect(func(reason: String): completions.append(reason))
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	auth._save_link_flow("google", "guest-user")
	auth._save_verifier("web-link-verifier")
	auth.oauth_in_flight = true

	assert_eq(auth._reject_unresolved_oauth_after_resume(true), auth.REASON_BROWSER)

	assert_false(auth.oauth_in_flight)
	assert_eq(completions, [auth.REASON_BROWSER])
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_false(auth.has_pending_provider_link())
	assert_false(auth._has_active_link_flow())
	assert_eq(auth._load_verifier(), "")

func test_android_oauth_resume_keeps_existing_cancel_semantics() -> void:
	var completions: Array[String] = []
	auth.oauth_completed.connect(func(reason: String): completions.append(reason))
	auth._save_verifier("android-verifier")
	auth.oauth_in_flight = true

	assert_eq(auth._reject_unresolved_oauth_after_resume(false), auth.REASON_CANCELLED)
	assert_eq(completions, [auth.REASON_CANCELLED])
	assert_eq(auth._load_verifier(), "")

func test_web_facebook_route_uses_sdk_while_android_stays_native() -> void:
	assert_eq(
		auth._facebook_link_route_for_runtime(true, "Web"),
		auth.FACEBOOK_LINK_ROUTE_WEB_SDK
	)
	assert_eq(
		auth._facebook_link_route_for_runtime(false, "Android"),
		auth.FACEBOOK_LINK_ROUTE_NATIVE
	)
	assert_eq(auth._facebook_link_route_for_runtime(false, "Linux"), "")

func test_web_facebook_sdk_uses_browser_credentials_without_redirect_oauth() -> void:
	var web_facebook = WebFacebookAuthScript.new()
	var bootstrap := web_facebook._initialize_script("test-app-id")
	var login := web_facebook._begin_login_script()

	assert_true(bootstrap.contains("window.FB.init"))
	assert_true(bootstrap.contains("test-app-id"))
	assert_true(login.contains("window.FB.login"))
	assert_true(login.contains("authResponse"))
	assert_true(login.contains("expiresIn"))
	assert_true(login.contains("reauthenticate"))
	assert_true(login.contains("bridge.result = result"))
	assert_true(login.contains("window.focus()"))
	assert_lt(login.find("bridge.result = result"), login.find("window.focus()"))
	assert_eq(login.count("resolve({"), 2)
	assert_false(login.contains("window.location"))
	assert_false(login.contains("window.open"))
	assert_false(login.contains("window.close"))
	assert_false(login.contains("supabase"))

func test_web_facebook_link_preflight_starts_sdk_without_native_fallthrough() -> void:
	var web_auth = WebFacebookLinkPreflightAuthManager.new()

	assert_eq(web_auth.begin_facebook_link_preflight(), web_auth.REASON_NONE)
	assert_eq(web_auth.active_flow_purpose, web_auth.FLOW_FACEBOOK_LINK_PREFLIGHT)
	assert_true(web_auth.web_facebook_login_in_flight)
	assert_eq(web_auth.web_facebook_login_purpose, web_auth.FLOW_FACEBOOK_LINK_PREFLIGHT)
	assert_eq(web_auth.native_readiness_calls, 0)
	assert_eq(web_auth.native_selection_calls, 0)

	web_auth.free()

func test_web_facebook_link_preflight_start_failure_is_retryable_and_restores_flow() -> void:
	var web_auth = WebFacebookLinkPreflightAuthManager.new()
	web_auth.web_launch_reason = web_auth.REASON_BROWSER
	web_auth.active_flow_purpose = web_auth.FLOW_LINK

	assert_eq(web_auth.begin_facebook_link_preflight(), web_auth.REASON_BROWSER)
	assert_eq(web_auth.active_flow_purpose, web_auth.FLOW_SIGN_IN)
	assert_false(web_auth.web_facebook_login_in_flight)
	assert_eq(web_auth.native_readiness_calls, 0)
	assert_eq(web_auth.native_selection_calls, 0)

	web_auth.free()

func test_web_facebook_link_credential_stages_without_mutating_guest() -> void:
	var ready_credentials: Array[String] = []
	var web_facebook = FakeWebFacebookAuth.new()
	auth.facebook_link_credential_ready.connect(
		func(credential: String): ready_credentials.append(credential)
	)
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	auth.web_facebook_auth = web_facebook
	auth.active_flow_purpose = auth.FLOW_FACEBOOK_LINK_PREFLIGHT
	auth.web_facebook_login_purpose = auth.FLOW_FACEBOOK_LINK_PREFLIGHT
	auth.web_facebook_login_in_flight = true
	web_facebook.login_result = {
		"access_token": "web-facebook-token",
		"expires_in": 3600
	}

	auth._process(0.0)

	assert_eq(ready_credentials, ["web-facebook-token"])
	assert_true(auth.has_pending_native_facebook_link())
	assert_eq(auth.pending_native_facebook_credential(), "web-facebook-token")
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_eq(auth.current_provider, "")
	assert_eq(auth.facebook_access_token_value, "")

func test_provider_link_result_keeps_only_its_provider_metadata_until_consumed() -> void:
	auth._save_link_flow("google", "guest-user")
	auth._record_provider_link_result(auth.REASON_REJECTED, false)

	assert_true(auth.has_provider_link_result())
	assert_eq(auth.provider_link_result_provider(), "google")
	assert_eq(auth.take_provider_link_result(), auth.REASON_REJECTED)
	assert_eq(auth.provider_link_result_provider(), "")

func test_finishing_or_rejecting_a_link_preserves_the_guest_until_accepted() -> void:
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	var flow := {
		"purpose": auth.FLOW_LINK,
		"provider": "google",
		"pre_link_user_id": "guest-user"
	}
	auth._stage_link_session({
		"access_token": "linked-access",
		"refresh_token": "linked-refresh",
		"expires_in": 3600,
		"user": {
			"id": "guest-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "google"}
		}
	}, flow)

	auth.reject_provider_link()
	assert_eq(auth.access_token_value, "guest-access")
	assert_true(auth.is_anonymous)

	auth._stage_link_session({
		"access_token": "linked-access",
		"refresh_token": "linked-refresh",
		"expires_in": 3600,
		"user": {
			"id": "guest-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "google"}
		}
	}, flow)
	assert_true(auth.finish_provider_link())
	assert_eq(auth.access_token_value, "linked-access")
	assert_false(auth.is_anonymous)
	assert_eq(auth.current_provider, "google")

func test_native_facebook_link_stages_credential_without_mutating_guest() -> void:
	var expires_at := int(Time.get_unix_time_from_system()) + 3600
	var ready_credentials: Array[String] = []
	auth.facebook_link_credential_ready.connect(
		func(credential: String): ready_credentials.append(credential)
	)
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	auth.active_flow_purpose = auth.FLOW_FACEBOOK_LINK_PREFLIGHT
	auth.native_signin_in_flight = true

	auth._on_facebook_sign_in_success("native-facebook-token", expires_at)

	assert_eq(ready_credentials, ["native-facebook-token"])
	assert_true(auth.has_pending_provider_link())
	assert_true(auth.has_pending_native_facebook_link())
	assert_eq(auth.pending_link_provider(), "facebook")
	assert_eq(auth.pending_native_facebook_credential(), "native-facebook-token")
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_eq(auth.current_provider, "")
	assert_eq(auth.facebook_access_token_value, "")

func test_native_facebook_link_finalizes_only_after_acceptance() -> void:
	var expires_at := int(Time.get_unix_time_from_system()) + 3600
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	assert_true(auth._stage_native_facebook_link_credential("native-facebook-token", expires_at))

	auth.reject_provider_link()
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_eq(auth.current_provider, "")
	assert_eq(auth.facebook_access_token_value, "")

	assert_true(auth._stage_native_facebook_link_credential("native-facebook-token", expires_at))
	assert_true(auth.finish_native_facebook_provider_link())
	assert_eq(auth.access_token_value, "")
	assert_eq(auth.refresh_token_value, "")
	assert_eq(auth.user_id, "guest-user")
	assert_false(auth.is_anonymous)
	assert_eq(auth.current_provider, "facebook")
	assert_eq(auth.facebook_access_token_value, "native-facebook-token")
	assert_eq(auth.facebook_expires_at_unix, expires_at)
	assert_false(auth.has_pending_provider_link())
	var restored = AuthManagerScript.new()
	restored._load_session()
	assert_eq(restored.user_id, "guest-user")
	assert_eq(restored.current_provider, "facebook")
	assert_eq(restored.facebook_access_token_value, "native-facebook-token")
	assert_eq(restored.access_token_value, "")
	restored.free()

func test_native_facebook_link_rejects_invalid_staged_credential() -> void:
	var failures: Array[String] = []
	auth.facebook_link_preflight_failed.connect(
		func(reason: String): failures.append(reason)
	)
	auth.active_flow_purpose = auth.FLOW_FACEBOOK_LINK_PREFLIGHT
	auth.native_signin_in_flight = true

	auth._on_facebook_sign_in_success(
		"native-facebook-token", int(Time.get_unix_time_from_system()) - 1
	)

	assert_eq(failures, [auth.REASON_REJECTED])
	assert_false(auth.has_pending_provider_link())
	assert_eq(auth.facebook_access_token_value, "")

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
