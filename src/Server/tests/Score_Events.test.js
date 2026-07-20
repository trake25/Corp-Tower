const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const GameConfig = require("../app/Game_Config");
const GameEngine = require("../app/Game_Engine");
const LobbyManager = require("../app/Lobby_Manager");
const TowerStability = require("../app/Tower_Stability");

const originalGameConfig = {
    placementCooldown: GameConfig.placementCooldown,
    placementScorePopupDurationMs: GameConfig.placementScorePopupDurationMs,
    finishScorePopupDurationMs: GameConfig.finishScorePopupDurationMs,
    levelSummaryDelayMs: GameConfig.levelSummaryDelayMs
    ,quickChatCooldownMs: GameConfig.quickChatCooldownMs
    ,powerLifetime: GameConfig.powerLifetime
    ,towerStabilityWarningThreshold: GameConfig.towerStabilityWarningThreshold
    ,towerStabilityCriticalThreshold: GameConfig.towerStabilityCriticalThreshold
};
const originalScoringConfig = { ...GameConfig.scoring };
const activeEngines = new Set();

afterEach(() => {
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
    GameConfig.towerStabilityWarningThreshold =
        originalGameConfig.towerStabilityWarningThreshold;
    GameConfig.towerStabilityCriticalThreshold =
        originalGameConfig.towerStabilityCriticalThreshold;
    GameConfig.scoring = { ...originalScoringConfig };
});

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

test("placement emits one placement score event", () => {
    const { engine, messages } = createPlayingEngine(1, 5);

    engine.room.players[0].blocks = [createBlock(2)];
    engine.room.players[1].blocks = [createBlock(3, "B2")];

    engine.placeBlock("P1", 0);

    const message = messageWithScoreEvents(messages);
    assert.deepEqual(eventTypes(message), ["placement"]);
    assert.equal(message.placementScorePopupDurationMs, 2500);
    assert.equal(message.finishScorePopupDurationMs, 3500);
    assert.equal(message.scorePopupDurationMs, 3500);
    assert.equal(message.scoreEvents[0].playerId, "P1");
    assert.equal(message.scoreEvents[0].points, 20);
    assert.equal(message.players[0].levelScore, 20);

});

test("centered Z block settles with an unsupported overhang", () => {
    const block = { cells: [[0, 0], [1, 0], [1, 1], [2, 1]] };
    const first = { block: createBlock(1), originX: 3, originY: 0 };
    const settled = TowerStability.settleBlock([first], block, 7);
    const result = TowerStability.evaluate([first, { block, ...settled }], GameConfig);
    assert.equal(settled.originX, 2);
    assert.equal(settled.originY, 1);
    assert.ok(result.stability < 100);
});

test("quick chat broadcasts a transient event and enforces the player cooldown", () => {
    const { engine, messages } = createPlayingEngine(1, 5);
    const player = engine.room.players[0];

    GameConfig.quickChatCooldownMs = 6000;

    assert.equal(engine.queueQuickChat(player, 1), true);
    const message = latestMessage(messages);
    assert.equal(message.quickChatEvents.length, 1);
    assert.equal(message.quickChatEvents[0].playerId, "P1");
    assert.equal(message.quickChatEvents[0].text, "Sorry!");
    assert.equal(message.quickChatCooldownMs, 6000);
    assert.equal(engine.queueQuickChat(player, 1), false);
    assert.equal(engine.queueQuickChat(player, 99), false);
});

test("exact winning placement emits exact finish and all eligible bonus events", () => {
    const { engine, messages } = createPlayingEngine(1, 3);

    engine.room.players[0].blocks = [createBlock(3)];

    engine.placeBlock("P1", 0);

    const message = messageWithScoreEvents(messages);
    const types = eventTypes(message);

    assert.equal(types.filter(type => type === "placement").length, 1);
    assert.equal(types.filter(type => type === "exact_finish").length, 1);
    assert.equal(types.filter(type => type === "finisher_bonus").length, 1);
    assert.equal(types.filter(type => type === "precision_bonus").length, 1);
    assert.equal(types.filter(type => type === "team_exact_bonus").length, 3);
    assert.equal(types.includes("assist_bonus"), false);
    assert.equal(types.filter(type => type === "mvp").length, 1);
    assert.equal(types.includes("team_total"), false);
    assert.equal(message.lastLevelSummary.result, "completed");
    assert.equal(message.lastLevelSummary.exactFinish, true);
    assert.equal(message.lastLevelSummary.overbuildHeight, 0);
    assert.equal(message.lastLevelSummary.finisherId, "P1");

});

