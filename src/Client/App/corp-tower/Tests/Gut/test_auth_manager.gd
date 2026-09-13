extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")

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

class PcWebFacebookLinkPreflightAuthManager extends AuthManagerScript:
	var web_launch_reason := REASON_NONE
	var web_launch_purpose := ""
	var native_readiness_calls := 0
	var native_selection_calls := 0

	func can_link_provider(provider: String) -> bool:
		return provider == "facebook"

	func facebook_link_route() -> String:
		return FACEBOOK_LINK_ROUTE_WEB_PC

	func _begin_web_facebook_login(purpose: String) -> String:
		web_launch_purpose = purpose
		return web_launch_reason

class MobileWebFacebookFreshAuthManager extends AuthManagerScript:
	var mobile_fresh_sign_in_calls := 0
	var generic_browser_sign_in_calls := 0
	var pc_web_sign_in_calls := 0

	func is_oauth_enabled() -> bool:
		return true

	func _is_mobile_web_facebook_runtime() -> bool:
		return true

	func _sign_in_with_mobile_web_facebook() -> String:
		mobile_fresh_sign_in_calls += 1
		return REASON_NONE

	func _sign_in_with_browser(_provider: String) -> String:
		generic_browser_sign_in_calls += 1
		return REASON_NONE

	func _sign_in_with_web_facebook() -> String:
		pc_web_sign_in_calls += 1
		return REASON_NONE

class MobileWebFacebookLinkAuthManager extends AuthManagerScript:
	var mobile_link_calls := 0

	func can_link_provider(provider: String) -> bool:
		return provider == "facebook"

	func _is_mobile_web_facebook_runtime() -> bool:
		return true

	func _begin_mobile_web_facebook_link() -> String:
		mobile_link_calls += 1
		return REASON_NONE

class MobileWebFacebookHandoffAuthManager extends AuthManagerScript:
	const OWNER_TAB_ID := "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	const FLOW_ID := "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	const MISMATCHED_FLOW_ID := "ccccccccccccccccccccccccccccccccccccccccccc"

	var handoff_now := 2000000000
	var owner_tab_id := OWNER_TAB_ID
	var owner_transaction: Dictionary = {}
	var shared_transaction: Dictionary = {}
	var shared_result: Dictionary = {}
	var link_flow: Dictionary = {}
	var verifier := ""
	var exchanged_requests: Array[Dictionary] = []
	var link_callback_reason := REASON_NONE
	var stage_link_callback := false
	var callback_query_clears := 0
	var secondary_close_attempts := 0

	func _is_web_handoff_bridge_available() -> bool:
		return true

	func _is_mobile_web_facebook_runtime() -> bool:
		return true

	func _mobile_web_facebook_handoff_now_unix() -> int:
		return handoff_now

	func _mobile_web_facebook_handoff_random_id() -> String:
		return FLOW_ID

	func redirect_uri() -> String:
		return "https://play.example.com/"

	func _load_mobile_web_facebook_handoff_owner_tab_id() -> String:
		return owner_tab_id

	func _save_mobile_web_facebook_handoff_owner_tab_id(value: String) -> bool:
		owner_tab_id = value
		return true

	func _load_mobile_web_facebook_handoff_owner_transaction() -> Dictionary:
		return owner_transaction.duplicate(true)

	func _save_mobile_web_facebook_handoff_owner_transaction(transaction: Dictionary) -> bool:
		owner_transaction = transaction.duplicate(true)
		return true

	func _load_mobile_web_facebook_handoff_shared_transaction(_flow_id: String) -> Dictionary:
		return shared_transaction.duplicate(true)

	func _save_mobile_web_facebook_handoff_shared_transaction(
		_flow_id: String,
		transaction: Dictionary
	) -> bool:
		shared_transaction = transaction.duplicate(true)
		return true

	func _load_mobile_web_facebook_handoff_shared_result(_flow_id: String) -> Dictionary:
		return shared_result.duplicate(true)

	func _save_mobile_web_facebook_handoff_shared_result(
		_flow_id: String,
		result: Dictionary
	) -> bool:
		shared_result = result.duplicate(true)
		return true

	func _clear_mobile_web_facebook_handoff_owner_transaction(
		expected_purpose: String = ""
	) -> void:
		if (
			not owner_transaction.is_empty()
			and expected_purpose != ""
			and str(owner_transaction.get("purpose", "")) != expected_purpose
		):
			return

		owner_transaction = {}
		shared_transaction = {}
		shared_result = {}
		mobile_web_facebook_handoff_result_consuming = false
		mobile_web_facebook_handoff_last_poll_msec = 0

	func _set_mobile_web_facebook_handoff_terminal(message: String) -> void:
		mobile_web_facebook_handoff_terminal_message = message

	func has_mobile_web_facebook_handoff_terminal() -> bool:
		return mobile_web_facebook_handoff_terminal_message != ""

	func mobile_web_facebook_handoff_terminal_copy() -> String:
		return mobile_web_facebook_handoff_terminal_message

	func _clear_mobile_web_facebook_handoff_terminal() -> void:
		mobile_web_facebook_handoff_terminal_message = ""

	func _clear_mobile_web_facebook_handoff_callback_query() -> void:
		callback_query_clears += 1

	func _attempt_mobile_web_facebook_handoff_secondary_close() -> void:
		secondary_close_attempts += 1

	func _save_verifier(value: String) -> void:
		verifier = value

	func _load_verifier() -> String:
		return verifier

	func _clear_verifier() -> void:
		verifier = ""

	func _save_link_flow(provider: String, pre_link_user_id: String) -> void:
		link_flow = {
			"purpose": FLOW_LINK,
			"provider": provider,
			"pre_link_user_id": pre_link_user_id
		}

	func _load_link_flow() -> Dictionary:
		return link_flow.duplicate(true)

	func _clear_link_flow() -> void:
		link_flow = {}

	func _exchange_code(code: String) -> String:
		exchanged_requests.append({"code": code, "verifier": _load_verifier()})
		_clear_verifier()
		return REASON_NONE

	func _consume_link_callback(_callback: Dictionary) -> String:
		if stage_link_callback and link_callback_reason == REASON_NONE:
			pending_link_session = {
				"access_token": "linked-access",
				"refresh_token": "linked-refresh",
				"user": {"id": user_id, "is_anonymous": false}
			}
			pending_link_provider_value = "facebook"
		return link_callback_reason

