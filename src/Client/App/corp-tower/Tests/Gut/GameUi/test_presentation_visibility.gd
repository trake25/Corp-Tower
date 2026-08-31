extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")

var harness

func before_each() -> void:
	harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))

func test_lobby_hides_gameplay_keeps_debug_and_play_restores_visibility() -> void:
	var debug_layer := harness.find("DebugLayer") as CanvasLayer
	var debug_overlay := harness.find("DebugOverlay") as Control
	var chat_popover := harness.find("ChatPopover") as Control
	var gameplay_items: Array[CanvasItem] = []
	var initial_visibility: Dictionary = {}

	for child in harness.main.get_children():
		if child is CanvasItem:
			var item := child as CanvasItem
			gameplay_items.append(item)
			initial_visibility[item] = item.visible

	assert_gt(gameplay_items.size(), 0, "GameUI must expose gameplay presentation layers.")
	chat_popover.call("open")
	assert_true(chat_popover.visible, "The fixture must begin with stale gameplay presentation to clear.")
	harness.main.set_debug_context("lobby")

	for item in gameplay_items:
		assert_false(item.visible, str(item.name) + " must stay hidden beneath the public lobby.")

	assert_true(debug_layer.visible, "The lobby must leave the debug CanvasLayer available.")
	harness.main.toggle_debug_overlay()
	assert_true(debug_overlay.visible, "Lobby debug controls must remain usable while gameplay is hidden.")
	harness.main.toggle_debug_overlay()

	harness.main.set_debug_context("play")
	for item in gameplay_items:
		assert_eq(item.visible, initial_visibility[item], str(item.name) + " must restore its clean play visibility.")
