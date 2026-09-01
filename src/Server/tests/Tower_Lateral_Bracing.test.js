const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const LateralBracing = require("../app/Tower_Lateral_Bracing");
const TowerStability = require("../app/Tower_Stability");
const {
    fixedStabilityConfig,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

const I_VERTICAL = [[0, 0], [0, 1], [0, 2], [0, 3]];
const O = [[0, 0], [1, 0], [0, 1], [1, 1]];
const CRITICAL_SUPPORT_THRESHOLD = 45;

afterEach(resetFixtures);

function entry(id, cells, originX, originY) {
    return { block: { id, cells }, originX, originY };
}

function thinFixture(brace = null) {
    const entries = [entry("I", I_VERTICAL, 3, 0)];
    for (let index = 0; index < 6; index += 1) {
        entries.push(entry(`O${index}`, O, 3, 4 + index * 2));
    }
    if (brace) entries.push(brace);
    return entries;
}

function groupFor(result, blockId) {
    return result.analysis.groups.find(group => group.memberBlockIds.includes(blockId));
}

function supportFor(result, blockId) {
    return result.supportStability.find(state => state.blockId === blockId)?.supportStability;
}

function fakeGroup(key, x, options = {}) {
    const group = {
        key,
        members: [{ cells: [{ x, y: 0 }] }],
        contacts: [],
        supportLinks: [],
        mass: options.mass ?? 1,
        loadMass: options.load ?? 1,
        loadMoment: options.moment ?? x + 0.5,
        interface: {
            balanceRisk: options.risk ?? 0,
            integrityRisk: options.risk ?? 0,
            loadRatio: options.ratio ?? 0,
            supportCapacity: options.capacity ?? 100
        }
    };
    if (options.ground) {
        group.contacts.push({ supporter: null });
        group.supportLinks.push({ supporter: null, weight: 1 });
    }
    return group;
}

function connect(group, supporter) {
    group.contacts.push({ supporter });
    group.supportLinks.push({ supporter, weight: 1 });
}

test("a grounded side brace shares the critical thin-I load and conserves mass and moment", () => {
    const lateralShare = 0.4;
    const config = fixedStabilityConfig({ towerLateralLoadShare: lateralShare });
    const before = TowerStability.evaluate(
        thinFixture(),
        { ...config, towerLateralLoadShare: 0 }
    );
    const brace = entry("B", O, 4, 0);
    const entries = thinFixture(brace);
    const after = TowerStability.evaluate(entries, config);
    const beforeSource = groupFor(before, "I");
    const afterSource = groupFor(after, "I");
    const afterBrace = groupFor(after, "B");
    const lateral = afterSource.lateralLinks[0];
    const groundGroups = after.analysis.groups.filter(group => (
        group.supportLinks.some(link => link.supporterKey === "ground")
    ));
    const totalMass = entries.reduce((sum, current) => sum + current.block.cells.length, 0);
    const totalMoment = entries.reduce((sum, current) => sum + current.block.cells.reduce((value, cell) => (
        value + current.originX + cell[0] + 0.5
    ), 0), 0);

    assert.ok(supportFor(before, "I") <= CRITICAL_SUPPORT_THRESHOLD);
    assert.ok(supportFor(before, "I") > 0);
    assert.equal(before.diagnostics.collapsed, false);
    assert.ok(supportFor(after, "I") > supportFor(before, "I"));
    assert.ok(supportFor(after, "B") < 100);
    assert.equal(after.diagnostics.collapsed, false);
    assert.equal(afterSource.lateralLinks.length, 1);
    assert.ok(Math.abs(lateral.weight - lateralShare) < 0.000000001);
    assert.ok(Math.abs(beforeSource.supportedLoad - afterSource.supportedLoad - lateral.acceptedMass) < 0.000000001);
    assert.ok(Math.abs(beforeSource.supportedMoment - afterSource.supportedMoment - lateral.acceptedMoment) < 0.000000001);
    assert.ok(Math.abs(afterBrace.supportedLoad - O.length - lateral.acceptedMass) < 0.000000001);
    assert.ok(Math.abs(groundGroups.reduce((sum, group) => sum + group.supportedLoad, 0) - totalMass) < 0.000000001);
    assert.ok(Math.abs(groundGroups.reduce((sum, group) => sum + group.supportedMoment, 0) - totalMoment) < 0.000000001);

    const assessment = TowerStability.comparePlacement(before, after, brace);
    assert.ok(assessment.directSupportShare > 0);
    assert.ok(assessment.structuralValue > 0);
});

test("a hanging side attachment receives no lateral load or reinforcement attribution", () => {
    const config = fixedStabilityConfig({ towerLateralLoadShare: 0.4 });
    const before = TowerStability.evaluate(thinFixture(), config);
    const hanging = entry("H", O, 4, 1);
    const after = TowerStability.evaluate(thinFixture(hanging), config);

    assert.deepEqual(groupFor(after, "I").lateralLinks, []);
    assert.equal(TowerStability.comparePlacement(before, after, hanging).directSupportShare, 0);
});

test("zero share preserves ordinary downward load and rejects lateral scoring", () => {
    const config = fixedStabilityConfig({ towerLateralLoadShare: 0 });
    const brace = entry("B", O, 4, 0);
    const before = TowerStability.evaluate(thinFixture(), config);
    const after = TowerStability.evaluate(thinFixture(brace), config);

    assert.deepEqual(groupFor(after, "I").lateralLinks, []);
    assert.equal(groupFor(after, "I").supportedLoad, groupFor(before, "I").supportedLoad);
    assert.equal(groupFor(after, "I").supportedMoment, groupFor(before, "I").supportedMoment);
    assert.equal(TowerStability.comparePlacement(before, after, brace).directSupportShare, 0);
});

test("a brace whose only route reaches ground through the source is not independent", () => {
    const source = fakeGroup("source", 0, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 100
    });
    const brace = fakeGroup("brace", 1, { load: 1, capacity: 100 });
    connect(brace, source);

    assert.deepEqual(LateralBracing.allocate([source, brace], 0.4), []);
});

