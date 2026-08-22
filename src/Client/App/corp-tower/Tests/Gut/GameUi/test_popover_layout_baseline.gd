extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const DESIGN_SIZE := Vector2(412, 917)
const EXPANDED_SIZE := Vector2(480, 1067)
const ANDROID_EXPANDED_SIZE := Vector2(484, 917)

var harness

func mount_at(root_size: Vector2) -> void:
	harness = HarnessScript.new()
	await harness.mount(self, root_size)

func shared_card() -> Control:
	return (harness.find("PowerPopover") as Control).get_node("%Card") as Control

func quest_card() -> Control:
	return (harness.find("QuestPopover") as Control).get_node("%Card") as Control

func card_of(popover_name: String) -> Control:
	return (harness.find(popover_name) as Control).get_node("%Card") as Control

func assert_shared_card_tracks_trigger_row() -> void:
	harness.main.power.open_power_popover()
	var trigger_rect: Rect2 = (harness.find("PowerTrigger") as Control).get_global_rect()
	var card_rect: Rect2 = shared_card().get_global_rect()
	assert_almost_eq(card_rect.position.x + card_rect.size.x, trigger_rect.position.x + trigger_rect.size.x + 2.0, 0.5, "The power popover card's right edge should track its own trigger's right edge.")
	assert_almost_eq(card_rect.position.y + card_rect.size.y, trigger_rect.position.y - 13.0, 0.5, "The power popover card should sit just above its own trigger.")

func assert_quest_card_tracks_chip() -> void:
	harness.main.quest.open_quest_popover()
	var chip_rect: Rect2 = (harness.find("QuestChip") as Control).get_global_rect()
	var card_rect: Rect2 = quest_card().get_global_rect()
	assert_almost_eq(card_rect.position.x, chip_rect.position.x + chip_rect.size.x + 5.0, 0.5, "The quest popover card should open just right of the quest chip.")
	assert_almost_eq(card_rect.position.y, chip_rect.position.y, 0.5, "The quest popover card should align with the quest chip's top edge.")

func test_shared_card_tracks_trigger_at_design_size() -> void:
	await mount_at(DESIGN_SIZE)
	assert_shared_card_tracks_trigger_row()

func test_shared_card_tracks_trigger_when_root_grows() -> void:
	await mount_at(EXPANDED_SIZE)
	assert_shared_card_tracks_trigger_row()

func test_quest_card_tracks_chip_at_design_size() -> void:
	await mount_at(DESIGN_SIZE)
	assert_quest_card_tracks_chip()

func test_quest_card_tracks_chip_when_root_grows() -> void:
	await mount_at(EXPANDED_SIZE)
	assert_quest_card_tracks_chip()

func test_bottom_popovers_share_fixed_size_and_baseline() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.power.open_power_popover()
	var power_rect: Rect2 = card_of("PowerPopover").get_global_rect()
	harness.main.chat.open_quick_chat_popover()
	var chat_rect: Rect2 = card_of("ChatPopover").get_global_rect()
	for entry in [["power", power_rect], ["chat", chat_rect]]:
		var rect: Rect2 = entry[1]
		assert_almost_eq(rect.size.x, 260.0, 0.5, "The %s popover card should render at the fixed design width." % entry[0])
		assert_almost_eq(rect.size.y, 163.0, 0.5, "The %s popover card should render at the fixed design height shared by every bottom-row popover." % entry[0])
	assert_almost_eq(chat_rect.position.y + chat_rect.size.y, power_rect.position.y + power_rect.size.y, 0.5, "The chat popover should share the power popover's bottom-edge baseline.")
	assert_eq(StringName(card_of("ChatPopover").theme_type_variation), &"GlassPanel", "Quick Chat should use the shared glass surface.")
	assert_eq(StringName(card_of("PowerPopover").theme_type_variation), &"GlassPanel", "Power should use the shared glass surface.")
	assert_eq(StringName(card_of("QuestPopover").theme_type_variation), &"GlassPanel", "Quest should use the shared glass surface.")

func test_quest_card_stays_fixed_size_with_overlong_label() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.quest.last_side_quest = {"label": "This side quest label is deliberately far too long to fit on a single popover row so that it would wrap onto several lines and grow the card unless the row clips its text horizontally within the fixed card."}
	harness.main.quest.open_quest_popover()
	var card_rect: Rect2 = quest_card().get_global_rect()
	assert_almost_eq(card_rect.size.x, 260.0, 0.5, "An overlong quest label must be clipped horizontally, keeping the quest card at its fixed design width.")
	assert_almost_eq(card_rect.size.y, 140.0, 0.5, "An overlong quest label must be clipped horizontally, keeping the quest card at its fixed design height instead of wrapping and growing.")

