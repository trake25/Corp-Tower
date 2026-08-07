const GameConfig = {

    maxLevel: 99,
    debugStartLevel: 1,
    placementCooldown: 1000,    // testing phase at 500ms, 1 during release
    quickChatCooldownMs: 3000,
    quickChatTemplates: [
        "Place Block!",
        "Sorry!",
        "Hello!"
    ],
    targetHeightMultiplier: 3,
    targetHeightBase: 30,
    targetHeightStepBase: 10,
    targetHeightStepGrowth: 5,
    targetHeightStepGrowthEvery: 3,
    startDelayMs: 4000, // testing 0.5, release 4
    // Floor only. The real limit is derived per level from target height
    // (Game_Engine.getLevelTimeLimitMs), so the clock cannot drift away from
    // the curve; this value is what short early levels get instead.
    levelTimeLimitMs: 60000,    // testing 120, release 30 (for tuning)
    levelTimePlannedEfficiency: 0.55,
    // Slack lerps from levelTimeSlack (level 1) down to levelTimeSlackMin (at
    // levelTimeSlackFullLevel and beyond) -- a flat multiplier left the clock
    // linear in target height, never proportionally tighter as levels grow.
    levelTimeSlack: 3.0,
    levelTimeSlackMin: 1.5,
    levelTimeSlackFullLevel: 25,
    nextLevelDelayMs: 1000, // testing 0.5, release 1
    failRestartDelayMs: 1000, // testing 0.5, release 1
    placementScorePopupDurationMs: 2000,
    finishScorePopupDurationMs: 2000,
    levelSummaryDelayMs: 4000,  // testing 2, release 4
    impactInterval: 2,
    impactScoreRequirement: 0,
    // With an Impact every level this is the core loop: each player must earn
    // this share of the level's expected placement score to advance. Three
    // players x 0.25 leaves a 25% contested margin -- enough that carrying the
    // level is worth real score, not so much that one player can starve another
    // below their share without failing the whole team.
    impactMinContributionShare: 0.30,
    // The Impact gate's expectation (getExpectedPlacementScoreForLevel) otherwise
    // assumes every placement pays a perfect 1.0 stability multiplier. Real play
    // pays placementStabilityFloor..1.0 (and that floor now descends toward
    // placementStabilityFloorAtTarget as the tower rises), so this keeps the
    // share's meaning honest ("X% of what is realistically earnable") instead of
    // silently tightening the gate as a side effect of the stability retune.
    impactExpectedStabilityMultiplier: 0.85,
    towerGridWidth: 8, //14 SnapGrid.gd previous values const GRID_WIDTH := 14 const GRID_CENTER_COL := 6.5
    placeableColumnMin: 2,
    placeableColumnMax: 5,
    towerSiteSlendernessTarget: 6.75,
    // Reverts a one-line, unreviewed change (63c4e8f) that pinned this equal to
    // towerSiteWidthMax/towerGridWidth (both 8), which made getSiteWidthForHeight
    // return 8 at every target height -- see decisions.md#buildable-site-width-
    // scales-with-target-height. Now cosmetic (affects levels 1-2 only, since the
    // target-height curve pushes every later level's derived width to the ceiling
    // anyway); site-width no longer carries the stability ramp, see towerStabilityAnchors.
    towerSiteWidthMin: 6,
    // Hard viewport ceiling, not a taste call: TowerStack is 272px wide at a
    // fixed 34px brick, so only grid columns 3-10 are ever on screen. A wider
    // site would place bricks the player can never see.
    towerSiteWidthMax: 8,
    towerMaxTiltAngleDeg: 10,   //18
    towerStabilityDifficulty: 95,   // 0 forgiving, 100 harsh, 90 default, 95 tuned
    towerStabilityPressure: {
        // floor raised and fullPressureLevel lowered again after live playtesting
        // at levels 1-4 found difficulty 100 still too gentle: at floor 0.35 /
        // fullPressureLevel 15, even max difficulty only reached ~52% pressure at
        // level 4, because the level ramp was still suppressing the dial's own
        // effect where players actually are early on. Raising the floor gives the
        // dial real teeth immediately; lowering fullPressureLevel means it doesn't
        // take until level 15 to feel that.
        floor: 0.55,
        fullPressureLevel: 8
    },
    towerStabilityAnchors: {
        forgiving: {
            towerOverhangWeight: 0.02,
            towerLaneImbalanceWeight: 0.03,
            towerCollapseTiltScore: 4.00,
            // Tightened from 3.20/8.00 after playtesting found thin columns
            // visibly should have been failing but weren't -- a straight, centred
            // column has zero lean (comOffset/laneImbalance/overhang all measure
            // asymmetry, not width), so slenderness is the *only* axis that can
            // catch it, and it must actually bite even at low pressure. The
            // opening-brick grace period is carried entirely by
            // towerStabilityMinHeight below now, not by loose slenderness bounds.
            towerSlendernessSafe: 2.40,
            towerSlendernessMax: 5.00,
            towerSupportDeficitMax: 0.85,
            // Raised from 8: with slenderness tightened above, this is now the
            // sole guard protecting the first few placements (maturity ramps
            // penalties in as min(1, height/this)) -- decisions.md#tower-
            // stability-is-one-derived-dial-scaled-by-level: re-check the opening
            // brick after every retune.
            towerStabilityMinHeight: 10,
            // Penalties additionally sharpen as height approaches the level's
            // target (severity = maturity x heightPressure in Tower_Stability.js),
            // so a tower near its target is graded harder than the same tower
            // early on. Kept as an anchor, not a standalone knob, so
            // towerStabilityDifficulty stays the sole stability tunable -- see
            // decisions.md#tower-stability-is-one-derived-dial-scaled-by-level.
            // 0.0 = height-blind grading, kept off so difficulty 0 stays close to
            // its documented "stability inert" contract.
            towerHeightPressureGain: 0.0
        },
        harsh: {
            towerOverhangWeight: 0.34,
            towerLaneImbalanceWeight: 0.30,
            // Tightened from 0.90: lean collapses sooner at max pressure too, not
            // just integrity -- a leaning-but-not-yet-slender tower should also
            // be brutal at the top of the dial.
            towerCollapseTiltScore: 0.75,
            // Tightened from 1.75/3.20: model-typical play (~1.78) now sits near
            // the edge of safe rather than comfortably inside it -- "brutal"
            // means even fairly good building carries real risk at max pressure,
            // not just deliberately bad building.
            towerSlendernessSafe: 1.30,
            towerSlendernessMax: 2.20,
            towerSupportDeficitMax: 0.15,
            // Lowered from 14: a long grace window contradicted "brutal" at max
            // pressure -- maturity now reaches 1 within the first 8 rows instead
            // of 14, so thin sections turn dangerous much sooner in height terms.
            towerStabilityMinHeight: 8,
            // 1.3 = penalties grow to 2.3x by the time the tower reaches target.
            towerHeightPressureGain: 1.3
        }
    },
    towerBaseHalfWidthFloor: 1.0,
    towerStabilityWarningThreshold: 75,
    towerStabilityCriticalThreshold: 45,
    towerStabilityMoodThreshold: 2,
    towerStabilityFeedbackMode: "warnings_only",
    powerUnlockLevel: 1,
    powerMaxSlots: 3,
    powerActivationCooldownMs: 3000,
    powerLifetime: "impact",
    // Replenish is quest-only: the guaranteed per-level grant and the Impact-MVP
    // draw are both off, so completing the side quest is the sole way to hold a
    // Power item.
    powerGuaranteedBaseline: false,
    powerImpactMvpReward: false,
    powerReplenishPileShare: 0.25,
    powerCatalog: {
        score_cap: { category: "Offensive", title: "Score Cap", active: false },
        copy_score: { category: "Defensive", title: "Copy Score", active: false },
        refresh: { category: "Utility", title: "Refresh", active: false },
        replenish: { category: "Utility", title: "Replenish", active: true }
    },

    brickShapes: [
        { shapeId: "I", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
        { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { shapeId: "L", cells: [[0, 0], [1, 0], [0, 1], [0, 2]] },
        { shapeId: "T", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
        { shapeId: "Z", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }
    ],

    brickWeights: {
        I: 1,
        O: 3,
        L: 2,
        T: 2,
        Z: 2
    },

    inventoryScaling: {
        1: 3
    },

    maxActiveBlocks: 3,

    maxTeamCarryOverBlocks: 3,
    // The pile is a reserve, not a hand: at target ~84 with model efficiency
    // 0.378 the derived reserve wants ~88 bricks, and 32 clipped it -- which
    // silently broke the solvability guarantee below level ~15 (see
    // plan/corp-tower-target-height-scaling-plan.md §1.3).
    // Sanity ceiling against a bad config, not a balance knob: the reserve is
    // derived per level and target height is uncapped, so a value that binds
    // starves the level outright. The Balance Simulator's pileClipped column
    // reports if it ever does.
    maxGeneratedDrawPileBlocks: 4096,
    supplyEffectiveWidthRatio: 0.4,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 4,
    // Proportional slack added on top of the flat levelSupplyMaxSurplus above,
    // scaled to the level's required brick height. A flat surplus alone is
    // missed almost every attempt once required height grows past the
    // earliest levels -- config-file-only for now, same treatment as
    // reinforceScorePerSupportedCell.
    levelSupplyMaxSurplusShare: 0.08,
    // Share of the level's packing-aware requirement the pile is built to carry,
    // lerped from levelSupplyCoverageStart (level 1) down to levelSupplyCoverageEnd
    // (at levelSupplyCoverageFullLevel and beyond) -- early levels run generous so
    // the squeeze is felt gradually, not from level 1. At the end value (today's
    // flat 0.75) a Replenish (powerReplenishPileShare of the starting pile) insures
    // the uncovered share, so most levels still finish unaided.
    levelSupplyCoverageStart: 1.05,
    levelSupplyCoverageEnd: 0.75,
    levelSupplyCoverageFullLevel: 15,
    minPrecisionBlocksPerLevel: 3,
    openingHandGenerationAttempts: 1000,

    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,

    accessibility: {
        parallelPlacement: false
    },

    visualHooks: {
        impactBeat: true,
        screenShake: true,
        impactBeatMinZoom: 0.3,
        impactBeatZoomOutMs: 900,
        impactBeatWaveMs: 1100,
        impactBeatHoldMs: 0,
        screenShakeMs: 260,
        screenShakeMagnitudeUnits: 0.22
    },

    scoring: {
        placementScorePerHeight: 10,
        // The stability floor descends as the placement's height nears target
        // (placementStabilityFloor at the ground -> placementStabilityFloorAtTarget
        // at target height), so stability is worth more to score the higher the
        // tower rises. Config-file-only, same treatment as the reinforce keys below.
        placementStabilityFloor: 0.5,
        placementStabilityFloorAtTarget: 0.15,
        // Raised from 2/20/5 after playtesting found repairing a wobbling tower
        // didn't feel rewarding -- the reinforce cap rarely binds for a realistic
        // repair, so these per-point rates (not the cap) are what a typical
        // repair is actually worth, and they needed to be bigger to read as a
        // real choice against a height claim.
        reinforceScorePerIntegrity: 4,
        reinforceScorePerLean: 35,
        reinforceScorePerSupportedCell: 10,
        // Repair cap share also rises with height (reinforceScoreCapShare at the
        // ground -> reinforceScoreCapShareAtTarget at target height) -- see
        // getReinforceScoreCap in Scoring.js. Ground share stays 1 (a maximal
        // repair equals one average height claim there); the target-height share
        // raised further so a big repair near the top can outpay a height claim,
        // not just match it -- see decisions.md#scoring-carries-the-selfish-
        // cooperation-tension.
        reinforceScoreCapShare: 1,
        reinforceScoreCapShareAtTarget: 3,
        finisherBonusPerLevel: 0,
        precisionBonusPerLevel: 20,
        teamExactBonusPerLevel: 15,
        assistBonusPerLevel: 0,
        assistContributionThreshold: 0.25
    },

    debugBotsEnabled: process.env.CORP_TOWER_BOTS_ENABLED === "true",    //testing true, release false

    debugBotCount: 2,

    debugBotDelayMin: 1500,

    debugBotDelayMax: 6000,

    debugBotStrategy: "mvp_greedy",

    // How many stability points a cooperative bot will give up to gain height.
    // Measured against the best column available for that brick, so it keeps
    // discriminating no matter how forgiving the stability config is tuned.
    debugBotStabilityTolerance: 5,

    // Cap on how many void-floor release rows a bot's placement search tries
    // per decision, largest-void-first -- bounds the search by tower shape
    // rather than tower height. See plan/corp-tower-target-height-scaling-
    // plan.md §2.1/§2.4.
    debugBotGapCandidates: 6,

};

module.exports = GameConfig;
