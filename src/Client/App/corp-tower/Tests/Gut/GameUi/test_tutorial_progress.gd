extends GutTest

const TutorialProgressScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialProgress.gd")
const PROGRESS_FILE := "user://tutorial_progress.cfg"

func before_each() -> void:
	if FileAccess.file_exists(PROGRESS_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PROGRESS_FILE))

func after_all() -> void:
	if FileAccess.file_exists(PROGRESS_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PROGRESS_FILE))

func test_missing_file_degrades_to_nothing_completed() -> void:
	var progress = TutorialProgressScript.new()
	assert_false(progress.is_complete(&"basics"), "With no save file at all, no lesson should read as complete.")
	assert_eq(progress.completed_ids().size(), 0, "completed_ids should be empty with no save file.")

func test_mark_complete_persists_across_instances() -> void:
	var progress = TutorialProgressScript.new()
	progress.mark_complete(&"basics")
	assert_true(progress.is_complete(&"basics"), "The instance that marked a lesson complete should read it back immediately.")

	var reloaded = TutorialProgressScript.new()
	assert_true(reloaded.is_complete(&"basics"), "A fresh instance must read the persisted completion from disk.")
	assert_false(reloaded.is_complete(&"bricks"), "A lesson that was never marked must read as incomplete.")

func test_reset_clears_a_single_lesson() -> void:
	var progress = TutorialProgressScript.new()
	progress.mark_complete(&"basics")
	progress.mark_complete(&"bricks")
	progress.reset(&"basics")

	assert_false(progress.is_complete(&"basics"), "reset should clear only the requested lesson.")
	assert_true(progress.is_complete(&"bricks"), "reset must not affect other completed lessons.")

	var reloaded = TutorialProgressScript.new()
	assert_false(reloaded.is_complete(&"basics"), "The reset must be persisted, not just in-memory.")

func test_corrupt_file_degrades_to_nothing_completed() -> void:
	var file := FileAccess.open(PROGRESS_FILE, FileAccess.WRITE)
	file.store_string("this is not valid ConfigFile syntax {{{")
	file.close()

	var progress = TutorialProgressScript.new()
	assert_false(progress.is_complete(&"basics"), "A corrupt save file must degrade to nothing completed rather than erroring.")
	assert_eq(progress.completed_ids().size(), 0, "A corrupt save file must not report any lesson as completed.")
