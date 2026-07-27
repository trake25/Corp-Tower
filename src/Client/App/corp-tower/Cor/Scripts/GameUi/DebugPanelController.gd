extends Node

const UiTuningScript = preload("res://Cor/Scripts/GameUi/UiTuning.gd")
const BOT_STRATEGY_COOPERATIVE := "cooperative"
const BOT_STRATEGY_MVP_GREEDY := "mvp_greedy"
const TOWER_FEEDBACK_MODES := ["warnings_only", "meter_only", "live_preview"]
const TOWER_FEEDBACK_MODE_TITLES := ["Warnings Only", "Meter Only", "Live Preview"]
const DEBUG_CATEGORY_NAMES := [
	"Bots", "Round", "UI", "Supply", "Scoring", "Impact", "Tower", "Power", "Parallax", "Placement"
]

# Per-variable explainers for the server-backed categories, keyed by the row's
# name-button node. Parallax/Placement carry their own copy inside their row
# tables; these categories are hand-wired, so they live here instead.
const DEBUG_TOOLTIPS := {
	# --- Tower -------------------------------------------------------------
	"TowerStabilityDifficultyLabel": {
		"title": "Stability Difficulty",
		"body": "The single dial for how punishing the tower is. Everything else — overhang weight, collapse threshold, slenderness band, support tolerance, the maturity ramp — is derived from it.\n\npressure = (this / 100) x (0.25 + 0.75 x min(1, level / 30))\n\nThreat also ramps with LEVEL, so the same setting is gentle early and dangerous late: at 90, level 1 sits near 87% stability and never collapses, while level 30+ punishes a careless column hard.\n\n0 = stability effectively off (score multiplier only). 90 = shipping default. 100 = brutal, greedy play fails the Impact gate.",
	},
	"TowerMaxTiltLabel": {
		"title": "Max Tilt Angle",
		"body": "Visual only. The lean in degrees drawn when tilt score reaches 1.0. Does not change when the tower collapses — that is derived from Stability Difficulty.\n\nHigher = drama. Lower = subtle.",
	},
	"TowerSiteSlendernessLabel": {
		"title": "Site Slenderness Target",
		"body": "Sets how wide the buildable site is for a given target height.\n\nsite width = even round-up(target height / this), clamped to Site Width Min..Max.\n\nAt 6.75 the site runs 6 columns on levels 1-28 (the Site Width Min floor), then 8 from level 29 — landing at full width just as stability pressure peaks at level 30.\n\nLower = wider site, easier. The site is also what slenderness is measured against — building on the full site width is always penalty-free, so widening the site widens the safe zone too.",
	},
	"TowerSiteWidthMinLabel": {
		"title": "Site Width Min",
		"body": "Narrowest the buildable site may get, in columns. Floors the formula above.",
	},
	"TowerSiteWidthMaxLabel": {
		"title": "Site Width Max",
		"body": "Widest the buildable site may get, in columns.\n\nHard ceiling is 8: the tower viewport is 272px at a 34px brick, so columns outside that are drawn off-screen and the player never sees those bricks.",
	},
	"TowerWarningThresholdLabel": {
		"title": "Warning Threshold",
		"body": "Stability % at or below which the \"Tower Wobbling\" cue fires. Display only — no gameplay effect.",
	},
	"TowerCriticalThresholdLabel": {
		"title": "Critical Threshold",
		"body": "Stability % at or below which the \"Tower Critical\" cue fires. Display only, and clamped to never exceed Warning.",
	},
	"TowerMoodThresholdLabel": {
		"title": "Brick Mood Threshold",
		"body": "How far a placement must move the tower toward or away from centre before the brick's face reacts.\n\nbalance delta = (lean before - lean after) / collapse threshold x 100\n\ndelta >= this = smiley, delta <= -this = worried, in between = disbelief. Display only, no gameplay effect.\n\nThis is NOT the change in the Stability %. That score is min(lean, integrity) and sags as the tower grows, so a perfectly centred brick read as a loss and straightening a lean was masked whenever integrity was the lower axis. This reads the lean alone, so a centred brick scores 0 at every height and pulling the tower back upright always scores positive.\n\nEach brick's delta is fixed at placement, but this compares against it live — dragging the slider restyles the whole standing tower immediately.\n\nMeasured mix across levels 1-30: at 1 roughly 29/58/13 smiley/worried/disbelief, at 3 about 17/33/50, at 5 about 12/18/70.\n\nBricks with no face at all mean the server is older than this feature and is not sending a delta.",
	},
	"TowerFeedbackModeLabel": {
		"title": "Stability Feedback",
		"body": "How stability is surfaced: warning popups only, a numeric meter, or a live preview. Presentation only.",
	},
	# --- Impact ------------------------------------------------------------
	"ImpactIntervalLabel": {
		"title": "Impact Interval",
		"body": "How many levels between Impacts. 1 = every level must be banked to advance, and a failure replays only that level.\n\nLarger = longer runs between checkpoints, so a rollback costs more.",
	},
	"ImpactScoreLabel": {
		"title": "Min Contribution Share",
		"body": "The share of a level's expected placement score EACH player must personally earn to advance.\n\nrequired = share x target height x level x Placement Score/Height\n\nWith 3 players, share x 3 is how much of the pool must be split evenly — above ~0.30 the gate becomes nearly impossible. 0 disables it.",
	},
	"ImpactScoreFloorLabel": {
		"title": "Impact Flat Floor",
		"body": "Legacy absolute score floor per player, applied alongside the share.\n\nrequirement = max(this, share-derived requirement)\n\nLeave at 0 unless you specifically want a fixed number rather than a percentage.",
	},
	# --- Supply ------------------------------------------------------------
	"LevelSupplyMinLabel": {
		"title": "Supply Min Surplus",
		"body": "Lowest total brick height a level may be dealt, above the amount needed.\n\nrequired = ceil(target height / packing efficiency), then this is added.\n\nRaise to guarantee slack; too low and levels run out of bricks.",
	},
	"LevelSupplyMaxLabel": {
		"title": "Supply Max Surplus",
		"body": "Highest total brick height above the requirement. Widens the accepted band so the generator can find a valid hand.\n\nHigher = more spare bricks, more overbuild and easier exact finishes.",
	},
	"MinPrecisionBlocksLabel": {
		"title": "Min Precision Bricks",
		"body": "How many height-1 or height-2 bricks a level's supply must contain. These are what let a team land an exact finish rather than overbuilding.\n\nRaise if Perfect Build feels luck-based.",
	},
	"MaxTeamCarryOverLabel": {
		"title": "Team Carry-Over",
		"body": "How many unused bricks survive into the next level, smallest first. Discarded entirely when a level fails.\n\nHigher = leftover precision bricks bank up between levels.",
	},
	"RefreshMinUsefulHeightLabel": {
		"title": "Refresh Useful Height",
		"body": "Minimum brick height a Refresh tries to hand you when the team's remaining height allows it, so a reroll is not wasted on tiny bricks.",
	},
	"SupplyEffectiveWidthLabel": {
		"title": "Supply Effective Width",
		"body": "How much of the site a tower is assumed to actually occupy when sizing supply.\n\nefficiency = cells per brick / (avg brick height x (site width x this + 0.5))\n\nLower = assumes a narrow tower, deals fewer bricks. Raise if levels run dry.",
	},
	# --- Scoring -----------------------------------------------------------
	"PlacementScoreLabel": {
		"title": "Placement Score / Height",
		"body": "The core earner, paid per unit of height your brick actually added.\n\npoints = effective height x level x this x stability multiplier\n\nEffective height is capped by the height still missing, so late placements pay less.",
	},
	"PlacementStabilityFloorLabel": {
		"title": "Placement Stability Floor",
		"body": "The multiplier on placement score when the tower is at 0 stability.\n\nmultiplier = floor + (1 - floor) x (stability before your placement / 100)\n\n0.5 = a wobbling tower halves your take. 1.0 = stability does not affect scoring at all.",
	},
	"ReinforceIntegrityLabel": {
		"title": "Reinforce / Integrity",
		"body": "Paid when your placement raises the tower's integrity — widening the base or reducing unsupported cells.\n\npoints += integrity gained x this x level\n\nThis is the reward for fixing the tower instead of racing. Raise to make repair competitive with grabbing height.",
	},
	"ReinforceLeanLabel": {
		"title": "Reinforce / Lean",
		"body": "Paid when your placement straightens a leaning tower.\n\npoints += (|lean before| - |lean after|) x this x level\n\nLean is roughly 0..collapse threshold, so this multiplier is large relative to the integrity one.",
	},
	"FinisherBonusLabel": {
		"title": "Finisher Bonus / Level",
		"body": "Flat reward to whoever places the final brick, exact or not.\n\npoints = level x this\n\nDefault 0 on purpose: overbuilding to steal the finish should earn nothing.",
	},
	"PrecisionBonusLabel": {
		"title": "Precision Bonus / Level",
		"body": "Paid only to the player who finishes the tower at EXACTLY the target height.\n\npoints = level x this\n\nThe main individual prize for a Perfect Build.",
	},
	"TeamExactBonusLabel": {
		"title": "Team Exact Bonus / Level",
		"body": "Paid to EVERY player on an exact finish.\n\npoints = level x this\n\nThe cooperative counterweight to the Precision bonus, and a big help toward each player's Impact share.",
	},
	"AssistBonusLabel": {
		"title": "Assist Bonus / Level",
		"body": "Optional reward for players who cleared the assist threshold but did not finish.\n\npoints = level x this\n\nDisabled at 0 by default.",
	},
	"AssistThresholdLabel": {
		"title": "Assist Threshold",
		"body": "Minimum contribution share needed to qualify for the Assist bonus. Only matters when Assist Bonus is above 0.",
	},
}

