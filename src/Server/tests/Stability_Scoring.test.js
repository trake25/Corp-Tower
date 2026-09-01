const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const TowerStability = require("../app/Tower_Stability");
const { stripRuntimeRoom } = require("../app/Redis_State");
const {
    GameConfig,
    createBlock,
    createPlayingEngine,
    eventTypes,
    fixedGridTunables,
    fixedStabilityConfig,
    latestMessage,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

function stabilityEntry(id, cells, originX, originY) {
    return { block: { id, cells }, originX, originY };
}

function loadedBottleneckEntries() {
    const row = width => Array.from({ length: width }, (_, x) => [x, 0]);
    return [
        stabilityEntry("B0", row(6), 0, 0),
        stabilityEntry("B1", row(6), 0, 1),
        stabilityEntry("N", row(1), 2, 2),
        stabilityEntry("U3", row(6), 0, 3),
        stabilityEntry("U4", row(6), 0, 4),
        stabilityEntry("U5", row(6), 0, 5),
        stabilityEntry("U6", row(6), 0, 6),
        stabilityEntry("U7", row(6), 0, 7),
        stabilityEntry("U8", row(6), 0, 8)
    ];
}

const INDEPENDENT_COLLAPSE_TUNABLES = {
    ...fixedGridTunables({ gridWidth: 14, widthMin: 14, widthMax: 14 }),
    powerLastChanceEnabled: false
};

function configureIndependentCollapse(engine, remainingBlocks) {
    const row = width => Array.from({ length: width }, (_, x) => [x, 0]);
    const config = fixedStabilityConfig({
        towerSiteWidth: 14,
        towerStabilityMinHeight: 1,
        towerStructuralSeverity: 1.3
    });
    engine.resolveStabilityConfig = () => config;
    engine.room.targetHeight = 20;
    engine.room.towerBlocks = [
        stabilityEntry("B0", row(6), 0, 0),
        stabilityEntry("B1", row(6), 0, 1),
        stabilityEntry("N", row(1), 2, 2),
        stabilityEntry("U3", row(6), 0, 3),
        stabilityEntry("U4", row(6), 0, 4),
        stabilityEntry("U5", row(6), 0, 5),
        stabilityEntry("S0", row(6), 8, 0),
        stabilityEntry("S1", row(6), 8, 1)
    ];
    engine.room.currentHeight = TowerStability.topHeight(engine.room.towerBlocks);
    engine.recalculateTowerStability(false);
    engine.room.players[0].blocks = [{ id: "FAIL", shapeId: "I6H", height: 1, cells: row(6) }];
    engine.room.players[1].blocks = remainingBlocks;
    engine.room.players[2].blocks = [];
}

function poseById(result, id) {
    return result.structuralPose.find(pose => pose.blockId === id);
}

function posedPoint(pose, x, y) {
    const angle = -pose.rotationDeg * Math.PI / 180;
    return {
        x: pose.sectionOriginXUnits + x * Math.cos(angle) - y * Math.sin(angle),
        y: pose.sectionOriginYUnits + x * Math.sin(angle) + y * Math.cos(angle)
    };
}

function scoreResult(stability = 100, criticalRisk = 0, height = 20) {
    return {
        stability,
        diagnostics: { collapsed: false, criticalRisk },
        analysis: { height, groups: [] }
    };
}

function scoreAssessment(overrides = {}) {
    return {
        riskIncrease: 0,
        rawStructuralUtility: 0,
        directSupportShare: 0,
        benefitedLoadShare: 0,
        criticalRiskReduction: 0,
        criticalSaveCandidate: false,
        repairClaimKey: null,
        ...overrides
    };
}

function previewScore(engine, overrides = {}) {
    return engine.previewPlacementScore({
        effectiveHeight: 0,
        beforeResult: scoreResult(),
        afterResult: scoreResult(),
        assessment: scoreAssessment(),
        stabilityConfig: fixedStabilityConfig({ towerStabilityMinHeight: 1 }),
        ...overrides
    });
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
    const originalDifficulty = GameConfig.towerStabilityDifficulty;

    for (let y = 0; y < 10; y++) {
        entries.push({ block: rowBlock, originX: 2, originY: y });
    }

    try {
        GameConfig.towerStabilityDifficulty = 65;
        const earlyConfig = engine.resolveStabilityConfig(1);
        const lateConfig = engine.resolveStabilityConfig(40);
        for (const config of [earlyConfig, lateConfig]) {
            config.towerSupportSafeLoadPerContact = 1000;
            config.towerSupportCollapseLoadPerContact = 2000;
        }
        const early = TowerStability.evaluate(entries, earlyConfig);
        const late = TowerStability.evaluate(entries, lateConfig);

        assert.ok(
            late.stability < early.stability,
            `expected level 40 to be harsher than level 1, got ${late.stability} vs ${early.stability}`
        );
    } finally {
        GameConfig.towerStabilityDifficulty = originalDifficulty;
    }
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

test("the difficulty dial is forgiving at 5 and never improves a loaded bottleneck", () => {
    const { engine } = createPlayingEngine(8, 125);
    const original = GameConfig.towerStabilityDifficulty;
    const results = new Map();

    try {
        for (const difficulty of [0, 5, 25, 50, 75, 100]) {
            GameConfig.towerStabilityDifficulty = difficulty;
            results.set(
                difficulty,
                TowerStability.evaluate(loadedBottleneckEntries(), engine.resolveStabilityConfig(8))
            );
        }
    } finally {
        GameConfig.towerStabilityDifficulty = original;
    }

    assert.equal(results.get(0).stability, 100);
    assert.equal(results.get(0).diagnostics.collapsed, false);
    assert.ok(results.get(5).stability > 0, "difficulty 5 must keep the bottleneck standing");
    assert.equal(results.get(5).diagnostics.collapsed, false);
    assert.ok(results.get(25).stability <= results.get(5).stability);
    assert.ok(results.get(50).stability <= results.get(25).stability);
    assert.ok(results.get(75).stability <= results.get(50).stability);
    assert.equal(results.get(100).diagnostics.collapsed, true);

    for (const [previous, difficulty] of [[0, 5], [5, 25], [25, 50], [50, 75], [75, 100]]) {
        assert.ok(
            results.get(difficulty).diagnostics.criticalRisk >= results.get(previous).diagnostics.criticalRisk,
            "difficulty " + difficulty + " must not reduce bottleneck risk"
        );
    }
});

test("well-supported tall towers remain standing at every difficulty", () => {
    const { engine } = createPlayingEngine(8, 125);
    const original = GameConfig.towerStabilityDifficulty;
    const row = Array.from({ length: 8 }, (_, x) => [x, 0]);
    const entries = Array.from({ length: 10 }, (_, y) => stabilityEntry("R" + y, row, 0, y));

    try {
        for (const difficulty of [0, 5, 25, 50, 75, 100]) {
            GameConfig.towerStabilityDifficulty = difficulty;
            const result = TowerStability.evaluate(entries, engine.resolveStabilityConfig(8));
            assert.ok(result.stability > 0, "full support must stay viable at " + difficulty);
            assert.equal(result.diagnostics.collapsed, false);
        }
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
    assert.ok(Math.abs(poseById(redundantResult, "C").rotationDeg) < 0.000001);
});

test("a failed narrow middle cuts only itself and its dependent upper groups", () => {
    const result = TowerStability.evaluate(loadedBottleneckEntries(), fixedStabilityConfig({
        towerSiteWidth: 6,
        towerStabilityMinHeight: 1,
        towerStructuralSeverity: 1.4
    }));
    const collapseIds = result.components[0].collapseBlockIds;

    assert.ok(collapseIds.includes("N"));
    assert.ok(collapseIds.includes("U8"));
    assert.equal(collapseIds.includes("B0"), false);
    assert.equal(collapseIds.includes("B1"), false);
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
    assert.equal(disconnected.components.length, 2);
    assert.ok(disconnected.components.every(component => !component.diagnostics.collapsed));
    assert.ok(disconnected.analysis.groups.every(group => group.carriedLoadShare === 1));
    assert.equal(hanging.diagnostics.collapsed, true);
    assert.equal(hanging.stability, 0);
});

test("side contact joins a physical component while support paths remain vertical", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const separate = TowerStability.evaluate([
        stabilityEntry("L", cell, 0, 0),
        stabilityEntry("R", cell, 2, 0)
    ], config);
    const joined = TowerStability.evaluate([
        stabilityEntry("L", cell, 0, 0),
        stabilityEntry("R", cell, 1, 0)
    ], config);

    assert.equal(separate.components.length, 2);
    assert.equal(joined.components.length, 1);
    assert.equal(joined.analysis.groups.length, 2);
});

test("one unstable component can collapse beside an independent stable tower", () => {
    const config = fixedStabilityConfig({
        towerStabilityMinHeight: 1,
        towerStructuralSeverity: 2
    });
    const row = width => Array.from({ length: width }, (_, x) => [x, 0]);
    const entries = [
        ...loadedBottleneckEntries(),
        ...Array.from({ length: 3 }, (_, y) => stabilityEntry("S" + y, row(6), 8, y))
    ];
    const result = TowerStability.evaluate(entries, config);

    assert.equal(result.components.length, 2);
    assert.equal(result.components[0].diagnostics.collapsed, true);
    assert.equal(result.components[1].diagnostics.collapsed, false);
    assert.equal(result.components[1].stability, 100);
    assert.ok(result.components[0].supportStability.some(state => state.supportStability < 100));
    assert.ok(result.components[1].supportStability.every(state => state.supportStability === 100));
    assert.ok(result.structuralPose.every(pose => Number.isInteger(pose.componentId)));
});

test("a bridge merges components and transfers load through both support paths", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const bridge = [[0, 0], [1, 0], [2, 0]];
    const before = TowerStability.evaluate([
        stabilityEntry("L", cell, 0, 0),
        stabilityEntry("R", cell, 2, 0)
    ], config);
    const after = TowerStability.evaluate([
        stabilityEntry("L", cell, 0, 0),
        stabilityEntry("R", cell, 2, 0),
        stabilityEntry("B", bridge, 0, 1)
    ], config);

    assert.equal(before.components.length, 2);
    assert.equal(after.components.length, 1);
    assert.ok(after.analysis.groups.some(group => group.pathConcentration === 0.5));
});

test("fallen components leave no standing height or placement collision", () => {
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const fallen = stabilityEntry("F", [[0, 0], [0, 1], [0, 2]], 0, 5);
    fallen.towerState = "fallen";
    const standing = stabilityEntry("S", [[0, 0]], 5, 0);
    const entries = [fallen, standing];
    const rebuilding = { id: "R", cells: [[0, 0], [1, 0]] };

    assert.equal(TowerStability.topHeight(entries), 1);
    assert.deepEqual(TowerStability.settleBlock(entries, rebuilding, 0), { originX: 0, originY: 0 });
    assert.equal(TowerStability.evaluate(entries, config).components.length, 1);
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

test("structural pose bends weak interfaces while rigid upper sections remain seamless", () => {
    const config = fixedStabilityConfig({
        towerStabilityMinHeight: 1,
        towerTargetHeight: 9,
        towerHeightPressureGain: 1,
        towerStructuralPoseRigidRisk: 0.08,
        towerStructuralPoseIntegritySwayShare: 0.45
    });
    const result = TowerStability.evaluate(loadedBottleneckEntries(), config);
    const base = poseById(result, "B0");
    const bottleneck = poseById(result, "N");
    const upper = poseById(result, "U3");
    const upperNext = poseById(result, "U4");
    const reinforced = TowerStability.evaluate(
        loadedBottleneckEntries().map(entry => entry.block.id === "N"
            ? stabilityEntry("N", Array.from({ length: 6 }, (_, x) => [x, 0]), 0, 2)
            : entry
        ),
        config
    );
    const reinforcedUpper = poseById(reinforced, "U3");
    const angle = -upper.rotationDeg * Math.PI / 180;
    const upperCenter = { x: 3, y: 3.5 };
    const upperNextCenter = { x: 3, y: 4.5 };
    const posedUpper = {
        x: upperCenter.x + upper.offsetXUnits,
        y: upperCenter.y + upper.offsetYUnits
    };
    const posedUpperNext = {
        x: upperNextCenter.x + upperNext.offsetXUnits,
        y: upperNextCenter.y + upperNext.offsetYUnits
    };
    const bottleneckHinge = posedPoint(bottleneck, 2.5, 3);
    const upperHinge = posedPoint(upper, 2.5, 3);

    assert.equal(upper.sectionId, upperNext.sectionId);
    assert.equal(upper.rotationDeg, upperNext.rotationDeg);
    assert.ok(Math.abs(upper.rotationDeg) > Math.abs(bottleneck.rotationDeg));
    assert.ok(Math.abs(upper.rotationDeg) > Math.abs(base.rotationDeg));
    assert.ok(Math.abs(reinforcedUpper.rotationDeg) < Math.abs(upper.rotationDeg));
    assert.ok(Math.abs(bottleneckHinge.x - upperHinge.x) < 0.0001);
    assert.ok(Math.abs(bottleneckHinge.y - upperHinge.y) < 0.0001);
    assert.ok(Math.abs(posedUpperNext.x - posedUpper.x + Math.sin(angle)) < 0.0001);
    assert.ok(Math.abs(posedUpperNext.y - posedUpper.y - Math.cos(angle)) < 0.0001);
});

test("structural pose caps the final inherited section angle", () => {
    const result = TowerStability.evaluate(loadedBottleneckEntries(), fixedStabilityConfig({
        towerStabilityMinHeight: 1,
        towerTargetHeight: 9,
        towerHeightPressureGain: 1,
        towerPoseMaxAngleDeg: 0.5
    }));

    assert.ok(result.structuralPose.some(pose => Math.abs(pose.rotationDeg) > 0));
    assert.ok(result.structuralPose.every(pose => Math.abs(pose.rotationDeg) <= 0.5));
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

test("clean average height earns one action unit while dangerous height stays positive", () => {
    const { engine } = createPlayingEngine(3, 100);
    const averageHeight = engine.getAverageBrickHeight();
    const actionUnit = engine.getActionUnit();
    const clean = previewScore(engine, { effectiveHeight: averageHeight });
    const dangerous = previewScore(engine, {
        effectiveHeight: averageHeight,
        assessment: scoreAssessment({
            riskIncrease: GameConfig.scoring.fullDangerRiskIncrease
        })
    });

    assert.equal(clean.heightPoints, Math.round(actionUnit));
    assert.equal(clean.points, clean.heightPoints);
    assert.equal(clean.classification, "useful_height");
    assert.equal(dangerous.heightQuality, GameConfig.scoring.dangerousHeightFloor);
    assert.ok(dangerous.heightPoints > 0);
    assert.ok(dangerous.heightPoints < clean.heightPoints);
    assert.equal(dangerous.classification, "dangerous_height");
});

test("historical rows and rebuild reinforcement decay until a new target", () => {
    const { engine } = createPlayingEngine(2, 20);
    const player = engine.room.players[0];
    const actionUnit = engine.getActionUnit();
    const input = {
        previousHeight: 2,
        settledHeight: 4,
        historicalMaxStandingHeight: 4,
        beforeResult: scoreResult(100, 0, 2),
        settledResult: scoreResult(100, 0, 4),
        peakResult: scoreResult(100, 0, 4),
        placedEntry: { block: { id: "RECOVERY" }, towerState: "standing" },
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1
        }),
        collapseSummary: { anyFallen: false }
    };
    const first = engine.addPlacementScore(player, input);

    assert.equal(first.newHeight, 0);
    assert.equal(first.recoveredHeight, 2);
    assert.equal(first.recoveryPoints, 20);
    assert.equal(first.structuralPoints, actionUnit);
    assert.equal(engine.room.rebuildScoreCount, 1);

    const second = engine.addPlacementScore(player, input);
    const third = engine.addPlacementScore(player, input);

    assert.equal(second.recoveryPoints, 10);
    assert.equal(second.structuralPoints, Math.round(actionUnit * 0.5));
    assert.equal(third.recoveryPoints, 5);
    assert.equal(third.structuralPoints, Math.round(actionUnit * 0.25));
    assert.equal(engine.room.rebuildScoreCount, 3);

    const newHeight = engine.previewPlacementScore({
        ...input,
        previousHeight: 4,
        settledHeight: 6,
        historicalMaxStandingHeight: 4,
        settledResult: scoreResult(100, 0, 6),
        peakResult: scoreResult(100, 0, 6)
    });
    assert.equal(newHeight.heightPoints, 40);
    assert.equal(newHeight.recoveryPoints, 0);
    assert.equal(
        newHeight.structuralPoints,
        Math.min(actionUnit, newHeight.cap - newHeight.heightPoints)
    );
});

test("zero-percent Recovery consumes rows and a collapse transaction scores nothing", () => {
    const { engine } = createPlayingEngine(1, 20);
    const player = engine.room.players[0];
    GameConfig.scoring.recoveryHeightScorePercent = 0;
    const base = {
        previousHeight: 1,
        settledHeight: 3,
        historicalMaxStandingHeight: 3,
        beforeResult: scoreResult(100, 0, 1),
        settledResult: scoreResult(100, 0, 3),
        peakResult: scoreResult(100, 0, 3),
        placedEntry: { block: { id: "REPAIR" }, towerState: "standing" },
        assessment: scoreAssessment({ rawStructuralUtility: 1, directSupportShare: 1 }),
        collapseSummary: { anyFallen: false }
    };
    const recovery = engine.addPlacementScore(player, base);

    assert.equal(recovery.recoveryPoints, 0);
    assert.equal(engine.room.rebuildScoreCount, 1);

    const collapse = engine.addPlacementScore(player, {
        ...base,
        previousHeight: 3,
        settledHeight: 4,
        historicalMaxStandingHeight: 3,
        collapseSummary: { anyFallen: true }
    });
    assert.equal(collapse.points, 0);
    assert.equal(collapse.impactEligiblePoints, 0);
    assert.equal(collapse.heightPoints, 0);
    assert.equal(collapse.newHeight, 0);
    assert.equal(collapse.classification, "collapse");
    assert.equal(collapse.structuralPoints, 0);
    assert.equal(collapse.criticalSavePoints, 0);
    assert.equal(engine.room.historicalMaxStandingHeight, 4);
});

test("active-tower reinforcement always pays while inactive and indirect repairs do not", () => {
    const { engine } = createPlayingEngine(1, 20);
    const config = fixedStabilityConfig({ towerStabilityMinHeight: 1 });
    const cell = [[0, 0]];
    const crown = [[0, 0], [1, 0], [2, 0], [3, 0]];
    const before = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("C", crown, 1, 1)
    ], config);
    const placedEntry = stabilityEntry("R", cell, 3, 0);
    const after = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        placedEntry,
        stabilityEntry("C", crown, 1, 1)
    ], config);
    const assessment = TowerStability.comparePlacement(before, after, placedEntry);
    const direct = previewScore(engine, {
        beforeResult: before,
        afterResult: after,
        placedEntry,
        assessment,
        stabilityConfig: config
    });
    const indirect = previewScore(engine, {
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 0
        })
    });

    assert.ok(assessment.rawStructuralUtility > 0);
    assert.ok(assessment.directSupportShare > 0);
    assert.equal(assessment.isActiveTower, true);
    assert.ok(direct.structuralPoints > 0);
    const repeated = TowerStability.comparePlacement(before, after, placedEntry);
    assert.equal(repeated.rawStructuralUtility, assessment.rawStructuralUtility);

    const wide = [[0, 0], [1, 0], [2, 0]];
    const tallerTower = [
        stabilityEntry("T0", wide, 10, 0),
        stabilityEntry("T1", wide, 10, 1),
        stabilityEntry("T2", wide, 10, 2)
    ];
    const inactiveBefore = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        stabilityEntry("C", crown, 1, 1),
        ...tallerTower
    ], config);
    const inactiveAfter = TowerStability.evaluate([
        stabilityEntry("L", cell, 2, 0),
        placedEntry,
        stabilityEntry("C", crown, 1, 1),
        ...tallerTower
    ], config);
    const inactiveAssessment = TowerStability.comparePlacement(
        inactiveBefore, inactiveAfter, placedEntry
    );
    const inactive = previewScore(engine, {
        beforeResult: inactiveBefore,
        afterResult: inactiveAfter,
        placedEntry,
        assessment: inactiveAssessment,
        stabilityConfig: config
    });

    assert.equal(inactiveAssessment.isActiveTower, false);
    assert.equal(inactive.structuralPoints, 0);
    assert.equal(indirect.structuralPoints, 0);
    assert.equal(indirect.classification, "low_value");
});

