extends Control

signal back_requested
signal provider_link_requested(provider: String)

const ERROR_MESSAGES := {
	"unreachable": "Servers unavailable. Check your connection and try again.",
	"rejected": "Could not link your account. Please try again.",
	"cancelled": "Account linking cancelled.",
	"browser": "Could not complete browser account linking. Please try again.",
	"mobile_facebook_handoff": "Facebook linking couldn’t finish. Your Guest account is unchanged. Contact Support with error FB-WEB-02.",
	"identity_conflict": "This account is already linked. Sign out and sign in with it instead.",
	"provider_unavailable": "Facebook linking is currently unavailable in this build."
}
const PROVIDER_BUTTONS := {
	"google": "GoogleButton",
	"facebook": "FacebookButton"
}
const TRANSPORT_DIAGNOSTIC_CODES := ["L1", "L2", "L3", "L4", "L5", "L6", "L7"]
const FACEBOOK_DIAGNOSTIC_CODES := ["F1", "F2", "F3", "F4", "F5", "F6", "F7"]
const SEMANTIC_LINK_ERROR_REASONS := [
	"unreachable",
	"cancelled",
	"browser",
	"mobile_facebook_handoff",
	"identity_conflict",
	"provider_unavailable",
	"provider_conflict"
]

@onready var back_button: TextureButton = %BackButton
@onready var guest_content: VBoxContainer = %GuestContent
@onready var linked_content: VBoxContainer = %LinkedContent
@onready var provider_identity_label: Label = %ProviderIdentityLabel
@onready var google_email_label: Label = %GoogleEmailLabel
@onready var provider_label: Label = %ProviderLabel
@onready var error_label: Label = %ErrorLabel
@onready var social_row: HBoxContainer = %SocialRow
@onready var facebook_button: TextureButton = %FacebookButton
@onready var google_button: TextureButton = %GoogleButton
@onready var tiktok_button: TextureButton = %TiktokButton

func _ready() -> void:
	back_button.pressed.connect(func(): back_requested.emit())
	error_label.visible = false
	tiktok_button.visible = false
	_apply_provider_availability()
	refresh_account_state()

func available_providers(oauth_enabled: bool) -> Array:
	var result := []

	for provider in PROVIDER_BUTTONS:
		if oauth_enabled and AuthManager.PROVIDERS.has(provider):
			result.append(provider)

	return result

func _apply_provider_availability(oauth_enabled: bool = AuthManager.is_oauth_enabled()) -> void:
	var available := available_providers(oauth_enabled)

	for provider in PROVIDER_BUTTONS:
		var button: BaseButton = social_row.get_node(PROVIDER_BUTTONS[provider])
		button.visible = available.has(provider)
		if button.visible and button.pressed.get_connections().is_empty():
			var provider_id := str(provider)
			button.pressed.connect(func():
				clear_error()
				provider_link_requested.emit(provider_id)
			)

	social_row.visible = not available.is_empty()

func refresh_account_state() -> void:
	apply_account_state(
		AuthManager.has_accepted_provider(),
		AuthManager.current_provider,
		AuthManager.display_name,
		AuthManager.google_email
	)

func apply_account_state(
	linked: bool,
	provider: String,
	provider_display_name: String = "",
	provider_email: String = ""
) -> void:
	guest_content.visible = not linked
	linked_content.visible = linked

	var available := available_providers(AuthManager.is_oauth_enabled())
	facebook_button.visible = not linked and available.has("facebook")
	google_button.visible = not linked and available.has("google")
	tiktok_button.visible = false
	social_row.visible = not linked and (facebook_button.visible or google_button.visible)

	if not linked:
		return

	var normalized_provider := provider.strip_edges().to_lower()
	var normalized_display_name := provider_display_name.strip_edges()
	google_email_label.visible = false

	if normalized_provider == "google":
		var masked_email := mask_google_email(provider_email)
		if normalized_display_name != "":
			provider_identity_label.text = normalized_display_name
			google_email_label.text = masked_email
			google_email_label.visible = masked_email != ""
		elif masked_email != "":
			provider_identity_label.text = masked_email
		else:
			provider_identity_label.text = "Google account"
	elif normalized_provider == "facebook":
		provider_identity_label.text = "Facebook account"
	else:
		provider_identity_label.text = "Account linked"

	provider_label.text = (
		"You are signed in with %s." % normalized_provider.capitalize()
		if normalized_provider != ""
		else "Your account is linked."
	)

func set_busy(busy: bool) -> void:
	social_row.modulate.a = 0.5 if busy else 1.0

	for provider in PROVIDER_BUTTONS:
		social_row.get_node(PROVIDER_BUTTONS[provider]).disabled = busy

	if busy:
		error_label.visible = false

func clear_error() -> void:
	error_label.visible = false

func show_error(reason: String, diagnostic_code := "") -> void:
	if reason == "unreachable" and TRANSPORT_DIAGNOSTIC_CODES.has(diagnostic_code):
		error_label.text = "Servers unavailable. [%s]" % diagnostic_code
	elif (
		FACEBOOK_DIAGNOSTIC_CODES.has(diagnostic_code)
		and not SEMANTIC_LINK_ERROR_REASONS.has(reason)
	):
		error_label.text = "Could not link your account. [%s]" % diagnostic_code
	else:
		error_label.text = ERROR_MESSAGES.get(reason, ERROR_MESSAGES["rejected"])
	error_label.visible = true

static func mask_google_email(value: String) -> String:
	var email := value.strip_edges()
	var at := email.find("@")

	if at <= 4 or at != email.rfind("@"):
		return ""

	var local_part := email.left(at)
	var domain := email.substr(at + 1)

	if (
		local_part.length() <= 4
		or domain.length() < 3
		or local_part.begins_with(".")
		or local_part.ends_with(".")
		or domain.begins_with(".")
		or domain.ends_with(".")
		or not domain.contains(".")
		or local_part.contains("..")
		or domain.contains("..")
		or email.contains(" ")
		or email.contains("\t")
	):
		return ""

	if not _contains_only_email_characters(
		local_part,
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.!#$%&'*+-/=?^_`{|}~"
	):
		return ""

	if not _contains_only_email_characters(
		domain,
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-"
	):
		return ""

	return local_part.left(4) + "•••@" + domain

static func _contains_only_email_characters(value: String, allowed: String) -> bool:
	for index in value.length():
		if not allowed.contains(value.substr(index, 1)):
			return false

	return true
