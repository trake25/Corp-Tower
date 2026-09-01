const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const TowerStability = require("../app/Tower_Stability");
const {
    createPlayingEngine,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

const SUPPORT_THRESHOLDS = { warning: 75, critical: 45 };
const I_HORIZONTAL = [[0, 0], [1, 0], [2, 0], [3, 0]];
const I_VERTICAL = [[0, 0], [0, 1], [0, 2], [0, 3]];
const O = [[0, 0], [1, 0], [0, 1], [1, 1]];

afterEach(resetFixtures);

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
        towerSupportSafeLoadPerContact: 15,
        towerSupportCollapseLoadPerContact: 30,
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

function supportFor(result, blockId) {
    return result.supportStability.find(state => state.blockId === blockId)?.supportStability;
}

function thinStack(oCount, mirrored = false, reinforced = false) {
    const oOriginX = mirrored ? 2 : 3;
    const entries = [entry("I", "I", I_VERTICAL, 3, 0)];

    if (reinforced) {
        entries.push(entry("I2", "I", I_VERTICAL, mirrored ? 2 : 4, 0));
    }

    for (let index = 0; index < oCount; index += 1) {
        entries.push(entry(`O${index}`, "O", O, oOriginX, 4 + index * 2));
    }

    return entries;
}

function productionConfig(level, difficulty) {
    const { engine } = createPlayingEngine(level, 30, {
        tunables: {
            towerStabilityDifficulty: difficulty,
            towerStabilityWarningThreshold: SUPPORT_THRESHOLDS.warning,
            towerStabilityCriticalThreshold: SUPPORT_THRESHOLDS.critical
        }
    });
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

test("support capacity is physical and does not grow with the level target height", () => {
    const shortTarget = TowerStability.evaluate(ioBottleneck(4), exactCapacityConfig({ towerTargetHeight: 30 }));
    const longTarget = TowerStability.evaluate(ioBottleneck(4), exactCapacityConfig({ towerTargetHeight: 300 }));

    assert.equal(groupFor(shortTarget, "MID").supportCapacity, groupFor(longTarget, "MID").supportCapacity);
    assert.equal(groupFor(shortTarget, "MID").loadRatio, groupFor(longTarget, "MID").loadRatio);
});

test("a thin support face worsens with dependent load and recovers through reinforcement", () => {
    const config = productionConfig(1, 50);
    const empty = TowerStability.evaluate(thinStack(0), config);
    const one = TowerStability.evaluate(thinStack(1), config);
    const two = TowerStability.evaluate(thinStack(2), config);
    const three = TowerStability.evaluate(thinStack(3), config);
    const reinforced = TowerStability.evaluate(thinStack(3, false, true), config);

    assert.ok(supportFor(empty, "I") > SUPPORT_THRESHOLDS.warning);
    assert.ok(supportFor(one, "I") > SUPPORT_THRESHOLDS.warning);
    assert.ok(supportFor(two, "I") <= SUPPORT_THRESHOLDS.warning);
    assert.ok(supportFor(two, "I") > SUPPORT_THRESHOLDS.critical);
    assert.ok(supportFor(three, "I") <= SUPPORT_THRESHOLDS.critical);
    assert.equal(supportFor(three, "O2"), 100);
    assert.ok(supportFor(reinforced, "I") > supportFor(three, "I"));
});

test("support faces and load direction mirror without inventing symmetric lean", () => {
    const config = productionConfig(1, 50);
    const right = TowerStability.evaluate(thinStack(3), config);
    const left = TowerStability.evaluate(thinStack(3, true), config);
    const symmetric = TowerStability.evaluate(thinStack(3, false, true), config);
    const rightPose = right.structuralPose.find(pose => pose.blockId === "I");
    const leftPose = left.structuralPose.find(pose => pose.blockId === "I");

    assert.equal(right.diagnostics.leanDirection, "right");
    assert.equal(left.diagnostics.leanDirection, "left");
    assert.equal(symmetric.diagnostics.leanDirection, "center");
    assert.ok(rightPose.rotationDeg > 0);
    assert.ok(leftPose.rotationDeg < 0);
    assert.ok(Math.abs(rightPose.rotationDeg + leftPose.rotationDeg) < 0.000001);
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

test("a connected support cluster stresses only bricks carrying dependent load", () => {
    const single = [[0, 0]];
    const row = [[0, 0], [1, 0]];
    const result = TowerStability.evaluate([
        entry("L", "single", single, 2, 0),
        entry("R", "single", single, 3, 0),
        entry("IDLE", "single", single, 4, 0),
        entry("CROWN", "row", row, 2, 1),
        entry("UPPER", "row", row, 2, 2)
    ], exactCapacityConfig({
        towerSupportSafeLoadPerContact: 1,
        towerSupportCollapseLoadPerContact: 6
    }));

    assert.equal(result.components.length, 1);
    assert.equal(supportFor(result, "L"), supportFor(result, "R"));
    assert.ok(supportFor(result, "L") < supportFor(result, "IDLE"));
    assert.equal(supportFor(result, "IDLE"), 100);
});

test("connecting separate towers recomputes load paths and relieves the prior bottleneck", () => {
    const row = width => Array.from({ length: width }, (_, x) => [x, 0]);
    const column = height => Array.from({ length: height }, (_, y) => [0, y]);
    const config = exactCapacityConfig({
        towerSupportSafeLoadPerContact: 4,
        towerSupportCollapseLoadPerContact: 20
    });
    const separate = [
        entry("A", "column", column(5), 2, 0),
        entry("B", "column", column(4), 5, 0),
        entry("CROWN", "row", row(4), 2, 5),
        entry("UPPER", "row", row(4), 2, 6)
    ];
    const before = TowerStability.evaluate(separate, config);
    const connected = TowerStability.evaluate([
        ...separate,
        entry("BRIDGE", "row", row(3), 3, 4)
    ], config);

    assert.equal(before.components.length, 2);
    assert.equal(connected.components.length, 1);
    assert.ok(supportFor(connected, "A") > supportFor(before, "A"));
    assert.ok(supportFor(connected, "B") < supportFor(before, "B"));
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
    const entries = ioBottleneck(4);
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
    const forwardSupport = forward.supportStability.slice().sort((left, right) => left.blockId.localeCompare(right.blockId));
    const reversedSupport = reversed.supportStability.slice().sort((left, right) => left.blockId.localeCompare(right.blockId));
    assert.deepEqual(
        forwardSupport.map(state => [state.blockId, state.supportStability]),
        reversedSupport.map(state => [state.blockId, state.supportStability])
    );
    assert.ok(forwardSupport.every(state => Number.isInteger(state.supportStability)));
    assert.ok(forwardSupport.every(state => state.supportStability >= 0 && state.supportStability <= 100));
});
