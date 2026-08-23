const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const TowerStability = require("../app/Tower_Stability");
const { stripRuntimeRoom } = require("../app/Redis_State");
const {
    GameConfig,
    createBlock,
    createPlayingEngine,
    fixedStabilityConfig,
    latestMessage,
    originalGameConfig,
    resetFixtures,
    useFixedGrid
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

function stabilityEntry(id, cells, originX, originY) {
    return { block: { id, cells }, originX, originY };
}

test("a centered narrow spire loses Integrity without inventing a direction", () => {
    const entries = [];
    const oBlock = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]] };
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

    assert.equal(tall.diagnostics.tiltScore, 0);
    assert.equal(tall.diagnostics.balance, 100);
    assert.equal(tall.diagnostics.leanDirection, "center");
    assert.ok(tall.diagnostics.integrity < short.diagnostics.integrity);
});

test("the same tower is less stable at a high level than at level 1", () => {
    const entries = [];
    // A moderately wide (not razor-thin) 4-cell column: narrow enough that harsh
    // pressure saturates its slenderness penalty, wide enough that low pressure
    // still leaves room to grade it -- so the comparison proves the level ramp
    // itself, not just "this tower is already maximally bad at any level."
    const rowBlock = { cells: [[0, 0], [1, 0], [2, 0], [3, 0]] };
    const { engine } = createPlayingEngine(1, 60);

    for (let y = 0; y < 10; y++) {
        entries.push({ block: rowBlock, originX: 2, originY: y });
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

test("a narrow spire on a wide base is no longer free -- slenderness reads mean row width, not the ground row", () => {
    const config = fixedStabilityConfig({ towerSiteWidth: 6, towerStabilityMinHeight: 1 });
    const entries = [];
    const wideRow = { cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] };
    const narrowRow = { cells: [[0, 0], [1, 0]] };

    // A full-width floor, then a narrow spire the rest of the way up. The old
    // ground-row-only measure read siteWidth/groundWidth = 6/6 = 1.0 here --
    // perfectly safe forever, which is the exploit this fix closes.
    entries.push({ block: wideRow, originX: 0, originY: 0 });
    for (let y = 1; y < 10; y++) {
        entries.push({ block: narrowRow, originX: 2, originY: y });
    }

    const result = TowerStability.evaluate(entries, config);

    assert.ok(
        result.diagnostics.slenderness >= 2.0,
        `expected the spire above a wide floor to read slender, got ${result.diagnostics.slenderness}`
    );
    assert.ok(result.diagnostics.integrity <= 50);
});

test("a wide crown on redundant supports is safer than the same crown on one support", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const crown = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const weak = [
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("C", crown, 1, 1)
    ];
    const redundant = [
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("R", cell, 3, 0),
        stabilityEntry("C", crown, 1, 1)
    ];
    const weakResult = TowerStability.evaluate(weak, config);
    const redundantResult = TowerStability.evaluate(redundant, config);
    const crownAnalysis = redundantResult.analysis.groups.find(group => group.key.includes("1:1"));

    assert.ok(redundantResult.stability > weakResult.stability);
    assert.equal(crownAnalysis.pathConcentration, 0.5);
    assert.equal(redundantResult.diagnostics.balance, 100);
    assert.equal(redundantResult.diagnostics.leanDirection, "center");
});

test("a gap fill repairs its matched support interface without accumulated damage", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const crown = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const before = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("C", crown, 1, 1)
    ], config);
    const repaired = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("R", cell, 3, 0),
        stabilityEntry("C", crown, 1, 1)
    ], config);

    assert.ok(repaired.diagnostics.integrity > before.diagnostics.integrity);
    assert.ok(repaired.diagnostics.criticalRisk < before.diagnostics.criticalRisk);
});

test("disconnected stacks are evaluated independently and unsupported stacks collapse", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const disconnected = TowerStability.evaluate([
        stabilityEntry("A", cell, 0, 0),
        stabilityEntry("B", cell, 5, 0)
    ], config);
    const hanging = TowerStability.evaluate([
        stabilityEntry("H", cell, 2, 3)
    ], config);

    assert.equal(disconnected.analysis.groups.length, 2);
    assert.ok(disconnected.analysis.groups.every(group => group.carriedLoadShare === 1));
    assert.equal(hanging.diagnostics.collapsed, true);
    assert.equal(hanging.stability, 0);
});

test("geometry, diagnostics, and structural pose are independent of entry ordering", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const crown = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const entries = [
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("R", cell, 3, 0),
        stabilityEntry("C", crown, 1, 1)
    ];
    const first = TowerStability.evaluate(entries, config);
    const second = TowerStability.evaluate(entries.slice().reverse(), config);
    const sortPose = pose => pose.slice().sort((left, right) => left.blockId.localeCompare(right.blockId));

    assert.deepEqual(first.diagnostics, second.diagnostics);
    assert.deepEqual(sortPose(first.structuralPose), sortPose(second.structuralPose));
});

