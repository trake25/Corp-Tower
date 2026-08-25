extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const PROGRESS_FILE := "user://tutorial_progress.cfg"

const SHAPE_BLOCK_FIXTURE := {"id": "b1", "shapeId": "L2", "cells": [[0, 0], [0, 1]], "height": 2}

class NetworkStub:
	var is_conn_estab := true
	var placed: Array = []

	func place_block(index: int, column: int = -1) -> void:
		placed.append([index, column])

class TutorialPlaceStub:
	var calls: Array = []

	func on_tutorial_place(index: int, column: int, origin_y: int = -1) -> void:
		calls.append([index, column, origin_y])

var harness

func before_each() -> void:
	if FileAccess.file_exists(PROGRESS_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PROGRESS_FILE))
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func after_all() -> void:
	if FileAccess.file_exists(PROGRESS_FILE):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(PROGRESS_FILE))

func tutorial():
	return harness.main.tutorial

func test_start_lesson_enters_the_first_step() -> void:
	await tutorial().start_lesson(&"basics")
	assert_true(tutorial().is_active(), "Starting a lesson should make the tutorial active.")
	assert_eq(tutorial().current_step_index, 0, "A freshly started lesson must begin at step 0.")
	assert_eq((harness.find("TopIndicatorLabel") as Label).text, "TOP (0/30)", "Tutorial state should use the shared top indicator contract.")

func test_back_is_disabled_on_step_zero_and_enabled_after() -> void:
	await tutorial().start_lesson(&"basics")
	assert_true(tutorial().back_button.disabled, "Back must be disabled on the first step.")

	tutorial().advance()
	assert_eq(tutorial().current_step_index, 1, "advance() should move to the next step.")
	assert_false(tutorial().back_button.disabled, "Back must be enabled once past the first step.")

	tutorial().back()
	assert_eq(tutorial().current_step_index, 0, "back() should return to the previous step.")
	assert_true(tutorial().back_button.disabled, "Back must be disabled again once back at step 0.")

# 'placement' is a single action-gated step now (one physical drag-and-drop),
# so this needs a lesson with a second step to actually observe an advance.
func test_skip_step_advances_without_satisfying_the_gate() -> void:
	await tutorial().start_lesson(&"gravity")
	assert_eq(tutorial().current_step_index, 0, "gravity should start at its first step.")

	tutorial().skip_step()
	assert_eq(tutorial().current_step_index, 1, "Skip step must advance even though no placement gate fired.")

func test_skip_lesson_ends_the_lesson_and_marks_it_complete() -> void:
	await tutorial().start_lesson(&"placement")
	tutorial().skip_lesson()

	assert_false(tutorial().is_active(), "Skipping a lesson must end it.")
	assert_true(tutorial().progress.is_complete(&"placement"), "Skipping a lesson must not strand it as permanently incomplete.")

func test_last_step_finishes_and_marks_the_lesson_complete() -> void:
	await tutorial().start_lesson(&"basics")
	var step_count: int = tutorial().current_lesson.get("steps", []).size()

	for i in range(step_count):
		assert_true(tutorial().is_active(), "The lesson must still be active before its final step.")
		tutorial().advance()

	assert_false(tutorial().is_active(), "Advancing past the last step must end the lesson.")
	assert_true(tutorial().progress.is_complete(&"basics"), "Finishing every step must mark the lesson complete.")

func test_blocks_popovers_true_mid_lesson() -> void:
	assert_false(harness.main.should_block_popovers(), "Popovers must not be blocked before any lesson starts.")
	await tutorial().start_lesson(&"basics")
	assert_true(tutorial().blocks_popovers(), "An info-gated step must keep blocking unrelated popovers.")
	assert_true(harness.main.should_block_popovers(), "Main's shared guard must reflect the tutorial's block state.")

func test_exit_button_ends_lesson_without_marking_it_complete() -> void:
	await tutorial().start_lesson(&"placement")
	tutorial()._on_exit_pressed()

	assert_false(tutorial().is_active(), "The exit button must end the active lesson.")
	assert_false(tutorial().progress.is_complete(&"placement"), "Exiting mid-lesson must leave it incomplete.")

func test_info_gate_only_advances_via_next_not_incidental_actions() -> void:
	await tutorial().start_lesson(&"basics")
	assert_eq(tutorial().current_step_index, 0, "basics should start at its first (info) step.")

	tutorial().on_power_activated({"type": "activate_power", "index": 0})
	assert_eq(
		tutorial().current_step_index, 0,
		"An unrelated dispatched action must not silently satisfy an info gate."
	)

	tutorial().advance()
	assert_eq(tutorial().current_step_index, 1, "Only the Next button should advance an info-gated step.")

