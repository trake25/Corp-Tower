extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const PLUGIN_CFG_PATH := "res://addons/GoogleSignInPlugin/plugin.cfg"

class FakeGoogleLinkProvider extends Node:
	var fresh_selection_calls := 0
	var reset_calls := 0

	func sign_in_fresh(_server_client_id: String) -> bool:
		fresh_selection_calls += 1
		return true

	func reset_session(_server_client_id: String) -> bool:
		reset_calls += 1
		return true

class FakeGoogleJniSingleton extends Node:
	var available_java_methods: Dictionary = {}
	var java_method_checks: Array[StringName] = []
	var fresh_selection_calls := 0
	var reset_calls := 0

	func has_java_method(method: StringName) -> bool:
		java_method_checks.append(method)
		return available_java_methods.has(method)

	func sign_in_fresh(_server_client_id: String) -> void:
		fresh_selection_calls += 1

	func reset_session(_server_client_id: String) -> void:
		reset_calls += 1

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.free()

func test_id_token_body_carries_the_id_token() -> void:
	var body: Dictionary = auth._build_id_token_body("the-id-token")

	assert_eq(body["provider"], "google")
	assert_eq(body["id_token"], "the-id-token")

func test_id_token_body_carries_the_configured_client_id() -> void:
	var body: Dictionary = auth._build_id_token_body("id-token")

	assert_eq(body["client_id"], EndpointConfig.AUTH_GOOGLE_SERVER_CLIENT_ID)

func test_facebook_token_body_uses_facebook_provider_without_google_client_id() -> void:
	var body: Dictionary = auth._build_id_token_body("facebook-access-token", "facebook")

	assert_eq(body["provider"], "facebook")
	assert_eq(body["id_token"], "facebook-access-token")
	assert_false(body.has("client_id"))

func test_native_google_is_never_ready_without_setup() -> void:
	assert_false(
		auth._native_google_ready(),
		"The test instance is never add_child()ed, so _setup_native_google() never " +
		"runs and google_signin_node stays null -- native must never be reachable here."
	)

func test_native_google_link_selection_uses_the_fresh_session_seam() -> void:
	var provider = FakeGoogleLinkProvider.new()
	auth.google_signin_node = provider

	assert_true(auth._begin_native_google_link_selection())
	assert_eq(provider.fresh_selection_calls, 1)
	assert_eq(provider.reset_calls, 0)

	auth.google_signin_node = null
	provider.free()

func test_google_runtime_reset_methods_are_safe_without_a_native_singleton() -> void:
	var script: GDScript = load(AuthManagerScript.GOOGLE_SIGNIN_SCRIPT)
	var node = script.new()

	assert_false(node.sign_in_fresh("test-client-id"))
	assert_false(node.reset_session("test-client-id"))

	node.free()

func test_google_runtime_fresh_and_reset_use_java_method_capabilities() -> void:
	var script: GDScript = load(AuthManagerScript.GOOGLE_SIGNIN_SCRIPT)
	var node = script.new()
	var singleton := FakeGoogleJniSingleton.new()
	singleton.available_java_methods = {
		&"sign_in_fresh": true,
		&"reset_session": true,
	}
	node._plugin_singleton = singleton

	assert_true(node.sign_in_fresh("test-client-id"))
	assert_true(node.reset_session("test-client-id"))
	assert_eq(singleton.java_method_checks, [&"sign_in_fresh", &"reset_session"])
	assert_eq(singleton.fresh_selection_calls, 1)
	assert_eq(singleton.reset_calls, 1)

	node._plugin_singleton = null
	singleton.free()
	node.free()

func test_google_runtime_rejects_missing_java_methods_even_when_callable_methods_exist() -> void:
	var script: GDScript = load(AuthManagerScript.GOOGLE_SIGNIN_SCRIPT)
	var node = script.new()
	var singleton := FakeGoogleJniSingleton.new()
	node._plugin_singleton = singleton

	assert_false(node.sign_in_fresh("test-client-id"))
	assert_false(node.reset_session("test-client-id"))
	assert_eq(singleton.java_method_checks, [&"sign_in_fresh", &"reset_session"])
	assert_eq(singleton.fresh_selection_calls, 0)
	assert_eq(singleton.reset_calls, 0)

	node._plugin_singleton = null
	singleton.free()
	node.free()

func test_native_google_resets_to_enabled_for_a_new_manager() -> void:
	assert_true(auth.is_native_google_enabled(), "Native Google must default to enabled.")

	auth.set_native_google_enabled(false)
	var restored = AuthManagerScript.new()

	assert_true(restored.is_native_google_enabled(), "Native Google must reset when the app reloads.")
	restored.free()

func test_native_facebook_resets_to_enabled_for_a_new_manager() -> void:
	assert_true(auth.is_native_facebook_enabled(), "Native Facebook must default to enabled.")

	auth.set_native_facebook_enabled(false)
	var restored = AuthManagerScript.new()

	assert_true(restored.is_native_facebook_enabled(), "Native Facebook must reset when the app reloads.")
	restored.free()

func test_unconfigured_provider_call_never_reaches_native() -> void:
	if EndpointConfig.SUPABASE_URL != "" or EndpointConfig.AUTH_OAUTH_ENABLED:
		return

	assert_eq(
		auth.sign_in_with_provider("google"), auth.REASON_REJECTED,
		"An unconfigured build must refuse before any native or browser branch runs."
	)

# The plugin.cfg script and the GDScript wrapper AuthManager loads are two
# different files by design (EditorPlugin vs. runtime node, same split as
# DeeplinkPlugin) -- confirm both exist rather than only one.
func test_addon_files_the_runtime_seam_depends_on_exist() -> void:
	assert_true(
		ResourceLoader.exists(AuthManagerScript.GOOGLE_SIGNIN_SCRIPT),
		"Auth_Manager.GOOGLE_SIGNIN_SCRIPT must point at a real file."
	)

	var config := ConfigFile.new()

	assert_eq(
		config.load(PLUGIN_CFG_PATH), OK,
		"GoogleSignInPlugin/plugin.cfg must exist for the addon to register."
	)
	assert_eq(
		config.get_value("plugin", "script", ""), "GoogleSignInPlugin.gd",
		"plugin.cfg must point at the EditorPlugin script, not the runtime node."
	)

func test_google_signin_singleton_name_is_pinned() -> void:
	var script: GDScript = load(AuthManagerScript.GOOGLE_SIGNIN_SCRIPT)
	var node = script.new()

	assert_eq(
		node.PLUGIN_SINGLETON_NAME, "GoogleSignInPlugin",
		"Must match the Kotlin plugin's pluginName in " +
		"plugins/godot-google-signin/plugin/build.gradle.kts -- the two can only " +
		"be cross-checked by hand, since GDScript cannot introspect Kotlin source."
	)

	node.free()
