extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const TutorialLessonsScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd")
const TutorialGatesScript = preload("res://Cor/Scripts/GameUi/Tutorial/TutorialGates.gd")

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func test_lesson_ids_are_unique() -> void:
	var ids: Array = TutorialLessonsScript.lesson_ids()
	var seen: Dictionary = {}

	for lesson_id in ids:
		assert_false(seen.has(lesson_id), "Lesson id '%s' is declared more than once." % str(lesson_id))
		seen[lesson_id] = true

	assert_eq(ids.size(), 12, "The catalog is specified as a 12-lesson set.")

func test_defaults_expose_the_tutorial_seed_contract() -> void:
	for key in [
		"level",
		"target_height",
		"grid_width",
		"site_width",
		"placeable_min",
		"placeable_max",
		"hand_slots_level_1",
		"hand_slots_level_3",
		"placement_cooldown_ms",
		"level_time_limit_ms",
		"impact_min_contribution_share",
		"impact_requirement_score",
		"impact_interval",
		"power_unlock_level"
	]:
		assert_true(TutorialLessonsScript.DEFAULTS.has(key), "Tutorial seed defaults must include '%s'." % key)

func test_impact_lesson_uses_canonical_contribution_fields() -> void:
	var lesson: Dictionary = TutorialLessonsScript.lesson_by_id(&"impact")
	var status: Dictionary = lesson.get("seed", {}).get("impact_status", {})

	assert_true(status.has("requiredContribution"), "The tutorial must seed the canonical Impact requirement field.")
	assert_false(status.has("requiredBandScore"), "The tutorial must not teach a compatibility-only Impact field.")
	for player_status in status.get("players", []):
		assert_true(player_status.has("bandContribution"), "The tutorial must use canonical personal contribution values.")

func test_every_lesson_has_at_least_one_step() -> void:
	for lesson in TutorialLessonsScript.all_lessons():
		var steps: Array = lesson.get("steps", [])
		assert_gt(steps.size(), 0, "Lesson '%s' must declare at least one step." % str(lesson.get("id", "")))

func test_every_step_gate_is_in_the_closed_set() -> void:
	for lesson in TutorialLessonsScript.all_lessons():
		for step in lesson.get("steps", []):
			var gate: StringName = step.get("gate", &"")
			assert_true(
				TutorialGatesScript.is_gate(gate),
				"Lesson '%s' step '%s' has gate '%s', which is not in TutorialGates.ALL." % [
					str(lesson.get("id", "")), str(step.get("id", "")), str(gate)
				]
			)

func test_lesson_by_id_resolves_every_catalog_entry() -> void:
	for lesson_id in TutorialLessonsScript.lesson_ids():
		var lesson: Dictionary = TutorialLessonsScript.lesson_by_id(lesson_id)
		assert_false(lesson.is_empty(), "lesson_by_id must resolve every id returned by lesson_ids.")
		assert_eq(lesson.get("id", &""), lesson_id, "lesson_by_id must return the matching lesson.")

	assert_true(
		TutorialLessonsScript.lesson_by_id(&"not_a_real_lesson").is_empty(),
		"An unknown lesson id must resolve to an empty dictionary, not null or an error."
	)

# The load-bearing regression guard: catches both a renamed node and another
# control being moved under LegacyHidden (or any other hidden container).
func test_every_step_target_resolves_and_is_visible() -> void:
	for lesson in TutorialLessonsScript.all_lessons():
		for step in lesson.get("steps", []):
			var target_name: StringName = step.get("target", &"")
			assert_false(
				str(target_name) == "",
				"Lesson '%s' step '%s' has no target." % [str(lesson.get("id", "")), str(step.get("id", ""))]
			)

			var target: Control = harness.find(str(target_name)) as Control
			assert_not_null(
				target,
				"Lesson '%s' step '%s' targets '%s', which does not resolve in GameUI.tscn." % [
					str(lesson.get("id", "")), str(step.get("id", "")), str(target_name)
				]
			)

			if target != null:
				assert_true(
					target.is_visible_in_tree(),
					"Lesson '%s' step '%s' targets '%s', which is not visible in the mounted scene." % [
						str(lesson.get("id", "")), str(step.get("id", "")), str(target_name)
					]
				)
