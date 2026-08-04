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
    useFixedGrid();
    const { engine, messages } = createPlayingEngine(1, 5);
    const originalDifficulty = GameConfig.towerStabilityDifficulty;

    engine.room.players[0].blocks = [createBlock(2)];
    engine.room.players[1].blocks = [createBlock(3, "B2")];

    try {
        // A lone narrow block trips the tilt/support-deficit warning under the
        // live tuned stability curve; zero difficulty isolates this test to
        // just the scoring event it's actually asserting on.
        GameConfig.towerStabilityDifficulty = 0;
        engine.placeBlock("P1", 0);
    } finally {
        GameConfig.towerStabilityDifficulty = originalDifficulty;
    }

    const message = messageWithScoreEvents(messages);
    assert.deepEqual(eventTypes(message), ["placement"]);
    assert.equal(message.placementScorePopupDurationMs, 2500);
    assert.equal(message.finishScorePopupDurationMs, 3500);
    assert.equal(message.scorePopupDurationMs, 3500);
    assert.equal(message.scoreEvents[0].playerId, "P1");
    assert.equal(message.scoreEvents[0].points, 20);
    assert.equal(message.players[0].levelScore, 20);

});

test("a Z block placed at a lane origin settles with an unsupported overhang", () => {
    const block = { cells: [[0, 0], [1, 0], [1, 1], [2, 1]] };
    const first = { block: createBlock(1), originX: 3, originY: 0 };
    const settled = TowerStability.settleBlock([first], block, 2);
    const result = TowerStability.evaluate(
        [first, { block, ...settled }], fixedStabilityConfig({ towerStabilityMinHeight: 1 })
    );
    assert.equal(settled.originX, 2);
    assert.equal(settled.originY, 1);
    assert.ok(result.stability < 100);
});

test("resolveColumnOriginX clamps the requested column to the block's valid placeable range", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 8);
    const tBlock = { shapeId: "T", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] };
    const verticalIBlock = { shapeId: "I", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] };

    // T is 3 cells wide -> valid origins are columns 4..7 on the 4-9 placeable range
    assert.equal(engine.resolveColumnOriginX(tBlock, 4), 4);
    assert.equal(engine.resolveColumnOriginX(tBlock, 7), 7);
    assert.equal(engine.resolveColumnOriginX(tBlock, 2), 4);
    assert.equal(engine.resolveColumnOriginX(tBlock, 9), 7);

    // vertical I is 1 cell wide -> valid origins span the full 4..9 range
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 4), 4);
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 9), 9);
    assert.equal(engine.resolveColumnOriginX(verticalIBlock, 12), 9);
});

test("getPlaceableOriginRange narrows as block width grows, keeping the full footprint within columns 4-9", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 8);
    const oBlock = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
    const horizontalIBlock = { shapeId: "I", cells: [[0, 0], [1, 0], [2, 0], [3, 0]] };

    // O is 2 wide -> rightmost valid origin is 8 (occupies columns 8,9)
    assert.deepEqual(engine.getPlaceableOriginRange(oBlock), { min: 4, max: 8 });
    // horizontal I is 4 wide -> rightmost valid origin is 6 (occupies columns 6-9)
    assert.deepEqual(engine.getPlaceableOriginRange(horizontalIBlock), { min: 4, max: 6 });
});

test("site width scales with target height, staying centered on the 14-column grid", () => {
    useFixedGrid({ widthMin: 6, widthMax: 12 });
    const { engine } = createPlayingEngine(1, 8);

    // A short target keeps the minimum 6-wide site; taller targets widen it so a
    // tall tower gets a proportionally broader base to stand on.
    assert.equal(engine.getSiteWidthForHeight(8), 6);
    assert.deepEqual(engine.getPlaceableColumnRange(), { min: 4, max: 9 });

    assert.ok(engine.getSiteWidthForHeight(30) > engine.getSiteWidthForHeight(8));
    assert.equal(engine.getSiteWidthForHeight(1000), GameConfig.towerSiteWidthMax);

    // every derived site stays centered, so the tower still renders mid-screen
    [4, 8, 20, 30, 60].forEach(targetHeight => {
        engine.room.targetHeight = targetHeight;
        const range = engine.getPlaceableColumnRange();

        assert.equal(
            range.min + range.max,
            GameConfig.towerGridWidth - 1,
            `site for target ${targetHeight} is off-center`
        );
    });
});

