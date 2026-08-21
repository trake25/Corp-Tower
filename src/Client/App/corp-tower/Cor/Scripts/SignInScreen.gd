extends Control

const SignInDebugOverlayScript = preload("res://Cor/Scripts/SignInDebugOverlay.gd")

signal guest_login_requested
signal provider_login_requested(provider: String)

const GUEST_LABEL_IDLE := "Play as Guest"
const GUEST_LABEL_BUSY := "Signing in..."
const ERROR_MESSAGES := {
	"unreachable": "Servers unavailable. Check your connection and try again.",
	"rejected": "Sign-in failed. Please try again.",
	"cancelled": "Sign-in cancelled.",
	"browser": "Could not open the browser to sign in."
}
const PROVIDER_BUTTONS := {
	"google": "GoogleButton",
	"facebook": "FacebookButton",
	"tiktok": "TiktokButton"
}

var sign_in_debug_overlay: Control

func _ready() -> void:
	%GuestButton.pressed.connect(func(): guest_login_requested.emit())
	%ErrorLabel.visible = false
	_apply_provider_availability()
	if EndpointConfig.DEBUG_UI_ENABLED:
		sign_in_debug_overlay = SignInDebugOverlayScript.new()
		add_child(sign_in_debug_overlay)

func available_providers(oauth_enabled: bool) -> Array:
	var result := []

	for provider in PROVIDER_BUTTONS:
		if oauth_enabled and AuthManager.PROVIDERS.has(provider):
			result.append(provider)

	return result

func _apply_provider_availability() -> void:
	var available := available_providers(AuthManager.is_oauth_enabled())

	for provider in PROVIDER_BUTTONS:
		var button: BaseButton = %SocialRow.get_node(PROVIDER_BUTTONS[provider])
		button.visible = available.has(provider)

		if not button.visible:
			continue

		var provider_id := str(provider)
		button.pressed.connect(func(): provider_login_requested.emit(provider_id))

	%SocialRow.visible = not available.is_empty()
	%OrDivider.visible = not available.is_empty()

func set_busy(busy: bool) -> void:
	%GuestButton.disabled = busy
	%GuestLabel.text = GUEST_LABEL_BUSY if busy else GUEST_LABEL_IDLE
	%SocialRow.modulate.a = 0.5 if busy else 1.0

	for provider in PROVIDER_BUTTONS:
		%SocialRow.get_node(PROVIDER_BUTTONS[provider]).disabled = busy

	if busy:
		%ErrorLabel.visible = false

func show_error(reason: String) -> void:
	%ErrorLabel.text = ERROR_MESSAGES.get(reason, ERROR_MESSAGES["rejected"])
	%ErrorLabel.visible = true

func show_diagnostic(diagnostic: String) -> void:
	if not EndpointConfig.DEBUG_UI_ENABLED:
		return

	OS.alert(diagnostic, "Sign-in diagnostics")

func toggle_debug_overlay() -> void:
	if sign_in_debug_overlay != null and sign_in_debug_overlay.has_method("toggle"):
		sign_in_debug_overlay.call("toggle")