const PARALLAX_TARGET_TOWER := "tower"
const PARALLAX_TARGET_SKY := "sky"
const PARALLAX_TARGET_GROUND := "ground"

const PARALLAX_ROWS := [
	{
		"key": "ScrollStartRatio", "target": PARALLAX_TARGET_TOWER, "property": "scroll_start_ratio",
		"label": "Scroll Start Ratio", "min": 0.0, "max": 100.0, "step": 5.0, "percent": true,
		"tooltip": "How full the screen has to feel before the camera starts panning at all. Lower = camera starts helping earlier (shorter towers). Higher = camera waits longer before it starts helping.",
	},
	{
		"key": "ScrollEasePower", "target": PARALLAX_TARGET_TOWER, "property": "scroll_ease_power",
		"label": "Scroll Ease Power", "min": 1.0, "max": 6.0, "step": 0.5, "decimals": 1,
		"tooltip": "The \"holding back\" curve. Higher = camera stays almost still for most of the climb and only rushes to the bar in the last few bricks. Lower toward 1 = a steady, even approach the whole way.",
	},
	{
		"key": "TopIndicatorClearance", "target": PARALLAX_TARGET_TOWER, "property": "top_indicator_clearance_units",
		"label": "Top Indicator Clearance", "min": 0.0, "max": 4.0, "step": 1.0, "is_int": true, "suffix": " bricks",
		"tooltip": "How much daylight is left between the top brick and the bar at a perfect finish. Bigger = more visible gap at 100%. 0 = try to touch it exactly.",
	},
	{
		"key": "BrickUnitSize", "target": PARALLAX_TARGET_TOWER, "property": "brick_unit_size",
		"label": "Brick Unit Size", "min": 20.0, "max": 48.0, "step": 1.0, "is_int": true, "suffix": "px",
		"tooltip": "Physical size of a brick on screen. Bigger bricks = fewer visible at once, chunkier/bolder tower; also changes how many bricks fit before scrolling is needed at all.",
	},
	{
		"key": "DropDuration", "target": PARALLAX_TARGET_TOWER, "property": "drop_duration",
		"label": "Drop Duration", "min": 0.05, "max": 1.0, "step": 0.05, "decimals": 2, "suffix": " sec",
		"tooltip": "How long a freshly placed brick takes to animate down into its slot. Longer = floatier, more weighty landing. Shorter = snappier, more immediate.",
	},
	{
		"key": "TiltEaseSpeed", "target": PARALLAX_TARGET_TOWER, "property": "tilt_ease_speed",
		"label": "Tilt Ease Speed", "min": 1.0, "max": 15.0, "step": 0.5, "decimals": 1,
		"tooltip": "How quickly the tower's lean animation catches up to the server's actual tilt reading. Higher = tower reacts to instability sharply/immediately. Lower = a slower, more organic sway.",
	},
	{
		"key": "CollapseTiltDeg", "target": PARALLAX_TARGET_TOWER, "property": "collapse_tilt_deg",
		"label": "Collapse Tilt", "min": 10.0, "max": 90.0, "step": 5.0, "is_int": true, "suffix": "°",
		"tooltip": "How far over the tower visually keels when it actually collapses — a pure \"sell the failure\" flourish, doesn't affect live play.",
	},
	{
		"key": "TopPadding", "target": PARALLAX_TARGET_TOWER, "property": "top_padding",
		"label": "Top Padding", "min": 0.0, "max": 40.0, "step": 2.0, "is_int": true, "suffix": "px",
		"tooltip": "Small reserved margin at the very top of the tower's drawing area — mostly invisible headroom, rarely worth touching.",
	},
	{
		"key": "BottomPadding", "target": PARALLAX_TARGET_TOWER, "property": "bottom_padding",
		"label": "Bottom Padding", "min": 0.0, "max": 40.0, "step": 2.0, "is_int": true, "suffix": "px",
		"tooltip": "Small reserved margin at the bottom of the tower's drawing area, above the ground line.",
	},
	{
		"key": "SkyParallaxRatio", "target": PARALLAX_TARGET_SKY, "property": "parallax_ratio",
		"label": "Sky Parallax Ratio", "min": 0.0, "max": 100.0, "step": 5.0, "percent": true,
		"tooltip": "How fast the sky moves relative to the tower's own scroll. Lower = feels farther away/slower (distant sky). Higher = feels closer/faster.",
	},
	{
		"key": "SkyEaseSpeed", "target": PARALLAX_TARGET_SKY, "property": "ease_speed",
		"label": "Sky Ease Speed", "min": 1.0, "max": 10.0, "step": 0.5, "decimals": 1,
		"tooltip": "How snappily the sky catches up whenever the scroll target changes. Higher = tight, immediate follow. Lower = a laggy, dreamy trail.",
	},
	{
		"key": "GroundParallaxRatio", "target": PARALLAX_TARGET_GROUND, "property": "parallax_ratio",
		"label": "Ground Parallax Ratio", "min": 0.0, "max": 200.0, "step": 5.0, "percent": true,
		"tooltip": "How fast the ground platform moves relative to the tower's own scroll. Higher = feels closer/faster (keeps the ground glued to the tower's base instead of lagging behind as it recedes).",
	},
	{
		"key": "GroundEaseSpeed", "target": PARALLAX_TARGET_GROUND, "property": "ease_speed",
		"label": "Ground Ease Speed", "min": 1.0, "max": 10.0, "step": 0.5, "decimals": 1,
		"tooltip": "How snappily the ground platform catches up whenever the scroll target changes. Higher = tight, immediate follow. Lower = laggy trail.",
	},
]

