extends Control

signal back_requested

@onready var back_button: TextureButton = %BackButton
@onready var guest_content: VBoxContainer = %GuestContent
@onready var linked_content: VBoxContainer = %LinkedContent
@onready var profile_name_label: Label = %ProfileNameLabel
@onready var provider_label: Label = %ProviderLabel
@onready var facebook_button: TextureButton = %FacebookButton
@onready var google_button: TextureButton = %GoogleButton
@onready var tiktok_button: TextureButton = %TiktokButton

func _ready() -> void:
	back_button.pressed.connect(func(): back_requested.emit())
	tiktok_button.visible = false
	refresh_account_state()

func refresh_account_state() -> void:
	apply_account_state(
		AuthManager.is_signed_in() and not AuthManager.is_anonymous,
		AuthManager.current_provider,
		AuthManager.display_name
	)

func apply_account_state(linked: bool, provider: String, profile_name: String) -> void:
	guest_content.visible = not linked
	linked_content.visible = linked
	facebook_button.visible = not linked
	google_button.visible = not linked
	tiktok_button.visible = false

	if not linked:
		return

	profile_name_label.text = profile_name.strip_edges() if profile_name.strip_edges() != "" else "Player"
	var normalized_provider := provider.strip_edges()
	provider_label.text = (
		"You are signed in with %s." % normalized_provider.capitalize()
		if normalized_provider != ""
		else "Your account is linked."
	)