class RecoveryAuthManager extends AuthManagerScript:
	func access_token() -> String:
		return access_token_value

class FakeCurrentProjectTransport extends RefCounted:
	var requests: Array = []
	var response: Dictionary = {}
	var post_requests: Array = []
	var post_response: Dictionary = {}

	func get_request(path: String, bearer_token: String) -> Dictionary:
		requests.append({"path": path, "bearer_token": bearer_token})
		await Engine.get_main_loop().process_frame
		return response

	func post(path: String, body: Dictionary) -> Dictionary:
		post_requests.append({"path": path, "body": body})
		await Engine.get_main_loop().process_frame
		return post_response

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

func test_mobile_web_facebook_fresh_sign_in_uses_backup_route_without_in_flight() -> void:
	var mobile_auth = MobileWebFacebookFreshAuthManager.new()

	assert_eq(mobile_auth.sign_in_with_provider("facebook"), mobile_auth.REASON_NONE)
	assert_eq(mobile_auth.mobile_fresh_sign_in_calls, 1)
	assert_eq(mobile_auth.generic_browser_sign_in_calls, 0)
	assert_eq(mobile_auth.pc_web_sign_in_calls, 0)
	assert_false(mobile_auth.oauth_in_flight)

	assert_eq(mobile_auth.sign_in_with_provider("google"), mobile_auth.REASON_NONE)
	assert_eq(mobile_auth.mobile_fresh_sign_in_calls, 1)
	assert_eq(mobile_auth.generic_browser_sign_in_calls, 1)
	assert_eq(mobile_auth.pc_web_sign_in_calls, 0)
	mobile_auth.free()