const PLACEMENT_ROWS := [
	{
		"key": "SnapRadius", "target": PARALLAX_TARGET_TOWER, "property": "snap_radius_units",
		"label": "Snap Radius", "min": 0.5, "max": 6.0, "step": 0.1, "decimals": 1, "suffix": " bricks",
		"tooltip": "How close a dragged brick's corner has to get to a snap point before it locks on. Higher = very forgiving, the brick jumps to points from far away. Lower = you have to aim, and drags far from the tower fall back to plain column aiming.",
	},
	{
		"key": "DragGripOffset", "target": PARALLAX_TARGET_TOWER, "property": "drag_grip_offset_units",
		"label": "Drag Grip Lift", "min": 0.0, "max": 4.0, "step": 0.1, "decimals": 1, "suffix": " bricks",
		"tooltip": "How far above the finger the dragged brick floats, so the thumb doesn't cover it. Higher = brick sits well clear of the hand but feels detached. 0 = brick sits right under the finger and gets hidden by it on a phone.",
	},
	{
		"key": "GhostAlpha", "target": PARALLAX_TARGET_TOWER, "property": "ghost_alpha",
		"label": "Landing Ghost Opacity", "min": 0.0, "max": 100.0, "step": 5.0, "percent": true,
		"tooltip": "How solid the preview of the brick's landing spot looks. Higher = reads as an almost-placed brick. Lower = a faint hint that's easier to see the tower through.",
	},
	{
		"key": "SnapDotRadius", "target": PARALLAX_TARGET_TOWER, "property": "snap_dot_radius",
		"label": "Snap Dot Size", "min": 1.0, "max": 8.0, "step": 0.5, "decimals": 1, "suffix": "px",
		"tooltip": "Size of the small rings marking every available snap point while dragging. Bigger = easier to see on a phone but busier over the tower.",
	},
	{
		"key": "SnapTargetRadius", "target": PARALLAX_TARGET_TOWER, "property": "snap_target_radius",
		"label": "Snap Target Size", "min": 4.0, "max": 18.0, "step": 0.5, "decimals": 1, "suffix": "px",
		"tooltip": "Size of the highlight ring around the point the brick is currently locked onto. Bigger = the chosen target stands out further from its neighbours.",
	},
]

static func tunable_rows() -> Array:
	return PARALLAX_ROWS + PLACEMENT_ROWS

var tuning
var network
var is_syncing_debug_config: bool = false

var debug_overlay: Control
var debug_dim_layer: Control
var debug_tooltip: Control
var reset_debug_button: Button
var restart_level_button: Button
var close_debug_button: Button
var category_dropdown: OptionButton
var category_panels: Dictionary = {}
var parallax_targets: Dictionary = {}
var parallax_buttons: Dictionary = {}
var parallax_sliders: Dictionary = {}
var bots_toggle: CheckButton
var bot_strategy_button: OptionButton
var bot_count_label: Label
var bot_count_slider: HSlider
var bot_delay_min_label: Label
var bot_delay_min_slider: HSlider
var bot_delay_max_label: Label
var bot_delay_max_slider: HSlider
var debug_start_level_label: Label
var debug_start_level_slider: HSlider
var cooldown_label: Label
var cooldown_slider: HSlider
var level_time_label: Label
var level_time_slider: HSlider
var start_delay_label: Label
var start_delay_slider: HSlider
var placement_popup_duration_label: Label
var placement_popup_duration_slider: HSlider
var finish_popup_duration_label: Label
var finish_popup_duration_slider: HSlider
var level_summary_delay_label: Label
var level_summary_delay_slider: HSlider
var target_multiplier_label: Label
var target_multiplier_slider: HSlider
var level_supply_min_label: Control
var level_supply_min_slider: HSlider
var level_supply_max_label: Control
var level_supply_max_slider: HSlider
var min_precision_blocks_label: Control
var min_precision_blocks_slider: HSlider
var max_team_carry_over_label: Control
var max_team_carry_over_slider: HSlider
var refresh_min_useful_height_label: Control
var refresh_min_useful_height_slider: HSlider
var placement_score_label: Control
var placement_score_slider: HSlider
var impact_score_label: Control
var impact_score_slider: HSlider
var impact_interval_label: Control
var impact_interval_slider: HSlider
var impact_score_floor_label: Control
var impact_score_floor_slider: HSlider
var finisher_bonus_label: Control
var finisher_bonus_slider: HSlider
var precision_bonus_label: Control
var precision_bonus_slider: HSlider
var team_exact_bonus_label: Control
var team_exact_bonus_slider: HSlider
var assist_bonus_label: Control
var assist_bonus_slider: HSlider
var assist_threshold_label: Control
var assist_threshold_slider: HSlider
var tower_stability_difficulty_label: Control
var tower_stability_difficulty_slider: HSlider
var tower_max_tilt_label: Control
var tower_max_tilt_slider: HSlider
var tower_site_slenderness_label: Control
var tower_site_slenderness_slider: HSlider
var tower_site_width_min_label: Control
var tower_site_width_min_slider: HSlider
var tower_site_width_max_label: Control
var tower_site_width_max_slider: HSlider
var supply_effective_width_label: Control
var supply_effective_width_slider: HSlider
var placement_stability_floor_label: Control
var placement_stability_floor_slider: HSlider
var reinforce_integrity_label: Control
var reinforce_integrity_slider: HSlider
var reinforce_lean_label: Control
var reinforce_lean_slider: HSlider
var tower_warning_threshold_label: Control
var tower_warning_threshold_slider: HSlider
var tower_critical_threshold_label: Control
var tower_critical_threshold_slider: HSlider
var tower_mood_threshold_label: Control
var tower_mood_threshold_slider: HSlider
var tower_feedback_mode_button: OptionButton
var power_unlock_level_label: Label
var power_unlock_level_slider: HSlider
var power_max_slots_label: Label
var power_max_slots_slider: HSlider
var power_cooldown_label: Label
var power_cooldown_slider: HSlider

