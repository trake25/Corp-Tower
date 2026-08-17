extends GutTest

const AuthManagerScript := preload("res://Sys/Auth/Auth_Manager.gd")
const EXPORT_CONFIG_PATH := "res://addons/DeeplinkPlugin/export.cfg"

# RFC 7636 appendix B: the one published verifier/challenge pair, so the S256
# transform is checked against the spec rather than against itself.
const RFC7636_VERIFIER := "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
const RFC7636_CHALLENGE := "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"

var auth

func before_each() -> void:
	auth = AuthManagerScript.new()

func after_each() -> void:
	auth.free()

func test_code_challenge_matches_the_rfc7636_vector() -> void:
	assert_eq(
		auth._code_challenge(RFC7636_VERIFIER),
		RFC7636_CHALLENGE,
		"S256 challenge must match the published RFC 7636 test vector."
	)

func test_code_verifier_is_unreserved_and_long_enough() -> void:
	var seen := {}

	for i in 10:
		var verifier: String = auth._generate_code_verifier()

		assert_between(
			verifier.length(), 43, 128,
			"RFC 7636 requires a 43-128 character verifier."
		)
		assert_false(
			verifier.contains("+") or verifier.contains("/") or verifier.contains("="),
			"A verifier must be base64url with no padding: got " + verifier
		)
		seen[verifier] = true

	assert_eq(seen.size(), 10, "Every generated verifier must be unique.")

func test_base64url_has_no_padding_or_unsafe_characters() -> void:
	var encoded: String = auth._base64url(PackedByteArray([251, 255, 190]))

	assert_false(encoded.contains("="), "Padding must be stripped.")
	assert_false(encoded.contains("+"), "'+' must become '-'.")
	assert_false(encoded.contains("/"), "'/' must become '_'.")

func test_authorize_url_encodes_the_redirect_and_pins_s256() -> void:
	var url: String = auth._build_authorize_url(
		"google", "com.galaxxigames.tod://auth-callback", "challenge+value/here"
	)

	assert_true(url.contains("provider=google"), "Provider must be on the query.")
	assert_true(
		url.contains("redirect_to=com.galaxxigames.tod%3A%2F%2Fauth-callback"),
		"The redirect must be percent-encoded, not raw: " + url
	)
	assert_true(
		url.contains("code_challenge_method=s256"),
		"The plain method must never be requested."
	)
	assert_false(
		url.contains("challenge+value/here"),
		"The challenge must be encoded, not interpolated raw."
	)

func test_callback_query_extracts_the_code() -> void:
	var parsed: Dictionary = auth._parse_callback_query("?code=abc123&state=xyz")

	assert_eq(parsed["code"], "abc123")
	assert_eq(parsed["error"], "")

func test_callback_query_decodes_and_survives_junk() -> void:
	assert_eq(
		auth._parse_callback_query("?code=a%2Fb%3Dc")["code"],
		"a/b=c",
		"A percent-encoded code must be decoded exactly once."
	)
	assert_eq(
		auth._parse_callback_query("?novalue&code=ok&=&trailing")["code"],
		"ok",
		"Malformed pairs must be skipped, not crash the parse."
	)
	assert_eq(auth._parse_callback_query("")["code"], "")

func test_callback_query_reports_a_denied_consent() -> void:
	var parsed: Dictionary = auth._parse_callback_query(
		"?error=access_denied&error_description=User%20denied"
	)

	assert_eq(parsed["code"], "", "A denial must never yield a code.")
	assert_eq(parsed["error"], "access_denied")

func test_android_redirect_parts_split_correctly() -> void:
	assert_eq(auth.redirect_android_scheme(), "com.galaxxigames.tod")
	assert_eq(auth.redirect_android_host(), "auth-callback")

# The manifest intent-filter is generated from export.cfg at export time while
# the runtime builds its redirect from the const. If the two drift, Supabase
# redirects to a URI no activity claims and sign-in dead-ends on device -- a
# failure no other test here can see.
func test_export_config_matches_the_redirect_const() -> void:
	var config := ConfigFile.new()

	assert_eq(
		config.load(EXPORT_CONFIG_PATH), OK,
		"Deeplink export config must exist at " + EXPORT_CONFIG_PATH
	)

	var sections := config.get_sections()
	assert_eq(sections.size(), 1, "Exactly one deeplink section is expected.")

	var section: String = sections[0]
	assert_eq(
		config.get_value(section, "scheme", ""),
		auth.redirect_android_scheme(),
		"export.cfg scheme must match AuthManager.REDIRECT_ANDROID."
	)
	assert_eq(
		config.get_value(section, "host", ""),
		auth.redirect_android_host(),
		"export.cfg host must match AuthManager.REDIRECT_ANDROID."
	)
	assert_false(
		bool(config.get_value(section, "is_auto_verify", true)),
		"autoVerify drives https App Link verification; a custom scheme cannot serve it."
	)
	assert_true(
		bool(config.get_value(section, "is_browsable", false)),
		"Without the BROWSABLE category a browser cannot hand the redirect back."
	)

func test_oauth_stays_disabled_in_an_unconfigured_build() -> void:
	if EndpointConfig.SUPABASE_URL != "" or EndpointConfig.AUTH_OAUTH_ENABLED:
		return

	assert_false(
		auth.is_oauth_enabled(),
		"An unconfigured build must not offer provider sign-in."
	)
	assert_eq(
		auth.sign_in_with_provider("google"),
		auth.REASON_REJECTED,
		"A provider call must be refused rather than opening a browser."
	)

# The visibility rule has to hold at OAuth-on too, which an unconfigured build
# never reaches -- so it is asserted against the decision, not the live flag.
func test_only_wired_providers_get_a_button() -> void:
	var screen = load("res://Cor/Scripts/SignInScreen.gd").new()

	assert_eq(
		screen.available_providers(true), ["google"],
		"With OAuth on, only providers in AuthManager.PROVIDERS may show a button."
	)
	assert_eq(
		screen.available_providers(false), [],
		"With OAuth off the whole social row must disappear."
	)

	for provider in screen.PROVIDER_BUTTONS:
		assert_true(
			AuthManagerScript.PROVIDERS.has(provider)
				or not screen.available_providers(true).has(provider),
			"A button may never be shown for a provider that has no flow: " + provider
		)

	screen.free()

func test_unknown_providers_are_refused() -> void:
	assert_eq(
		auth.sign_in_with_provider("myspace"),
		auth.REASON_REJECTED,
		"Only providers listed in PROVIDERS may start a flow."
	)
	assert_false(
		auth.PROVIDERS.has("facebook") or auth.PROVIDERS.has("tiktok"),
		"Facebook and TikTok are out of scope this pass and must stay unwired."
	)