test("overbuild winning placement emits overbuild finish without exact bonuses", () => {
    const { engine, messages } = createPlayingEngine(1, 2);

    engine.room.players[0].blocks = [createBlock(3)];

    engine.placeBlock("P1", 0);

    const message = messageWithScoreEvents(messages);
    const types = eventTypes(message);

    assert.equal(types.includes("overbuild_finish"), true);
    assert.equal(types.includes("exact_finish"), false);
    assert.equal(types.includes("precision_bonus"), false);
    assert.equal(types.includes("team_exact_bonus"), false);
    assert.equal(message.lastLevelSummary.result, "completed");
    assert.equal(message.lastLevelSummary.exactFinish, false);
    assert.equal(message.lastLevelSummary.overbuildHeight, 1);

});

test("refresh upgrades small blocks to unlocked size 3 or higher", () => {
    const { engine } = createPlayingEngine(10, 20);

    const refreshed = engine.generateRefreshBlocks([
        createBlock(1, "B1"),
        createBlock(2, "B2")
    ]);

    assert.equal(refreshed.length, 2);
    assert.equal(
        refreshed.every(block => engine.getBlockCellCount(block) >= 3),
        true
    );
});

test("refresh rerolls size 3 or higher blocks without changing size", () => {
    const { engine } = createPlayingEngine(15, 20);

    const refreshed = engine.generateRefreshBlocks([
        createBlock(4, "B4"),
        createBlock(5, "B5")
    ]);

    assert.deepEqual(
        refreshed.map(block => engine.getBlockCellCount(block)),
        [4, 5]
    );
    assert.notEqual(refreshed[0].shapeId, "I4V");
    assert.notEqual(refreshed[1].shapeId, "I5V");
});

test("activating the refresh power item rerolls every player's blocks", () => {
    const { engine } = createPlayingEngine(10, 20);
    const caster = engine.room.players[0];
    const teammateA = engine.room.players[1];
    const teammateB = engine.room.players[2];

    engine.room.endsAt = Date.now() + 60000;
    caster.powerInventory = [{ id: "refresh", earnedLevel: 10 }];
    caster.lastPowerActivationTime = 0;
    caster.blocks = [createBlock(1, "B0")];
    teammateA.blocks = [
        createBlock(1, "B1"),
        createBlock(2, "B2")
    ];
    teammateB.blocks = [createBlock(2, "B3")];

    assert.equal(engine.activatePower(caster.id, 0), true);

    assert.equal(caster.powerInventory.length, 0);
    for (const player of [caster, teammateA, teammateB]) {
        assert.equal(
            player.blocks.every(block => engine.getBlockCellCount(block) >= 3),
            true
        );
    }
});

test("a held refresh power item defers the not-enough-height fail", () => {
    const { engine } = createPlayingEngine(10, 20);
    const player = engine.room.players[0];

    engine.room.endsAt = Date.now() + 60000;
    engine.room.currentHeight = 0;
    engine.room.drawPile = [];
    engine.room.players.forEach(p => {
        p.blocks = [];
        p.powerInventory = [];
    });
    player.blocks = [createBlock(1, "B1")];

    player.powerInventory = [{ id: "refresh", earnedLevel: 10 }];
    engine.checkFailCondition();
    assert.equal(engine.room.state, "playing");

    player.powerInventory = [];
    engine.checkFailCondition();
    assert.equal(engine.room.state, "failed");
});

test("failed level summary does not bank level score into final totals", () => {
    const { engine } = createPlayingEngine(1, 5);

    engine.room.players[0].score = 100;
    engine.room.players[0].levelScore = 40;
    engine.room.players[0].scoreBreakdown = { placement: 40 };

    engine.failLevel("time_expired");

    const playerSummary = engine.room.lastLevelSummary.players.find(player => {
        return player.id === "P1";
    });

    assert.equal(engine.room.lastLevelSummary.result, "failed");
    assert.equal(playerSummary.previousTotalScore, 100);
    assert.equal(playerSummary.finalTotalScore, 100);
    assert.equal(engine.room.players[0].score, 100);

});

