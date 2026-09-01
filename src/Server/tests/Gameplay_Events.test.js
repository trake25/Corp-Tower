const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { stripRuntimeRoom } = require("../app/Redis_State");
const GameEngine = require("../app/Game_Engine");
const BotManager = require("../app/Bot_Manager");
const TowerStability = require("../app/Tower_Stability");

const {
    GameConfig,
    createBlock,
    createPlayingEngine,
    eventTypes,
    fixedGridTunables,
    fixedStabilityConfig,
    latestMessage,
    messageWithScoreEvents,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

function flatCells(width) {
    return Array.from({ length: width }, (_, x) => [x, 0]);
}

function towerEntry(id, cells, originX, originY) {
    return {
        block: { id, shapeId: id, height: 1, cells },
        originX,
        originY
    };
}

function createLastChancePlacementEngine(reinforcementCells) {
    const { engine, messages } = createPlayingEngine(1, 20, {
        tunables: {
            ...fixedGridTunables({ gridWidth: 14, widthMin: 14, widthMax: 14 }),
            powerLastChanceEnabled: true
        }
    });
    const row = flatCells(6);
    engine.resolveStabilityConfig = () => fixedStabilityConfig({
        towerSiteWidth: 14,
        towerStabilityMinHeight: 1,
        towerStructuralSeverity: 1.3
    });
    engine.room.towerBlocks = [
        towerEntry("B0", row, 0, 0),
        towerEntry("B1", row, 0, 1),
        towerEntry("N", flatCells(1), 2, 2),
        towerEntry("U3", row, 0, 3),
        towerEntry("U4", row, 0, 4),
        towerEntry("U5", row, 0, 5),
        towerEntry("S0", row, 8, 0),
        towerEntry("S1", row, 8, 1)
    ];
    engine.room.currentHeight = TowerStability.topHeight(engine.room.towerBlocks);
    engine.recalculateTowerStability(false);
    engine.room.players[0].blocks = [
        { id: "FAIL", shapeId: "I6H", height: 1, cells: row }
    ];
    engine.room.players[1].blocks = [
        { id: "BRACE", shapeId: "BRACE", height: 1, cells: reinforcementCells }
    ];
    engine.room.players[2].blocks = [createBlock(30, "SUPPLY")];

    return { engine, messages };
}

test("Last Chance saves one collapse, requires a reinforcement, and persists its pending state", () => {
    const { engine } = createPlayingEngine(1, 8);
    const collapse = {
        stability: 0,
        diagnostics: { collapsed: true },
        structuralPose: [],
        analysis: { groups: [] }
    };
    const reinforcement = {
        stability: 2,
        diagnostics: { collapsed: false },
        structuralPose: [],
        analysis: { groups: [] }
    };

    GameConfig.powerLastChanceEnabled = true;
    const saved = engine.resolveLastChance(collapse, true);

    assert.equal(saved.stability, 1);
    assert.equal(saved.diagnostics.collapsed, false);
    assert.equal(saved.diagnostics.lastChanceRescuePending, true);
    assert.equal(engine.room.lastChanceRescuePending, true);
    assert.equal(engine.room.lastChanceRescueUsed, true);

    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: engine.room.players,
        state: engine.room
    });
    assert.equal(snapshot.state.lastChanceRescuePending, true);
    assert.equal(snapshot.state.lastChanceRescueUsed, true);

    const held = engine.resolveLastChance(collapse);
    assert.equal(held.stability, 1);
    assert.equal(engine.room.lastChanceRescuePending, true);

    const recovered = engine.resolveLastChance(reinforcement, true);
    assert.equal(recovered.stability, 2);
    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.resolveLastChance(collapse, true).stability, 0);
});

test("Last Chance collapses on an unsuccessful follow-up placement and resets per level", () => {
    const { engine } = createPlayingEngine(1, 8);
    const collapse = {
        stability: 0,
        diagnostics: { collapsed: true },
        structuralPose: [],
        analysis: { groups: [] }
    };

    GameConfig.powerLastChanceEnabled = true;
    engine.resolveLastChance(collapse, true);
    const failedFollowUp = engine.resolveLastChance({
        ...collapse,
        stability: 1,
        diagnostics: { collapsed: false }
    }, true);

    assert.equal(failedFollowUp.stability, 0);
    assert.equal(failedFollowUp.diagnostics.collapsed, true);
    assert.equal(engine.room.lastChanceRescuePending, false);

    engine.resetLastChanceRescue();
    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.room.lastChanceRescueUsed, false);

    GameConfig.powerLastChanceEnabled = false;
    const disabled = engine.resolveLastChance(collapse, true);
    assert.equal(disabled.stability, 0);
    assert.equal(engine.room.lastChanceRescuePending, false);
});

