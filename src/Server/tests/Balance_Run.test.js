const assert = require("node:assert/strict");
const test = require("node:test");
const { hostProfile, parseCli, planRun } = require("../tools/Balance_Run");

const constrained = hostProfile({ platform: "linux", cpuCount: 4, memoryBytes: 4 * 1024 ** 3 });

test("constrained hosts default balance sampling to a bounded pilot", () => {
    const plan = planRun(parseCli(["simulate"]), constrained);

    assert.equal(plan.kind, "simulate");
    assert.equal(plan.workUnits, 2);
    assert.equal(plan.deadlineSeconds, 45);
    assert.deepEqual(plan.args, ["1", "1"]);
});

test("constrained hosts reject an oversized sample without explicit opt-in", () => {
    assert.throws(
        () => planRun(parseCli(["simulate", "20", "100"]), constrained),
        /requests 4000 work units/
    );
});

test("an explicit expensive run remains capped by the host deadline", () => {
    assert.throws(
        () => planRun(parseCli(["simulate", "20", "100", "--allow-expensive"]), constrained),
        /requires an explicit --max-seconds/
    );
    const plan = planRun(parseCli(["simulate", "20", "100", "--allow-expensive", "--max-seconds", "180"]), constrained);

    assert.equal(plan.workUnits, 4000);
    assert.equal(plan.deadlineSeconds, 180);
    assert.throws(
        () => planRun(parseCli(["simulate", "--max-seconds", "181"]), constrained),
        /cap --max-seconds at 180/
    );
});

test("stability probes use the pilot profile until explicitly expanded", () => {
    const pilot = planRun(parseCli(["probe"]), constrained);
    const full = planRun(parseCli(["probe", "--allow-expensive", "--max-seconds", "180"]), constrained);

    assert.equal(pilot.runProfile, "pilot");
    assert.equal(pilot.workUnits, 14);
    assert.equal(full.runProfile, "full");
    assert.equal(full.workUnits, 1200);
});
