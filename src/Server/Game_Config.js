// Game_Config.js

const GameConfig = {

    // =========================
    // GAME SETTINGS
    // =========================

    maxLevel: 99,
    placementCooldown: 3000,
    targetHeightMultiplier: 3,

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

};

module.exports = GameConfig;