extends Node

const GREEN := Color("#5EE68C")
const YELLOW := Color("#FFD166")
const RED := Color("#FF6B6B")
const NEUTRAL := Color("#E5E7EB")

var indicator: Control
var label: Label
var network

func bind_nodes(binder) -> void:
	indicator = binder.require_node("LatencyIndicator") as Control
	label = binder.require_node("LatencyIndicatorLabel") as Label

func setup(network_ref) -> void:
	network = network_ref
	network.latency_rtt_updated.connect(_on_latency_rtt_updated)
	reset_display()

func apply_config(config) -> void:
	var enabled := bool(config.get("showLatencyIndicator", false))
	indicator.visible = enabled
	network.set_latency_probe_enabled(enabled)
	if not enabled:
		reset_display()

func reset_display() -> void:
	if label == null:
		return
	label.text = "Latency: —"
	label.modulate = NEUTRAL

func _on_latency_rtt_updated(rtt_ms: int) -> void:
	if label == null or indicator == null or not indicator.visible:
		return

	label.text = "Latency: %d ms" % rtt_ms
	if rtt_ms <= 60:
		label.modulate = GREEN
	elif rtt_ms < 120:
		label.modulate = YELLOW
	else:
		label.modulate = RED
