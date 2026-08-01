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
    // Level 1 is 16 -- the exact number of 34px brick rows that fit the tower
    // viewport under the Top Indicator, so the opening level plays entirely on
    // one screen with no parallax. Every level above it overflows and scrolls.
    targetHeightCurve: [
        { minLevel: 1, maxLevel: 1, baseLevel: 1, baseHeight: 16, heightPerLevel: 0 },
        { minLevel: 2, maxLevel: 6, baseLevel: 1, baseHeight: 16, heightPerLevel: 2 },
        { minLevel: 7, maxLevel: 15, baseLevel: 6, baseHeight: 26, heightPerLevel: 1 },
        { minLevel: 16, maxLevel: 40, baseLevel: 15, baseHeight: 35, heightPerLevel: 0.4 },
        { minLevel: 41, maxLevel: 99, baseLevel: 40, baseHeight: 45, heightPerLevel: 0.15 }
    ],
    startDelayMs: 1000, // testing 0.5, release 2
    levelTimeLimitMs: 30000,    // testing 120, release 30 (for tuning)
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
    towerSiteWidthMin: 6, // from level 1-28
    // Hard viewport ceiling, not a taste call: TowerStack is 272px wide at a
    // fixed 34px brick, so only grid columns 3-10 are ever on screen. A wider
    // site would place bricks the player can never see.
    towerSiteWidthMax: 8,   // cap limit 8 from level 29-99
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
    // Refresh is quest-only: the guaranteed per-level grant and the Impact-MVP
    // draw are both off, so completing the side quest is the sole way to hold a
    // Power item.
    powerGuaranteedBaseline: false,
    powerImpactMvpReward: false,
    powerCatalog: {
        score_cap: { category: "Offensive", title: "Score Cap", active: false },
        copy_score: { category: "Defensive", title: "Copy Score", active: false },
        refresh: { category: "Utility", title: "Refresh", active: true }
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
        1: 2,
        3: 3
    },

    maxActiveBlocks: 3,

    maxTeamCarryOverBlocks: 3,
    maxGeneratedDrawPileBlocks: 32,
    supplyEffectiveWidthRatio: 0.5,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 6,
    minPrecisionBlocksPerLevel: 3,
    openingHandGenerationAttempts: 1000,

    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,

    scoring: {
        placementScorePerHeight: 10,
        placementStabilityFloor: 0.5,
        reinforceScorePerIntegrity: 1,
        reinforceScorePerLean: 20,
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

};

module.exports = GameConfig;