func test_mobile_web_facebook_handoff_transaction_is_bounded_and_non_secret() -> void:
	var handoff = MobileWebFacebookHandoffAuthManager.new()
	handoff.oauth_in_flight = true
	var transaction := handoff._begin_mobile_web_facebook_handoff_transaction(
		handoff.FLOW_SIGN_IN
	)

	assert_eq(transaction.get("flow_id", ""), handoff.FLOW_ID)
	assert_eq(transaction.get("owner_tab_id", ""), handoff.OWNER_TAB_ID)
	assert_eq(transaction.get("purpose", ""), handoff.FLOW_SIGN_IN)
	assert_eq(
		transaction.get("expires_at_unix", 0),
		handoff.handoff_now + handoff.WEB_FACEBOOK_FLOW_TTL_SECONDS
	)
	assert_eq(handoff.owner_transaction, transaction)
	assert_eq(handoff.shared_transaction, transaction)
	assert_false(transaction.has("code_verifier"))
	assert_false(transaction.has("access_token"))
	assert_false(transaction.has("refresh_token"))
	assert_false(transaction.has("guest_credential"))

	var redirect_to := handoff._build_mobile_web_facebook_handoff_redirect_to(transaction)
	assert_true(redirect_to.begins_with("https://play.example.com/?ct_fb_flow="))
	assert_true(redirect_to.contains("ct_fb_owner=" + handoff.OWNER_TAB_ID))
	assert_true(redirect_to.contains("ct_fb_purpose=sign_in"))
	assert_false(handoff.oauth_in_flight)
	handoff.free()

func test_mobile_web_facebook_handoff_same_tab_uses_its_original_verifier() -> void:
	var handoff = MobileWebFacebookHandoffAuthManager.new()
	var transaction := handoff._begin_mobile_web_facebook_handoff_transaction(
		handoff.FLOW_SIGN_IN
	)
	handoff._save_verifier("owner-tab-verifier")

	assert_eq(await handoff._consume_mobile_web_facebook_handoff_callback({
		"code": "same-tab-code",
		"mobile_facebook_flow": transaction["flow_id"],
		"mobile_facebook_owner": transaction["owner_tab_id"],
		"mobile_facebook_purpose": transaction["purpose"]
	}), handoff.REASON_NONE)
	assert_eq(handoff.exchanged_requests, [{
		"code": "same-tab-code", "verifier": "owner-tab-verifier"
	}])
	assert_eq(handoff.callback_query_clears, 1)
	assert_true(handoff.owner_transaction.is_empty())
	assert_true(handoff.shared_transaction.is_empty())
	assert_false(handoff.has_mobile_web_facebook_handoff_terminal())
	handoff.free()

func test_mobile_web_facebook_link_handoff_keeps_guest_state_tab_scoped() -> void:
	var handoff = MobileWebFacebookHandoffAuthManager.new()
	handoff._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	handoff._save_link_flow("facebook", "guest-user")
	var transaction := handoff._begin_mobile_web_facebook_handoff_transaction(
		handoff.FLOW_LINK
	)

	assert_eq(transaction.get("purpose", ""), handoff.FLOW_LINK)
	assert_eq(handoff._load_link_flow().get("pre_link_user_id", ""), "guest-user")
	assert_eq(handoff.user_id, "guest-user")
	assert_true(handoff.is_anonymous)
	assert_false(handoff.shared_transaction.has("pre_link_user_id"))
	assert_false(handoff.shared_transaction.has("access_token"))
	assert_false(handoff.shared_transaction.has("refresh_token"))
	handoff.free()

func test_mobile_web_facebook_secondary_callback_forwards_once_and_owner_exchanges_once() -> void:
	var owner = MobileWebFacebookHandoffAuthManager.new()
	var transaction := owner._begin_mobile_web_facebook_handoff_transaction(owner.FLOW_SIGN_IN)
	owner._save_verifier("owner-only-verifier")
	var secondary = MobileWebFacebookHandoffAuthManager.new()
	secondary.shared_transaction = owner.shared_transaction.duplicate(true)
	var callback := {
		"code": "forwarded-code",
		"mobile_facebook_flow": transaction["flow_id"],
		"mobile_facebook_owner": transaction["owner_tab_id"],
		"mobile_facebook_purpose": transaction["purpose"]
	}

	assert_eq(
		await secondary._consume_mobile_web_facebook_handoff_callback(callback),
		secondary.REASON_NONE
	)
	assert_true(secondary.exchanged_requests.is_empty())
	assert_eq(
		secondary.mobile_web_facebook_handoff_terminal_copy(),
		secondary.MOBILE_WEB_FACEBOOK_HANDOFF_SECONDARY_SUCCESS_MESSAGE
	)
	assert_eq(secondary.secondary_close_attempts, 1)
	assert_false(secondary.shared_result.is_empty())
	assert_false(secondary.shared_result.has("code_verifier"))
	assert_false(secondary.shared_result.has("access_token"))
	assert_false(secondary.shared_result.has("refresh_token"))
	assert_false(secondary.shared_result.has("guest_credential"))

	assert_eq(
		await secondary._consume_mobile_web_facebook_handoff_callback(callback),
		secondary.REASON_NONE
	)
	assert_true(secondary.exchanged_requests.is_empty())
	assert_eq(
		secondary.mobile_web_facebook_handoff_terminal_copy(),
		secondary.MOBILE_WEB_FACEBOOK_HANDOFF_SECONDARY_FAILURE_MESSAGE
	)

	owner.shared_transaction = secondary.shared_transaction.duplicate(true)
	owner.shared_result = secondary.shared_result.duplicate(true)
	owner.mobile_web_facebook_handoff_last_poll_msec = -1000
	await owner._poll_mobile_web_facebook_handoff()

	assert_eq(owner.exchanged_requests, [{
		"code": "forwarded-code", "verifier": "owner-only-verifier"
	}])
	assert_true(owner.owner_transaction.is_empty())
	assert_true(owner.shared_result.is_empty())
	owner.free()
	secondary.free()

