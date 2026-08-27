extends RefCounted

const DEFAULT_IMPACT_BEAT := true
const DEFAULT_SCREEN_SHAKE := true
const DEFAULT_MIN_ZOOM := 0.3
const DEFAULT_ZOOM_OUT_MS := 900
const DEFAULT_WAVE_MS := 1100
const DEFAULT_HOLD_MS := 0
const DEFAULT_COLLAPSE_DEBRIS_LIFETIME_MS := 2000
const DEFAULT_SHAKE_MS := 260
const DEFAULT_SHAKE_MAGNITUDE_UNITS := 0.22

var impact_beat_enabled: bool = DEFAULT_IMPACT_BEAT
var screen_shake_enabled: bool = DEFAULT_SCREEN_SHAKE
var impact_beat_min_zoom: float = DEFAULT_MIN_ZOOM
var impact_beat_zoom_out_ms: int = DEFAULT_ZOOM_OUT_MS
var impact_beat_wave_ms: int = DEFAULT_WAVE_MS
var impact_beat_hold_ms: int = DEFAULT_HOLD_MS
var collapse_debris_lifetime_ms: int = DEFAULT_COLLAPSE_DEBRIS_LIFETIME_MS
var screen_shake_ms: int = DEFAULT_SHAKE_MS
var screen_shake_magnitude_units: float = DEFAULT_SHAKE_MAGNITUDE_UNITS

func apply(config: Variant) -> void:
	if typeof(config) != TYPE_DICTIONARY:
		return

	var hooks: Dictionary = config

	impact_beat_enabled = bool(hooks.get("impactBeat", DEFAULT_IMPACT_BEAT))
	screen_shake_enabled = bool(hooks.get("screenShake", DEFAULT_SCREEN_SHAKE))
	impact_beat_min_zoom = clampf(
		float(hooks.get("impactBeatMinZoom", DEFAULT_MIN_ZOOM)), 0.05, 1.0
	)
	impact_beat_zoom_out_ms = maxi(0, int(hooks.get("impactBeatZoomOutMs", DEFAULT_ZOOM_OUT_MS)))
	impact_beat_wave_ms = maxi(0, int(hooks.get("impactBeatWaveMs", DEFAULT_WAVE_MS)))
	impact_beat_hold_ms = maxi(0, int(hooks.get("impactBeatHoldMs", DEFAULT_HOLD_MS)))
	collapse_debris_lifetime_ms = maxi(
		0, int(hooks.get("collapseDebrisLifetimeMs", DEFAULT_COLLAPSE_DEBRIS_LIFETIME_MS))
	)
	screen_shake_ms = maxi(0, int(hooks.get("screenShakeMs", DEFAULT_SHAKE_MS)))
	screen_shake_magnitude_units = maxf(
		0.0, float(hooks.get("screenShakeMagnitudeUnits", DEFAULT_SHAKE_MAGNITUDE_UNITS))
	)

func impact_beat_total_ms() -> int:
	return impact_beat_zoom_out_ms + impact_beat_wave_ms + impact_beat_hold_ms

func impact_beat_total_seconds() -> float:
	return float(impact_beat_total_ms()) / 1000.0