func bind_nodes(binder) -> void:
	debug_overlay = binder.optional_node("DebugOverlay") as Control
	debug_dim_layer = binder.optional_node("DebugDimLayer") as Control
	debug_tooltip = binder.optional_node("DebugTooltip") as Control
	category_dropdown = binder.optional_node("DebugCategoryDropdown") as OptionButton
	category_panels = {
		"Bots": binder.optional_node("Bots") as Control,
		"Round": binder.optional_node("Round") as Control,
		"UI": binder.optional_node("UI") as Control,
		"Supply": binder.optional_node("Supply") as Control,
		"Scoring": binder.optional_node("Scoring") as Control,
		"Impact": binder.optional_node("Impact") as Control,
		"Tower": binder.optional_node("Tower") as Control,
		"Power": binder.optional_node("Power") as Control,
		"Parallax": binder.optional_node("Parallax") as Control,
		"Placement": binder.optional_node("Placement") as Control,
	}
	parallax_targets = {
		PARALLAX_TARGET_TOWER: binder.optional_node("TowerStack"),
		PARALLAX_TARGET_SKY: binder.optional_node("BgArt"),
		PARALLAX_TARGET_GROUND: binder.optional_node("PlatformArt"),
	}
	for row in tunable_rows():
		parallax_buttons[row.key] = binder.optional_node(row.key + "Button") as Button
		parallax_sliders[row.key] = binder.optional_node(row.key + "Slider") as HSlider
	reset_debug_button = binder.optional_node("ResetDebugButton") as Button
	restart_level_button = binder.optional_node("RestartLevelButton") as Button
	close_debug_button = binder.optional_node("CloseDebugButton") as Button
	bots_toggle = binder.optional_node("BotsToggle") as CheckButton
	bot_strategy_button = binder.optional_node("BotStrategyButton") as OptionButton
	bot_count_label = binder.optional_node("BotCountLabel") as Label
	bot_count_slider = binder.optional_node("BotCountSlider") as HSlider
	bot_delay_min_label = binder.optional_node("BotDelayMinLabel") as Label
	bot_delay_min_slider = binder.optional_node("BotDelayMinSlider") as HSlider
	bot_delay_max_label = binder.optional_node("BotDelayMaxLabel") as Label
	bot_delay_max_slider = binder.optional_node("BotDelayMaxSlider") as HSlider
	debug_start_level_label = binder.optional_node("DebugStartLevelLabel") as Label
	debug_start_level_slider = binder.optional_node("DebugStartLevelSlider") as HSlider
	cooldown_label = binder.optional_node("CooldownLabel") as Label
	cooldown_slider = binder.optional_node("CooldownSlider") as HSlider
	level_time_label = binder.optional_node("LevelTimeLabel") as Label
	level_time_slider = binder.optional_node("LevelTimeSlider") as HSlider
	start_delay_label = binder.optional_node("StartDelayLabel") as Label
	start_delay_slider = binder.optional_node("StartDelaySlider") as HSlider
	placement_popup_duration_label = binder.optional_node("PlacementPopupDurationLabel") as Label
	placement_popup_duration_slider = binder.optional_node("PlacementPopupDurationSlider") as HSlider
	finish_popup_duration_label = binder.optional_node("FinishPopupDurationLabel") as Label
	finish_popup_duration_slider = binder.optional_node("FinishPopupDurationSlider") as HSlider
	level_summary_delay_label = binder.optional_node("LevelSummaryDelayLabel") as Label
	level_summary_delay_slider = binder.optional_node("LevelSummaryDelaySlider") as HSlider
	target_multiplier_label = binder.optional_node("TargetMultiplierLabel") as Label
	target_multiplier_slider = binder.optional_node("TargetMultiplierSlider") as HSlider
	level_supply_min_label = bind_tooltip_row(binder, "LevelSupplyMinLabel")
	level_supply_min_slider = binder.optional_node("LevelSupplyMinSlider") as HSlider
	level_supply_max_label = bind_tooltip_row(binder, "LevelSupplyMaxLabel")
	level_supply_max_slider = binder.optional_node("LevelSupplyMaxSlider") as HSlider
	min_precision_blocks_label = bind_tooltip_row(binder, "MinPrecisionBlocksLabel")
	min_precision_blocks_slider = binder.optional_node("MinPrecisionBlocksSlider") as HSlider
	max_team_carry_over_label = bind_tooltip_row(binder, "MaxTeamCarryOverLabel")
	max_team_carry_over_slider = binder.optional_node("MaxTeamCarryOverSlider") as HSlider
	refresh_min_useful_height_label = bind_tooltip_row(binder, "RefreshMinUsefulHeightLabel")
	refresh_min_useful_height_slider = binder.optional_node("RefreshMinUsefulHeightSlider") as HSlider
	placement_score_label = bind_tooltip_row(binder, "PlacementScoreLabel")
	placement_score_slider = binder.optional_node("PlacementScoreSlider") as HSlider
	impact_score_label = bind_tooltip_row(binder, "ImpactScoreLabel")
	impact_score_slider = binder.optional_node("ImpactScoreSlider") as HSlider
	impact_interval_label = bind_tooltip_row(binder, "ImpactIntervalLabel")
	impact_interval_slider = binder.optional_node("ImpactIntervalSlider") as HSlider
	impact_score_floor_label = bind_tooltip_row(binder, "ImpactScoreFloorLabel")
	impact_score_floor_slider = binder.optional_node("ImpactScoreFloorSlider") as HSlider
	finisher_bonus_label = bind_tooltip_row(binder, "FinisherBonusLabel")
	finisher_bonus_slider = binder.optional_node("FinisherBonusSlider") as HSlider
	precision_bonus_label = bind_tooltip_row(binder, "PrecisionBonusLabel")
	precision_bonus_slider = binder.optional_node("PrecisionBonusSlider") as HSlider
	team_exact_bonus_label = bind_tooltip_row(binder, "TeamExactBonusLabel")
	team_exact_bonus_slider = binder.optional_node("TeamExactBonusSlider") as HSlider
	assist_bonus_label = bind_tooltip_row(binder, "AssistBonusLabel")
	assist_bonus_slider = binder.optional_node("AssistBonusSlider") as HSlider
	assist_threshold_label = bind_tooltip_row(binder, "AssistThresholdLabel")
	assist_threshold_slider = binder.optional_node("AssistThresholdSlider") as HSlider
	tower_stability_difficulty_label = bind_tooltip_row(binder, "TowerStabilityDifficultyLabel")
	tower_stability_difficulty_slider = binder.optional_node("TowerStabilityDifficultySlider") as HSlider
	tower_max_tilt_label = bind_tooltip_row(binder, "TowerMaxTiltLabel")
	tower_max_tilt_slider = binder.optional_node("TowerMaxTiltSlider") as HSlider
	tower_site_slenderness_label = bind_tooltip_row(binder, "TowerSiteSlendernessLabel")
	tower_site_slenderness_slider = binder.optional_node("TowerSiteSlendernessSlider") as HSlider
	tower_site_width_min_label = bind_tooltip_row(binder, "TowerSiteWidthMinLabel")
	tower_site_width_min_slider = binder.optional_node("TowerSiteWidthMinSlider") as HSlider
	tower_site_width_max_label = bind_tooltip_row(binder, "TowerSiteWidthMaxLabel")
	tower_site_width_max_slider = binder.optional_node("TowerSiteWidthMaxSlider") as HSlider
	supply_effective_width_label = bind_tooltip_row(binder, "SupplyEffectiveWidthLabel")
	supply_effective_width_slider = binder.optional_node("SupplyEffectiveWidthSlider") as HSlider
	placement_stability_floor_label = bind_tooltip_row(binder, "PlacementStabilityFloorLabel")
	placement_stability_floor_slider = binder.optional_node("PlacementStabilityFloorSlider") as HSlider
	reinforce_integrity_label = bind_tooltip_row(binder, "ReinforceIntegrityLabel")
	reinforce_integrity_slider = binder.optional_node("ReinforceIntegritySlider") as HSlider
	reinforce_lean_label = bind_tooltip_row(binder, "ReinforceLeanLabel")
	reinforce_lean_slider = binder.optional_node("ReinforceLeanSlider") as HSlider
	tower_warning_threshold_label = bind_tooltip_row(binder, "TowerWarningThresholdLabel")
	tower_warning_threshold_slider = binder.optional_node("TowerWarningThresholdSlider") as HSlider
	tower_critical_threshold_label = bind_tooltip_row(binder, "TowerCriticalThresholdLabel")
	tower_critical_threshold_slider = binder.optional_node("TowerCriticalThresholdSlider") as HSlider
	tower_mood_threshold_label = bind_tooltip_row(binder, "TowerMoodThresholdLabel")
	tower_mood_threshold_slider = binder.optional_node("TowerMoodThresholdSlider") as HSlider
	tower_feedback_mode_button = binder.optional_node("TowerFeedbackModeButton") as OptionButton
	power_unlock_level_label = binder.optional_node("PowerUnlockLevelLabel") as Label
	power_unlock_level_slider = binder.optional_node("PowerUnlockLevelSlider") as HSlider
	power_max_slots_label = binder.optional_node("PowerMaxSlotsLabel") as Label
	power_max_slots_slider = binder.optional_node("PowerMaxSlotsSlider") as HSlider
	power_cooldown_label = binder.optional_node("PowerCooldownLabel") as Label
	power_cooldown_slider = binder.optional_node("PowerCooldownSlider") as HSlider