test("Last Chance placeBlock rescue remains playable and a successful reinforcement clears pending", () => {
    const { engine, messages } = createLastChancePlacementEngine([[1, 0], [4, 0]]);
    let persisted = 0;
    engine.onRoomChanged = async () => {
        persisted += 1;
    };

    engine.placeBlock("P1", 0, 0);

    assert.equal(engine.room.state, "playing");
    assert.equal(engine.room.lastChanceRescuePending, true);
    assert.equal(engine.room.lastChanceRescueUsed, true);
    assert.equal(engine.room.towerStability, 1);
    assert.equal(engine.room.towerBlocks.some(entry => entry.towerState === "fallen"), false);
    assert.ok(engine.room.towerStabilityComponents.every(component => !component.diagnostics.collapsed));
    assert.equal(latestMessage(messages).towerStability, 1);
    assert.equal(persisted, 1);

    engine.placeBlock("P2", 0, 0, 2);

    assert.equal(engine.room.state, "playing");
    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.room.lastChanceRescueUsed, true);
    assert.ok(engine.room.towerStability > 1);
    assert.equal(engine.room.towerBlocks.some(entry => entry.towerState === "fallen"), false);
    assert.ok(latestMessage(messages).towerStability > 1);
    assert.equal(messages.length, 2);
    assert.equal(persisted, 2);

    const row = flatCells(6);
    engine.room.players[2].blocks = [
        { id: "FAIL_AGAIN_A", shapeId: "I6H", height: 1, cells: row },
        { id: "FAIL_AGAIN_B", shapeId: "I6H", height: 1, cells: row },
        createBlock(30, "SUPPLY")
    ];
    engine.placeBlock("P3", 0, 0);
    engine.placeBlock("P3", 0, 0);

    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.room.lastChanceRescueUsed, true);
    assert.ok(engine.room.towerBlocks.some(entry => entry.towerState === "fallen"));
    assert.ok(eventTypes(latestMessage(messages)).includes("tower_component_collapsed"));
    assert.equal(messages.length, 4);
    assert.equal(persisted, 4);
});

test("Last Chance failed placeBlock reinforcement collapses authoritative components", () => {
    const { engine, messages } = createLastChancePlacementEngine([[1, 0], [3, 0]]);
    let persisted = 0;
    engine.onRoomChanged = async () => {
        persisted += 1;
    };

    engine.placeBlock("P1", 0, 0);
    engine.placeBlock("P2", 0, 0, 2);

    const fallen = engine.room.towerBlocks.filter(entry => entry.towerState === "fallen");
    const broadcast = latestMessage(messages);
    assert.equal(engine.room.state, "playing");
    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.room.lastChanceRescueUsed, true);
    assert.ok(fallen.length > 0);
    assert.ok(eventTypes(broadcast).includes("tower_component_collapsed"));
    assert.equal(broadcast.towerStabilityDiagnostics.collapsed, false);
    assert.equal(messages.length, 2);
    assert.equal(persisted, 2);

    engine.startLevel();
    assert.equal(engine.room.lastChanceRescuePending, false);
    assert.equal(engine.room.lastChanceRescueUsed, false);
});

