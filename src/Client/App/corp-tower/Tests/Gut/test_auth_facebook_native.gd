extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const PLUGIN_CFG_PATH := "res://addons/FacebookSignInPlugin/plugin.cfg"

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.free()

func test_facebook_is_an_enabled_provider() -> void:
	assert_true(auth.PROVIDERS.has("facebook"))

func test_native_facebook_is_unavailable_without_android_plugin() -> void:
	assert_false(auth._native_facebook_ready())

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
