extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const PLUGIN_CFG_PATH := "res://addons/FacebookSignInPlugin/plugin.cfg"

class FakeFacebookLinkProvider extends Node:
	var fresh_selection_calls := 0
	var reset_calls := 0

	func sign_in_fresh() -> bool:
		fresh_selection_calls += 1
		return true

	func reset_session() -> bool:
		reset_calls += 1
		return true

class FakeFacebookJniSingleton extends Node:
	var available_java_methods: Dictionary = {}
	var java_method_checks: Array[StringName] = []
	var fresh_selection_calls := 0
	var reset_calls := 0

	func has_java_method(method: StringName) -> bool:
		java_method_checks.append(method)
		return available_java_methods.has(method)

	func sign_in_fresh() -> void:
		fresh_selection_calls += 1

	func reset_session() -> void:
		reset_calls += 1

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.free()

func test_facebook_is_an_enabled_provider() -> void:
	assert_true(auth.PROVIDERS.has("facebook"))

func test_native_facebook_is_unavailable_without_android_plugin() -> void:
	assert_false(auth._native_facebook_ready())

func test_native_facebook_link_selection_uses_the_fresh_session_seam() -> void:
	var provider = FakeFacebookLinkProvider.new()
	auth.facebook_signin_node = provider

	assert_true(auth._begin_native_facebook_link_selection())
	assert_eq(provider.fresh_selection_calls, 1)
	assert_eq(provider.reset_calls, 0)

	auth.facebook_signin_node = null
	provider.free()

func test_facebook_runtime_reset_methods_are_safe_without_a_native_singleton() -> void:
	var script: GDScript = load(AuthManagerScript.FACEBOOK_SIGNIN_SCRIPT)
	var node = script.new()

	assert_false(node.sign_in_fresh())
	assert_false(node.reset_session())

	node.free()

func test_facebook_runtime_fresh_and_reset_use_java_method_capabilities() -> void:
	var script: GDScript = load(AuthManagerScript.FACEBOOK_SIGNIN_SCRIPT)
	var node = script.new()
	var singleton := FakeFacebookJniSingleton.new()
	singleton.available_java_methods = {
		&"sign_in_fresh": true,
		&"reset_session": true,
	}
	node._plugin_singleton = singleton

	assert_true(node.sign_in_fresh())
	assert_true(node.reset_session())
	assert_eq(singleton.java_method_checks, [&"sign_in_fresh", &"reset_session"])
	assert_eq(singleton.fresh_selection_calls, 1)
	assert_eq(singleton.reset_calls, 1)

	node._plugin_singleton = null
	singleton.free()
	node.free()

func test_facebook_runtime_rejects_missing_java_methods_even_when_callable_methods_exist() -> void:
	var script: GDScript = load(AuthManagerScript.FACEBOOK_SIGNIN_SCRIPT)
	var node = script.new()
	var singleton := FakeFacebookJniSingleton.new()
	node._plugin_singleton = singleton

	assert_false(node.sign_in_fresh())
	assert_false(node.reset_session())
	assert_eq(singleton.java_method_checks, [&"sign_in_fresh", &"reset_session"])
	assert_eq(singleton.fresh_selection_calls, 0)
	assert_eq(singleton.reset_calls, 0)

	node._plugin_singleton = null
	singleton.free()
	node.free()

func test_facebook_addon_files_and_singleton_name_are_pinned() -> void:
	assert_true(
		ResourceLoader.exists(AuthManagerScript.FACEBOOK_SIGNIN_SCRIPT),
		"Auth_Manager.FACEBOOK_SIGNIN_SCRIPT must point at a real file."
	)

	var config := ConfigFile.new()
	assert_eq(config.load(PLUGIN_CFG_PATH), OK)
	assert_eq(config.get_value("plugin", "script", ""), "FacebookSignInPlugin.gd")

	var script: GDScript = load(AuthManagerScript.FACEBOOK_SIGNIN_SCRIPT)
	var node = script.new()
	assert_eq(node.PLUGIN_SINGLETON_NAME, "FacebookSignInPlugin")
	node.free()

func test_facebook_authorize_url_uses_provider_generic_pkce() -> void:
	var url: String = auth._build_authorize_url(
		"facebook", "https://example.test/", "challenge-value"
	)

	assert_true(url.contains("provider=facebook"))
	assert_true(url.contains("code_challenge_method=s256"))

func test_native_facebook_session_uses_its_access_token_on_the_server_wire() -> void:
	var expiry := int(Time.get_unix_time_from_system()) + 3600

	assert_true(auth._apply_facebook_session("native-facebook-token", expiry))
	assert_eq(auth.connection_access_token(), "native-facebook-token")
	assert_eq(auth.connection_auth_provider(), "facebook")

func test_native_facebook_session_rejects_expired_tokens() -> void:
	assert_false(
		auth._apply_facebook_session(
			"native-facebook-token", int(Time.get_unix_time_from_system()) - 1
		)
	)

func test_facebook_native_callback_timeout_is_bounded() -> void:
	assert_eq(auth.NATIVE_FACEBOOK_TIMEOUT_SECONDS, 30.0)
