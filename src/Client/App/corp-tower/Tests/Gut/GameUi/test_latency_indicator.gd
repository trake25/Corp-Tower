extends GutTest

const HarnessScript = preload("res://Tests/Gut/Helpers/GameUiHarness.gd")
const NetworkManagerScript = preload("res://Sys/NetMan/NetworkManager.gd")

func test_toggle_controls_indicator_visibility() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var indicator := harness.find("LatencyIndicator") as Control

	harness.main.update_debug_config({"showLatencyIndicator": false})
	assert_false(indicator.visible, "The indicator must stay hidden while the synchronized toggle is off.")
	harness.main.update_debug_config({"showLatencyIndicator": true})
	assert_true(indicator.visible, "The indicator must become visible when the synchronized toggle is on.")

func test_indicator_container_is_transparent() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	var indicator := harness.find("LatencyIndicator") as Panel

	assert_true(
		indicator.get_theme_stylebox("panel") is StyleBoxEmpty,
		"The latency text must not render inside a visible panel container."
	)

func test_latency_threshold_colors_include_each_boundary() -> void:
	var harness = HarnessScript.new()
	await harness.mount(self, Vector2(412, 917))
	harness.main.update_debug_config({"showLatencyIndicator": true})
	var controller = harness.main.latency_indicator
	var label := harness.find("LatencyIndicatorLabel") as Label

	controller._on_latency_rtt_updated(60)
	assert_eq(label.modulate, controller.GREEN, "60 ms must be green.")
	controller._on_latency_rtt_updated(61)
	assert_eq(label.modulate, controller.YELLOW, "61 ms must be yellow.")
	controller._on_latency_rtt_updated(119)
	assert_eq(label.modulate, controller.YELLOW, "119 ms must be yellow.")
	controller._on_latency_rtt_updated(120)
	assert_eq(label.modulate, controller.RED, "120 ms must be red.")

func test_stale_latency_pongs_are_rejected() -> void:
	var network = NetworkManagerScript.new()
	var received: Array[int] = []
	network.latency_rtt_updated.connect(func(rtt_ms: int): received.append(rtt_ms))
	network.latency_probe_enabled = true
	network.latency_probe_nonce = "current"
	network.latency_probe_sent_at_msec = 100

	network.accept_latency_pong({"nonce": "stale"}, 125)
	assert_eq(received, [], "A mismatched pong must not report a latency value.")
	network.accept_latency_pong({"nonce": "current"}, 125)
	assert_eq(received, [25], "The matching pong must report the transport RTT once.")
	network.accept_latency_pong({"nonce": "current"}, 130)
	assert_eq(received, [25], "A duplicate pong must be ignored after the probe is consumed.")
