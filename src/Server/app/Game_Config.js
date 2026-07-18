const GameConfig = {

    maxLevel: 99,
    debugStartLevel: 1,
    placementCooldown: 1500,
    quickChatCooldownMs: 6000,
    quickChatTemplates: ["Place now!", "I'm out of blocks!", "Sorry!"],
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
    startDelayMs: 1500,
    levelTimeLimitMs: 30000,
    nextLevelDelayMs: 1500,
    failRestartDelayMs: 1500,
    placementScorePopupDurationMs: 3000,
    finishScorePopupDurationMs: 3500,
    levelSummaryDelayMs: 4000,
    checkpointInterval: 3,
    checkpointScoreRequirement: 0,
    checkpointMinContributionShare: 0.30,
    towerGridWidth: 7,
    towerPlacementMode: "auto_center",
    towerOverhangWeight: 0.18,
    towerMaxTiltAngleDeg: 24,
    towerCollapseTiltScore: 1.0,
    towerStabilityWarningThreshold: 60,
    towerStabilityCriticalThreshold: 30,
    towerStabilityFeedbackMode: "warnings_only",
    politicsUnlockLevel: 4,
    politicsMaxSlots: 3,
    politicsActivationCooldownMs: 3000,
    politicsLifetime: "checkpoint",
    politicsCatalog: {
        score_cap: { category: "Offensive", title: "Score Cap" },
        copy_score: { category: "Defensive", title: "Copy Score" },
        free_refresh: { category: "Utility", title: "Free Refresh" }
    },

    blockUnlockLevels: {
        1: 1,
        2: 2,
        3: 3,
        4: 5,
        5: 10,
        6: 15
    },

    blockWeights: {
        1: 3,
        2: 3,
        3: 2,
        4: 2,
        5: 1,
        6: 1
    },

    blockShapeVariants: {
        1: [
            { shapeId: "I1", cells: [[0, 0]] }
        ],
        2: [
            { shapeId: "I2V", cells: [[0, 0], [0, 1]] },
            { shapeId: "I2H", cells: [[0, 0], [1, 0]] }
        ],
        3: [
            { shapeId: "I3V", cells: [[0, 0], [0, 1], [0, 2]] },
            { shapeId: "I3H", cells: [[0, 0], [1, 0], [2, 0]] },
            { shapeId: "L3", cells: [[0, 0], [0, 1], [1, 1]] },
            { shapeId: "J3", cells: [[1, 0], [1, 1], [0, 1]] }
        ],
        4: [
            { shapeId: "I4V", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
            { shapeId: "I4H", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
            { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
            { shapeId: "T", cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
            { shapeId: "L", cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
            { shapeId: "J", cells: [[1, 0], [1, 1], [1, 2], [0, 2]] },
            { shapeId: "S", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
            { shapeId: "Z", cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }
        ],
        5: [
            { shapeId: "I5V", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
            { shapeId: "I5H", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
            { shapeId: "P", cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
            { shapeId: "U", cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }
        ],
        6: [
            { shapeId: "I6V", cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4], [0, 5]] },
            { shapeId: "I6H", cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] },
            { shapeId: "RECT6V", cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] },
            { shapeId: "RECT6H", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }
        ]
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

    maxRefreshTokens: 1,
    maxRefreshUsesPerLevel: 2,
    refreshLockoutMs: 12000,
    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,

    scoring: {
        placementScorePerHeight: 10,
        finisherBonusPerLevel: 4,
        precisionBonusPerLevel: 8,
        teamExactBonusPerLevel: 6,
        assistBonusPerLevel: 0,
        assistContributionThreshold: 0.25
    },

    debugBotsEnabled: false,

    debugBotCount: 2,

    debugBotDelayMin: 1000,

    debugBotDelayMax: 5000,

    debugBotStrategy: "mvp_greedy",
    botRefreshLowInventoryHeight: 4,

};

module.exports = GameConfig;