test("placeable origin range follows the level's site, not a fixed 4-9 span", () => {
    useFixedGrid({ widthMin: 6, widthMax: 12 });
    const { engine } = createPlayingEngine(1, 8);
    const oBlock = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };

    const narrow = engine.getPlaceableOriginRange(oBlock);

    engine.room.targetHeight = 40;
    const wide = engine.getPlaceableOriginRange(oBlock);

    assert.ok(wide.min < narrow.min);
    assert.ok(wide.max > narrow.max);
    assert.equal(engine.resolveColumnOriginX(oBlock, wide.min - 1), wide.min);
    assert.equal(engine.resolveColumnOriginX(oBlock, wide.max + 1), wide.max);
});

test("a slender spire collapses on integrity even when perfectly symmetrical", () => {
    const entries = [];
    const oBlock = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
    // A 2-wide stack on a 6-wide site: site usage 3.0, past the pinned Max of 2.5.
    // The maturity floor sits above the short tower's height so the ramp is still
    // protecting it there, which is what makes the short-vs-tall contrast the point.
    const config = fixedStabilityConfig({
        towerSiteWidth: 6,
        towerStabilityMinHeight: 20
    });

    for (let i = 0; i < 3; i++) {
        const placement = TowerStability.settleBlock(entries, oBlock, 6);
        entries.push({ block: oBlock, ...placement });
    }

    const short = TowerStability.evaluate(entries, config);

    assert.equal(short.diagnostics.tiltScore, 0);
    assert.equal(short.diagnostics.collapsed, false);

    for (let i = 0; i < 12; i++) {
        const placement = TowerStability.settleBlock(entries, oBlock, 6);
        entries.push({ block: oBlock, ...placement });
    }

    const tall = TowerStability.evaluate(entries, config);

    // zero lean the whole way up -- only the slenderness term can fail this
    assert.equal(tall.diagnostics.tiltScore, 0);
    assert.equal(tall.diagnostics.integrity, 0);
    assert.equal(tall.diagnostics.collapsed, true);
    assert.equal(tall.stability, 0);
});

test("the same tower is less stable at a high level than at level 1", () => {
    const entries = [];
    const oBlock = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
    const { engine } = createPlayingEngine(1, 10);

    for (let i = 0; i < 6; i++) {
        const placement = TowerStability.settleBlock(entries, oBlock, 3);
        entries.push({ block: oBlock, ...placement });
    }

    const early = TowerStability.evaluate(entries, engine.resolveStabilityConfig(1));
    const late = TowerStability.evaluate(entries, engine.resolveStabilityConfig(40));

    assert.ok(
        late.stability < early.stability,
        `expected level 40 to be harsher than level 1, got ${late.stability} vs ${early.stability}`
    );
});

test("stability difficulty 0 leaves the same tower unpenalised", () => {
    const entries = [];
    const oBlock = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
    const { engine } = createPlayingEngine(1, 10);
    const original = GameConfig.towerStabilityDifficulty;

    for (let i = 0; i < 6; i++) {
        const placement = TowerStability.settleBlock(entries, oBlock, 3);
        entries.push({ block: oBlock, ...placement });
    }

    try {
        GameConfig.towerStabilityDifficulty = 0;
        const off = TowerStability.evaluate(entries, engine.resolveStabilityConfig(40));

        GameConfig.towerStabilityDifficulty = 100;
        const on = TowerStability.evaluate(entries, engine.resolveStabilityConfig(40));

        assert.ok(off.stability > on.stability);
        assert.equal(off.diagnostics.collapsed, false);
    } finally {
        GameConfig.towerStabilityDifficulty = original;
    }
});

test("placement score scales with the stability the placer inherited", () => {
    const { engine } = createPlayingEngine(1, 10);

    GameConfig.scoring.placementStabilityFloor = 0.5;

    const full = engine.getPlacementStabilityMultiplier(100);
    const half = engine.getPlacementStabilityMultiplier(50);
    const none = engine.getPlacementStabilityMultiplier(0);

    assert.equal(full, 1);
    assert.equal(half, 0.75);
    assert.equal(none, 0.5);

    engine.room.players[0].blocks = [createBlock(2)];
    engine.room.towerStability = 0;
    engine.placeBlock("P1", 0);

    // 2 height x level 1 x 10 per height x 0.5 floor multiplier
    assert.equal(engine.room.players[0].levelScore, 10);
});

