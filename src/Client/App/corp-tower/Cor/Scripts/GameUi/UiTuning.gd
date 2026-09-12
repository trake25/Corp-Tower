extends RefCounted

const SCORE_POPUP_DEFAULT_DURATION_MS := 1000
const FINISH_SCORE_POPUP_DEFAULT_DURATION_MS := 1550
const LEVEL_SUMMARY_DEFAULT_DELAY_MS := 4000

# Compatibility fallback for older/offline payloads. Ordinary game_state replaces this.
var placement_cooldown_ms: int = 1500
var placement_score_popup_duration_ms: int = SCORE_POPUP_DEFAULT_DURATION_MS
var finish_score_popup_duration_ms: int = FINISH_SCORE_POPUP_DEFAULT_DURATION_MS
var level_summary_delay_ms: int = LEVEL_SUMMARY_DEFAULT_DELAY_MS
