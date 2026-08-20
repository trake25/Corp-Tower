@tool
extends EditorPlugin

const PLUGIN_NAME: String = "FacebookSignInPlugin"
const ANDROID_DEPENDENCIES: Array = [
	"com.facebook.android:facebook-login:18.0.3"
]

var android_export_plugin: AndroidExportPlugin

func _enter_tree() -> void:
	android_export_plugin = AndroidExportPlugin.new()
	add_export_plugin(android_export_plugin)

func _exit_tree() -> void:
	remove_export_plugin(android_export_plugin)
	android_export_plugin = null

class AndroidExportPlugin extends EditorExportPlugin:
	var _plugin_name = PLUGIN_NAME

	func _supports_platform(platform: EditorExportPlatform) -> bool:
		return platform is EditorExportPlatformAndroid

	func _get_name() -> String:
		return _plugin_name

	func _get_android_libraries(platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		if debug:
			return PackedStringArray(["%s/bin/debug/%s-debug.aar" % [_plugin_name, _plugin_name]])
		return PackedStringArray(["%s/bin/release/%s-release.aar" % [_plugin_name, _plugin_name]])

	func _get_android_dependencies(platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		return PackedStringArray(ANDROID_DEPENDENCIES)