test("strong and small reinforcement stay in their action-unit bands", () => {
    const { engine } = createPlayingEngine(2, 40);
    const actionUnit = engine.getActionUnit();
    const strong = previewScore(engine, {
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1
        })
    });
    const small = previewScore(engine, {
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement * 0.25,
            directSupportShare: 1
        })
    });

    assert.ok(strong.structuralPoints >= actionUnit * 0.95);
    assert.ok(strong.structuralPoints <= actionUnit);
    assert.ok(small.structuralPoints >= actionUnit * 0.1);
    assert.ok(small.structuralPoints <= actionUnit * 0.4);
    assert.equal(strong.classification, "reinforcement");
});

test("round-clock slack lerps down from levelTimeSlack to levelTimeSlackMin across levelTimeSlackFullLevel", () => {
    const { engine } = createPlayingEngine(1, 10, {
        tunables: {
            levelTimeLimitMs: 60000,
            levelTimeSlack: 3,
            levelTimeSlackMin: 1.5,
            levelTimeSlackFullLevel: 25,
            placementCooldown: 1000
        }
    });

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
});

test("the round-clock floor binds at low levels and releases once the derived clock outgrows it", () => {
    const { engine } = createPlayingEngine(1, 10, { tunables: { placementCooldown: 1000 } });

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

test("combined and Critical Save caps conserve the component breakdown", () => {
    const { engine } = createPlayingEngine(2, 40);
    const averageHeight = engine.getAverageBrickHeight();
    const combined = previewScore(engine, {
        effectiveHeight: averageHeight,
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1
        })
    });
    const critical = previewScore(engine, {
        effectiveHeight: averageHeight,
        beforeResult: scoreResult(40, 0.8, 20),
        afterResult: scoreResult(80, 0.2, 20),
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1,
            benefitedLoadShare: 0.5,
            criticalRiskReduction: 0.5,
            criticalSaveCandidate: true,
            repairClaimKey: "critical-interface"
        }),
        stabilityConfig: fixedStabilityConfig({ towerStabilityMinHeight: 1 })
    });

    assert.equal(
        combined.points,
        combined.heightPoints + combined.structuralPoints + combined.criticalSavePoints
    );
    assert.equal(combined.capHit, true);
    assert.equal(critical.criticalSave, true);
    assert.equal(
        critical.points,
        critical.heightPoints + critical.structuralPoints + critical.criticalSavePoints
    );
    assert.equal(critical.points, critical.cap);
});

