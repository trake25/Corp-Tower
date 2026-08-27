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
	assert_lte(card_rect.end.y, trigger_rect.position.y, "The power popover should stay above its trigger.")
	assert_true(card_rect.has_point(Vector2(trigger_rect.get_center().x, card_rect.get_center().y)), "The power popover should track its trigger horizontally.")

func assert_quest_card_tracks_chip() -> void:
	harness.main.quest.open_quest_popover()
	var chip_rect: Rect2 = (harness.find("QuestChip") as Control).get_global_rect()
	var card_rect: Rect2 = quest_card().get_global_rect()
	assert_gte(card_rect.position.x, chip_rect.end.x, "The quest popover should open to the right of its trigger.")
	assert_true(card_rect.position.y <= chip_rect.get_center().y and card_rect.end.y >= chip_rect.get_center().y, "The quest trigger should remain aligned with the popover.")

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
	assert_eq(chat_rect.size, power_rect.size, "Bottom-row popovers should share one card structure.")
	assert_almost_eq(chat_rect.position.y + chat_rect.size.y, power_rect.position.y + power_rect.size.y, 0.5, "The chat popover should share the power popover's bottom-edge baseline.")
	assert_eq(StringName(card_of("ChatPopover").theme_type_variation), &"GlassPanel", "Quick Chat should use the shared glass surface.")
	assert_eq(StringName(card_of("PowerPopover").theme_type_variation), &"GlassPanel", "Power should use the shared glass surface.")
	assert_eq(StringName(card_of("QuestPopover").theme_type_variation), &"GlassPanel", "Quest should use the shared glass surface.")

func test_quest_card_stays_fixed_size_with_overlong_label() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.quest.open_quest_popover()
	var initial_size: Vector2 = quest_card().size
	harness.main.quest.last_side_quest = {"label": "This side quest label is deliberately far too long to fit on a single popover row so that it would wrap onto several lines and grow the card unless the row clips its text horizontally within the fixed card."}
	harness.main.quest.open_quest_popover()
	assert_eq(quest_card().size, initial_size, "Content length must not change the popover structure.")

func test_score_popup_positions_scale_with_layer_size() -> void:
	await mount_at(DESIGN_SIZE)
	var design_position: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "mvp"})
	assert_almost_eq(design_position.x, DESIGN_SIZE.x * 0.5, 0.5, "MVP popups should center horizontally at the design size.")
	harness.resize(EXPANDED_SIZE)
	await get_tree().process_frame
	var expanded_position: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "mvp"})
	assert_almost_eq(expanded_position.x, EXPANDED_SIZE.x * 0.5, 0.5, "MVP popups should keep centering horizontally when the layer grows.")
	assert_gt(expanded_position.y, 0.0)
	assert_lt(expanded_position.y, EXPANDED_SIZE.y)

func test_play_canvas_uses_responsive_anchors_without_stretching_art() -> void:
	await mount_at(ANDROID_EXPANDED_SIZE)
	var play_field: Control = harness.find("PlayField") as Control
	var top_indicator_rect: Rect2 = (harness.find("TopIndicatorRow") as Control).get_global_rect()
	var tower_rect: Rect2 = (harness.find("TowerStack") as Control).get_global_rect()
	var platform_rect: Rect2 = (harness.find("PlatformArt") as Control).get_global_rect()
	var timer_rect: Rect2 = (harness.find("RoundTimeBadge") as Control).get_global_rect()
	var level_rect: Rect2 = (harness.find("LevelBadge") as Control).get_global_rect()
	var impact_rect: Rect2 = (harness.find("ImpactTrack") as Control).get_global_rect()
	var power_circle_rect: Rect2 = (harness.find("PowerTriggerCircle") as Control).get_global_rect()
	var background_rect: Rect2 = (harness.find("BgArt") as Control).get_global_rect()
	assert_almost_eq(play_field.get_global_rect().position.x, 0.0, 0.5, "The Play canvas should start at the available left edge.")
	assert_almost_eq(play_field.get_global_rect().end.x, ANDROID_EXPANDED_SIZE.x, 0.5, "Play should occupy the complete logical width.")
	assert_eq(play_field.scale, Vector2.ONE, "Android must not non-uniformly scale the Play canvas.")
	assert_almost_eq(tower_rect.get_center().x, ANDROID_EXPANDED_SIZE.x * 0.5, 0.5, "The tower should remain centered on Android.")
	assert_almost_eq(platform_rect.get_center().x, tower_rect.get_center().x, 0.5, "The platform should stay attached to the centered tower during parallax.")
	assert_almost_eq(power_circle_rect.size.x, power_circle_rect.size.y, 0.5, "Circular HUD controls must remain circular.")
	assert_almost_eq(background_rect.position.x, play_field.get_global_rect().position.x, 0.5)
	assert_almost_eq(background_rect.end.x, play_field.get_global_rect().end.x, 0.5)
	assert_true(top_indicator_rect.position.x >= play_field.get_global_rect().position.x and top_indicator_rect.end.x <= play_field.get_global_rect().end.x)
	assert_true(timer_rect.position.x >= play_field.get_global_rect().position.x and level_rect.end.x <= play_field.get_global_rect().end.x)
	assert_true(impact_rect.end.x <= play_field.get_global_rect().end.x)

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
	assert_true(label.is_visible_in_tree(), "The glass power toast must render its text, not only its card.")
	assert_true(layer.get_global_rect().encloses(popup.get_global_rect()), "The power toast should stay inside its overlay.")

func test_placement_popup_lane_positions_interpolate_across_players() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.players_ctx.update_from_players([{"id": "P1"}, {"id": "P2"}, {"id": "P3"}])
	var layer_size: Vector2 = (harness.find("ScorePopupLayer") as Control).size
	var first_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P1"})
	var middle_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P2"})
	var last_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P3"})
	assert_gt(first_lane.x, 0.0)
	assert_almost_eq(middle_lane.x, layer_size.x * 0.5, 0.5, "The middle player's placement popup should center.")
	assert_lt(last_lane.x, layer_size.x)
	assert_lt(first_lane.x, middle_lane.x)
	assert_lt(middle_lane.x, last_lane.x)
	assert_almost_eq(first_lane.y, middle_lane.y, 0.5)
	assert_almost_eq(middle_lane.y, last_lane.y, 0.5)