test("quick chat broadcasts a transient event and enforces the player cooldown", () => {
    const { engine, messages } = createPlayingEngine(1, 5);
    const player = engine.room.players[0];

    GameConfig.quickChatCooldownMs = 6000;

    assert.equal(engine.queueQuickChat(player, 1), true);
    const message = latestMessage(messages);
    assert.equal(message.quickChatEvents.length, 1);
    assert.equal(message.quickChatEvents[0].playerId, "P1");
    assert.equal(message.quickChatEvents[0].text, GameConfig.quickChatTemplates[1]);
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
    assert.equal(types.filter(type => type === "finisher_bonus").length, 0);
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

test("a placement emits one authoritative score transaction and contribution", () => {
    const { engine, messages } = createPlayingEngine(2, 10);

    engine.room.players[0].blocks = [createBlock(2)];
    engine.placeBlock("P1", 0);

    const message = messageWithScoreEvents(messages);
    const placementEvents = message.scoreEvents.filter(event => event.type === "placement");
    const player = engine.room.players[0];

    assert.equal(placementEvents.length, 1);
    assert.equal(message.scoreEvents.some(event => event.type === "reinforce"), false);
    assert.deepEqual(
        Object.keys(placementEvents[0].meta).sort(),
        [
            "benefitedLoadShare", "classification", "criticalSavePoints", "effectiveHeight",
            "heightPoints", "heightQuality", "newHeight", "recoveredHeight", "recoveryPoints",
            "structuralPoints", "structuralValue"
        ]
    );
    assert.equal(player.levelImpactContribution, placementEvents[0].points);
    assert.equal(
        message.players.find(entry => entry.id === player.id).levelImpactContribution,
        player.levelImpactContribution
    );
});

test("a qualified Critical Save claims its interface and banks eligible contribution", () => {
    const { engine, messages } = createPlayingEngine(1, 20);
    const player = engine.room.players[0];
    const input = {
        effectiveHeight: 0,
        beforeResult: { stability: 40, diagnostics: { collapsed: false, criticalRisk: 0.8 }, analysis: { height: 20, groups: [] } },
        afterResult: { stability: 80, diagnostics: { collapsed: false, criticalRisk: 0.2 }, analysis: { height: 20, groups: [] } },
        assessment: {
            riskIncrease: 0,
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1,
            benefitedLoadShare: 0.5,
            criticalRiskReduction: 0.5,
            criticalSaveCandidate: true,
            repairClaimKey: "support:C"
        },
        stabilityConfig: { towerStabilityMinHeight: 1 }
    };

    const transaction = engine.addPlacementScore(player, input);
    engine.broadcastGameState();

    const event = latestMessage(messages).scoreEvents.find(scoreEvent => {
        return scoreEvent.type === "critical_save";
    });

    assert.equal(transaction.criticalSave, true);
    assert.ok(event);
    assert.equal(engine.room.criticalSaveClaimKeys["support:C"], true);
    assert.equal(player.levelImpactContribution, transaction.points);
    engine.addLevelScoreToLeaderboard();
    assert.equal(player.impactContribution, transaction.points);
    assert.equal(player.levelImpactContribution, 0);
    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: engine.room.players,
        state: engine.room
    });

    assert.equal(snapshot.players[0].levelImpactContribution, 0);
    assert.equal(snapshot.players[0].impactContribution, transaction.points);
    assert.equal(snapshot.state.criticalSaveClaimKeys["support:C"], true);
});

test("banking a completed level preserves Impact progress without live double-counting", () => {
    const { engine } = createPlayingEngine(2, 20);
    const player = engine.room.players[0];

    GameConfig.impactInterval = 2;
    GameConfig.impactScoreRequirement = 0;
    GameConfig.impactMinContributionShare = 0;
    engine.room.impactLevel = 1;
    engine.room.impactContributions = { P1: 10, P2: 0, P3: 0 };
    player.impactContribution = 10;
    player.levelImpactContribution = 25;

    const before = engine.getImpactScoreStatus(3).players.find(entry => entry.id === player.id);
    engine.addLevelScoreToLeaderboard();
    const after = engine.getImpactScoreStatus(3).players.find(entry => entry.id === player.id);

    assert.equal(before.bandContribution, 25);
    assert.equal(after.bankedBandContribution, 25);
    assert.equal(after.liveLevelContribution, 0);
    assert.equal(after.bandContribution, before.bandContribution);
});

test("refresh rerolls blocks into the five-brick set", () => {
    const { engine } = createPlayingEngine(10, 20);
    const validShapes = new Set(["I", "O", "L", "T", "Z"]);

    const refreshed = engine.generateRefreshBlocks([
        engine.createBlock("O"),
        engine.createBlock("T")
    ]);

    assert.equal(refreshed.length, 2);
    assert.equal(refreshed.every(block => validShapes.has(block.shapeId)), true);
    assert.equal(refreshed.every(block => engine.getBlockCellCount(block) === 4), true);
    assert.equal(refreshed.every(block => block.height >= 1 && block.height <= 4), true);
});

