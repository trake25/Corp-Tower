@tool
class_name GoogleSignIn extends Node

signal sign_in_success(id_token: String)
signal sign_in_failed(code: String, message: String)

const PLUGIN_SINGLETON_NAME: String = "GoogleSignInPlugin"

const CODE_NO_CREDENTIAL := "no_credential"
const CODE_PROVIDER_UNAVAILABLE := "provider_unavailable"
const CODE_CANCELLED := "cancelled"
const CODE_ERROR := "error"

var _plugin_singleton: Object


func _ready() -> void:
	if Engine.has_singleton(PLUGIN_SINGLETON_NAME):
		_plugin_singleton = Engine.get_singleton(PLUGIN_SINGLETON_NAME)
		_plugin_singleton.connect("sign_in_success", _on_sign_in_success)
		_plugin_singleton.connect("sign_in_failed", _on_sign_in_failed)


func is_available() -> bool:
	if _plugin_singleton == null:
		return false

	return bool(_plugin_singleton.is_available())


func sign_in(server_client_id: String, hashed_nonce: String) -> bool:
	if _plugin_singleton == null:
		return false

	_plugin_singleton.sign_in(server_client_id, hashed_nonce)
	return true


func _on_sign_in_success(id_token: String) -> void:
	sign_in_success.emit(id_token)


func _on_sign_in_failed(code: String, message: String) -> void:
	sign_in_failed.emit(code, message)
