// Game_Config.js

const GameConfig = {

    // =========================
    // GAME SETTINGS
    // =========================

    maxLevel: 99,
    placementCooldown: 2000,
    targetHeightMultiplier: 3,
    startDelayMs: 1500,
    levelTimeLimitMs: 30000,
    nextLevelDelayMs: 1500,
    failRestartDelayMs: 1500,
    checkpointInterval: 3,
    checkpointScoreRequirement: 0,

    // =========================
    // BLOCK SETTINGS
    // =========================

    blockUnlockLevels: {
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
            { shapeId: "P", cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
            { shapeId: "U", cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }
        ],
        6: [
            { shapeId: "RECT6V", cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2]] },
            { shapeId: "RECT6H", cells: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]] }
        ]
    },

    // =========================
    // INVENTORY SETTINGS
    // =========================

    inventoryScaling: {
        1: 1,
        2: 2,
        4: 3,
        12: 4
    },

    maxActiveBlocks: 3,
    maxCarryOverBlocks: 1,

    // =========================
    // REFRESH TOKEN SETTINGS
    // =========================

    maxRefreshTokens: 1,
    maxRefreshUsesPerLevel: 2,
    refreshLockoutMs: 10000,

    // =========================
    // DEBUG SETTINGS
    // =========================

    debugBotsEnabled: true,

    debugBotCount: 2,

    debugBotDelayMin: 2000,

    debugBotDelayMax: 5000,

};

module.exports = GameConfig;
