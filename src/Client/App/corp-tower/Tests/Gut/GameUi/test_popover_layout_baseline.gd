extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

const DESIGN_SIZE := Vector2(412, 917)
const EXPANDED_SIZE := Vector2(480, 1067)

var harness

func mount_at(root_size: Vector2) -> void:
	harness = HarnessScript.new()
	await harness.mount(self, root_size)

func shared_card() -> Control:
	return (harness.find("TeamInventoryPopover") as Control).get_node("%Card") as Control

func quest_card() -> Control:
	return (harness.find("QuestPopover") as Control).get_node("%Card") as Control

func assert_shared_card_tracks_trigger_row() -> void:
	harness.main.open_team_inventory_popover()
	var trigger_rect: Rect2 = (harness.find("PowerTrigger") as Control).get_global_rect()
	var card_rect: Rect2 = shared_card().get_global_rect()
	assert_almost_eq(card_rect.position.x + card_rect.size.x, trigger_rect.position.x + trigger_rect.size.x + 2.0, 0.5, "The shared popover card's right edge should track the trigger row's right edge.")
	assert_almost_eq(card_rect.position.y + card_rect.size.y, trigger_rect.position.y - 13.0, 0.5, "The shared popover card should sit just above the trigger row.")

func assert_quest_card_tracks_chip() -> void:
	harness.main.open_quest_popover()
	var chip_rect: Rect2 = (harness.find("QuestChip") as Control).get_global_rect()
	var card_rect: Rect2 = quest_card().get_global_rect()
	assert_almost_eq(card_rect.position.x, chip_rect.position.x + chip_rect.size.x + 5.0, 0.5, "The quest popover card should open just right of the quest chip.")
	assert_almost_eq(card_rect.position.y, chip_rect.position.y, 0.5, "The quest popover card should align with the quest chip's top edge.")

func test_shared_card_matches_authored_layout_at_design_size() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.open_team_inventory_popover()
	var card_rect: Rect2 = shared_card().get_global_rect()
	var origin: Vector2 = harness.main.get_global_rect().position
	assert_almost_eq(card_rect.position.x - origin.x, 136.0, 0.5, "At the 412x917 design size the shared card must keep its authored x position.")
	assert_almost_eq(card_rect.position.y - origin.y, 601.0, 0.5, "At the 412x917 design size the shared card must keep its authored y position.")

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

func test_placement_popup_lane_positions_interpolate_across_players() -> void:
	await mount_at(DESIGN_SIZE)
	harness.main.players_ctx.update_from_players([{"id": "P1"}, {"id": "P2"}, {"id": "P3"}])
	var layer_size: Vector2 = (harness.find("ScorePopupLayer") as Control).size
	var first_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P1"})
	var middle_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P2"})
	var last_lane: Vector2 = harness.main.score_popups.get_score_popup_position({"type": "placement", "playerId": "P3"})
	assert_almost_eq(first_lane.x, layer_size.x * 0.22, 0.5, "The first player's placement popup should use the left lane.")
	assert_almost_eq(middle_lane.x, layer_size.x * 0.5, 0.5, "The middle player's placement popup should center.")
	assert_almost_eq(last_lane.x, layer_size.x * 0.78, 0.5, "The last player's placement popup should use the right lane.")
	assert_almost_eq(first_lane.y, layer_size.y * 0.58, 0.5, "Placement popups should use the placement lane height.")