test("structural evaluation scales to a representative tall snapshot", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const entries = [];
    const row = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];

    for (let y = 0; y < 99; y++) {
        entries.push(stabilityEntry(`B${y}`, row, 0, y));
    }

    const startedAt = process.hrtime.bigint();
    const result = TowerStability.evaluate(entries, config);
    const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1000000;

    assert.equal(result.structuralPose.length, entries.length);
    assert.ok(elapsedMs < 500, `expected a linear tall-snapshot evaluation, got ${elapsedMs.toFixed(2)}ms`);
});

test("height pressure grades an identical tower harder as it nears target, without disturbing balance delta", () => {
    const baseConfig = {
        towerSiteWidth: 6,
        towerBaseHalfWidthFloor: 1.0,
        towerMaxTiltAngleDeg: 24,
        towerOverhangWeight: 0.18,
        towerLaneImbalanceWeight: 0.15,
        towerCollapseTiltScore: 1.0,
        towerSlendernessSafe: 1.2,
        towerSlendernessMax: 2.5,
        towerSupportDeficitMax: 0.35,
        towerStabilityMinHeight: 1,
        towerHeightPressureGain: 1.0
    };
    const rowBlock = { cells: [[0, 0], [1, 0], [2, 0]] };
    const entries = [];

    for (let y = 0; y < 8; y++) {
        entries.push({ block: rowBlock, originX: 1, originY: y });
    }

    const nearTarget = TowerStability.evaluate(entries, { ...baseConfig, towerTargetHeight: 8 });
    const farFromTarget = TowerStability.evaluate(entries, { ...baseConfig, towerTargetHeight: 800 });

    assert.equal(nearTarget.diagnostics.tiltScore, 0, "a centred straight column has no lean either way");
    assert.equal(farFromTarget.diagnostics.tiltScore, 0);
    assert.ok(
        nearTarget.stability < farFromTarget.stability,
        `expected a tower at its own target height (${nearTarget.stability}) to grade strictly harsher ` +
            `than the same tower far from target (${farFromTarget.stability})`
    );
    assert.equal(nearTarget.diagnostics.heightProgress, 1);
    assert.ok(farFromTarget.diagnostics.heightProgress < 0.02);

    // The lean-only signal must stay free of height drift regardless -- this is
    // the invariant "a centred placement scores a zero balance delta at every
    // height" depends on, checked here specifically against the new
    // height-pressure axis rather than just the pre-existing maturity ramp.
    const before = entries.slice(0, -1);
    const beforeNear = TowerStability.evaluate(before, { ...baseConfig, towerTargetHeight: 8 });
    const beforeFar = TowerStability.evaluate(before, { ...baseConfig, towerTargetHeight: 800 });
    const deltaNear = TowerStability.balanceDelta(beforeNear.diagnostics, nearTarget.diagnostics, baseConfig);
    const deltaFar = TowerStability.balanceDelta(beforeFar.diagnostics, farFromTarget.diagnostics, baseConfig);

    assert.equal(deltaNear, 0, "a centred brick still scores zero balance delta near target height");
    assert.equal(deltaFar, 0, "and the same brick still scores zero balance delta far from target height");
});

test("placement stability multiplier's floor descends toward target height", () => {
    const { engine } = createPlayingEngine(1, 100);

    GameConfig.scoring.placementStabilityFloor = 0.5;
    GameConfig.scoring.placementStabilityFloorAtTarget = 0.1;

    const atGround = engine.getPlacementStabilityMultiplier(0, 0);
    const atTarget = engine.getPlacementStabilityMultiplier(0, 100);
    const midway = engine.getPlacementStabilityMultiplier(0, 50);

    assert.equal(atGround, 0.5, "floor at height 0 is placementStabilityFloor");
    assert.ok(
        Math.abs(atTarget - 0.1) < 1e-9,
        "floor at target height is placementStabilityFloorAtTarget"
    );
    assert.ok(midway < atGround && midway > atTarget, "the floor lerps between the two");

    // The single-argument form defaults heightBefore to the tower's current
    // height, so a caller that only cares about the ground-floor rate can still
    // call this with one argument -- room.currentHeight is 0 in a fresh engine.
    assert.equal(engine.getPlacementStabilityMultiplier(0), atGround);
});

test("reinforce score cap's share rises toward target height", () => {
    const { engine } = createPlayingEngine(5, 100);

    GameConfig.scoring.reinforceScoreCapShare = 1;
    GameConfig.scoring.reinforceScoreCapShareAtTarget = 2;

    const atGround = engine.getReinforceScoreCap(0);
    const atTarget = engine.getReinforceScoreCap(100);
    const expectedAtGround = Math.round(
        1 * engine.getAverageBrickHeight()
            * GameConfig.scoring.placementScorePerHeight * engine.room.level
    );
    const expectedAtTarget = Math.round(
        2 * engine.getAverageBrickHeight()
            * GameConfig.scoring.placementScorePerHeight * engine.room.level
    );

    assert.equal(atGround, expectedAtGround);
    assert.equal(atTarget, expectedAtTarget);
    assert.ok(atTarget > atGround, "the cap should rise as the tower nears its target");

    // heightAfter defaults to room.currentHeight, which is 0 in a fresh engine.
    assert.equal(engine.getReinforceScoreCap(), atGround);
});