func test_mobile_web_facebook_recovered_link_stages_the_original_guest_before_commit() -> void:
	var owner = MobileWebFacebookHandoffAuthManager.new()
	var completions: Array[String] = []
	owner.provider_link_completed.connect(func(reason: String): completions.append(reason))
	owner._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	owner._save_link_flow("facebook", "guest-user")
	owner.stage_link_callback = true
	var transaction := owner._begin_mobile_web_facebook_handoff_transaction(owner.FLOW_LINK)
	owner._save_verifier("guest-owner-verifier")
	owner.shared_result = {
		"flow_id": transaction["flow_id"],
		"owner_tab_id": transaction["owner_tab_id"],
		"purpose": transaction["purpose"],
		"code": "forwarded-link-code",
		"error": "",
		"error_code": "",
		"delivered_at_unix": owner.handoff_now
	}
	owner.mobile_web_facebook_handoff_last_poll_msec = -1000

	await owner._poll_mobile_web_facebook_handoff()

	assert_eq(completions, [owner.REASON_NONE])
	assert_true(owner.has_pending_provider_link())
	assert_eq(owner.pending_link_provider(), "facebook")
	assert_eq(owner.user_id, "guest-user")
	assert_true(owner.is_anonymous)
	owner.free()

func test_mobile_web_facebook_handoff_mismatch_and_missing_owner_fail_closed() -> void:
	var owner = MobileWebFacebookHandoffAuthManager.new()
	var transaction := owner._begin_mobile_web_facebook_handoff_transaction(owner.FLOW_SIGN_IN)
	owner._save_verifier("owner-verifier")

	assert_eq(await owner._consume_mobile_web_facebook_handoff_callback({
		"code": "mismatched-code",
		"mobile_facebook_flow": owner.MISMATCHED_FLOW_ID,
		"mobile_facebook_owner": transaction["owner_tab_id"],
		"mobile_facebook_purpose": transaction["purpose"]
	}), owner.REASON_MOBILE_FACEBOOK_HANDOFF)
	assert_true(owner.exchanged_requests.is_empty())
	assert_eq(owner._load_verifier(), "")

	var orphan = MobileWebFacebookHandoffAuthManager.new()
	assert_eq(await orphan._consume_mobile_web_facebook_handoff_callback({
		"code": "orphan-code",
		"mobile_facebook_flow": orphan.FLOW_ID,
		"mobile_facebook_owner": orphan.OWNER_TAB_ID,
		"mobile_facebook_purpose": orphan.FLOW_SIGN_IN
	}), orphan.REASON_NONE)
	assert_true(orphan.exchanged_requests.is_empty())
	assert_eq(
		orphan.mobile_web_facebook_handoff_terminal_copy(),
		orphan.MOBILE_WEB_FACEBOOK_HANDOFF_SECONDARY_FAILURE_MESSAGE
	)
	owner.free()
	orphan.free()