test("bricks are created with a random rotation (I appears both tall and flat)", () => {
    const { engine } = createPlayingEngine(1, 8);
    const heights = new Set();

    for (let i = 0; i < 200; i++) {
        heights.add(engine.getBlockHeight(engine.createBlock("I")));
    }

    // I rotates between vertical (height 4) and horizontal (height 1)
    assert.equal(heights.has(4), true);
    assert.equal(heights.has(1), true);
});

test("createRefreshBlock rerolls a brick to a different shape", () => {
    const { engine } = createPlayingEngine(10, 20);
    const original = engine.createBlock("O");

    for (let i = 0; i < 20; i++) {
        assert.notEqual(engine.createRefreshBlock(original).shapeId, "O");
    }
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

test("insufficient supply fails unless replenish can rescue it", () => {
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

    player.powerInventory = [{ id: "replenish", earnedLevel: 10 }];
    engine.checkFailCondition();
    assert.equal(engine.room.state, "playing");

    player.powerInventory = [];
    engine.checkFailCondition();
    assert.equal(engine.room.state, "failed");
    assert.equal(engine.room.lastLevelSummary.failureReason, "not_enough_height_remaining");

    const exhausted = createPlayingEngine(10, 20).engine;
    exhausted.room.drawPile = [];
    exhausted.room.players.forEach(p => {
        p.blocks = [];
        p.powerInventory = [];
    });
    exhausted.checkFailCondition();
    assert.equal(exhausted.room.state, "failed");
    assert.equal(exhausted.room.lastLevelSummary.failureReason, "all_blocks_used");
});

test("an empty-handed bot activates Replenish before supply failure", () => {
    const { engine, messages } = createPlayingEngine(10, 20);
    const bot = engine.room.players[1];

    engine.room.endsAt = Date.now() + 60000;
    engine.room.drawPile = [];
    engine.room.drawPileStartCount = 12;
    engine.room.players.forEach(player => {
        player.blocks = [];
        player.powerInventory = [];
    });
    bot.isBot = true;
    bot.lastPowerActivationTime = 0;
    bot.powerInventory = [{ id: "replenish", earnedLevel: 10 }];

    engine.checkFailCondition();

    assert.equal(engine.room.state, "playing");
    assert.equal(bot.powerInventory.length, 0);
    assert.ok(engine.room.players.some(player => player.blocks.length > 0));
    assert.ok(messages.flatMap(message => message.powerEvents || []).some(event => {
        return event.playerId === bot.id && event.powerId === "replenish";
    }));
});

test("replenish adds a configurable share of level-start supply", () => {
    const { engine } = createPlayingEngine(10, 20);

    engine.room.drawPile = Array.from({ length: 5 }, (_, i) => {
        return createBlock(1, `P${i}`);
    });
    engine.room.drawPileStartCount = 20;

    GameConfig.powerReplenishPileShare = 0.25;
    assert.equal(engine.getReplenishBlockCount(), 5);

    const nextDrawBefore = engine.getNextDrawBlock();
    const added = engine.generateReplenishBlocks();

    assert.equal(added, 5);
    assert.equal(engine.room.drawPile.length, 10);
    // Appended, never reshuffled: the previewed next draw must not move.
    assert.equal(engine.getNextDrawBlock().id, nextDrawBefore.id);

    GameConfig.powerReplenishPileShare = 0.5;
    assert.equal(engine.getReplenishBlockCount(), 10);

    GameConfig.powerReplenishPileShare = 0;
    assert.equal(engine.getReplenishBlockCount(), 0);
});

test("activating replenish grows the shared draw pile and reports the count", () => {
    const { engine, messages } = createPlayingEngine(10, 20);
    const caster = engine.room.players[0];

    engine.room.endsAt = Date.now() + 60000;
    engine.room.drawPile = Array.from({ length: 9 }, (_, i) => {
        return createBlock(1, `P${i}`);
    });
    engine.room.drawPileStartCount = 12;
    caster.powerInventory = [{ id: "replenish", earnedLevel: 10 }];
    caster.lastPowerActivationTime = 0;

    const heldBefore = engine.room.players
        .reduce((total, player) => total + (player.blocks || []).length, 0);
    const inCirculationBefore = engine.room.drawPile.length + heldBefore;

    assert.equal(engine.activatePower(caster.id, 0), true);

    assert.equal(caster.powerInventory.length, 0);

    const heldAfter = engine.room.players
        .reduce((total, player) => total + (player.blocks || []).length, 0);

    assert.equal(
        engine.room.drawPile.length + heldAfter,
        inCirculationBefore + 3,
        "replenish adds 25% of drawPileStartCount to the room"
    );
    assert.ok(
        heldAfter > heldBefore,
        "replenish refills every hand, so the new blocks reach players rather than sitting in the pile"
    );

    const event = messages
        .flatMap(message => message.powerEvents || [])
        .find(powerEvent => powerEvent.powerId === "replenish");

    assert.ok(event, "a replenish power event should be broadcast");
    assert.equal(event.meta.blocksAdded, 3);
});

test("the level summary carries the level's side quest", () => {
    const { engine } = createPlayingEngine(10, 20);

    engine.setupSideQuest();
    engine.room.sideQuest.claimedBy = engine.room.players[1].id;

    const summary = engine.buildLevelSummary({ result: "completed" });

    assert.equal(summary.sideQuest.type, "exact_finish");
    assert.equal(summary.sideQuest.rewardId, "replenish");
    assert.equal(summary.sideQuest.claimedBy, engine.room.players[1].id);
});

test("failed level summary does not bank level score into final totals", () => {
    const { engine } = createPlayingEngine(1, 5);

    engine.room.players[0].score = 100;
    engine.room.players[0].levelScore = 40;
    engine.room.players[0].scoreBreakdown = { height: 40 };

    engine.failLevel("time_expired");

    const playerSummary = engine.room.lastLevelSummary.players.find(player => {
        return player.id === "P1";
    });

    assert.equal(engine.room.lastLevelSummary.result, "failed");
    assert.equal(playerSummary.previousTotalScore, 100);
    assert.equal(playerSummary.finalTotalScore, 100);
    assert.equal(engine.room.players[0].score, 100);

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

test("Impact measures scored contribution with live points counted once", () => {
    const { engine } = createPlayingEngine(1, 10);
    const [first, second, third] = engine.room.players;

    GameConfig.impactInterval = 1;
    GameConfig.impactMinContributionShare = 0.25;
    GameConfig.impactScoreRequirement = 0;
    engine.room.impactContributions = { P1: 30, P2: 0, P3: 0 };
    first.impactContribution = 55;
    first.levelImpactContribution = 12;
    second.impactContribution = 300;
    third.impactContribution = 300;

    const status = engine.getImpactScoreStatus(2);
    const firstStatus = status.players.find(player => player.id === first.id);
    const expected = Math.round(
        engine.getExpectedNormalUsefulScoreForLevel(1) * 0.25
    );

    assert.equal(status.requiredContribution, expected);
    assert.equal(firstStatus.checkpointContribution, 30);
    assert.equal(firstStatus.bankedBandContribution, 25);
    assert.equal(firstStatus.liveLevelContribution, 12);
    assert.equal(firstStatus.bandContribution, 37);
    assert.equal(firstStatus.bandScore, 25);
    assert.equal(firstStatus.remainingContribution, Math.max(0, expected - 37));
});

test("Impact contribution excludes completion bonuses and cannot be carried by teammates", () => {
    const { engine } = createPlayingEngine(1, 10);
    const [first, second, third] = engine.room.players;

    GameConfig.impactScoreRequirement = 50;
    GameConfig.impactMinContributionShare = 0;
    engine.addBonusScore(first, 90, "precision");
    first.levelImpactContribution = 50;
    second.levelImpactContribution = 0;
    third.levelImpactContribution = 500;

    const status = engine.getImpactScoreStatus(2);

    assert.equal(first.levelImpactContribution, 50);
    assert.equal(first.levelScore, 90);
    assert.equal(status.players.find(player => player.id === first.id).met, true);
    assert.equal(status.players.find(player => player.id === second.id).met, false);
    assert.equal(status.players.find(player => player.id === third.id).met, true);
    assert.equal(engine.hasMetImpactScoreRequirement(2), false);
});

test("an Impact shortfall replaces the completion summary at the checkpoint", () => {
    const { engine, messages } = createPlayingEngine(2, 1);

    GameConfig.impactInterval = 2;
    GameConfig.impactMinContributionShare = 0;
    GameConfig.impactScoreRequirement = 1;
    engine.room.impactLevel = 1;
    engine.room.players[0].blocks = [createBlock(1)];

    engine.placeBlock("P1", 0);

    assert.equal(engine.room.state, "failed");
    assert.equal(engine.room.lastLevelSummary.result, "failed");
    assert.equal(engine.room.lastLevelSummary.reason, "impact_score_requirement");
    assert.equal(
        messages.some(message => message.lastLevelSummary?.result === "completed"),
        false
    );
});

test("cooperative bots use authoritative Impact contribution status", () => {
    const { engine } = createPlayingEngine(1, 10);
    const [first, second, third] = engine.room.players;

    GameConfig.impactScoreRequirement = 20;
    GameConfig.impactMinContributionShare = 0;
    first.levelImpactContribution = 20;
    second.levelImpactContribution = 19;
    third.levelImpactContribution = 20;

    assert.equal(BotManager.hasClearedShareWhileTeammateShort(first, engine), true);
    assert.equal(BotManager.hasClearedShareWhileTeammateShort(second, engine), false);

    second.levelImpactContribution = 20;

    assert.equal(BotManager.hasClearedShareWhileTeammateShort(first, engine), false);
});

test("bots keep height moves but reject structural repairs below the visible tower floor", () => {
    const { engine } = createPlayingEngine(1, 30);
    engine.room.currentHeight = 24;
    engine.room.targetHeight = 30;
    const visibleFloor = BotManager.getActiveVisibleTowerFloor(engine);

    assert.ok(visibleFloor > 0);
    assert.equal(
        BotManager.isVisibleStructuralRepair(engine, { heightGain: 0, originY: visibleFloor - 1 }),
        false
    );
    assert.equal(
        BotManager.isVisibleStructuralRepair(engine, { heightGain: 0, originY: visibleFloor }),
        true
    );
    assert.equal(
        BotManager.isVisibleStructuralRepair(engine, { heightGain: 1, originY: 0 }),
        true
    );
});

test("Timer and supply failures enter checkpoint failure while collapse does not", () => {
    for (const reason of ["all_blocks_used", "not_enough_height_remaining"]) {
        const { engine } = createPlayingEngine(1, 5);
        assert.equal(engine.failLevel(reason), true);
        assert.equal(engine.room.state, "failed");
        assert.equal(engine.room.impactFailureCount, 1);
    }

    for (const reason of ["tower_collapsed", "lost_height"]) {
        const { engine } = createPlayingEngine(1, 5);
        assert.equal(engine.failLevel(reason), false);
        assert.equal(engine.room.state, "playing");
        assert.equal(engine.room.impactFailureCount, 0);
    }

    const timer = createPlayingEngine(1, 5).engine;
    assert.equal(timer.failLevel("time_expired"), true);
    assert.equal(timer.room.state, "failed");
    assert.equal(timer.room.impactFailureCount, 1);
    assert.equal(timer.getImpactFailureStatus().retriesRemaining, 2);
    assert.ok(timer.nextLevelTimer);
    assert.equal(timer.failLevel("time_expired"), false);

    const { engine } = createPlayingEngine(1, 5);
    engine.room.state = "finished";

    assert.equal(engine.failImpactScoreRequirement(2), true);
    assert.equal(engine.room.impactFailureCount, 1);
    assert.equal(engine.failImpactScoreRequirement(2), false);
});

test("rollback preserves retries and restores checkpoint score, contribution, and power", () => {
    const { engine } = createPlayingEngine(4, 10);
    const first = engine.room.players[0];

    engine.room.impactLevel = 3;
    engine.room.impactScores = { P1: 41, P2: 0, P3: 0 };
    engine.room.impactContributions = { P1: 31, P2: 0, P3: 0 };
    engine.room.impactPowers = { P1: [{ id: "replenish", earnedLevel: 3 }], P2: [], P3: [] };
    first.score = 99;
    first.impactContribution = 88;
    first.levelScore = 20;
    first.levelImpactContribution = 19;
    first.powerInventory = [{ id: "refresh", earnedLevel: 4 }];

    assert.equal(engine.failLevel("time_expired"), true);
    assert.equal(engine.rollbackToImpact(), true);
    assert.equal(engine.room.state, "starting");
    assert.equal(engine.room.level, 3);
    assert.equal(engine.room.impactFailureCount, 1);
    assert.equal(engine.room.failureTransitionCommitted, false);
    assert.equal(first.score, 41);
    assert.equal(first.impactContribution, 31);
    assert.equal(first.levelScore, 0);
    assert.equal(first.levelImpactContribution, 0);
    assert.deepEqual(first.powerInventory, [{ id: "replenish", earnedLevel: 3 }]);
});

test("a secured checkpoint is the only path that resets retry state", () => {
    const { engine } = createPlayingEngine(1, 10);

    GameConfig.impactInterval = 1;
    GameConfig.impactMinContributionShare = 0;
    engine.room.state = "finished";
    engine.room.impactFailureCount = 3;
    engine.room.lastImpactFailureReason = "time_expired";
    engine.room.players[0].impactContribution = 17;

    engine.nextLevel();

    assert.equal(engine.room.level, 2);
    assert.equal(engine.room.impactLevel, 2);
    assert.equal(engine.room.impactFailureCount, 0);
    assert.equal(engine.room.lastImpactFailureReason, null);
    assert.equal(engine.room.impactContributions.P1, 17);

    engine.room.impactFailureCount = 2;
    engine.room.impactLevel = 1;
    engine.room.impactScores = { P1: 7, P2: 0, P3: 0 };
    engine.restartAtLevel(2, { resetScores: false });

    assert.equal(engine.room.impactFailureCount, 2);
    assert.equal(engine.room.impactLevel, 1);
    assert.equal(engine.room.impactScores.P1, 7);
});

test("the fourth failure enters Game Over, restores checkpoint totals, and closes once", async () => {
    const closeRequests = [];
    const { engine } = createPlayingEngine(4, 10, {
        onRoomCloseRequested: (roomId, reason, destination) => {
            closeRequests.push({ roomId, reason, destination });
        }
    });
    const first = engine.room.players[0];

    engine.room.impactFailureCount = 3;
    engine.room.impactScores = { P1: 12, P2: 0, P3: 0 };
    engine.room.impactContributions = { P1: 9, P2: 0, P3: 0 };
    engine.room.impactPowers = { P1: [{ id: "replenish", earnedLevel: 3 }], P2: [], P3: [] };
    first.score = 80;
    first.impactContribution = 60;
    first.levelScore = 30;
    first.levelImpactContribution = 25;
    first.powerInventory = [{ id: "refresh", earnedLevel: 4 }];

    assert.equal(engine.failLevel("time_expired"), true);
    assert.equal(engine.room.state, "game_over");
    assert.equal(engine.room.impactFailureCount, 4);
    assert.equal(engine.room.lastLevelSummary.result, "game_over");
    assert.equal(engine.room.lastLevelSummary.failureReason, "time_expired");
    assert.equal(engine.rollbackToImpact(), false);
    assert.equal(first.score, 12);
    assert.equal(first.impactContribution, 9);
    assert.equal(first.levelScore, 0);
    assert.equal(first.levelImpactContribution, 0);
    assert.deepEqual(first.powerInventory, [{ id: "replenish", earnedLevel: 3 }]);

    engine.clearTimers();
    engine.scheduleTerminalRoomClose(0);
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(closeRequests, [{
        roomId: "TEST",
        reason: "failure_limit_reached",
        destination: "home"
    }]);
    assert.equal(engine.requestRoomClose("failure_limit_reached", "home"), false);
});

test("hydrated Game Over restores only its terminal close timer", () => {
    const { engine } = createPlayingEngine(2, 10);

    engine.room.state = "game_over";
    engine.room.impactFailureCount = 4;
    engine.room.terminalCloseAt = Date.now() + 10000;
    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: engine.room.players,
        state: engine.room
    });
    const resumed = new GameEngine({ onRoomCloseRequested: () => {} });

    resumed.hydrateRoom(snapshot, snapshot.players.map(player => ({ ...player })));

    assert.equal(resumed.startTimer, null);
    assert.equal(resumed.levelTimer, null);
    assert.ok(resumed.nextLevelTimer);
    resumed.clearTimers();
});
