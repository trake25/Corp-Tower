const GameConfig = {

    maxLevel: 99,
    debugStartLevel: 1,
    placementCooldown: 1500,
    quickChatCooldownMs: 6000,
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
    startDelayMs: 3000,
    levelTimeLimitMs: 30000,
    nextLevelDelayMs: 3000,
    failRestartDelayMs: 3000,
    placementScorePopupDurationMs: 3000,
    finishScorePopupDurationMs: 3000,
    levelSummaryDelayMs: 3000,
    impactInterval: 1,
    impactScoreRequirement: 0,
    // With an Impact every level this is the core loop: each player must earn
    // this share of the level's expected placement score to advance. Three
    // players x 0.25 leaves a 25% contested margin -- enough that carrying the
    // level is worth real score, not so much that one player can starve another
    // below their share without failing the whole team.
    impactMinContributionShare: 0.25,
    towerGridWidth: 14,
    placeableColumnMin: 4,
    placeableColumnMax: 9,
    towerSiteSlendernessTarget: 2,
    towerSiteWidthMin: 6,
    // Hard viewport ceiling, not a taste call: TowerStack is 272px wide at a
    // fixed 34px brick, so only grid columns 3-10 are ever on screen. A wider
    // site would place bricks the player can never see.
    towerSiteWidthMax: 8,
    towerOverhangWeight: 0.15,
    towerLaneImbalanceWeight: 0.1,
    towerMaxTiltAngleDeg: 18,
    towerCollapseTiltScore: 4.0,
    towerSlendernessSafe: 2.5,
    towerSlendernessMax: 8.0,
    towerStabilityMinHeight: 6,
    towerBaseHalfWidthFloor: 1.0,
    towerSupportDeficitMax: 0.35,
    towerStabilityWarningThreshold: 60,
    towerStabilityCriticalThreshold: 30,
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
        impactFillBonusRate: 0.5,
        assistBonusPerLevel: 0,
        assistContributionThreshold: 0.25
    },

    debugBotsEnabled: false,

    debugBotCount: 2,

    debugBotDelayMin: 1000,

    debugBotDelayMax: 5000,

    debugBotStrategy: "mvp_greedy",

};

module.exports = GameConfig;
