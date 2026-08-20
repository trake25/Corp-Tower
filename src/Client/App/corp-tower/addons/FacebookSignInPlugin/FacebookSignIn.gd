@tool
class_name FacebookSignIn extends Node

signal sign_in_success(access_token: String)
signal sign_in_failed(code: String, message: String)

const PLUGIN_SINGLETON_NAME: String = "FacebookSignInPlugin"

var _plugin_singleton: Object

func _ready() -> void:
	if Engine.has_singleton(PLUGIN_SINGLETON_NAME):
		_plugin_singleton = Engine.get_singleton(PLUGIN_SINGLETON_NAME)
		_plugin_singleton.connect("sign_in_success", _on_sign_in_success)
		_plugin_singleton.connect("sign_in_failed", _on_sign_in_failed)

func is_available() -> bool:
	return _plugin_singleton != null and bool(_plugin_singleton.is_available())

func configure(app_id: String, client_token: String) -> bool:
	if _plugin_singleton == null:
		return false
	return bool(_plugin_singleton.configure(app_id, client_token))

func sign_in() -> bool:
	if _plugin_singleton == null:
		return false
	_plugin_singleton.sign_in()
	return true

func _on_sign_in_success(access_token: String) -> void:
	sign_in_success.emit(access_token)

func _on_sign_in_failed(code: String, message: String) -> void:
	sign_in_failed.emit(code, message)