test("reinforce pays for widening a slender tower's base", () => {
    const { engine } = createPlayingEngine(1, 40);
    const before = { integrity: 40, tiltScore: 0.8 };
    const player = engine.room.players[0];

    GameConfig.scoring.reinforceScorePerIntegrity = 1;
    GameConfig.scoring.reinforceScorePerLean = 20;

    const gained = engine.addReinforceScore(
        player, before, { integrity: 60, tiltScore: 0.3 }
    );

    // +20 integrity x 1 and +0.5 lean correction x 20 is 30 raw, held to the
    // repair ceiling: one average brick's height claim at this level.
    const cap = Math.round(
        engine.getAverageBrickHeight() * GameConfig.scoring.placementScorePerHeight
    );

    assert.equal(gained, cap);
    assert.equal(player.scoreBreakdown.reinforce, cap);

    // a placement that makes the tower worse pays nothing
    assert.equal(
        engine.addReinforceScore(player, before, { integrity: 10, tiltScore: 1.5 }),
        0
    );
});

test("an empty tower's first placement earns no phantom reinforce", () => {
    const { engine } = createPlayingEngine(1, 10);

    engine.room.players[0].blocks = [createBlock(2)];
    engine.placeBlock("P1", 0);

    assert.equal(
        Number(engine.room.players[0].scoreBreakdown.reinforce || 0),
        0
    );
});

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

    assert.equal(engine.activatePower(caster.id, 0), true);

    assert.equal(caster.powerInventory.length, 0);
    assert.equal(engine.room.drawPile.length, 15);

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

