const GameConfig = require("../../app/Game_Config");
const GameEngine = require("../../app/Game_Engine");

const originalGameConfig = {
    placementCooldown: GameConfig.placementCooldown,
    placementScorePopupDurationMs: GameConfig.placementScorePopupDurationMs,
    finishScorePopupDurationMs: GameConfig.finishScorePopupDurationMs,
    levelSummaryDelayMs: GameConfig.levelSummaryDelayMs
    ,quickChatCooldownMs: GameConfig.quickChatCooldownMs
    ,powerLifetime: GameConfig.powerLifetime
    ,powerReplenishPileShare: GameConfig.powerReplenishPileShare
    ,towerStabilityWarningThreshold: GameConfig.towerStabilityWarningThreshold
    ,towerStabilityCriticalThreshold: GameConfig.towerStabilityCriticalThreshold
    ,towerStabilityMoodThreshold: GameConfig.towerStabilityMoodThreshold
    ,towerGridWidth: GameConfig.towerGridWidth
    ,towerSiteWidthMin: GameConfig.towerSiteWidthMin
    ,towerSiteWidthMax: GameConfig.towerSiteWidthMax
    ,towerSiteSlendernessTarget: GameConfig.towerSiteSlendernessTarget
};

// Placement geometry is designer-tunable, so these tests pin the grid they
// assert against instead of inheriting whatever Game_Config currently ships.
function useFixedGrid({ gridWidth = 14, widthMin = 6, widthMax = 6 } = {}) {
    GameConfig.towerGridWidth = gridWidth;
    GameConfig.towerSiteWidthMin = widthMin;
    GameConfig.towerSiteWidthMax = widthMax;
    GameConfig.towerSiteSlendernessTarget = 2.75;
}

// The live stability constants are derived per level from towerStabilityDifficulty,
// so tests that assert concrete stability numbers pin their own resolved set the
// same way useFixedGrid pins the grid.
function fixedStabilityConfig(overrides = {}) {
    return {
        towerSiteWidth: 6,
        towerBaseHalfWidthFloor: 1.0,
        towerMaxTiltAngleDeg: 24,
        towerOverhangWeight: 0.18,
        towerLaneImbalanceWeight: 0.15,
        towerCollapseTiltScore: 1.0,
        towerSlendernessSafe: 1.2,
        towerSlendernessMax: 2.5,
        towerSupportDeficitMax: 0.35,
        towerStabilityMinHeight: 6,
        ...overrides
    };
}
const originalScoringConfig = { ...GameConfig.scoring };
const activeEngines = new Set();

function resetFixtures() {
    activeEngines.forEach(engine => {
        engine.clearTimers();
    });
    activeEngines.clear();
    GameConfig.placementCooldown = originalGameConfig.placementCooldown;
    GameConfig.placementScorePopupDurationMs =
        originalGameConfig.placementScorePopupDurationMs;
    GameConfig.finishScorePopupDurationMs =
        originalGameConfig.finishScorePopupDurationMs;
    GameConfig.levelSummaryDelayMs = originalGameConfig.levelSummaryDelayMs;
    GameConfig.quickChatCooldownMs = originalGameConfig.quickChatCooldownMs;
    GameConfig.powerLifetime = originalGameConfig.powerLifetime;
    GameConfig.powerReplenishPileShare =
        originalGameConfig.powerReplenishPileShare;
    GameConfig.towerStabilityWarningThreshold =
        originalGameConfig.towerStabilityWarningThreshold;
    GameConfig.towerStabilityCriticalThreshold =
        originalGameConfig.towerStabilityCriticalThreshold;
    GameConfig.towerStabilityMoodThreshold =
        originalGameConfig.towerStabilityMoodThreshold;
    GameConfig.towerGridWidth = originalGameConfig.towerGridWidth;
    GameConfig.towerSiteWidthMin = originalGameConfig.towerSiteWidthMin;
    GameConfig.towerSiteWidthMax = originalGameConfig.towerSiteWidthMax;
    GameConfig.towerSiteSlendernessTarget =
        originalGameConfig.towerSiteSlendernessTarget;
    GameConfig.scoring = { ...originalScoringConfig };
}

function createPlayers() {
    return [
        { id: "P1", score: 0 },
        { id: "P2", score: 0 },
        { id: "P3", score: 0 }
    ];
}

function createBlock(height, id = "B1") {
    return {
        id: id,
        shapeId: "I" + height + "V",
        height: height,
        cells: Array.from({ length: height }, (_, y) => [0, y])
    };
}

function createPlayingEngine(level = 1, targetHeight = 5) {
    const messages = [];
    const engine = new GameEngine({
        onRoomMessage: (_roomId, message) => {
            messages.push(JSON.parse(JSON.stringify(message)));
        }
    });

    GameConfig.placementCooldown = 0;
    GameConfig.placementScorePopupDurationMs = 2500;
    GameConfig.finishScorePopupDurationMs = 3500;
    GameConfig.levelSummaryDelayMs = 1000;

    engine.createRoom(createPlayers());
    activeEngines.add(engine);
    engine.room.id = "TEST";
    engine.room.state = "playing";
    engine.room.level = level;
    engine.room.targetHeight = targetHeight;
    engine.room.currentHeight = 0;
    engine.room.drawPile = [];
    engine.room.towerBlocks = [];
    engine.room.pendingScoreEvents = [];
    engine.room.scoreEventSeq = 0;
    engine.room.players.forEach(player => {
        player.blocks = [];
        player.score = 0;
        player.levelScore = 0;
        player.scoreBreakdown = {};
        player.contributedHeight = 0;
        player.lastPlacementTime = 0;
    });

    return { engine, messages };
}

function latestMessage(messages) {
    return messages[messages.length - 1];
}

function messageWithScoreEvents(messages) {
    return messages.find(message => {
        return (message.scoreEvents || []).length > 0;
    });
}

function eventTypes(message) {
    return message.scoreEvents.map(event => event.type);
}


function createFlatBlock(width, id = "F1") {
    return {
        id: id,
        shapeId: "I" + width + "H",
        height: 1,
        cells: Array.from({ length: width }, (_, x) => [x, 0])
    };
}

// Two ground bricks with a one-cell void between them and a lid across the top:
// the shape that was unreachable while every brick fell to the first thing under
// it. P1 keeps a spare filler brick in hand for the placement under test.
function buildTowerWithVoid(engine) {
    engine.room.players[0].blocks = [
        createBlock(1, "L1"), createBlock(1, "FILL"), createBlock(4, "S1")
    ];
    engine.room.players[1].blocks = [
        createBlock(1, "R1"), createBlock(1, "R2"), createBlock(4, "S2")
    ];
    engine.room.players[2].blocks = [
        createFlatBlock(3, "LID"), createBlock(1, "P3B"), createBlock(4, "S3")
    ];

    engine.placeBlock("P1", 0, 4);
    engine.placeBlock("P2", 0, 6);
    engine.placeBlock("P3", 0, 4);
}

module.exports = {
    GameConfig,
    buildTowerWithVoid,
    createBlock,
    createFlatBlock,
    createPlayingEngine,
    eventTypes,
    fixedStabilityConfig,
    latestMessage,
    messageWithScoreEvents,
    originalGameConfig,
    resetFixtures,
    useFixedGrid
};
