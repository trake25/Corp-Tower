const GameConfig = require("../../app/Game_Config");
const GameEngine = require("../../app/Game_Engine");

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function configLeafPaths(value, prefix = "") {
    if (Array.isArray(value) || value === null || typeof value !== "object") {
        return [prefix];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return configLeafPaths(child, path);
    });
}

const originalGameConfig = clone(GameConfig);

const QA_TUNING_BASELINE = Object.freeze({
    maxLevel: 99,
    debugStartLevel: 1,
    playersPerRoom: 3,
    placementCooldown: 0,
    quickChatCooldownMs: 3000,
    quickChatTemplates: ["Place Block!", "Sorry!", "Hello!"],
    targetHeightMultiplier: 3,
    targetHeightBase: 30,
    targetHeightStepBase: 10,
    targetHeightStepGrowth: 5,
    targetHeightStepGrowthEvery: 3,
    startDelayMs: 0,
    lobbyReadyTimeoutMs: 60000,
    privateLobbyStartCountdownMs: 5000,
    privateLobbyReconnectPhaseMs: 10000,
    privateLobbyGracePhaseMs: 10000,
    levelTimeLimitMs: 120000,
    levelTimePlannedEfficiency: 0.55,
    levelTimeSlack: 3,
    levelTimeSlackMin: 1.5,
    levelTimeSlackFullLevel: 25,
    nextLevelDelayMs: 1000,
    failRestartDelayMs: 1000,
    placementScorePopupDurationMs: 2500,
    finishScorePopupDurationMs: 3500,
    levelSummaryDelayMs: 1000,
    impactInterval: 2,
    impactScoreRequirement: 0,
    impactMinContributionShare: 0.3,
    impactRecoverableFailures: 3,
    towerGridWidth: 8,
    placeableColumnMin: 2,
    placeableColumnMax: 5,
    towerSiteSlendernessTarget: 6.75,
    towerSiteWidthMin: 8,
    towerSiteWidthMax: 8,
    towerMaxTiltAngleDeg: 15,
    towerStructuralPoseMaxAngleDeg: 12,
    towerStructuralPoseMaxDipUnits: 0.18,
    towerStructuralPoseRigidRisk: 0.08,
    towerStructuralPoseIntegritySwayShare: 0.45,
    towerVisibleRowCapacity: 17,
    towerScrollStartRatio: 0.7,
    towerScrollEasePower: 3,
    towerTopIndicatorClearanceRows: 1,
    towerStabilityDifficulty: 30,
    towerLateralLoadShare: 0.45,
    towerStabilityPressure: { floor: 0.55, fullPressureLevel: 8, difficultyCurvePower: 2 },
    towerSupportDifficultyPressure: { midpoint: 0.38, steepness: 8 },
    towerStabilityAnchors: {
        forgiving: {
            towerBalanceSafeOffsetShare: 0.9,
            towerBalanceCollapseOffsetShare: 1.65,
            towerStructuralLoadExponent: 0.92,
            towerRedundancyBonus: 0.45,
            towerStructuralSeverity: 0.55,
            towerStabilityMinHeight: 10,
            towerHeightPressureGain: 0,
            towerSupportSafeLoadPerContact: 9.6,
            towerSupportCollapseLoadPerContact: 48
        },
        harsh: {
            towerBalanceSafeOffsetShare: 0.4,
            towerBalanceCollapseOffsetShare: 1,
            towerStructuralLoadExponent: 0.68,
            towerRedundancyBonus: 0.65,
            towerStructuralSeverity: 1.35,
            towerStabilityMinHeight: 8,
            towerHeightPressureGain: 1.3,
            towerSupportSafeLoadPerContact: 3.2,
            towerSupportCollapseLoadPerContact: 16
        }
    },
    towerBaseHalfWidthFloor: 1,
    towerStabilityWarningThreshold: 75,
    towerStabilityCriticalThreshold: 30,
    towerStabilityMoodThreshold: 2,
    towerStabilityFeedbackMode: "live_preview",
    powerUnlockLevel: 1,
    powerMaxSlots: 3,
    powerActivationCooldownMs: 3000,
    powerLastChanceEnabled: false,
    powerLifetime: "impact",
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
    brickWeights: { I: 1, O: 3, L: 2, T: 2, Z: 2 },
    inventoryScaling: { 1: 3 },
    maxActiveBlocks: 3,
    maxTeamCarryOverBlocks: 3,
    maxGeneratedDrawPileBlocks: 4096,
    supplyEffectiveWidthRatio: 0.4,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 4,
    levelSupplyMaxSurplusShare: 0.08,
    levelSupplyCoverageStart: 1.05,
    levelSupplyCoverageEnd: 0.75,
    levelSupplyCoverageFullLevel: 15,
    minPrecisionBlocksPerLevel: 3,
    openingHandGenerationAttempts: 1000,
    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,
    accessibility: { parallelPlacement: false },
    visualHooks: {
        impactBeat: true,
        screenShake: true,
        impactBeatMinZoom: 0.3,
        impactBeatZoomOutMs: 900,
        impactBeatWaveMs: 1100,
        impactBeatHoldMs: 0,
        collapseDebrisLifetimeMs: 3000,
        screenShakeMs: 460,
        screenShakeMagnitudeUnits: 0.22
    },
    scoring: {
        placementScorePerHeight: 10,
        recoveryHeightScorePercent: 50,
        strongReinforcementActionShare: 2,
        strongStructuralImprovement: 0.3,
        fullDangerRiskIncrease: 0.25,
        dangerousHeightFloor: 0.35,
        criticalSaveActionShare: 3,
        criticalSaveMinRiskReduction: 0.3,
        criticalSaveMinLoadShare: 0.3,
        criticalSaveMaxPerLevel: 2,
        finisherBonusPerLevel: 0,
        perfectBuildFinisherActionShare: 5,
        perfectBuildImpactRequirementShare: 0.15,
        assistBonusPerLevel: 0,
        assistContributionThreshold: 0.25
    },
    debugBotsEnabled: false,
    showLatencyIndicator: true,
    debugBotCount: 2,
    debugBotDelayMin: 6000,
    debugBotDelayMax: 7000,
    debugBotStrategy: "cooperative",
    debugBotStabilityTolerance: 5,
    debugBotGapCandidates: 6
});