test("stability difficulty is the only exposed stability tunable", async () => {
    const lobbyManager = new LobbyManager();
    const original = GameConfig.towerStabilityDifficulty;

    try {
        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", 250);
        assert.equal(GameConfig.towerStabilityDifficulty, 100);

        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", -40);
        assert.equal(GameConfig.towerStabilityDifficulty, 0);

        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", 65);
        assert.equal(lobbyManager.getDebugConfig().towerStabilityDifficulty, 65);

        // The raw physics constants are derived now, so a stale client sending
        // them must be rejected rather than silently desyncing from the dial.
        for (const key of [
            "towerOverhangWeight",
            "towerCollapseTiltScore",
            "towerSlendernessSafe",
            "towerSlendernessMax",
            "towerSupportDeficitMax",
            "towerStabilityMinHeight"
        ]) {
            assert.equal(await lobbyManager.updateDebugConfig(key, 1), false, key);
            assert.equal(GameConfig[key], undefined, key);
        }
    } finally {
        GameConfig.towerStabilityDifficulty = original;
    }
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

test("the brick mood threshold is exposed and clamped in debug config", async () => {
    const lobbyManager = new LobbyManager();

    await lobbyManager.updateDebugConfig("towerStabilityMoodThreshold", 900);
    assert.equal(GameConfig.towerStabilityMoodThreshold, 50);

    // Floored at 1, not 0: a 0 threshold would classify every placement as both
    // a rise and a fall, so no brick could ever wear the neutral face.
    await lobbyManager.updateDebugConfig("towerStabilityMoodThreshold", 0);
    assert.equal(GameConfig.towerStabilityMoodThreshold, 1);

    await lobbyManager.updateDebugConfig("towerStabilityMoodThreshold", 8);
    assert.equal(lobbyManager.getDebugConfig().towerStabilityMoodThreshold, 8);
});

// The bug this pins: a perfectly centred brick used to read as a loss, and the
// loss grew with height and level, because the stability score is
// min(lean, integrity) and sags on its own as the tower matures.
test("a centred placement scores a zero balance delta at every height", () => {
    const config = fixedStabilityConfig();
    const centred = [];
    let previous = TowerStability.evaluate(centred, config);

    for (let i = 0; i < 6; i++) {
        const block = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
        const settled = TowerStability.settleBlock(centred, block, 2);
        centred.push({ playerId: "P1", block, ...settled });

        const current = TowerStability.evaluate(centred, config);

        assert.equal(
            TowerStability.balanceDelta(
                previous.diagnostics, current.diagnostics, config
            ),
            0,
            `centred brick ${i + 1} should not move the balance`
        );

        previous = current;
    }

    // The old signal is what a designer would otherwise have been reading: it
    // drifts down even though nothing about the tower's balance changed.
    assert.ok(
        previous.stability < 100,
        "the stability score itself does sag on a flawless centred stack"
    );
});

test("straightening a lean scores positive and worsening it scores negative", () => {
    const config = fixedStabilityConfig();
    const stack = (spec) => {
        const entries = [];
        for (const column of spec) {
            const block = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
            entries.push({
                playerId: "P1",
                block,
                ...TowerStability.settleBlock(entries, block, column)
            });
        }
        return entries;
    };
    const deltaFor = (entries, column) => {
        const before = TowerStability.evaluate(entries, config);
        const block = { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
        const settled = TowerStability.settleBlock(entries, block, column);
        const after = TowerStability.evaluate(
            [...entries, { playerId: "P1", block, ...settled }], config
        );
        return TowerStability.balanceDelta(
            before.diagnostics, after.diagnostics, config
        );
    };

    // Wide base spanning columns 2-5, then two bricks stacked out to the right.
    const leaningRight = stack([2, 4, 4, 4]);

    assert.ok(
        deltaFor(leaningRight, 2) > 0,
        "a brick on the light side should score positive"
    );
    assert.ok(
        deltaFor(leaningRight, 4) < 0,
        "a brick on the heavy side should score negative"
    );

    // Mirrored, so the sign follows the correction and not a fixed direction.
    const leaningLeft = stack([2, 4, 2, 2]);

    assert.ok(
        deltaFor(leaningLeft, 4) > 0,
        "correcting a left lean should also score positive"
    );
    assert.ok(
        deltaFor(leaningLeft, 2) < 0,
        "worsening a left lean should also score negative"
    );
});

test("balance delta clamps and tolerates missing diagnostics", () => {
    const config = fixedStabilityConfig({ towerCollapseTiltScore: 0.01 });

    assert.equal(TowerStability.balanceDelta({}, {}, config), 0);
    assert.equal(TowerStability.balanceDelta({}, {}, {}), 0);
    assert.equal(
        TowerStability.balanceDelta({ comOffset: 5 }, { comOffset: 0 }, config),
        100,
        "an enormous correction should clamp at +100"
    );
    assert.equal(
        TowerStability.balanceDelta({ comOffset: 0 }, { comOffset: 5 }, config),
        -100,
        "an enormous worsening should clamp at -100"
    );
});

test("a placed brick carries the balance delta it caused", () => {
    useFixedGrid();
    const { engine, messages } = createPlayingEngine(1, 8);

    engine.room.players[0].blocks = [createBlock(2)];
    engine.room.players[1].blocks = [createBlock(2, "B2")];
    // Enough height left in hand that the two placements below neither finish
    // the level nor trip the not-enough-height fail check.
    engine.room.players[2].blocks = [createBlock(4, "B3")];

    engine.placeBlock("P1", 0);
    engine.placeBlock("P2", 0);

    for (const entry of engine.room.towerBlocks) {
        assert.equal(
            typeof entry.balanceDelta, "number", "every placed brick is stamped"
        );
    }

    // The client classifies the face from this delta on every frame, so it must
    // ride every rebroadcast -- not just the one right after the placement.
    const broadcast = latestMessage(messages);
    assert.equal(
        broadcast.towerBlocks[0].balanceDelta,
        engine.room.towerBlocks[0].balanceDelta
    );
    assert.equal(
        broadcast.towerBlocks[1].balanceDelta,
        engine.room.towerBlocks[1].balanceDelta
    );
});

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

test("an aimed placement lands in the gap instead of falling to the top", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 12);

    buildTowerWithVoid(engine);
    engine.placeBlock("P1", 0, 5, 0);

    const fill = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(fill.originX, 5);
    assert.equal(fill.originY, 0, "the brick stays in the void it was aimed at");
    assert.equal(fill.baseHeight, 0, "the settle mirror the client draws from agrees");
});

test("an origin that is no longer legal falls back to the gravity settle", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 12);

    buildTowerWithVoid(engine);
    // Column 4 row 0 is occupied -- the race where a teammate filled the target
    // gap first. The brick must still be placed, just settled.
    engine.placeBlock("P2", 0, 4, 0);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originX, 4);
    assert.equal(placed.originY, 2, "it lands on top of the lid rather than inside a brick");
});