test("UI durations are exposed and clamped in debug config", async () => {
    const lobbyManager = new LobbyManager();

    await lobbyManager.updateDebugConfig("placementScorePopupDurationMs", 250);
    assert.equal(GameConfig.placementScorePopupDurationMs, 500);

    await lobbyManager.updateDebugConfig("placementScorePopupDurationMs", 12000);
    assert.equal(GameConfig.placementScorePopupDurationMs, 10000);

    await lobbyManager.updateDebugConfig("finishScorePopupDurationMs", 250);
    assert.equal(GameConfig.finishScorePopupDurationMs, 500);

    await lobbyManager.updateDebugConfig("finishScorePopupDurationMs", 12000);
    assert.equal(GameConfig.finishScorePopupDurationMs, 10000);

    await lobbyManager.updateDebugConfig("levelSummaryDelayMs", 500);
    assert.equal(GameConfig.levelSummaryDelayMs, 1000);

    await lobbyManager.updateDebugConfig("levelSummaryDelayMs", 12000);
    assert.equal(GameConfig.levelSummaryDelayMs, 10000);
    assert.equal(lobbyManager.getDebugConfig().placementScorePopupDurationMs, 10000);
    assert.equal(lobbyManager.getDebugConfig().finishScorePopupDurationMs, 10000);
    assert.equal(lobbyManager.getDebugConfig().levelSummaryDelayMs, 10000);
});

test("tower stability thresholds are exposed and clamped in debug config", async () => {
    const lobbyManager = new LobbyManager();

    await lobbyManager.updateDebugConfig("towerStabilityWarningThreshold", 150);
    assert.equal(GameConfig.towerStabilityWarningThreshold, 100);

    await lobbyManager.updateDebugConfig("towerStabilityWarningThreshold", -20);
    assert.equal(GameConfig.towerStabilityWarningThreshold, 0);
    assert.equal(GameConfig.towerStabilityCriticalThreshold, 0);

    await lobbyManager.updateDebugConfig("towerStabilityWarningThreshold", 60);
    await lobbyManager.updateDebugConfig("towerStabilityCriticalThreshold", 80);
    assert.equal(GameConfig.towerStabilityCriticalThreshold, 60);

    await lobbyManager.updateDebugConfig("towerStabilityCriticalThreshold", 30);
    assert.equal(lobbyManager.getDebugConfig().towerStabilityWarningThreshold, 60);
    assert.equal(lobbyManager.getDebugConfig().towerStabilityCriticalThreshold, 30);
});

test("rollback restores power inventory from impact snapshot", () => {
    GameConfig.powerLifetime = "impact";
    const { engine } = createPlayingEngine(6, 20);

    engine.room.impactLevel = 4;
    engine.room.impactPowers = {
        P1: [{ id: "score_cap", earnedLevel: 4 }],
        P2: [],
        P3: []
    };
    engine.room.players[0].powerInventory = [
        { id: "score_cap", earnedLevel: 4 },
        { id: "refresh", earnedLevel: 5 },
        { id: "copy_score", earnedLevel: 6 }
    ];

    engine.restoreImpactPowers();

    assert.equal(engine.room.players[0].powerInventory.length, 1);
    assert.equal(engine.room.players[0].powerInventory[0].id, "score_cap");
    assert.equal(engine.room.players[0].powerInventory[0].earnedLevel, 4);
});

test("saveImpactPowers captures each player's current inventory", () => {
    const { engine } = createPlayingEngine(4, 10);

    engine.room.players[0].powerInventory = [
        { id: "refresh", earnedLevel: 4, source: "impact_mvp" }
    ];
    engine.room.players[1].powerInventory = [
        { id: "copy_score", earnedLevel: 5 }
    ];

    engine.saveImpactPowers();

    assert.deepEqual(engine.room.impactPowers.P1, [
        { id: "refresh", earnedLevel: 4, source: "impact_mvp" }
    ]);
    assert.deepEqual(engine.room.impactPowers.P2, [
        { id: "copy_score", earnedLevel: 5 }
    ]);
    assert.deepEqual(engine.room.impactPowers.P3, []);
});
