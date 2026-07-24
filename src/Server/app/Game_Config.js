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
        { minLevel: 13, maxLevel: 31, baseLevel: 12, baseHeight: 26, heightPerLevel: 0.75 },
        { minLevel: 32, maxLevel: 99, baseLevel: 31, baseHeight: 40, heightPerLevel: 0.5 }
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
    towerGridWidth: 5,
    placeableLanes: { left: 1, center: 2, right: 3 },
    towerOverhangWeight: 0.2,
    towerLaneImbalanceWeight: 0.15,
    towerMaxTiltAngleDeg: 18,
    towerCollapseTiltScore: 2.0,
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
        { shapeId: "I", cells: [[0, 0], [0, 1], [0, 2], [0, 3]], anchorX: 0 },
        { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]], anchorX: 0 },
        { shapeId: "L", cells: [[0, 0], [1, 0], [0, 1], [0, 2]], anchorX: 0 },
        { shapeId: "T", cells: [[1, 0], [0, 1], [1, 1], [2, 1]], anchorX: 1 },
        { shapeId: "Z", cells: [[1, 0], [2, 0], [0, 1], [1, 1]], anchorX: 1 }
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
    generatedDrawPileScaling: {
        1: 0,
        4: 1,
        7: 2,
        10: 3,
        13: 4,
        16: 5,
        19: 6,
        22: 7,
        25: 8,
        28: 9,
        31: 10,
        34: 11,
        37: 12,
        40: 13,
        43: 14,
        46: 15,
        49: 16,
        52: 17,
        55: 18,
        58: 19,
        61: 20,
        64: 21,
        67: 22,
        70: 23,
        73: 24,
        76: 25,
        79: 26,
        82: 27,
        85: 28,
        88: 29,
        91: 30,
        94: 31,
        97: 32
    },
    maxGeneratedDrawPileBlocks: 32,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 6,
    minPrecisionBlocksPerLevel: 2,
    openingHandGenerationAttempts: 1000,

    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,

    scoring: {
        placementScorePerHeight: 10,
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