test("round-clock slack lerps down from levelTimeSlack to levelTimeSlackMin across levelTimeSlackFullLevel", () => {
    const { engine } = createPlayingEngine(1, 10);
    const original = {
        levelTimeLimitMs: GameConfig.levelTimeLimitMs,
        levelTimeSlack: GameConfig.levelTimeSlack,
        levelTimeSlackMin: GameConfig.levelTimeSlackMin,
        levelTimeSlackFullLevel: GameConfig.levelTimeSlackFullLevel
    };

    try {
        GameConfig.levelTimeLimitMs = 60000;
        GameConfig.levelTimeSlack = 3.0;
        GameConfig.levelTimeSlackMin = 1.5;
        GameConfig.levelTimeSlackFullLevel = 25;
        // createPlayingEngine zeroes placementCooldown so placements in other
        // tests don't have to wait out a real cooldown -- restored by the
        // shared afterEach, but this test needs a realistic value or the
        // derived clock collapses to near-zero regardless of level.
        GameConfig.placementCooldown = 1000;

        // Large enough that the floor never binds at any tested level, so what's
        // left to vary is purely the slack ramp.
        const fixedHeight = 1000;
        const atLevel1 = engine.getLevelTimeLimitMs(fixedHeight, 1);
        const atLevel13 = engine.getLevelTimeLimitMs(fixedHeight, 13);
        const atLevel25 = engine.getLevelTimeLimitMs(fixedHeight, 25);
        const atLevel40 = engine.getLevelTimeLimitMs(fixedHeight, 40);

        assert.ok(
            atLevel1 > atLevel13,
            `expected level 1 (${atLevel1}) to allow more time than level 13 (${atLevel13})`
        );
        assert.ok(
            atLevel13 > atLevel25,
            `expected level 13 (${atLevel13}) to allow more time than level 25 (${atLevel25})`
        );
        assert.equal(atLevel25, atLevel40, "slack stays flat once levelTimeSlackFullLevel is reached");
    } finally {
        GameConfig.levelTimeLimitMs = original.levelTimeLimitMs;
        GameConfig.levelTimeSlack = original.levelTimeSlack;
        GameConfig.levelTimeSlackMin = original.levelTimeSlackMin;
        GameConfig.levelTimeSlackFullLevel = original.levelTimeSlackFullLevel;
    }
});

test("the round-clock floor binds at low levels and releases once the derived clock outgrows it", () => {
    const { engine } = createPlayingEngine(1, 10);

    // createPlayingEngine zeroes placementCooldown for other tests' convenience;
    // restored by the shared afterEach.
    GameConfig.placementCooldown = originalGameConfig.placementCooldown || 1000;

    assert.equal(
        engine.getLevelTimeLimitMs(engine.getTargetHeightForLevel(1), 1),
        GameConfig.levelTimeLimitMs,
        "level 1's small target should still be floored"
    );
    assert.ok(
        engine.getLevelTimeLimitMs(engine.getTargetHeightForLevel(20), 20) > GameConfig.levelTimeLimitMs,
        "by level 20 the derived clock should have grown past the floor"
    );
});

test("supply coverage runs a surplus at level 1 and flattens by levelSupplyCoverageFullLevel", () => {
    const { engine } = createPlayingEngine(1, 100);

    engine.room.teamCarryOverBlocks = [];

    engine.room.level = 1;
    const l1Count = engine.getGeneratedDrawPileBlockCount();

    engine.room.level = GameConfig.levelSupplyCoverageFullLevel;
    const fullCount = engine.getGeneratedDrawPileBlockCount();

    engine.room.level = GameConfig.levelSupplyCoverageFullLevel + 10;
    const pastFullCount = engine.getGeneratedDrawPileBlockCount();

    assert.ok(
        l1Count > fullCount,
        `expected level 1's generated pile (${l1Count}) to exceed the flat-coverage pile (${fullCount})`
    );
    assert.equal(fullCount, pastFullCount, "coverage stays flat past levelSupplyCoverageFullLevel");
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

test("balance delta follows only the directional Balance axis", () => {
    const config = fixedStabilityConfig();

    assert.ok(
        TowerStability.balanceDelta({ tiltScore: 0.8 }, { tiltScore: 0.2 }, config) > 0,
        "reducing directional Balance risk pays a positive delta"
    );
    assert.ok(
        TowerStability.balanceDelta({ tiltScore: 0.2 }, { tiltScore: 0.8 }, config) < 0,
        "increasing directional Balance risk pays a negative delta"
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
    assert.equal(broadcast.towerStructuralPose.length, engine.room.towerBlocks.length);
    assert.deepEqual(
        Object.keys(broadcast.towerStructuralPose[0]).sort(),
        ["blockId", "failureWeight", "offsetXUnits", "offsetYUnits", "rotationDeg"]
    );
    assert.equal(Object.hasOwn(broadcast, "analysis"), false);

    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: [],
        state: engine.room
    });

    assert.deepEqual(snapshot.state.towerStructuralPose, engine.room.towerStructuralPose);
    assert.equal(Object.hasOwn(snapshot.state, "analysis"), false);
});