func test_mobile_web_facebook_handoff_watchdog_completes_once_and_preserves_guest_linking() -> void:
	var fresh = MobileWebFacebookHandoffAuthManager.new()
	var fresh_completions: Array[String] = []
	fresh.oauth_completed.connect(func(reason: String): fresh_completions.append(reason))
	var fresh_transaction := fresh._begin_mobile_web_facebook_handoff_transaction(fresh.FLOW_SIGN_IN)
	fresh_transaction["expires_at_unix"] = fresh.handoff_now
	fresh.owner_transaction = fresh_transaction
	fresh._save_verifier("expired-owner-verifier")

	await fresh._poll_mobile_web_facebook_handoff()
	await fresh._poll_mobile_web_facebook_handoff()
	assert_eq(fresh_completions, [fresh.REASON_MOBILE_FACEBOOK_HANDOFF])
	assert_eq(fresh._load_verifier(), "")

	var link = MobileWebFacebookHandoffAuthManager.new()
	var link_completions: Array[String] = []
	link.provider_link_completed.connect(func(reason: String): link_completions.append(reason))
	link._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	link._save_link_flow("facebook", "guest-user")
	var link_transaction := link._begin_mobile_web_facebook_handoff_transaction(link.FLOW_LINK)
	link_transaction["expires_at_unix"] = link.handoff_now
	link.owner_transaction = link_transaction

	await link._poll_mobile_web_facebook_handoff()
	assert_eq(link_completions, [link.REASON_MOBILE_FACEBOOK_HANDOFF])
	assert_eq(link.user_id, "guest-user")
	assert_true(link.is_anonymous)
	assert_false(link.has_pending_provider_link())
	fresh.free()
	link.free()

func test_normal_pkce_callback_exchange_stores_the_fresh_supabase_session() -> void:
	var transport = FakeCurrentProjectTransport.new()
	transport.post_response = {
		"reason": auth.REASON_NONE,
		"data": {
			"access_token": "facebook-access",
			"refresh_token": "facebook-refresh",
			"expires_in": 3600,
			"user": {
				"id": "facebook-user",
				"is_anonymous": false,
				"app_metadata": {"provider": "facebook"}
			}
		}
	}
	auth.auth_transport = transport
	auth._save_verifier("mobile-facebook-verifier")

	assert_eq(await auth._exchange_code("mobile-facebook-code"), auth.REASON_NONE)
	assert_eq(transport.post_requests, [{
		"path": "/auth/v1/token?grant_type=pkce",
		"body": {
			"auth_code": "mobile-facebook-code",
			"code_verifier": "mobile-facebook-verifier"
		}
	}])
	assert_eq(auth.access_token_value, "facebook-access")
	assert_eq(auth.user_id, "facebook-user")
	assert_false(auth.is_anonymous)
	assert_eq(auth.current_provider, "facebook")

func test_mobile_facebook_link_uses_the_authenticated_browser_flow_and_stages_the_guest() -> void:
	var browser_auth = MobileWebFacebookLinkAuthManager.new()
	browser_auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})

	assert_eq(await browser_auth.link_with_provider("facebook"), browser_auth.REASON_NONE)
	assert_eq(browser_auth.mobile_link_calls, 1)
	assert_eq(browser_auth._load_link_flow().get("provider", ""), "facebook")
	assert_eq(browser_auth._load_link_flow().get("pre_link_user_id", ""), "guest-user")
	assert_eq(browser_auth.user_id, "guest-user")
	assert_true(browser_auth.is_anonymous)
	assert_false(browser_auth.oauth_in_flight)

	assert_eq(browser_auth._stage_link_session({
		"access_token": "linked-access",
		"refresh_token": "linked-refresh",
		"expires_in": 3600,
		"user": {
			"id": "guest-user",
			"is_anonymous": false,
			"app_metadata": {"provider": "facebook"}
		}
	}, browser_auth._load_link_flow()), browser_auth.REASON_NONE)
	assert_true(browser_auth.has_pending_provider_link())
	assert_eq(browser_auth.pending_link_provider(), "facebook")
	assert_eq(browser_auth.access_token_value, "guest-access")
	assert_eq(browser_auth.user_id, "guest-user")
	assert_true(browser_auth.is_anonymous)

	browser_auth.sign_out()
	browser_auth.free()

func test_google_identity_already_exists_callback_uses_existing_recovery_path() -> void:
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
	recovery._save_link_flow("google", "guest-user")

	assert_eq(await recovery._consume_link_callback({
		"code": "",
		"error": "server_error",
		"error_code": "identity_already_exists"
	}), recovery.REASON_NONE)
	assert_eq(transport.requests, [{
		"path": "/auth/v1/user", "bearer_token": "guest-access"
	}])
	assert_true(recovery.has_pending_provider_link())
	assert_eq(recovery.pending_link_provider(), "google")
	assert_true(recovery.is_anonymous)
	recovery.sign_out()
	recovery.free()

func test_google_identity_conflict_callback_keeps_existing_cancel_semantics() -> void:
	auth._save_link_flow("google", "guest-user")

	assert_eq(await auth._consume_link_callback({
		"code": "",
		"error": "server_error",
		"error_code": "identity_conflict"
	}), auth.REASON_CANCELLED)
	assert_false(auth.has_pending_provider_link())

