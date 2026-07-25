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
    targetHeightCurve: [
        { minLevel: 1, maxLevel: 1, baseLevel: 1, baseHeight: 3, heightPerLevel: 0 },
        { minLevel: 2, maxLevel: 2, baseLevel: 2, baseHeight: 6, heightPerLevel: 0 },
        { minLevel: 3, maxLevel: 3, baseLevel: 3, baseHeight: 8, heightPerLevel: 0 },
        { minLevel: 4, maxLevel: 6, baseLevel: 3, baseHeight: 8, heightPerLevel: 2 },
        { minLevel: 7, maxLevel: 12, baseLevel: 6, baseHeight: 14, heightPerLevel: 2 },
        { minLevel: 13, maxLevel: 31, baseLevel: 12, baseHeight: 26, heightPerLevel: 1 },
        { minLevel: 32, maxLevel: 99, baseLevel: 31, baseHeight: 45, heightPerLevel: 0.25 }
    ],
    startDelayMs: 3000,
    levelTimeLimitMs: 30000,
    nextLevelDelayMs: 3000,
    failRestartDelayMs: 3000,
    placementScorePopupDurationMs: 3000,
    finishScorePopupDurationMs: 3000,
    levelSummaryDelayMs: 3000,
    impactInterval: 3,
    impactScoreRequirement: 0,
    impactMinContributionShare: 0.30,
    towerGridWidth: 14,
    placeableColumnMin: 4,
    placeableColumnMax: 9,
    towerSiteSlendernessTarget: 2.75,
    towerSiteWidthMin: 6,
    towerSiteWidthMax: 12,
    towerOverhangWeight: 0.15,
    towerLaneImbalanceWeight: 0.1,
    towerMaxTiltAngleDeg: 18,
    towerCollapseTiltScore: 4.0,
    towerSlendernessSafe: 2.5,
    towerSlendernessMax: 6.0,
    towerSlendernessMinHeight: 6,
    towerSupportDeficitMax: 0.35,
    towerStabilityWarningThreshold: 60,
    towerStabilityCriticalThreshold: 30,
    towerStabilityFeedbackMode: "warnings_only",
    powerUnlockLevel: 4,
    powerMaxSlots: 3,
    powerActivationCooldownMs: 3000,
    powerLifetime: "impact",
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
        1: 1,
        2: 2,
        4: 3
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
