extends SceneTree

const MAIN_SCENE_PATH := "res://Cor/Scenes/Main.tscn"
const MAIN_SCENE_UID := "uid://c0po62b2x6ltb"
const NETWORK_MANAGER_PATH := "res://Sys/NetMan/NetworkManager.gd"
const DEFAULT_SKIN_PATH := "res://Cor/Scenes/Skins/DefaultSkin.tscn"
const FIGMA_SKIN_PATH := "res://Cor/Scenes/Skins/Figma_SkinV1.tscn"

var failures: Array[String] = []

func _init() -> void:
	call_deferred("run")

func run() -> void:
	check_project_settings()
	check_autoload()
	check_scene_load(DEFAULT_SKIN_PATH, "default UI skin")
	check_scene_load(FIGMA_SKIN_PATH, "Figma UI skin")

	var main_instance: Node = instantiate_scene(MAIN_SCENE_PATH, "main scene")
	if main_instance != null:
		root.add_child(main_instance)
		await process_frame
		check_main_scene_ready(main_instance)
		main_instance.queue_free()
		await process_frame

	finish()

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
	var skin_root := main_instance.get_node_or_null("SkinRoot")
	if skin_root == null:
		failures.append("Main scene is missing SkinRoot.")
		return

	if skin_root.get_child_count() == 0:
		failures.append("Main scene did not load an active UI skin during _ready().")

	var active_skin: Variant = main_instance.get("active_skin")
	if active_skin == null:
		failures.append("Main scene active_skin is null after _ready().")

	var missing_required_nodes: Variant = main_instance.get("missing_required_nodes")
	if missing_required_nodes is Array and !missing_required_nodes.is_empty():
		failures.append(
			"Main scene UI skin is missing required nodes: " +
			", ".join(missing_required_nodes)
		)

func finish() -> void:
	if failures.is_empty():
		print("CI smoke test passed: main scene, autoload, and UI skins load.")
		quit(0)
		return

	for failure in failures:
		push_error(failure)

	quit(1)
