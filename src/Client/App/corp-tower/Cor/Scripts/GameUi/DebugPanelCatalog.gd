extends RefCounted

const BOT_STRATEGY_COOPERATIVE := "cooperative"
const BOT_STRATEGY_MVP_GREEDY := "mvp_greedy"
const TOWER_FEEDBACK_MODES := ["warnings_only", "live_preview"]
const TOWER_FEEDBACK_MODE_TITLES := ["Warnings Only", "Live Preview"]
const DEBUG_CATEGORY_NAMES := [
	"Bots", "Round", "UI", "Supply", "Scoring", "Impact", "Tower", "Power", "Parallax", "Placement",
	"Hooks", "Sign In"
]
const DEBUG_CONTEXT_LOBBY := "lobby"
const DEBUG_CONTEXT_PLAY := "play"

const DEBUG_TOOLTIPS := {
	"TowerStabilityDifficultyLabel": {
		"title": "Stability Difficulty",
		"body": "The core dial for how punishing the tower is. Overhang weight, collapse threshold, slenderness band, support tolerance, and the maturity ramp are derived from it; Lateral Load Share remains a separate reinforcement cap.\n\nThreat rises with both this dial and level. Low values keep ordinary towers forgiving, while high values make careless narrow structures dangerous.\n\n0 disables stability. The upper end is intentionally severe.",
	},
	"TowerLateralLoadShareLabel": {
		"title": "Lateral Load Share",
		"body": "The maximum share of a stressed support's carried load that independently grounded side braces may accept. Real contact, alternate-path capacity, and shared bottlenecks can reduce the actual transfer.\n\nThis is separate from Stability Difficulty. Changes apply to the next authoritative tower evaluation.",
	},
	"TowerMaxTiltLabel": {
		"title": "Structural Pose Cap",
		"body": "Visual only. Caps the final standing rotation of a rigid tower section after inherited bends are composed. It does not affect stability, collapse, or legal placement.\n\nHigher = more visible sway. Lower = more room for support placement.",
	},
	"TowerSiteSlendernessLabel": {
		"title": "Site Slenderness Target",
		"body": "Sets how wide the buildable site is for a given target height.\n\nsite width = even round-up(target height / this), clamped to Site Width Min..Max.\n\nLower = wider site, easier. The site is also what slenderness is measured against — building on the full site width is always penalty-free, so widening the site widens the safe zone too.",
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
		"body": "How far a new placement must move the tower toward or away from centre for its entrance reaction.\n\nbalance delta = (lean before - lean after) / collapse threshold x 100\n\ndelta >= this = smiley, delta <= -this = worried, in between = disbelief. Display only, no gameplay effect.\n\nAfter the drop animation, every standing brick switches to its live load-bearing support state using the authoritative Warning and Critical thresholds.",
	},
	"TowerFeedbackModeLabel": {
		"title": "Stability Feedback",
		"body": "How stability is surfaced: warning popups only, or a live preview of the tallest active component. Brick faces and structural pose remain live in both modes. Presentation only.",
	},
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
	"PlacementScoreLabel": {
		"title": "Useful Height Rate",
		"body": "The clean score for each unit the top of the tower rises.\n\nclean points = this x level x effective height\n\nOpen Placement Score Table for the current player-facing values across representative levels.",
	},
	"PlacementStabilityFloorLabel": {
		"title": "Dangerous Height Floor",
		"body": "The lowest share of clean height points a risky placement can keep.\n\nThe server grades the risk this brick adds, not the tower it inherited.\n\nLower makes dangerous height less rewarding; it never changes collapse rules.",
	},
	"RecoveryHeightScoreLabel": {
		"title": "Recovery Height Score",
		"body": "The share of risk-adjusted Height score paid when the team rebuilds a previously reached row. Each rebuilding placement halves Recovery and rebuild Reinforce again until the tower reaches a new target. New historical height still earns full Height score.",
	},
	"ReinforceIntegrityLabel": {
		"title": "Strong Direct Repair",
		"body": "The share of one average useful-height action awarded for a strong, direct structural repair.\n\nThe server pays one matched support improvement, so Integrity, lean, and repaired cells cannot stack for the same fix.",
	},
	"ReinforceLeanLabel": {
		"title": "Normal Transaction Cap",
		"body": "The largest normal placement total in average-action units, unless its useful height already exceeds that limit.\n\nThis constrains height plus structural value once, after both components are computed.",
	},
	"CriticalSaveBonusLabel": {
		"title": "Critical Save Bonus",
		"body": "The extra average-action share awarded when a direct repair moves a mature tower from critical to safe.\n\nIt is limited by the Critical Save cap and can only be claimed once per repaired interface.",
	},
	"CriticalSaveCapLabel": {
		"title": "Critical Save Cap",
		"body": "The highest total for a placement that includes a Critical Save, in average-action units. Useful-height points are always retained before this cap trims other components.",
	},

	"PowerReplenishShareLabel": {
		"title": "Replenish Share",
		"body": "How many bricks the Replenish power adds to the shared draw pile.\n\nbricks = max(1, round(this x the level's STARTING draw pile size))\n\nThe starting pile is team carry-over plus the generated reserve, so this scales itself with target height, site width and brick weights instead of being a flat number. At 25% a level dealt 20 bricks replenishes 5.\n\nNew bricks are appended, never shuffled in — the \"Next Draw\" preview all three players can see stays put.\n\nReplenish is the side-quest reward and the only power that can rescue a level short on supply: holding one defers the not-enough-height failure.",
	},

	"HooksAboutButton": {
		"title": "Visual Hooks",
		"body": "The end-of-level flourishes every player in the room sees together, not client-local cosmetics.\n\nImpact Beat: the camera pulls back so the whole tower is visible while each placed brick flips to its placer's pass/fail face, then holds there through the level summary and snaps back once the summary closes. Plays once per level result. Skipped entirely on a collapse — there are no standing bricks left to wave across.\n\nScreen Shake: a jolt on a failed Impact or any negative verdict. Fires alongside a collapse instead of the beat.\n\nBoth toggles and every duration below round-trip through the server — a beat only reads as a shared moment if all three clients play it in lockstep, so this is not a Parallax-style client-local row.",
	},
	"ImpactBeatZoomOutLabel": {
		"title": "Impact Beat / Zoom Out",
		"body": "First phase of the beat: how long the camera takes to pull back to the wide framing that shows the whole tower.\n\nLonger = a slower, more deliberate reveal. Shorter = snaps out almost instantly.",
	},
	"ImpactBeatWaveLabel": {
		"title": "Impact Beat / Wave",
		"body": "Second phase: how long the pass/fail face sweep takes to travel bottom-to-top across every placed brick, once the camera has finished pulling back.\n\nLonger = each brick's verdict is easier to read as it flips. Shorter = reads as a flash rather than a sweep.\n\nZoom Out + Wave run in sequence and their sum is added to the level-summary wait, so a longer beat delays the score screen by the same amount.",
	},
	"ImpactBeatHoldLabel": {
		"title": "Impact Beat / Hold",
		"body": "Third phase: how long the camera stays at the wide framing, verdict faces held, before the level summary appears. There is no separate zoom-in -- the beat keeps holding through the summary itself and the camera only snaps back to normal play framing once the summary closes.",
	},
	"ScreenShakeDurationLabel": {
		"title": "Screen Shake Duration",
		"body": "How long the failure shake decays for, in ms. Only the tower and its debris shake — the HUD and buttons never move.\n\nFires on a failed Impact or any negative verdict, and also on a collapse (which skips the Impact Beat itself).",
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