test("Critical Save qualification enforces claim and per-level limits", () => {
    const { engine } = createPlayingEngine(1, 20);
    const base = {
        beforeResult: scoreResult(40, 0.8, 20),
        afterResult: scoreResult(80, 0.2, 20),
        assessment: scoreAssessment({
            rawStructuralUtility: GameConfig.scoring.strongStructuralImprovement,
            directSupportShare: 1,
            benefitedLoadShare: 0.5,
            criticalRiskReduction: 0.5,
            criticalSaveCandidate: true,
            repairClaimKey: "critical-interface"
        }),
        stabilityConfig: fixedStabilityConfig({ towerStabilityMinHeight: 1 })
    };
    const qualified = previewScore(engine, base);
    const claimed = previewScore(engine, {
        ...base,
        claimedKeys: { "critical-interface": true }
    });
    const capped = previewScore(engine, { ...base, criticalSaveCount: 2 });
    const shallow = previewScore(engine, {
        ...base,
        assessment: scoreAssessment({
            ...base.assessment,
            criticalRiskReduction: 0.1
        })
    });

    assert.equal(qualified.criticalSave, true);
    assert.equal(claimed.criticalSaveRejection, "claimed");
    assert.equal(capped.criticalSaveRejection, "level_cap");
    assert.equal(shallow.criticalSaveRejection, "risk_reduction");
});

