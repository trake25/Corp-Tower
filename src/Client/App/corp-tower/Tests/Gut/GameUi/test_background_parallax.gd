extends GutTest

const BackgroundParallax := preload("res://Cor/Scripts/BackgroundParallax.gd")
const HarnessScript := preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const DESIGN_SIZE := Vector2(412.0, 917.0)
const BACKGROUND_SIZE := Vector2(1648.0, 3668.0)
const GROUND_ANCHOR_Y := 720.5

func test_design_viewport_keeps_the_authored_background_crop() -> void:
	assert_almost_eq(
		BackgroundParallax.covered_anchor_shift(
			DESIGN_SIZE,
			BACKGROUND_SIZE,
			DESIGN_SIZE,
			GROUND_ANCHOR_Y
		),
		0.0,
		0.001,
		"The Web-authored 412x917 crop must remain unchanged."
	)

func test_wide_mobile_viewport_compensates_the_covered_crop() -> void:
	assert_almost_eq(
		BackgroundParallax.covered_anchor_shift(
			Vector2(484.0, 917.0),
			BACKGROUND_SIZE,
			DESIGN_SIZE,
			GROUND_ANCHOR_Y
		),
		45.786,
		0.01,
		"A wider Android root should pull the covered background ground line back to its authored height."
	)

func test_android_alignment_moves_only_the_background_art() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(484.0, 917.0))
	var background_art := harness.find("BgArt") as TextureRect
	var image := background_art.get_node("Image") as TextureRect
	var platform := harness.find("PlatformArt") as TextureRect

	assert_almost_eq(image.offset_top, -91.572, 0.02, "The covered image should offset by twice the ground-line correction.")
	assert_almost_eq(image.offset_bottom, 0.0, 0.001, "The aligned image must continue covering the bottom edge.")
	assert_almost_eq(platform.position.y, 712.0, 0.001, "Android crop correction must not move the platform or tower geometry.")
