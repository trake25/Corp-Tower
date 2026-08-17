@tool
extends EditorPlugin

const PLUGIN_NAME: String = "GoogleSignInPlugin"
const ANDROID_DEPENDENCIES: Array = [
	"androidx.credentials:credentials:1.5.0",
	"androidx.credentials:credentials-play-services-auth:1.5.0",
	"com.google.android.libraries.identity.googleid:googleid:1.1.1",
	"org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.1"
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
		else:
			return PackedStringArray(["%s/bin/release/%s-release.aar" % [_plugin_name, _plugin_name]])

	func _get_android_dependencies(platform: EditorExportPlatform, debug: bool) -> PackedStringArray:
		return PackedStringArray(ANDROID_DEPENDENCIES)
