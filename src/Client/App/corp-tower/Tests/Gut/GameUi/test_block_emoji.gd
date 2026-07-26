extends GutTest

const BlockData := preload("res://Cor/Scripts/GameUi/BlockData.gd")

# Pinned against the hand-placed positions in Art/Guide/guide-brick-emoji.png.
const GUIDE_ANCHORS := {
	"I": Vector2(0.5, 2.0),
	"O": Vector2(1.0, 1.0),
	"L": Vector2(0.5, 1.5),
	"T": Vector2(1.5, 1.5),
	"Z": Vector2(1.5, 1.0)
}

func test_every_shape_matches_the_guide_anchor() -> void:
	for shape_id in GUIDE_ANCHORS:
		assert_eq(
			BlockData.emoji_anchor(BlockData.BRICK_SHAPES[shape_id]),
			GUIDE_ANCHORS[shape_id],
			"%s emoji anchor should match the brick-emoji guide." % shape_id
		)

func test_every_shape_anchor_lands_on_brick_mass() -> void:
	for shape_id in BlockData.BRICK_SHAPES:
		var cells: Array = BlockData.BRICK_SHAPES[shape_id]
		var anchor: Vector2 = BlockData.emoji_anchor(cells)
		var touching: bool = false

		for cell in cells:
			var center := Vector2(float(cell[0]) + 0.5, float(cell[1]) + 0.5)

			if absf(anchor.x - center.x) <= 0.5 and absf(anchor.y - center.y) <= 0.5:
				touching = true
				break

		assert_true(touching, "%s emoji anchor should sit on an occupied cell." % shape_id)

func test_rotated_shapes_keep_the_anchor_on_brick_mass() -> void:
	for shape_id in BlockData.BRICK_SHAPES:
		var cells: Array = BlockData.BRICK_SHAPES[shape_id]

		for step in range(1, 4):
			cells = _rotate_cells_cw(cells)

			var anchor: Vector2 = BlockData.emoji_anchor(cells)
			var touching: bool = false

			for cell in cells:
				var center := Vector2(float(cell[0]) + 0.5, float(cell[1]) + 0.5)

				if absf(anchor.x - center.x) <= 0.5 and absf(anchor.y - center.y) <= 0.5:
					touching = true
					break

			assert_true(
				touching,
				"%s rotated %d step(s) should keep its emoji anchor on brick mass." % [shape_id, step]
			)

func test_dictionary_cells_resolve_the_same_anchor() -> void:
	assert_eq(
		BlockData.emoji_anchor([{"x": 1, "y": 0}, {"x": 0, "y": 1}, {"x": 1, "y": 1}, {"x": 2, "y": 1}]),
		GUIDE_ANCHORS["T"],
		"Dictionary-style cells should resolve the same anchor as array cells."
	)

func test_legacy_column_anchors_at_its_middle() -> void:
	assert_eq(
		BlockData.emoji_anchor([[0, 0], [0, 1], [0, 2]]),
		Vector2(0.5, 1.5),
		"An odd-height legacy column should anchor on its middle cell."
	)
	assert_eq(
		BlockData.emoji_anchor([[0, 0], [0, 1], [0, 2], [0, 3]]),
		Vector2(0.5, 2.0),
		"An even-height legacy column should anchor between its two middle cells."
	)

func test_empty_cells_do_not_crash() -> void:
	assert_eq(
		BlockData.emoji_anchor([]),
		Vector2.ZERO,
		"An empty footprint should resolve to the origin rather than divide by zero."
	)

func test_each_mood_resolves_its_own_texture() -> void:
	var positive: Texture2D = BlockData.emoji_texture("positive")
	var negative: Texture2D = BlockData.emoji_texture("negative")
	var neutral: Texture2D = BlockData.emoji_texture("neutral")

	assert_not_null(positive, "The positive mood should resolve a texture.")
	assert_not_null(negative, "The negative mood should resolve a texture.")
	assert_not_null(neutral, "The neutral mood should resolve a texture.")
	assert_ne(positive, negative, "Positive and negative moods should differ.")
	assert_ne(positive, neutral, "Positive and neutral moods should differ.")
	assert_ne(negative, neutral, "Negative and neutral moods should differ.")

func test_unknown_mood_falls_back_to_neutral() -> void:
	assert_eq(
		BlockData.emoji_texture(""),
		BlockData.emoji_texture(BlockData.DEFAULT_EMOJI_MOOD),
		"An unknown mood should fall back to the neutral face."
	)

func test_delta_classifies_against_the_threshold_in_both_directions() -> void:
	assert_eq(BlockData.emoji_mood_for_delta(5, 5), "positive", "A delta at +threshold is positive.")
	assert_eq(BlockData.emoji_mood_for_delta(40, 5), "positive", "A large rise is positive.")
	assert_eq(BlockData.emoji_mood_for_delta(4, 5), "neutral", "A rise under threshold is neutral.")
	assert_eq(BlockData.emoji_mood_for_delta(0, 5), "neutral", "No change is neutral.")
	assert_eq(BlockData.emoji_mood_for_delta(-4, 5), "neutral", "A fall under threshold is neutral.")
	assert_eq(BlockData.emoji_mood_for_delta(-5, 5), "negative", "A delta at -threshold is negative.")
	assert_eq(BlockData.emoji_mood_for_delta(-100, 5), "negative", "A collapse is negative.")

# The knob's whole point is that one delta reads differently at different
# thresholds -- that is what lets a designer sweep it and watch the tower change.
func test_the_same_delta_reclassifies_as_the_threshold_moves() -> void:
	assert_eq(BlockData.emoji_mood_for_delta(-6, 3), "negative", "-6 is a fall at threshold 3.")
	assert_eq(BlockData.emoji_mood_for_delta(-6, 10), "neutral", "The same -6 is noise at threshold 10.")
	assert_eq(BlockData.emoji_mood_for_delta(7, 3), "positive", "+7 is a rise at threshold 3.")
	assert_eq(BlockData.emoji_mood_for_delta(7, 10), "neutral", "The same +7 is noise at threshold 10.")

func test_a_zero_threshold_still_leaves_a_neutral_band() -> void:
	assert_eq(
		BlockData.emoji_mood_for_delta(0, 0),
		"neutral",
		"A 0 threshold must floor to 1, or a 0 delta would satisfy both directions."
	)

func _rotate_cells_cw(cells: Array) -> Array:
	var rotated: Array = []
	var min_x: int = 999999
	var min_y: int = 999999

	for cell in cells:
		rotated.append([int(cell[1]), -int(cell[0])])

	for cell in rotated:
		min_x = mini(min_x, cell[0])
		min_y = mini(min_y, cell[1])

	var normalized: Array = []

	for cell in rotated:
		normalized.append([cell[0] - min_x, cell[1] - min_y])

	return normalized
