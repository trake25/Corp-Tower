extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const PLUGIN_CFG_PATH := "res://addons/GoogleSignInPlugin/plugin.cfg"

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