test("a placement with no aimed row still settles from above", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 12);

    buildTowerWithVoid(engine);
    // What a bot sends: a column and nothing else.
    engine.placeBlock("P3", 0, 5);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originY, 2, "gravity still stops it on the lid, above the void");
});

test("reinforce pays for the cells a gap fill puts back on solid ground", () => {
    useFixedGrid();
    const { engine, messages } = createPlayingEngine(1, 12);

    GameConfig.scoring.reinforceScorePerSupportedCell = 5;
    GameConfig.scoring.reinforceScorePerIntegrity = 0;
    GameConfig.scoring.reinforceScorePerLean = 0;

    buildTowerWithVoid(engine);
    engine.placeBlock("P1", 0, 5, 0);

    const reinforce = latestMessage(messages).scoreEvents.find(
        event => event.type === "reinforce"
    );

    assert.ok(reinforce, "filling a void is a repair and must emit a reinforce event");
    assert.equal(
        reinforce.meta.supportedCells, 1, "the lid cell above the void is now supported"
    );
    // 1 cell x 5 per cell x level 1, with the other two terms zeroed out
    assert.equal(reinforce.points, 5);
});

test("stacking on top of the tower supports nothing and pays no repair", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 12);

    buildTowerWithVoid(engine);

    assert.equal(
        TowerStability.supportedCellsGained(
            engine.room.towerBlocks, createBlock(1, "TOP"), 5, 2
        ),
        0
    );
});

test("placement legality only judges the release row, not its support", () => {
    const tower = [
        { block: createFlatBlock(2, "A"), originX: 4, originY: 0 }
    ];
    const brick = createBlock(1, "B");

    assert.equal(TowerStability.isPlacementLegal(tower, brick, 6, 0), true);
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, 1), true);
    assert.equal(
        TowerStability.isPlacementLegal(tower, brick, 9, 4), true,
        "releasing into open air is legal -- gravity decides where it ends up"
    );
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, 0), false);
    assert.equal(TowerStability.isPlacementLegal(tower, brick, 4, -1), false);
});

test("a brick released with nothing under it falls", () => {
    useFixedGrid();
    const { engine } = createPlayingEngine(1, 12);

    buildTowerWithVoid(engine);
    // Column 7 is empty ground; aiming four rows up in mid-air is legal, and the
    // brick drops out of the sky rather than hanging there.
    engine.placeBlock("P1", 0, 7, 4);

    const placed = engine.room.towerBlocks[engine.room.towerBlocks.length - 1];

    assert.equal(placed.originX, 7);
    assert.equal(placed.originY, 0, "nothing holds it up, so it lands on the platform");
});

test("a repair can never out-earn an average height claim", () => {
    const { engine } = createPlayingEngine(3, 40);
    const player = engine.room.players[0];

    GameConfig.scoring.reinforceScoreCapShare = 1;

    const cap = Math.round(
        engine.getAverageBrickHeight()
            * GameConfig.scoring.placementScorePerHeight
            * engine.room.level
    );
    const huge = engine.addReinforceScore(
        player, { integrity: 0, tiltScore: 1.5 }, { integrity: 100, tiltScore: 0 }
    );

    assert.equal(huge, cap, "the ceiling scales with the level exactly as a claim does");

    // Under the ceiling the terms still pay their raw sum, so ordinary repairs
    // stay proportional to how much they actually fixed.
    GameConfig.scoring.reinforceScorePerIntegrity = 2;
    GameConfig.scoring.reinforceScorePerLean = 0;

    const small = engine.addReinforceScore(
        player, { integrity: 90, tiltScore: 0 }, { integrity: 93, tiltScore: 0 }
    );

    assert.equal(small, 18, "+3 integrity x 2 per point x level 3");
    assert.ok(small < cap);
});

test("game state carries the room's accessibility options", () => {
    const { engine, messages } = createPlayingEngine(1, 8);

    engine.broadcastGameState();

    const state = latestMessage(messages);

    assert.equal(typeof state.accessibility, "object");
    assert.equal(
        state.accessibility.parallelPlacement,
        GameConfig.accessibility.parallelPlacement
    );
});