func test_facebook_link_identity_already_exists_leaves_the_guest_unchanged() -> void:
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	auth._save_link_flow("facebook", "guest-user")

	assert_eq(await auth._consume_link_callback({
		"code": "",
		"error": "server_error",
		"error_code": "identity_already_exists"
	}), auth.REASON_IDENTITY_CONFLICT)
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_false(auth.has_pending_provider_link())

func test_facebook_link_identity_conflict_leaves_the_guest_unchanged() -> void:
	auth._apply_session({
		"access_token": "guest-access",
		"refresh_token": "guest-refresh",
		"expires_in": 3600,
		"user": {"id": "guest-user", "is_anonymous": true}
	})
	auth._save_link_flow("facebook", "guest-user")

	assert_eq(await auth._consume_link_callback({
		"code": "",
		"error": "server_error",
		"error_code": "identity_conflict"
	}), auth.REASON_IDENTITY_CONFLICT)
	assert_eq(auth.access_token_value, "guest-access")
	assert_eq(auth.refresh_token_value, "guest-refresh")
	assert_eq(auth.user_id, "guest-user")
	assert_true(auth.is_anonymous)
	assert_false(auth.has_pending_provider_link())

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

func test_web_facebook_routes_mobile_to_supabase_linking_and_keeps_pc_and_android_paths() -> void:
	assert_eq(
		auth._facebook_link_route_for_runtime(true, "Web", false),
		auth.FACEBOOK_LINK_ROUTE_WEB_PC
	)
	assert_eq(
		auth._facebook_link_route_for_runtime(true, "Web", true),
		auth.FACEBOOK_LINK_ROUTE_WEB_MOBILE
	)
	assert_eq(
		auth._facebook_link_route_for_runtime(false, "Android"),
		auth.FACEBOOK_LINK_ROUTE_NATIVE
	)
	assert_eq(auth._facebook_link_route_for_runtime(false, "Linux"), "")

func test_mobile_web_detection_covers_common_mobile_and_desktop_user_agents() -> void:
	assert_true(auth._is_mobile_web_for_user_agent(
		"Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Mobile Safari/537.36"
	))
	assert_true(auth._is_mobile_web_for_user_agent(
		"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
	))
	assert_true(auth._is_mobile_web_for_user_agent(
		"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", false, "MacIntel", 5
	))
	assert_false(auth._is_mobile_web_for_user_agent(
		"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128.0"
	))

func test_pc_web_facebook_link_preflight_starts_direct_oauth_without_native_fallthrough() -> void:
	var web_auth = PcWebFacebookLinkPreflightAuthManager.new()

	assert_eq(web_auth.begin_facebook_link_preflight(), web_auth.REASON_NONE)
	assert_eq(web_auth.active_flow_purpose, web_auth.FLOW_FACEBOOK_LINK_PREFLIGHT)
	assert_eq(web_auth.web_launch_purpose, web_auth.FLOW_FACEBOOK_LINK_PREFLIGHT)
	assert_eq(web_auth.native_readiness_calls, 0)
	assert_eq(web_auth.native_selection_calls, 0)

	web_auth.free()

func test_pc_web_facebook_link_preflight_start_failure_is_retryable_and_restores_flow() -> void:
	var web_auth = PcWebFacebookLinkPreflightAuthManager.new()
	web_auth.web_launch_reason = web_auth.REASON_BROWSER
	web_auth.active_flow_purpose = web_auth.FLOW_LINK

	assert_eq(web_auth.begin_facebook_link_preflight(), web_auth.REASON_BROWSER)
	assert_eq(web_auth.active_flow_purpose, web_auth.FLOW_SIGN_IN)
	assert_eq(web_auth.web_launch_purpose, web_auth.FLOW_FACEBOOK_LINK_PREFLIGHT)
	assert_eq(web_auth.native_readiness_calls, 0)
	assert_eq(web_auth.native_selection_calls, 0)

	web_auth.free()

func test_web_facebook_flow_expiry_is_one_time_and_time_bounded() -> void:
	var now := int(Time.get_unix_time_from_system())
	assert_true(auth._web_facebook_flow_expired({"expires_at_unix": now}))
	assert_false(auth._web_facebook_flow_expired({"expires_at_unix": now + 60}))

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
