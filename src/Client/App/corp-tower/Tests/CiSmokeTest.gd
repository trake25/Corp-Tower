extends SceneTree

const MAIN_SCENE_PATH := "res://Cor/Scenes/Main.tscn"
const MAIN_SCENE_UID := "uid://c0po62b2x6ltb"
const NETWORK_MANAGER_PATH := "res://Sys/NetMan/NetworkManager.gd"
const UI_SCENE_PATH := "res://Cor/Scenes/GameUI.tscn"
const APPLICATION_SCRIPT_ROOTS := [
	"res://Cor",
	"res://Sys"
]

var checked_script_count := 0
var failures: Array[String] = []

func _init() -> void:
	call_deferred("run")

func run() -> void:
	check_application_scripts()
	check_project_settings()
	check_autoload()
	check_scene_load(UI_SCENE_PATH, "UI scene")

	var main_instance: Node = instantiate_scene(MAIN_SCENE_PATH, "main scene")
	if main_instance != null:
		root.add_child(main_instance)
		await process_frame
		check_main_scene_ready(main_instance)
		main_instance.queue_free()
		await process_frame

	await check_play_scene_ready()

	finish()

func check_application_scripts() -> void:
	for root_path in APPLICATION_SCRIPT_ROOTS:
		scan_script_directory(root_path)

func scan_script_directory(path: String) -> void:
	var directory := DirAccess.open(path)
	if directory == null:
		failures.append("Failed to open script directory: " + path)
		return

	directory.list_dir_begin()
	var entry := directory.get_next()

	while entry != "":
		if entry == "." or entry == "..":
			entry = directory.get_next()
			continue

		var entry_path := path.path_join(entry)

		if directory.current_is_dir():
			scan_script_directory(entry_path)
		elif entry_path.get_extension() == "gd":
			check_script_loads(entry_path)

		entry = directory.get_next()

	directory.list_dir_end()

func check_script_loads(path: String) -> void:
	checked_script_count += 1
	var script := load(path) as Script

	if script == null:
		failures.append("Failed to load client script: " + path)

func check_project_settings() -> void:
	var main_scene := str(ProjectSettings.get_setting("application/run/main_scene", ""))
	var accepted_main_scenes := [MAIN_SCENE_PATH, MAIN_SCENE_UID]

	if !accepted_main_scenes.has(main_scene):
		failures.append(
			"application/run/main_scene must point to %s; got %s" %
			[MAIN_SCENE_PATH, main_scene]
		)

func check_autoload() -> void:
	var autoload_setting := str(ProjectSettings.get_setting("autoload/NetworkManager", ""))
	var expected_autoload := "*" + NETWORK_MANAGER_PATH

	if autoload_setting != expected_autoload:
		failures.append(
			"autoload/NetworkManager must be %s; got %s" %
			[expected_autoload, autoload_setting]
		)

	var network_manager_script := load(NETWORK_MANAGER_PATH) as Script
	if network_manager_script == null:
		failures.append("Failed to load NetworkManager script: " + NETWORK_MANAGER_PATH)

	var network_manager := root.get_node_or_null("NetworkManager")
	if network_manager == null:
		failures.append("NetworkManager autoload was not added to the scene tree.")

func check_scene_load(path: String, description: String) -> void:
	var scene := load(path) as PackedScene
	if scene == null:
		failures.append("Failed to load " + description + ": " + path)

func instantiate_scene(path: String, description: String) -> Node:
	var scene := load(path) as PackedScene
	if scene == null:
		failures.append("Failed to load " + description + ": " + path)
		return null

	var instance := scene.instantiate()
	if instance == null:
		failures.append("Failed to instantiate " + description + ": " + path)

	return instance

func check_main_scene_ready(main_instance: Node) -> void:
	var screen_container := main_instance.get_node_or_null("ScreenContainer")
	if screen_container == null:
		failures.append("Main scene is missing ScreenContainer.")
	elif screen_container.get_child_count() == 0:
		failures.append("Main scene ScreenContainer has no active screen.")

	var debug_button := main_instance.get_node_or_null("DebugButton")
	if debug_button == null:
		failures.append("Main scene is missing the overlay DebugButton.")

func check_play_scene_ready() -> void:
	var play_instance: Node = instantiate_scene(UI_SCENE_PATH, "Play scene")
	if play_instance == null:
		return

	root.add_child(play_instance)
	await process_frame

	var missing_required_nodes: Variant = play_instance.get("missing_required_nodes")
	if missing_required_nodes is Array and !missing_required_nodes.is_empty():
		failures.append(
			"Play scene UI is missing required nodes: " +
			", ".join(missing_required_nodes)
		)

	play_instance.queue_free()
	await process_frame

func finish() -> void:
	if failures.is_empty():
		print(
			"CI smoke test passed: loaded " + str(checked_script_count) +
			" client scripts; main scene, autoload, and UI scene load."
		)
		quit(0)
		return

	for failure in failures:
		push_error(failure)

	quit(1)