func test_score_popup_positions_scale_with_layer_size() -> void:
	await mount_at(DESIGN_SIZE)
	var design_position: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "mvp"})
	assert_almost_eq(design_position.x, DESIGN_SIZE.x * 0.5, 0.5, "MVP popups should center horizontally at the design size.")
	assert_almost_eq(design_position.y, DESIGN_SIZE.y * 0.25, 0.5, "MVP popups should sit at a quarter height at the design size.")
	harness.resize(EXPANDED_SIZE)
	await get_tree().process_frame
	var expanded_position: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "mvp"})
	assert_almost_eq(expanded_position.x, EXPANDED_SIZE.x * 0.5, 0.5, "MVP popups should keep centering horizontally when the layer grows.")
	assert_almost_eq(expanded_position.y, EXPANDED_SIZE.y * 0.25, 0.5, "MVP popups should keep their proportional height when the layer grows.")

func test_play_canvas_scales_across_android_expanded_width() -> void:
	await mount_at(ANDROID_EXPANDED_SIZE)
	var play_field: Control = harness.find("PlayField") as Control
	var top_indicator_rect: Rect2 = (harness.find("TopIndicatorRow") as Control).get_global_rect()
	var background_rect: Rect2 = (harness.find("BgArt") as Control).get_global_rect()
	var expected_scale: float = ANDROID_EXPANDED_SIZE.x / DESIGN_SIZE.x
	assert_almost_eq(play_field.position.x, 0.0, 0.5, "The Android Play canvas should start at the available left edge.")
	assert_almost_eq(play_field.size.x, DESIGN_SIZE.x, 0.5, "Play should retain its authored coordinate width before responsive scaling.")
	assert_almost_eq(play_field.scale.x, expected_scale, 0.001, "Android should scale the authored Play coordinates across the available width.")
	assert_almost_eq(top_indicator_rect.position.x, 8.0 * expected_scale, 0.5, "The top indicator should preserve its guide-relative left margin.")
	assert_almost_eq(top_indicator_rect.end.x, 404.0 * expected_scale, 0.5, "The top indicator should preserve its guide-relative right margin.")
	assert_almost_eq(background_rect.position.x, 0.0, 0.5, "The Play background should continue covering the complete Android root.")
	assert_almost_eq(background_rect.size.x, ANDROID_EXPANDED_SIZE.x, 0.5, "The Play background should fill Android's extra width.")
	var background_style: StyleBoxFlat = (harness.find("Background") as Panel).get_theme_stylebox("panel")
	assert_gt(background_style.bg_color.g, 0.85, "The revealed parallax backdrop should sample the visible sky instead of using the mismatched legacy blue.")

func test_popups_and_summary_draw_above_impact_bars() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.players_ctx.roster = [{"id": "P1", "avatarId": "avatar_0"}]
	harness.main.roster.update_impact_status_ui({
		"requiredBandScore": 40,
		"players": [{"id": "P1", "bandScore": 20, "requiredBandScore": 40}]
	})
	var impact_bar: Control = harness.main.roster.impact_bars["P1"]
	var impact_marker: Control = impact_bar.get_node("%ImpactAvatarMarker") as Control
	var impact_track: Panel = impact_bar.get_node("ImpactBarTrack") as Panel
	assert_gt((harness.find("PowerPopover") as Control).z_index, impact_marker.z_index, "Power popups should draw above Impact avatars.")
	assert_gt((harness.find("ChatPopover") as Control).z_index, impact_marker.z_index, "Chat popups should draw above Impact avatars.")
	assert_gt((harness.find("LevelSummaryOverlay") as Control).z_index, impact_marker.z_index, "Level Summary should draw above Impact avatars.")
	assert_gt((harness.find("ScorePopupLayer") as Control).z_index, impact_track.z_index, "Runtime toasts should draw above Impact fills.")

func test_power_event_builds_a_visible_text_toast() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.power.process_power_events([{
		"id": "power-refresh-1",
		"powerId": "refresh"
	}], [])
	await get_tree().process_frame
	var layer: Control = harness.find("ScorePopupLayer") as Control
	var popup: PanelContainer = layer.get_node("PowerToast") as PanelContainer
	var label: Label = popup.get_node("ToastMargin/ToastLabel") as Label
	assert_eq(label.text, "Team inventory has been refreshed.", "The power toast should carry the guide copy.")
	assert_true(label.is_visible_in_tree(), "The glass power toast must render its text, not only its card.")
	assert_almost_eq(popup.size.x, 330.0, 0.5, "The power toast should retain the guide width.")
	assert_almost_eq(popup.size.y, 64.0, 0.5, "The power toast should retain the guide height.")

func test_placement_popup_lane_positions_interpolate_across_players() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.players_ctx.update_from_players([{"id": "P1"}, {"id": "P2"}, {"id": "P3"}])
	var layer_size: Vector2 = (harness.find("ScorePopupLayer") as Control).size
	var first_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P1"})
	var middle_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P2"})
	var last_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P3"})
	assert_almost_eq(first_lane.x, layer_size.x * 0.16, 0.5, "The first player's placement popup should use the left lane.")
	assert_almost_eq(middle_lane.x, layer_size.x * 0.5, 0.5, "The middle player's placement popup should center.")
	assert_almost_eq(last_lane.x, layer_size.x * 0.84, 0.5, "The last player's placement popup should use the right lane.")
	assert_almost_eq(first_lane.y, layer_size.y * 0.58, 0.5, "Placement popups should use the placement lane height.")
