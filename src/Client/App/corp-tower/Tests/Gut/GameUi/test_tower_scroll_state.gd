extends GutTest

const TowerScrollState := preload("res://Cor/Scripts/GameUi/TowerScrollState.gd")

func configured_state() -> RefCounted:
	var state := TowerScrollState.new()
	state.configure(16, 30, 16, 17, 0.7, 3.0, 1)
	return state

func test_normal_target_preserves_the_existing_rounded_auto_follow_formula() -> void:
	assert_eq(TowerScrollState.calculate_normal_target(16, 30, 17, 0.7, 3.0, 1), 5.0)
	assert_eq(TowerScrollState.calculate_normal_target(10, 16, 17, 0.7, 3.0, 1), 0.0)

func test_navigation_and_mid_pan_reversal_are_fractional_and_continuous() -> void:
	var state = configured_state()
	state.snap_to_normal()
	assert_true(state.navigate_to_row(0.0))

	state.step(0.05)
	assert_almost_eq(state.displayed_offset_units, 4.55, 0.001)
	var reversal_start: float = state.displayed_offset_units
	assert_true(state.return_to_auto())
	assert_almost_eq(state.displayed_offset_units, reversal_start, 0.001)

	state.step(0.025)
	assert_almost_eq(state.displayed_offset_units, 4.775, 0.001)
	state.step(1.0)
	assert_eq(state.displayed_offset_units, state.normal_target_units)
	assert_eq(state.mode, TowerScrollState.Mode.AUTO)

func test_incoming_tower_growth_retargets_auto_without_snapping_manual_navigation() -> void:
	var state = configured_state()
	state.snap_to_normal()
	state.navigate_to_row(0.0)
	state.step(0.1)
	var displayed_before_update: float = state.displayed_offset_units

	state.configure(18, 30, 18, 17, 0.7, 3.0, 1)

	assert_gt(state.normal_target_units, 5.0)
	assert_almost_eq(state.displayed_offset_units, displayed_before_update, 0.001)
	state.step(0.1)
	assert_lt(state.displayed_offset_units, displayed_before_update)

func test_auto_follow_catching_up_is_not_manual_navigation() -> void:
	var state = configured_state()

	assert_true(state.is_displaced())
	assert_false(state.is_manually_displaced())
	state.snap_to_normal()
	assert_true(state.navigate_to_row(0.0))
	assert_true(state.is_manually_displaced())

func test_freeze_and_extent_clamping_keep_navigation_bounded() -> void:
	var state = configured_state()
	state.snap_to_normal()
	state.navigate_to_row(-100.0)
	state.frozen = true
	assert_false(state.step(1.0))
	assert_eq(state.displayed_offset_units, 5.0)

	state.frozen = false
	state.configure(4, 30, 4, 17, 0.7, 3.0, 1)
	assert_eq(state.maximum_offset_units, 0.0)
	assert_eq(state.displayed_offset_units, 0.0)
