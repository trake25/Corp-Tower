const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");
const { stripRuntimeRoom } = require("../app/Redis_State");

const {
    GameConfig,
    createBlock,
    createPlayingEngine,
    eventTypes,
    latestMessage,
    messageWithScoreEvents,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

test("createBlock no longer assigns an anchorX field", () => {
    const { engine } = createPlayingEngine(1, 8);
    const block = engine.createBlock("O");

    assert.equal(Object.prototype.hasOwnProperty.call(block, "anchorX"), false);
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
            "heightPoints", "heightQuality", "structuralPoints", "structuralValue"
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
    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: engine.room.players,
        state: engine.room
    });

    assert.equal(snapshot.players[0].levelImpactContribution, transaction.points);
    assert.equal(snapshot.players[0].impactContribution, transaction.points);
    assert.equal(snapshot.state.criticalSaveClaimKeys["support:C"], true);
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

test("a held replenish power item defers the not-enough-height fail", () => {
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
});

test("replenish adds a share of the level's starting draw pile", () => {
    const { engine } = createPlayingEngine(10, 20);

    engine.room.drawPile = Array.from({ length: 20 }, (_, i) => {
        return createBlock(1, `P${i}`);
    });
    engine.room.drawPileStartCount = 20;

    GameConfig.powerReplenishPileShare = 0.25;
    assert.equal(engine.getReplenishBlockCount(), 5);

    const nextDrawBefore = engine.getNextDrawBlock();
    const added = engine.generateReplenishBlocks();

    assert.equal(added, 5);
    assert.equal(engine.room.drawPile.length, 25);
    // Appended, never reshuffled: the previewed next draw must not move.
    assert.equal(engine.getNextDrawBlock().id, nextDrawBefore.id);

    GameConfig.powerReplenishPileShare = 0.5;
    assert.equal(engine.getReplenishBlockCount(), 10);

    GameConfig.powerReplenishPileShare = 0;
    assert.equal(engine.getReplenishBlockCount(), 1);

    GameConfig.powerReplenishPileShare = 0.25;
});

test("activating replenish grows the shared draw pile and reports the count", () => {
    const { engine, messages } = createPlayingEngine(10, 20);
    const caster = engine.room.players[0];

    engine.room.endsAt = Date.now() + 60000;
    engine.room.drawPile = Array.from({ length: 12 }, (_, i) => {
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