func setup(tuning_ref, network_ref) -> void:
	tuning = tuning_ref
	network = network_ref

	if debug_overlay != null:
		set_open(false)

	if close_debug_button != null:
		close_debug_button.pressed.connect(func(): set_open(false))

	if reset_debug_button != null:
		reset_debug_button.pressed.connect(on_reset_debug_pressed)

	if restart_level_button != null:
		restart_level_button.pressed.connect(on_restart_level_pressed)

	if debug_dim_layer != null:
		debug_dim_layer.mouse_filter = Control.MOUSE_FILTER_STOP
		debug_dim_layer.gui_input.connect(on_debug_dim_layer_input)

	if bots_toggle != null:
		bots_toggle.toggled.connect(on_bots_toggle)

	if bot_strategy_button != null:
		bot_strategy_button.clear()
		bot_strategy_button.add_item("Cooperative", 0)
		bot_strategy_button.add_item("MVP Greedy", 1)
		bot_strategy_button.item_selected.connect(on_bot_strategy_selected)

	configure_slider(bot_count_slider, 0, 2, 1, func(value): send_debug_int("debugBotCount", value))
	configure_slider(bot_delay_min_slider, 250, 10000, 250, func(value): send_debug_int("debugBotDelayMin", value))
	configure_slider(bot_delay_max_slider, 250, 10000, 250, func(value): send_debug_int("debugBotDelayMax", value))
	configure_slider(debug_start_level_slider, 1, 99, 1, func(value): send_debug_int("debugStartLevel", value))
	configure_slider(cooldown_slider, 0, 5000, 250, func(value): send_debug_int("placementCooldown", value))
	configure_slider(level_time_slider, 5000, 120000, 1000, func(value): send_debug_int("levelTimeLimitMs", value))
	configure_slider(start_delay_slider, 0, 10000, 500, func(value): send_debug_int("startDelayMs", value))
	configure_slider(placement_popup_duration_slider, 500, 10000, 500, on_placement_popup_duration_changed)
	configure_slider(finish_popup_duration_slider, 500, 10000, 500, on_finish_popup_duration_changed)
	configure_slider(level_summary_delay_slider, 1000, 10000, 500, on_level_summary_delay_changed)
	configure_slider(target_multiplier_slider, 1, 20, 1, func(value): send_debug_int("targetHeightMultiplier", value))
	configure_slider(level_supply_min_slider, 0, 20, 1, func(value): send_debug_int("levelSupplyMinSurplus", value))
	configure_slider(level_supply_max_slider, 0, 30, 1, func(value): send_debug_int("levelSupplyMaxSurplus", value))
	configure_slider(min_precision_blocks_slider, 0, 9, 1, func(value): send_debug_int("minPrecisionBlocksPerLevel", value))
	configure_slider(max_team_carry_over_slider, 0, 12, 1, func(value): send_debug_int("maxTeamCarryOverBlocks", value))
	configure_slider(refresh_min_useful_height_slider, 1, 6, 1, func(value): send_debug_int("refreshMinUsefulBlockHeight", value))
	configure_slider(placement_score_slider, 1, 25, 1, func(value): send_debug_int("placementScorePerHeight", value))
	configure_slider(impact_score_slider, 0, 50, 5, func(value): send_debug_float("impactMinContributionShare", value / 100.0))
	configure_slider(impact_interval_slider, 1, 10, 1, func(value): send_debug_int("impactInterval", value))
	configure_slider(impact_score_floor_slider, 0, 5000, 50, func(value): send_debug_int("impactScoreRequirement", value))
	configure_slider(finisher_bonus_slider, 0, 25, 1, func(value): send_debug_int("finisherBonusPerLevel", value))
	configure_slider(precision_bonus_slider, 0, 25, 1, func(value): send_debug_int("precisionBonusPerLevel", value))
	configure_slider(team_exact_bonus_slider, 0, 25, 1, func(value): send_debug_int("teamExactBonusPerLevel", value))
	configure_slider(assist_bonus_slider, 0, 25, 1, func(value): send_debug_int("assistBonusPerLevel", value))
	configure_slider(assist_threshold_slider, 0, 100, 5, func(value): send_debug_float("assistContributionThreshold", value / 100.0))
	configure_slider(tower_stability_difficulty_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityDifficulty", value))
	configure_slider(tower_max_tilt_slider, 5, 60, 1, func(value): send_debug_int("towerMaxTiltAngleDeg", value))
	configure_slider(tower_site_slenderness_slider, 1.0, 12.0, 0.25, func(value): send_debug_float("towerSiteSlendernessTarget", value))
	configure_slider(tower_site_width_min_slider, 2, 8, 2, func(value): send_debug_int("towerSiteWidthMin", value))
	configure_slider(tower_site_width_max_slider, 2, 8, 2, func(value): send_debug_int("towerSiteWidthMax", value))
	configure_slider(supply_effective_width_slider, 10, 200, 5, func(value): send_debug_float("supplyEffectiveWidthRatio", value / 100.0))
	configure_slider(placement_stability_floor_slider, 0, 100, 5, func(value): send_debug_float("placementStabilityFloor", value / 100.0))
	configure_slider(reinforce_integrity_slider, 0, 25, 1, func(value): send_debug_float("reinforceScorePerIntegrity", value))
	configure_slider(reinforce_lean_slider, 0, 200, 5, func(value): send_debug_float("reinforceScorePerLean", value))
	configure_slider(tower_warning_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityWarningThreshold", value))
	configure_slider(tower_critical_threshold_slider, 0, 100, 5, func(value): send_debug_int("towerStabilityCriticalThreshold", value))
	configure_slider(tower_mood_threshold_slider, 1, 50, 1, func(value): send_debug_int("towerStabilityMoodThreshold", value))
	configure_slider(power_unlock_level_slider, 1, 20, 1, func(value): send_debug_int("powerUnlockLevel", value))
	configure_slider(power_max_slots_slider, 1, 6, 1, func(value): send_debug_int("powerMaxSlots", value))
	configure_slider(power_cooldown_slider, 0, 30000, 500, func(value): send_debug_int("powerActivationCooldownMs", value))

	if tower_feedback_mode_button != null:
		tower_feedback_mode_button.clear()
		for i in range(TOWER_FEEDBACK_MODES.size()):
			tower_feedback_mode_button.add_item(TOWER_FEEDBACK_MODE_TITLES[i], i)
		tower_feedback_mode_button.item_selected.connect(on_tower_feedback_mode_selected)

	setup_category_dropdown()
	setup_parallax_controls()
	update_debug_labels()

func setup_category_dropdown() -> void:
	if category_dropdown == null:
		return

	category_dropdown.clear()
	for i in range(DEBUG_CATEGORY_NAMES.size()):
		category_dropdown.add_item(DEBUG_CATEGORY_NAMES[i], i)

	category_dropdown.item_selected.connect(on_category_selected)
	category_dropdown.select(0)
	on_category_selected(0)

func on_category_selected(index: int) -> void:
	if index < 0 or index >= DEBUG_CATEGORY_NAMES.size():
		return

	var selected_name: String = DEBUG_CATEGORY_NAMES[index]
	for category_name in category_panels:
		var panel: Control = category_panels[category_name]
		if panel != null:
			panel.visible = (category_name == selected_name)

func setup_parallax_controls() -> void:
	for row in tunable_rows():
		var target_node = parallax_targets.get(row.target)
		var slider: HSlider = parallax_sliders.get(row.key)
		var button: Button = parallax_buttons.get(row.key)

		if target_node == null or slider == null:
			continue

		var raw_value: float = float(target_node.get(row.property))
		var display_value: float = raw_value * 100.0 if row.get("percent", false) else raw_value

		slider.min_value = row.min
		slider.max_value = row.max
		slider.step = row.step
		slider.set_value_no_signal(display_value)
		slider.value_changed.connect(func(value): on_parallax_slider_changed(row, value))
		update_parallax_button_text(row, display_value)

		if button != null:
			button.pressed.connect(func(): open_debug_tooltip(row.label, row.tooltip))

func on_parallax_slider_changed(row: Dictionary, value: float) -> void:
	var target_node = parallax_targets.get(row.target)
	if target_node == null:
		return

	var applied_value: float = value / 100.0 if row.get("percent", false) else value
	if row.get("is_int", false):
		applied_value = round(applied_value)

	target_node.set(row.property, applied_value)
	if target_node.has_method("refresh_visuals"):
		target_node.call("refresh_visuals")

	update_parallax_button_text(row, value)

func update_parallax_button_text(row: Dictionary, display_value: float) -> void:
	var button: Button = parallax_buttons.get(row.key)
	if button == null:
		return

	var decimals: int = int(row.get("decimals", 0))
	var formatted: String
	if decimals > 0:
		formatted = ("%." + str(decimals) + "f") % display_value
	else:
		formatted = str(int(round(display_value)))

	var suffix: String = "%" if row.get("percent", false) else str(row.get("suffix", ""))

	button.text = "%s: %s%s  ⓘ" % [row.label, formatted, suffix]

func open_debug_tooltip(title: String, body: String) -> void:
	if debug_tooltip != null and debug_tooltip.has_method("open"):
		debug_tooltip.call("open", title, body)

func configure_slider(slider: HSlider, min_value: float, max_value: float, step: float, callback: Callable) -> void:
	if slider == null:
		return

	slider.min_value = min_value
	slider.max_value = max_value
	slider.step = step
	slider.value_changed.connect(callback)

func set_slider_no_signal(slider: HSlider, value: float) -> void:
	if slider != null:
		slider.set_value_no_signal(value)

func get_slider_value(slider: HSlider, fallback: float = 0.0) -> float:
	if slider == null:
		return fallback

	return slider.value

# Row names are Buttons in the tooltip-bearing categories and plain Labels
# elsewhere; both carry `text`, so this stays type-agnostic rather than forcing
# every category to convert at once.
func set_debug_label_text(label: Control, text: String) -> void:
	if label != null:
		label.set("text", text)

# Binds a row's name control and, when it is a tappable Button with a registered
# explainer, wires the tap to the shared debug tooltip.
func bind_tooltip_row(row_binder, node_name: String) -> Control:
	var node: Control = row_binder.optional_node(node_name) as Control

	if node == null or not DEBUG_TOOLTIPS.has(node_name):
		return node

	if node.has_signal("pressed"):
		var info: Dictionary = DEBUG_TOOLTIPS[node_name]
		node.connect("pressed", func(): open_debug_tooltip(info.title, info.body))

	return node

func toggle() -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("toggle"):
		debug_overlay.call("toggle")
	else:
		debug_overlay.visible = !debug_overlay.visible

func set_open(open: bool) -> void:
	if debug_overlay == null:
		return

	if debug_overlay.has_method("set_open"):
		debug_overlay.call("set_open", open)
	else:
		debug_overlay.visible = open

	if not open and debug_tooltip != null and debug_tooltip.has_method("close"):
		debug_tooltip.call("close")

func is_open() -> bool:
	return debug_overlay != null and debug_overlay.visible

func on_debug_dim_layer_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		set_open(false)

func on_bots_toggle(enabled: bool) -> void:
	if is_syncing_debug_config:
		return
	network.update_config("debugBotsEnabled", enabled)

func on_reset_debug_pressed() -> void:
	network.update_config("resetDebugConfig", true)

func on_restart_level_pressed() -> void:
	network.update_config("restartLevel", true)
	set_open(false)

func on_bot_strategy_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	var strategy: String = BOT_STRATEGY_COOPERATIVE
	if index == 1:
		strategy = BOT_STRATEGY_MVP_GREEDY

	network.update_config("debugBotStrategy", strategy)

func on_tower_feedback_mode_selected(index: int) -> void:
	if is_syncing_debug_config:
		return

	if index < 0 or index >= TOWER_FEEDBACK_MODES.size():
		return

	network.update_config("towerStabilityFeedbackMode", TOWER_FEEDBACK_MODES[index])

func send_debug_int(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	network.update_config(key, int(value))

func send_debug_float(key: String, value: float) -> void:
	if is_syncing_debug_config:
		return
	update_debug_labels()
	network.update_config(key, value)

func on_placement_popup_duration_changed(value: float) -> void:
	tuning.placement_score_popup_duration_ms = int(value)
	send_debug_int("placementScorePopupDurationMs", value)

func on_finish_popup_duration_changed(value: float) -> void:
	tuning.finish_score_popup_duration_ms = int(value)
	send_debug_int("finishScorePopupDurationMs", value)

func on_level_summary_delay_changed(value: float) -> void:
	tuning.level_summary_delay_ms = int(value)
	send_debug_int("levelSummaryDelayMs", value)

func apply_config(config) -> void:
	if bots_toggle == null:
		return

	is_syncing_debug_config = true
	tuning.placement_cooldown_ms = int(config.get("placementCooldown", tuning.placement_cooldown_ms))
	bots_toggle.set_pressed_no_signal(bool(config.get("debugBotsEnabled", false)))
	if bot_strategy_button != null:
		var strategy: String = str(config.get("debugBotStrategy", BOT_STRATEGY_COOPERATIVE))
		var selected_strategy_index: int = 1 if strategy == BOT_STRATEGY_MVP_GREEDY else 0
		bot_strategy_button.select(selected_strategy_index)
	set_slider_no_signal(bot_count_slider, float(config.get("debugBotCount", 0)))
	set_slider_no_signal(bot_delay_min_slider, float(config.get("debugBotDelayMin", 2000)))
	set_slider_no_signal(bot_delay_max_slider, float(config.get("debugBotDelayMax", 5000)))
	set_slider_no_signal(debug_start_level_slider, float(config.get("debugStartLevel", 1)))
	set_slider_no_signal(cooldown_slider, float(config.get("placementCooldown", 2000)))
	set_slider_no_signal(level_time_slider, float(config.get("levelTimeLimitMs", 30000)))
	set_slider_no_signal(start_delay_slider, float(config.get("startDelayMs", 1500)))
	tuning.placement_score_popup_duration_ms = int(config.get(
		"placementScorePopupDurationMs",
		UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
	))
	tuning.finish_score_popup_duration_ms = int(config.get(
		"finishScorePopupDurationMs",
		UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
	))
	tuning.level_summary_delay_ms = int(config.get("levelSummaryDelayMs", UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS))
	set_slider_no_signal(
		placement_popup_duration_slider,
		float(config.get("placementScorePopupDurationMs", UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(
		finish_popup_duration_slider,
		float(config.get("finishScorePopupDurationMs", UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS))
	)
	set_slider_no_signal(level_summary_delay_slider, float(config.get("levelSummaryDelayMs", UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS)))
	set_slider_no_signal(target_multiplier_slider, float(config.get("targetHeightMultiplier", 3)))
	set_slider_no_signal(level_supply_min_slider, float(config.get("levelSupplyMinSurplus", 0)))
	set_slider_no_signal(level_supply_max_slider, float(config.get("levelSupplyMaxSurplus", 6)))
	set_slider_no_signal(min_precision_blocks_slider, float(config.get("minPrecisionBlocksPerLevel", 2)))
	set_slider_no_signal(max_team_carry_over_slider, float(config.get("maxTeamCarryOverBlocks", 3)))
	set_slider_no_signal(refresh_min_useful_height_slider, float(config.get("refreshMinUsefulBlockHeight", 2)))
	set_slider_no_signal(placement_score_slider, float(config.get("placementScorePerHeight", 10)))
	set_slider_no_signal(
		impact_interval_slider,
		float(config.get("impactInterval", 1))
	)
	set_slider_no_signal(
		impact_score_floor_slider,
		float(config.get("impactScoreRequirement", 0))
	)
	set_slider_no_signal(
		impact_score_slider,
		float(config.get("impactMinContributionShare", 0.30)) * 100.0
	)
	set_slider_no_signal(finisher_bonus_slider, float(config.get("finisherBonusPerLevel", 4)))
	set_slider_no_signal(precision_bonus_slider, float(config.get("precisionBonusPerLevel", 8)))
	set_slider_no_signal(team_exact_bonus_slider, float(config.get("teamExactBonusPerLevel", 6)))
	set_slider_no_signal(assist_bonus_slider, float(config.get("assistBonusPerLevel", 0)))
	set_slider_no_signal(
		assist_threshold_slider,
		float(config.get("assistContributionThreshold", 0.25)) * 100.0
	)
	set_slider_no_signal(
		tower_stability_difficulty_slider,
		float(config.get("towerStabilityDifficulty", 90))
	)
	set_slider_no_signal(tower_max_tilt_slider, float(config.get("towerMaxTiltAngleDeg", 24)))
	set_slider_no_signal(
		tower_site_slenderness_slider,
		float(config.get("towerSiteSlendernessTarget", 6.75))
	)
	set_slider_no_signal(
		tower_site_width_min_slider,
		float(config.get("towerSiteWidthMin", 4))
	)
	set_slider_no_signal(
		tower_site_width_max_slider,
		float(config.get("towerSiteWidthMax", 8))
	)
	set_slider_no_signal(
		supply_effective_width_slider,
		float(config.get("supplyEffectiveWidthRatio", 0.5)) * 100.0
	)
	set_slider_no_signal(
		placement_stability_floor_slider,
		float(config.get("placementStabilityFloor", 0.5)) * 100.0
	)
	set_slider_no_signal(
		reinforce_integrity_slider,
		float(config.get("reinforceScorePerIntegrity", 1))
	)
	set_slider_no_signal(
		reinforce_lean_slider,
		float(config.get("reinforceScorePerLean", 20))
	)
	set_slider_no_signal(
		tower_warning_threshold_slider,
		float(config.get("towerStabilityWarningThreshold", 60))
	)
	set_slider_no_signal(
		tower_critical_threshold_slider,
		float(config.get("towerStabilityCriticalThreshold", 30))
	)
	set_slider_no_signal(
		tower_mood_threshold_slider,
		float(config.get("towerStabilityMoodThreshold", 3))
	)
	if tower_feedback_mode_button != null:
		var feedback_mode: String = str(config.get("towerStabilityFeedbackMode", TOWER_FEEDBACK_MODES[0]))
		var feedback_mode_index: int = TOWER_FEEDBACK_MODES.find(feedback_mode)
		tower_feedback_mode_button.select(max(feedback_mode_index, 0))
	set_slider_no_signal(power_unlock_level_slider, float(config.get("powerUnlockLevel", 4)))
	set_slider_no_signal(power_max_slots_slider, float(config.get("powerMaxSlots", 3)))
	set_slider_no_signal(power_cooldown_slider, float(config.get("powerActivationCooldownMs", 3000)))
	update_debug_labels()
	is_syncing_debug_config = false

func update_debug_labels() -> void:
	set_debug_label_text(bot_count_label, "Bot Count: " + str(int(get_slider_value(bot_count_slider))))
	set_debug_label_text(
		bot_delay_min_label,
		"Bot Delay Min: " + str(int(get_slider_value(bot_delay_min_slider, 2000))) + " ms"
	)
	set_debug_label_text(
		bot_delay_max_label,
		"Bot Delay Max: " + str(int(get_slider_value(bot_delay_max_slider, 5000))) + " ms"
	)
	set_debug_label_text(
		debug_start_level_label,
		"Start Level: " + str(int(get_slider_value(debug_start_level_slider, 1)))
	)
	set_debug_label_text(
		cooldown_label,
		"Placement Cooldown: " + str(int(get_slider_value(cooldown_slider, 2000))) + " ms"
	)
	set_debug_label_text(
		level_time_label,
		"Level Time: " + str(int(get_slider_value(level_time_slider, 30000) / 1000.0)) + " sec"
	)
	set_debug_label_text(
		start_delay_label,
		"Start Delay: " + str(int(get_slider_value(start_delay_slider, 1500))) + " ms"
	)
	set_debug_label_text(
		placement_popup_duration_label,
		"Placement Popups: " + str(int(get_slider_value(
			placement_popup_duration_slider,
			UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		finish_popup_duration_label,
		"MVP / Perfect / Team Popups: " + str(int(get_slider_value(
			finish_popup_duration_slider,
			UiTuningScript.SCORE_POPUP_DEFAULT_DURATION_MS
		))) + " ms"
	)
	set_debug_label_text(
		level_summary_delay_label,
		"Level Score Summary: " + str(int(get_slider_value(level_summary_delay_slider, UiTuningScript.LEVEL_SUMMARY_DEFAULT_DELAY_MS))) + " ms"
	)
	set_debug_label_text(
		target_multiplier_label,
		"Target Multiplier: " + str(int(get_slider_value(target_multiplier_slider, 3)))
	)
	set_debug_label_text(
		level_supply_min_label,
		"Supply Min Surplus: " + str(int(get_slider_value(level_supply_min_slider)))
	)
	set_debug_label_text(
		level_supply_max_label,
		"Supply Max Surplus: " + str(int(get_slider_value(level_supply_max_slider, 6)))
	)
	set_debug_label_text(
		min_precision_blocks_label,
		"Precision Blocks: " + str(int(get_slider_value(min_precision_blocks_slider, 2)))
	)
	set_debug_label_text(
		max_team_carry_over_label,
		"Carry-Over Blocks: " + str(int(get_slider_value(max_team_carry_over_slider, 3)))
	)
	set_debug_label_text(
		refresh_min_useful_height_label,
		"Refresh Useful Height: " + str(int(get_slider_value(refresh_min_useful_height_slider, 2)))
	)
	set_debug_label_text(
		placement_score_label,
		"Placement Score/Height: " + str(int(get_slider_value(placement_score_slider, 10)))
	)
	set_debug_label_text(
		supply_effective_width_label,
		"Supply Effective Width: " + str(int(get_slider_value(supply_effective_width_slider, 50))) + "%"
	)
	set_debug_label_text(
		placement_stability_floor_label,
		"Placement Stability Floor: " + str(int(get_slider_value(placement_stability_floor_slider, 50))) + "%"
	)
	set_debug_label_text(
		reinforce_integrity_label,
		"Reinforce / Integrity: " + str(int(get_slider_value(reinforce_integrity_slider, 1)))
	)
	set_debug_label_text(
		reinforce_lean_label,
		"Reinforce / Lean: " + str(int(get_slider_value(reinforce_lean_slider, 20)))
	)
	set_debug_label_text(
		tower_site_slenderness_label,
		"Site Slenderness Target: " + ("%.2f" % get_slider_value(tower_site_slenderness_slider, 6.75))
	)
	set_debug_label_text(
		tower_site_width_min_label,
		"Site Width Min: " + str(int(get_slider_value(tower_site_width_min_slider, 4)))
	)
	set_debug_label_text(
		tower_site_width_max_label,
		"Site Width Max: " + str(int(get_slider_value(tower_site_width_max_slider, 8)))
	)
	set_debug_label_text(
		impact_score_label,
		"Min Contribution Share: " + str(int(get_slider_value(impact_score_slider, 25))) + "%"
	)
	set_debug_label_text(
		impact_interval_label,
		"Impact Interval: " + str(int(get_slider_value(impact_interval_slider, 1))) + " level(s)"
	)
	set_debug_label_text(
		impact_score_floor_label,
		"Impact Flat Floor: " + str(int(get_slider_value(impact_score_floor_slider, 0)))
	)
	set_debug_label_text(
		finisher_bonus_label,
		"Finisher Bonus/Level: " + str(int(get_slider_value(finisher_bonus_slider, 4)))
	)
	set_debug_label_text(
		precision_bonus_label,
		"Precision Bonus/Level: " + str(int(get_slider_value(precision_bonus_slider, 8)))
	)
	set_debug_label_text(
		team_exact_bonus_label,
		"Team Exact Bonus/Level: " + str(int(get_slider_value(team_exact_bonus_slider, 6)))
	)
	var assist_bonus_value: int = int(get_slider_value(assist_bonus_slider, 0))
	set_debug_label_text(
		assist_bonus_label,
		"Assist Bonus/Level: " + ("Off" if assist_bonus_value <= 0 else str(assist_bonus_value))
	)
	set_debug_label_text(
		assist_threshold_label,
		"Assist Threshold: " + str(int(get_slider_value(assist_threshold_slider, 25))) + "%"
	)
	set_debug_label_text(
		tower_stability_difficulty_label,
		"Stability Difficulty: " + str(int(get_slider_value(tower_stability_difficulty_slider, 90)))
	)
	set_debug_label_text(
		tower_max_tilt_label,
		"Max Tilt Angle: " + str(int(get_slider_value(tower_max_tilt_slider, 24))) + "°"
	)
	set_debug_label_text(
		tower_warning_threshold_label,
		"Warning Threshold: " + str(int(get_slider_value(tower_warning_threshold_slider, 60))) + "%"
	)
	set_debug_label_text(
		tower_critical_threshold_label,
		"Critical Threshold: " + str(int(get_slider_value(tower_critical_threshold_slider, 30))) + "%"
	)
	set_debug_label_text(
		tower_mood_threshold_label,
		"Brick Mood Threshold: ±" + str(int(get_slider_value(tower_mood_threshold_slider, 3)))
	)
	set_debug_label_text(
		power_unlock_level_label,
		"Power Unlock Level: " + str(int(get_slider_value(power_unlock_level_slider, 4)))
	)
	set_debug_label_text(
		power_max_slots_label,
		"Power Slots: " + str(int(get_slider_value(power_max_slots_slider, 3)))
	)
	set_debug_label_text(
		power_cooldown_label,
		"Power Cooldown: " + ("%.1f" % (get_slider_value(power_cooldown_slider, 3000) / 1000.0)) + " sec"
	)
