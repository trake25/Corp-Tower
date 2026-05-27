// Game_Config.js

const GameConfig = {

    // =========================
    // GAME SETTINGS
    // =========================

    maxLevel: 99,
    placementCooldown: 2000,
    targetHeightMultiplier: 3,
    startDelayMs: 2000,
    levelTimeLimitMs: 30000,
    nextLevelDelayMs: 2000,
    failRestartDelayMs: 2000,
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
