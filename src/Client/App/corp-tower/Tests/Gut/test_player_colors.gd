extends GutTest

const PlayerColors := preload("res://Cor/Scripts/PlayerColors.gd")

func test_empty_player_id_uses_fallback_color() -> void:
	assert_eq(
		PlayerColors.color_for_player_id(""),
		PlayerColors.FALLBACK_COLOR,
		"Empty player IDs should use the fallback color."
	)

func test_negative_player_index_uses_fallback_color() -> void:
	assert_eq(
		PlayerColors.color_for_player_index(-1),
		PlayerColors.FALLBACK_COLOR,
		"Negative player indexes should use the fallback color."
	)

func test_player_color_index_wraps_palette() -> void:
	assert_eq(
		PlayerColors.color_for_player_index(PlayerColors.PLAYER_COLORS.size()),
		PlayerColors.PLAYER_COLORS[0],
		"Player color indexes should wrap around the configured palette."
	)