test("lateral evaluation is independent of entry ordering", () => {
    const config = fixedStabilityConfig({ towerLateralLoadShare: 0.4 });
    const entries = thinFixture(entry("B", O, 4, 0));
    const forward = TowerStability.evaluate(entries, config);
    const reverse = TowerStability.evaluate(entries.slice().reverse(), config);
    const normalize = result => result.analysis.groups.map(group => ({
        ids: group.memberBlockIds,
        load: group.supportedLoad,
        moment: group.supportedMoment,
        lateral: group.lateralLinks
    })).sort((left, right) => left.ids.join("|").localeCompare(right.ids.join("|")));

    assert.deepEqual(normalize(forward), normalize(reverse));
    assert.deepEqual(
        forward.supportStability.map(state => [state.blockId, state.supportStability]).sort(),
        reverse.supportStability.map(state => [state.blockId, state.supportStability]).sort()
    );
    assert.equal(forward.stability, reverse.stability);
    assert.equal(forward.diagnostics.collapsed, reverse.diagnostics.collapsed);
});

test("allocation clips at physical headroom", () => {
    const source = fakeGroup("source", 0, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 20
    });
    const brace = fakeGroup("brace", 1, {
        ground: true,
        load: 9,
        mass: 1,
        risk: 0.1,
        ratio: 0.1,
        capacity: 10
    });
    const transfers = LateralBracing.allocate([source, brace], 0.4);

    assert.equal(transfers.length, 1);
    assert.ok(Math.abs(transfers[0].acceptedMass - 1) < 0.000000001);
});

test("exhausted assisting headroom rejects transfer", () => {
    const source = fakeGroup("source", 0, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 20
    });
    const brace = fakeGroup("brace", 1, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.1,
        ratio: 0.1,
        capacity: 10
    });

    assert.deepEqual(LateralBracing.allocate([source, brace], 0.4), []);
});

test("configured share is a cap and raising it does not reduce accepted transfer", () => {
    const source = fakeGroup("source", 1, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 100
    });
    const left = fakeGroup("left", 0, { ground: true, load: 1, capacity: 100 });
    const right = fakeGroup("right", 2, { ground: true, load: 1, capacity: 100 });
    const accepted = share => LateralBracing.allocate([right, source, left], share)
        .reduce((sum, transfer) => sum + transfer.acceptedMass, 0);

    assert.ok(Math.abs(accepted(0.2) - 2) < 0.000000001);
    assert.ok(Math.abs(accepted(0.4) - 4) < 0.000000001);
    assert.ok(accepted(0.4) <= source.loadMass * 0.4 + 0.000000001);
});

test("a branch rejoining the source path reserves only its exclusive headroom", () => {
    const common = fakeGroup("common", 8, {
        ground: true,
        load: 11,
        mass: 1,
        capacity: 11
    });
    const source = fakeGroup("source", 0, {
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 100
    });
    const brace = fakeGroup("brace", 1, { load: 1, capacity: 100 });
    connect(source, common);
    connect(brace, common);

    const transfers = LateralBracing.allocate([source, brace, common], 0.4);

    assert.equal(transfers.length, 1);
    assert.ok(Math.abs(transfers[0].acceptedMass - 4) < 0.000000001);
    assert.equal(transfers[0].pathShares.has(common), false);
});

test("two braces split one shared bottleneck without double-claiming headroom", () => {
    const left = fakeGroup("left", 0, { load: 1, capacity: 100 });
    const source = fakeGroup("source", 1, {
        ground: true,
        load: 10,
        mass: 1,
        risk: 0.8,
        ratio: 0.8,
        capacity: 100
    });
    const right = fakeGroup("right", 2, { load: 1, capacity: 100 });
    const bottleneck = fakeGroup("bottleneck", 8, {
        ground: true,
        load: 2,
        capacity: 4
    });
    connect(left, bottleneck);
    connect(right, bottleneck);

    const forward = LateralBracing.allocate([left, source, right, bottleneck], 0.4);
    const reverse = LateralBracing.allocate([bottleneck, right, source, left], 0.4);
    const summarize = transfers => transfers.map(transfer => [
        transfer.brace.key,
        transfer.acceptedMass
    ]).sort();

    assert.deepEqual(summarize(forward), [["left", 1], ["right", 1]]);
    assert.deepEqual(summarize(reverse), summarize(forward));
    assert.equal(forward.reduce((sum, transfer) => sum + transfer.acceptedMass, 0), 2);
});