test("the first brick has no phantom structural value and preview equals award", () => {
    const { engine } = createPlayingEngine(1, 10);
    const player = engine.room.players[0];
    const input = {
        effectiveHeight: engine.getAverageBrickHeight(),
        beforeResult: scoreResult(),
        afterResult: scoreResult(),
        assessment: scoreAssessment()
    };
    const preview = engine.previewPlacementScore(input);
    const awarded = engine.addPlacementScore(player, input);

    assert.equal(preview.structuralPoints, 0);
    assert.equal(preview.criticalSavePoints, 0);
    assert.deepEqual(awarded, preview);
    assert.equal(player.levelScore, preview.points);
    assert.equal(player.levelImpactContribution, preview.impactEligiblePoints);
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

test("placement collapses only its component and play continues with enough supply", () => {
    const { engine, messages } = createPlayingEngine(1, 20, {
        tunables: INDEPENDENT_COLLAPSE_TUNABLES
    });
    const rebuild = {
        id: "REBUILD",
        shapeId: "I6H",
        height: 1,
        cells: Array.from({ length: 6 }, (_, x) => [x, 0])
    };
    configureIndependentCollapse(engine, [rebuild]);
    engine.room.players[2].blocks = [createBlock(30, "SUPPLY")];

    engine.placeBlock("P1", 0, 0);

    const fallen = engine.room.towerBlocks.filter(entry => entry.towerState === "fallen");
    const standing = engine.room.towerBlocks.filter(entry => entry.towerState === "standing");
    const failedPlacement = fallen.find(entry => entry.block.id === "FAIL");
    const broadcast = latestMessage(messages);

    assert.equal(engine.room.state, "playing");
    assert.equal(engine.room.currentHeight, 2);
    assert.ok(engine.room.towerStability > 0);
    assert.equal(fallen.length, 5);
    assert.deepEqual(standing.map(entry => entry.block.id).sort(), ["B0", "B1", "S0", "S1"]);
    assert.equal(failedPlacement.effectiveHeight, 0);
    assert.equal(failedPlacement.supportStability, 0);
    assert.ok(fallen.every(entry => Number.isInteger(entry.supportStability)));
    assert.ok(standing.every(entry => Number.isInteger(entry.supportStability)));
    assert.equal(engine.room.players[0].contributedHeight, 0);
    assert.ok(eventTypes(broadcast).includes("tower_component_collapsed"));
    assert.equal(eventTypes(broadcast).includes("placement"), false);
    assert.equal(broadcast.towerStabilityComponents.length, 2);
    assert.ok(broadcast.towerStabilityComponents.every(component => component.height === 2));
    assert.equal(Object.hasOwn(broadcast.towerStabilityComponents[0], "analysis"), false);
    assert.equal(Object.hasOwn(broadcast.towerStabilityComponents[0], "entryIndexes"), false);

    engine.placeBlock("P2", 0, 0);

    const rebuilt = engine.room.towerBlocks.find(entry => entry.block.id === "REBUILD");
    assert.equal(engine.room.state, "playing");
    assert.equal(rebuilt.towerState, "standing");
    assert.equal(rebuilt.originY, 2);
});

test("collapse itself does not fail but insufficient remaining supply does", () => {
    const { engine } = createPlayingEngine(1, 20, {
        tunables: INDEPENDENT_COLLAPSE_TUNABLES
    });
    configureIndependentCollapse(engine, [createBlock(1, "TOO_SMALL")]);

    engine.placeBlock("P1", 0, 0);

    assert.equal(engine.room.state, "failed");
    assert.equal(engine.room.lastLevelSummary.failureReason, "not_enough_height_remaining");
});

test("a placed brick carries the balance delta it caused", () => {
    const { engine, messages } = createPlayingEngine(1, 8, {
        tunables: fixedGridTunables()
    });

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
        assert.equal(typeof entry.supportStability, "number", "every standing brick carries live support stability");
    }

    // The client can redraw the entrance reaction before switching to live support,
    // so both presentation fields must ride every rebroadcast.
    const broadcast = latestMessage(messages);
    assert.equal(
        broadcast.towerBlocks[0].balanceDelta,
        engine.room.towerBlocks[0].balanceDelta
    );
    assert.equal(
        broadcast.towerBlocks[1].balanceDelta,
        engine.room.towerBlocks[1].balanceDelta
    );
    assert.equal(
        broadcast.towerBlocks[0].supportStability,
        engine.room.towerBlocks[0].supportStability
    );
    assert.equal(broadcast.towerStabilityWarningThreshold, GameConfig.towerStabilityWarningThreshold);
    assert.equal(broadcast.towerStabilityCriticalThreshold, GameConfig.towerStabilityCriticalThreshold);
    assert.equal(Number.isInteger(broadcast.towerStabilityWarningThreshold), true);
    assert.equal(Number.isInteger(broadcast.towerStabilityCriticalThreshold), true);
    assert.equal(broadcast.towerStructuralPose.length, engine.room.towerBlocks.length);
    assert.deepEqual(
        Object.keys(broadcast.towerStructuralPose[0]).sort(),
        [
            "blockId", "componentId", "failureWeight", "offsetXUnits", "offsetYUnits", "rotationDeg",
            "sectionId", "sectionOriginXUnits", "sectionOriginYUnits"
        ]
    );
    assert.equal(Object.hasOwn(broadcast, "analysis"), false);

    const snapshot = stripRuntimeRoom({
        id: "TEST",
        players: [],
        state: engine.room
    });

    assert.deepEqual(snapshot.state.towerStructuralPose, engine.room.towerStructuralPose);
    assert.deepEqual(snapshot.state.towerStabilityComponents, engine.room.towerStabilityComponents);
    assert.equal(snapshot.state.towerBlocks[0].supportStability, engine.room.towerBlocks[0].supportStability);
    assert.equal(Object.hasOwn(snapshot.state, "analysis"), false);
});

test("reinforcement attribution follows one lateral edge and then only downward", () => {
    const group = (key, blockIds, risk, supportLinks = [], lateralLinks = []) => ({
        key,
        signature: `0:${key}`,
        boundaryKey: "0",
        memberKeys: [key],
        memberBlockIds: blockIds,
        carriedLoadShare: 1,
        supportedLoad: 1,
        supportedMoment: 1,
        incomingLoad: 1,
        supportCapacity: 10,
        loadRatio: 0.1,
        balanceRisk: risk,
        integrityRisk: risk,
        risk,
        pivotY: 0,
        supportLinks,
        lateralLinks
    });
    const before = {
        analysis: { groups: [group("A", ["A"], 0.8)] },
        components: [],
        diagnostics: { criticalRisk: 0.8 }
    };
    const afterWithDownwardRoute = {
        analysis: { groups: [
            group("A", ["A"], 0.4, [], [{ supporterKey: "B", weight: 1 }]),
            group("B", ["B"], 0.1, [{ supporterKey: "C", weight: 1 }]),
            group("C", ["PLACED"], 0)
        ] },
        components: [],
        diagnostics: { criticalRisk: 0.4 }
    };
    const afterWithSecondLateralAndCycle = {
        analysis: { groups: [
            group("A", ["A"], 0.4, [], [{ supporterKey: "B", weight: 1 }]),
            group(
                "B",
                ["B"],
                0.1,
                [{ supporterKey: "A", weight: 1 }],
                [{ supporterKey: "C", weight: 1 }]
            ),
            group("C", ["PLACED"], 0)
        ] },
        components: [],
        diagnostics: { criticalRisk: 0.4 }
    };
    const placed = { block: { id: "PLACED" } };

    assert.equal(
        TowerStability.comparePlacement(before, afterWithDownwardRoute, placed).directSupportShare,
        1
    );
    assert.equal(
        TowerStability.comparePlacement(before, afterWithSecondLateralAndCycle, placed).directSupportShare,
        0
    );
});