function assertCompleteGameConfig(values) {
    const expectedPaths = configLeafPaths(originalGameConfig);
    const providedPaths = configLeafPaths(values);
    const provided = new Set(providedPaths);
    const expected = new Set(expectedPaths);
    const missingPaths = expectedPaths.filter(path => !provided.has(path));
    const extraPaths = providedPaths.filter(path => !expected.has(path));

    if (missingPaths.length || extraPaths.length) {
        throw new Error([
            missingPaths.length ? `missing: ${missingPaths.join(", ")}` : "",
            extraPaths.length ? `unknown: ${extraPaths.join(", ")}` : ""
        ].filter(Boolean).join("; "));
    }
}

function applyCompleteGameConfig(values) {
    assertCompleteGameConfig(values);
    for (const [key, value] of Object.entries(values)) {
        GameConfig[key] = clone(value);
    }
}

function restoreOriginalGameConfig() {
    for (const key of Object.keys(GameConfig)) {
        if (!Object.hasOwn(originalGameConfig, key)) delete GameConfig[key];
    }
    for (const [key, value] of Object.entries(originalGameConfig)) {
        GameConfig[key] = clone(value);
    }
}

function applyTunables(tunables = {}) {
    for (const [key, value] of Object.entries(tunables)) {
        if (!Object.hasOwn(GameConfig, key)) throw new Error(`Unknown QA tunable: ${key}`);
        if (value && typeof value === "object" && !Array.isArray(value)) {
            GameConfig[key] = { ...GameConfig[key], ...clone(value) };
        } else {
            GameConfig[key] = clone(value);
        }
    }
}

function fixedGridTunables({ gridWidth = 14, widthMin = 6, widthMax = 6 } = {}) {
    return {
        towerGridWidth: gridWidth,
        towerSiteWidthMin: widthMin,
        towerSiteWidthMax: widthMax,
        towerSiteSlendernessTarget: 2.75
    };
}

// The live stability constants are derived per level from towerStabilityDifficulty,
// so tests that assert concrete stability numbers pin their own resolved set the
// same way fixedGridTunables pins the grid.
function fixedStabilityConfig(overrides = {}) {
    return {
        towerSiteWidth: 6,
        towerBaseHalfWidthFloor: 1.0,
        towerMaxTiltAngleDeg: 24,
        towerCollapseTiltScore: 1.0,
        towerBalanceSafeOffsetShare: 0.8,
        towerBalanceCollapseOffsetShare: 1.15,
        towerStructuralLoadExponent: 0.8,
        towerRedundancyBonus: 0.45,
        towerStructuralSeverity: 1.0,
        towerStabilityMinHeight: 6,
        towerStabilityPressureApplied: 1,
        towerSupportSafeLoadPerContact: 25.5,
        towerSupportCollapseLoadPerContact: 45,
        ...overrides
    };
}
const activeEngines = new Set();

function resetFixtures() {
    activeEngines.forEach(engine => {
        engine.clearTimers();
    });
    activeEngines.clear();
    restoreOriginalGameConfig();
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

function createPlayingEngine(level = 1, targetHeight = 5, options = {}) {
    const messages = [];
    applyCompleteGameConfig(QA_TUNING_BASELINE);
    applyTunables(options.tunables);
    const engine = new GameEngine({
        onRoomMessage: (_roomId, message) => {
            messages.push(JSON.parse(JSON.stringify(message)));
        },
        onRoomCloseRequested: options.onRoomCloseRequested || null
    });

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
    fixedGridTunables,
    fixedStabilityConfig,
    latestMessage,
    messageWithScoreEvents,
    originalGameConfig,
    QA_TUNING_BASELINE,
    resetFixtures,
    applyTunables
};
