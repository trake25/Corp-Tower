const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const GameEngine = require("../app/Game_Engine");
const GameConfig = require("../app/Game_Config");
const TowerStability = require("../app/Tower_Stability");

const ORIGINAL_DIFFICULTY = GameConfig.towerStabilityDifficulty;
const I_HORIZONTAL = [[0, 0], [1, 0], [2, 0], [3, 0]];
const I_VERTICAL = [[0, 0], [0, 1], [0, 2], [0, 3]];
const O = [[0, 0], [1, 0], [0, 1], [1, 1]];

afterEach(() => {
    GameConfig.towerStabilityDifficulty = ORIGINAL_DIFFICULTY;
});

function entry(id, shapeId, cells, originX, originY) {
    return { block: { id, shapeId, cells }, originX, originY };
}

function exactCapacityConfig(overrides = {}) {
    return {
        towerSiteWidth: 8,
        towerTargetHeight: 30,
        towerBalanceSafeOffsetShare: 2,
        towerBalanceCollapseOffsetShare: 3,
        towerStructuralLoadExponent: 0.8,
        towerRedundancyBonus: 0.45,
        towerStructuralSeverity: 0,
        towerStabilityMinHeight: 1,
        towerHeightPressureGain: 0,
        towerStabilityPressureApplied: 1,
        towerStabilityRiskScaleApplied: 1,
        towerSupportSafeLoadHeightShare: 0.5,
        towerSupportCollapseLoadHeightShare: 1,
        ...overrides
    };
}

function ioBottleneck(oCount, reinforced = false) {
    const entries = [
        entry("BASE0", "I", I_HORIZONTAL, 2, 0),
        entry("BASE1", "I", I_HORIZONTAL, 2, 1),
        entry("MID", "I", I_VERTICAL, 3, 2)
    ];

    if (reinforced) {
        entries.push(entry("MID2", "I", I_VERTICAL, 4, 2));
    }

    for (let index = 0; index < oCount; index += 1) {
        entries.push(entry(`O${index}`, "O", O, 3, 6 + index * 2));
    }

    return entries;
}

function verticalIBottleneck(upperCount) {
    const entries = [
        entry("BASE0", "I", I_HORIZONTAL, 2, 0),
        entry("BASE1", "I", I_HORIZONTAL, 2, 1),
        entry("MID", "I", I_VERTICAL, 3, 2)
    ];

    for (let index = 0; index < upperCount; index += 1) {
        entries.push(entry(`I${index}`, "I", I_VERTICAL, 3, 6 + index * 4));
    }

    return entries;
}

function groupFor(result, blockId) {
    return result.analysis.groups.find(group => group.memberBlockIds.includes(blockId));
}

function productionConfig(level, difficulty) {
    const originalLog = console.log;
    console.log = () => {};
    const engine = new GameEngine();

    try {
        engine.createRoom([{ id: "P1" }, { id: "P2" }, { id: "P3" }]);
    } finally {
        console.log = originalLog;
    }

    engine.room.level = level;
    engine.room.targetHeight = engine.getTargetHeightForLevel(level);
    GameConfig.towerStabilityDifficulty = difficulty;
    return engine.resolveStabilityConfig(level);
}

test("unchanged thin support has fixed capacity and monotonically rising I/O load", () => {
    const config = exactCapacityConfig();
    let previous = null;

    for (let count = 1; count <= 6; count += 1) {
        const result = TowerStability.evaluate(ioBottleneck(count), config);
        const middle = groupFor(result, "MID");

        assert.equal(middle.supportedLoad, 4 + count * 4);
        assert.equal(middle.supportCapacity, 30);
        assert.equal(result.diagnostics.collapsed, false);

        if (previous) {
            assert.ok(middle.loadRatio > previous.loadRatio);
            assert.ok(middle.integrityRisk >= previous.integrityRisk);
        }

        previous = middle;
    }
});

test("I/O pile collapses at the exact contact limit and preserves the strong base", () => {
    const safe = TowerStability.evaluate(ioBottleneck(6), exactCapacityConfig());
    const failed = TowerStability.evaluate(ioBottleneck(7), exactCapacityConfig());
    const collapsedIds = failed.components[0].collapseBlockIds;

    assert.equal(safe.diagnostics.collapsed, false);
    assert.ok(safe.stability > 0);
    assert.equal(failed.diagnostics.collapsed, true);
    assert.equal(failed.stability, 0);
    assert.ok(collapsedIds.includes("MID"));
    assert.ok(collapsedIds.includes("O6"));
    assert.equal(collapsedIds.includes("BASE0"), false);
    assert.equal(collapsedIds.includes("BASE1"), false);
});

test("a second grounded I path carries more O mass than one thin support", () => {
    const weak = TowerStability.evaluate(ioBottleneck(7), exactCapacityConfig());
    const reinforced = TowerStability.evaluate(ioBottleneck(7, true), exactCapacityConfig());
    const weakMiddle = groupFor(weak, "MID");
    const reinforcedMiddle = groupFor(reinforced, "MID");

    assert.equal(weak.diagnostics.collapsed, true);
    assert.equal(reinforced.diagnostics.collapsed, false);
    assert.ok(reinforcedMiddle.supportedLoad < weakMiddle.supportedLoad);
    assert.ok(reinforcedMiddle.loadRatio < weakMiddle.loadRatio);
});

test("equal-mass I and O add the same four load units", () => {
    const base = verticalIBottleneck(0);
    const withI = TowerStability.evaluate(verticalIBottleneck(1), exactCapacityConfig());
    const withO = TowerStability.evaluate([
        ...base,
        entry("O0", "O", O, 3, 6)
    ], exactCapacityConfig());

    assert.equal(groupFor(withI, "MID").supportedLoad, 8);
    assert.equal(groupFor(withO, "MID").supportedLoad, 8);
});

test("centred overload fails Integrity without inventing Balance direction", () => {
    const failed = TowerStability.evaluate(verticalIBottleneck(7), exactCapacityConfig());

    assert.equal(failed.diagnostics.collapsed, true);
    assert.equal(failed.diagnostics.balance, 100);
    assert.equal(failed.diagnostics.integrity, 0);
    assert.equal(failed.diagnostics.leanDirection, "center");
});

test("stability difficulty changes the finite I/O carrying limit", () => {
    const entries = ioBottleneck(35);
    const forgiving = TowerStability.evaluate(entries, productionConfig(8, 25));
    const harsh = TowerStability.evaluate(entries, productionConfig(8, 100));

    assert.equal(forgiving.diagnostics.collapsed, false);
    assert.equal(harsh.diagnostics.collapsed, true);
    assert.ok(forgiving.diagnostics.integrity > harsh.diagnostics.integrity);
});

test("load analysis and collapse membership are independent of entry order", () => {
    const entries = ioBottleneck(7);
    const forward = TowerStability.evaluate(entries, exactCapacityConfig());
    const reversed = TowerStability.evaluate(entries.slice().reverse(), exactCapacityConfig());
    const forwardMiddle = groupFor(forward, "MID");
    const reversedMiddle = groupFor(reversed, "MID");

    assert.equal(forwardMiddle.supportedLoad, reversedMiddle.supportedLoad);
    assert.equal(forwardMiddle.supportCapacity, reversedMiddle.supportCapacity);
    assert.equal(forwardMiddle.loadRatio, reversedMiddle.loadRatio);
    assert.deepEqual(forward.components[0].collapseBlockIds, reversed.components[0].collapseBlockIds);
});
