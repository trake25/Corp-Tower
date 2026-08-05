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
    startDelayMs: 1000, // testing 0.5, release 2
    // Floor only. The real limit is derived per level from target height
    // (Game_Engine.getLevelTimeLimitMs), so the clock cannot drift away from
    // the curve; this value is what short early levels get instead.
    levelTimeLimitMs: 30000,    // testing 120, release 30 (for tuning)
    levelTimePlannedEfficiency: 0.55,
    levelTimeSlack: 2.0,
    nextLevelDelayMs: 1000, // testing 0.5, release 1
    failRestartDelayMs: 1000, // testing 0.5, release 1
    placementScorePopupDurationMs: 2000,
    finishScorePopupDurationMs: 2000,
    levelSummaryDelayMs: 2000,  // testing 2, release 3
    impactInterval: 2,
    impactScoreRequirement: 0,
    // With an Impact every level this is the core loop: each player must earn
    // this share of the level's expected placement score to advance. Three
    // players x 0.25 leaves a 25% contested margin -- enough that carrying the
    // level is worth real score, not so much that one player can starve another
    // below their share without failing the whole team.
    impactMinContributionShare: 0.30,
    towerGridWidth: 8, //14 SnapGrid.gd previous values const GRID_WIDTH := 14 const GRID_CENTER_COL := 6.5
    placeableColumnMin: 2,
    placeableColumnMax: 5,
    towerSiteSlendernessTarget: 6.75,
    towerSiteWidthMin: 8,
    // Hard viewport ceiling, not a taste call: TowerStack is 272px wide at a
    // fixed 34px brick, so only grid columns 3-10 are ever on screen. A wider
    // site would place bricks the player can never see.
    towerSiteWidthMax: 8,
    towerMaxTiltAngleDeg: 10,   //18
    towerStabilityDifficulty: 95,   // 0 forgiving, 100 harsh, 90 default, 95 tuned
    towerStabilityPressure: {
        floor: 0.25,
        fullPressureLevel: 30
    },
    towerStabilityAnchors: {
        forgiving: {
            towerOverhangWeight: 0.02,
            towerLaneImbalanceWeight: 0.03,
            towerCollapseTiltScore: 4.00,
            towerSlendernessSafe: 3.20,
            towerSlendernessMax: 8.00,
            towerSupportDeficitMax: 0.95,
            towerStabilityMinHeight: 6
        },
        harsh: {
            towerOverhangWeight: 0.34,
            towerLaneImbalanceWeight: 0.30,
            towerCollapseTiltScore: 0.90,
            towerSlendernessSafe: 1.10,
            towerSlendernessMax: 1.95,
            towerSupportDeficitMax: 0.22,
            towerStabilityMinHeight: 10
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
    supplyEffectiveWidthRatio: 0.5,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 6,
    // Proportional slack added on top of the flat levelSupplyMaxSurplus above,
    // scaled to the level's required brick height. A flat +6 against a total
    // drawn from ~90 random bricks (sd ~10) is missed almost every attempt
    // once required height grows past the earliest levels -- config-file-only
    // for now, same treatment as reinforceScorePerSupportedCell.
    levelSupplyMaxSurplusShare: 0.12,
    // Share of the level's brick requirement the pile deliberately does not
    // cover. One Replenish adds powerReplenishPileShare of the starting pile,
    // so at 0.10 most levels finish unaided and Power is insurance against a
    // bad draw rather than a mandatory cast.
    levelSupplyPowerReserveShare: 0.10,
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
        impactBeatZoomOutMs: 450,
        impactBeatWaveMs: 550,
        impactBeatHoldMs: 600,
        impactBeatZoomInMs: 350,
        screenShakeMs: 260,
        screenShakeMagnitudeUnits: 0.22
    },

    scoring: {
        placementScorePerHeight: 10,
        placementStabilityFloor: 0.5,
        reinforceScorePerIntegrity: 2,
        reinforceScorePerLean: 20,
        reinforceScorePerSupportedCell: 5,
        reinforceScoreCapShare: 1,
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
