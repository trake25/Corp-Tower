extends GutTest

const MAIN_SCENE_PATH := "res://Cor/Scenes/Main.tscn"
const MAIN_SCENE_UID := "uid://c0po62b2x6ltb"
const NETWORK_MANAGER_PATH := "res://Sys/NetMan/NetworkManager.gd"
const DEFAULT_SKIN_PATH := "res://Cor/Scenes/Skins/DefaultSkin.tscn"
const FIGMA_SKIN_PATH := "res://Cor/Scenes/Skins/Figma_SkinV1.tscn"
const PlayerColors := preload("res://Cor/Scripts/PlayerColors.gd")

func test_project_main_scene_points_to_committed_main_scene() -> void:
	var main_scene := str(ProjectSettings.get_setting("application/run/main_scene", ""))

	assert_true(
		[MAIN_SCENE_PATH, MAIN_SCENE_UID].has(main_scene),
		"Project main scene should resolve to the committed main scene."
	)

func test_network_manager_autoload_is_configured() -> void:
	assert_eq(
		str(ProjectSettings.get_setting("autoload/NetworkManager", "")),
		"*" + NETWORK_MANAGER_PATH,
		"NetworkManager should be configured as an autoload singleton."
	)

	assert_not_null(
		load(NETWORK_MANAGER_PATH),
		"NetworkManager script should load."
	)

func test_startup_scenes_load() -> void:
	for scene_path in [MAIN_SCENE_PATH, DEFAULT_SKIN_PATH, FIGMA_SKIN_PATH]:
		assert_not_null(
			load(scene_path),
			"Startup scene should load: " + scene_path
		)

func test_main_scene_instantiates() -> void:
	var scene := load(MAIN_SCENE_PATH) as PackedScene
	assert_not_null(scene, "Main scene should load as a PackedScene.")

	if scene == null:
		return

	var instance := scene.instantiate()
	assert_not_null(instance, "Main scene should instantiate.")

	if instance != null:
		instance.free()

func test_player_color_defaults_and_wrapping() -> void:
	assert_eq(
		PlayerColors.color_for_player_id(""),
		PlayerColors.FALLBACK_COLOR,
		"Empty player IDs should use the fallback color."
	)
	assert_eq(
		PlayerColors.color_for_player_index(-1),
		PlayerColors.FALLBACK_COLOR,
		"Negative player indexes should use the fallback color."
	)
	assert_eq(
		PlayerColors.color_for_player_index(PlayerColors.PLAYER_COLORS.size()),
		PlayerColors.PLAYER_COLORS[0],
		"Player color indexes should wrap around the configured palette."
	)