func test_stability_lesson_structural_pose_direction_follows_the_actual_drop_column() -> void:
	await tutorial().start_lesson(&"stability")
	var tower_stack: Node = harness.find("TowerStack")
	assert_false(tower_stack.structural_pose.has_targets(), "The seeded tower should start without a scripted structural pose.")

	# Site is columns 2..5 (site_center 4.0); an "L" brick (width 2) at column 2
	# lands left of centre.
	tutorial().on_tutorial_place(0, 2)
	assert_almost_eq(
		float(tower_stack.structural_pose.pose_for("tut-stability-1").get("rotationDeg", 0.0)), -8.0, 0.01,
		"Dropping the brick left of centre must bend the scripted weak section left (negative), not rotate the whole tower."
	)
	assert_almost_eq(float(tower_stack.get("tower_tilt_deg")), 0.0, 0.01, "Standing structural poses must not use the retired whole-tower tilt.")

	await tutorial().start_lesson(&"stability")
	tower_stack = harness.find("TowerStack")

	# Column 4 is the brick's rightmost valid origin on this site -- lands right of centre.
	tutorial().on_tutorial_place(0, 4)
	assert_almost_eq(
		float(tower_stack.structural_pose.pose_for("tut-stability-1").get("rotationDeg", 0.0)), 8.0, 0.01,
		"Dropping the same brick right of centre must bend the scripted weak section right (positive)."
	)

func test_stability_repair_clears_the_scripted_weak_section_pose() -> void:
	await tutorial().start_lesson(&"stability")
	tutorial().on_tutorial_place(0, 2)
	tutorial().on_tutorial_place(0, 4)

	assert_false((harness.find("TowerStack") as Node).structural_pose.has_targets(), "The scripted direct repair should straighten the displayed weak section.")

func test_observe_gate_shows_a_manual_continue_button() -> void:
	await tutorial().start_lesson(&"collapse")
	assert_true(tutorial().next_button.visible, "An observe-gated step must offer a manual way to continue, not only a timer.")
	assert_eq(tutorial().next_button.text, "Continue", "The manual button should read Continue for an observe step.")

	tutorial().advance()
	assert_false(tutorial().is_active(), "Manually continuing past collapse's only step should end the lesson.")

func test_activating_refresh_swaps_the_hand_and_shows_a_toast() -> void:
	await tutorial().start_lesson(&"quest_power")
	var popup_layer: Control = harness.find("ScorePopupLayer") as Control
	var before_count: int = popup_layer.get_child_count()

	tutorial().on_power_activated({"type": "activate_power", "index": 0, "powerId": "refresh"})

	assert_gt(popup_layer.get_child_count(), before_count, "Activating Refresh should show a toast popup.")

	var hand_ids: Array = []
	for block in harness.main.inventory.inventory_slot_blocks:
		if typeof(block) == TYPE_DICTIONARY and block.has("id"):
			hand_ids.append(block.id)

	assert_true(
		hand_ids.has("tut-quest-power-refreshed-1"),
		"Refresh should visibly swap the hand to the seeded refreshed bricks."
	)

func test_sending_quick_chat_shows_a_bubble() -> void:
	await tutorial().start_lesson(&"pressure")
	var popup_layer: Control = harness.find("ScorePopupLayer") as Control
	var before_count: int = popup_layer.get_child_count()

	tutorial().on_chat_sent({"type": "send_chat", "slot": 0})

	assert_gt(popup_layer.get_child_count(), before_count, "Sending a quick chat template should show a bubble.")

func test_tutorial_mode_place_routes_to_tutorial_and_skips_network() -> void:
	var inventory = harness.main.inventory
	var network_stub := NetworkStub.new()
	var tutorial_stub := TutorialPlaceStub.new()

	inventory.network = network_stub
	inventory.tutorial = tutorial_stub
	harness.main.match_state.tutorial_mode = true
	inventory.update_inventory_ui([SHAPE_BLOCK_FIXTURE], 3)

	inventory.on_block_pressed(0, 3, 5)

	assert_eq(
		tutorial_stub.calls, [[0, 3, 5]],
		"Tutorial mode must route the placement, aimed row included, to the tutorial hook."
	)
	assert_eq(network_stub.placed.size(), 0, "Tutorial mode must never contact the real network layer.")
