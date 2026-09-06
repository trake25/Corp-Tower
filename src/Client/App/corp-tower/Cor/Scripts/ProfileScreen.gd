extends Control

signal back_requested
signal change_name_requested

const PlayerRailEntry := preload("res://Cor/Scripts/PlayerRailEntry.gd")

var account_uid := ""
var profile_data: Dictionary = {}

func _ready() -> void:
	%BackButton.pressed.connect(func(): back_requested.emit())
	%EditNameButton.pressed.connect(func(): change_name_requested.emit())
	%CopyUidButton.pressed.connect(_copy_full_uid)

func set_profile(data: Dictionary) -> void:
	profile_data = data.duplicate(true)
	account_uid = str(data.get("accountUid", ""))
	%NameLabel.text = _profile_name(str(data.get("displayName", "Player")))
	%UidLabel.text = "@" + _short_uid(account_uid)
	%EditNameButton.visible = not bool(data.get("nameChangeUsed", false))
	%AvatarTexture.texture = _avatar_texture(str(data.get("avatarId", "avatar_0")))

func set_online(online: bool) -> void:
	var dot_style := %OnlineDot.get_theme_stylebox("panel").duplicate() as StyleBoxFlat
	dot_style.bg_color = Color("20c95a") if online else Color("87919b")
	%OnlineDot.add_theme_stylebox_override("panel", dot_style)
	%OnlineLabel.text = "Online" if online else "Offline"

func _profile_name(value: String) -> String:
	return value if value.length() <= 10 else value.substr(0, 10) + ".."

func _short_uid(value: String) -> String:
	if value.length() <= 14:
		return value
	return value.substr(0, 8) + "…" + value.substr(value.length() - 4, 4)

func _copy_full_uid() -> void:
	if account_uid != "":
		DisplayServer.clipboard_set(account_uid)

func _avatar_texture(avatar_id: String) -> Texture2D:
	return PlayerRailEntry.load_avatar_texture(avatar_id)
