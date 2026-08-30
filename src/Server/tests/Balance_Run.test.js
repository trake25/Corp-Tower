const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");
const { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, utimesSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { artifactPaths, artifactRoot, cleanupArtifacts, hostProfile, parseCli, planRun, runPlan } = require("../tools/Balance_Run");

function fixtureRoot() {
    return mkdtempSync(join(tmpdir(), "corp-tower-balance-run-test-"));
}

function makeRun(root, name, ageMs = 0) {
    const directory = join(root, name);
    mkdirSync(directory, { recursive: true });
    const modifiedAt = new Date(Date.now() - ageMs);
    utimesSync(directory, modifiedAt, modifiedAt);
    return directory;
}

function fakeSpawn() {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => true;
    setImmediate(() => {
        child.stdout.emit("data", Buffer.from("simulated stdout"));
        child.stderr.emit("data", Buffer.from("simulated stderr"));
        child.emit("close", 0, null);
    });
    return child;
}

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

test("artifacts resolve in an injected temp namespace, never task material", () => {
    const root = fixtureRoot();
    try {
        const artifacts = artifactPaths("simulate", { root: artifactRoot(root), now: 0, unique: "one" });

        assert.ok(artifacts.root.startsWith(root));
        assert.ok(!artifacts.root.includes(`${require("node:path").sep}task${require("node:path").sep}`));
        assert.ok(existsSync(artifacts.runDirectory));
        assert.match(artifacts.stdout, /stdout\.log$/);
        assert.match(artifacts.stderr, /stderr\.log$/);
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("cleanup removes stale runs while retaining recent runs within the limit", () => {
    const root = fixtureRoot();
    try {
        const now = Date.now();
        makeRun(root, "stale", 24 * 60 * 60 * 1000 + 60 * 1000);
        makeRun(root, "recent-one", 1000);
        makeRun(root, "recent-two", 2000);

        cleanupArtifacts(root, now);

        const retained = readdirSync(root).sort();
        assert.deepEqual(retained, ["recent-one", "recent-two"]);
        assert.ok(!retained.includes("stale"));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("cleanup prunes the oldest recent runs above the retention limit", () => {
    const root = fixtureRoot();
    try {
        const now = Date.now();
        for (let index = 0; index < 12; index++) makeRun(root, `recent-${index}`, 1000 + index);

        cleanupArtifacts(root, now);

        const retained = readdirSync(root).sort();
        assert.equal(retained.length, 10);
        assert.ok(!retained.includes("recent-11"));
        assert.ok(!retained.includes("recent-10"));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});

test("cleanup only removes immediate run directories under its root", () => {
    const fixture = fixtureRoot();
    const root = join(fixture, "balance-runs");
    const sibling = join(fixture, "sibling");
    try {
        makeRun(root, "stale", 24 * 60 * 60 * 1000 + 60 * 1000);
        makeRun(sibling, "must-survive");

        cleanupArtifacts(root, Date.now());

        assert.ok(existsSync(sibling));
        assert.deepEqual(readdirSync(sibling), ["must-survive"]);
    } finally {
        rmSync(fixture, { recursive: true, force: true });
    }
});

test("a cleanup warning leaves the planned run and its isolated logs available", async () => {
    const root = fixtureRoot();
    const messages = { log: [], warn: [] };
    const output = { log: message => messages.log.push(JSON.parse(message)), warn: message => messages.warn.push(JSON.parse(message)) };
    try {
        const code = await runPlan(planRun(parseCli(["simulate"]), constrained), {
            artifacts: { root, cleanup: () => { throw new Error("cleanup unavailable"); }, unique: "warning" },
            output,
            spawn: fakeSpawn
        });

        assert.equal(code, 1);
        assert.equal(messages.warn.length, 1);
        assert.equal(messages.warn[0].event, "balance.cleanup");
        const started = messages.log.find(message => message.event === "balance.start");
        assert.ok(started.artifact.startsWith(root));
        assert.ok(existsSync(join(started.artifact, "stdout.log")));
        assert.ok(existsSync(join(started.artifact, "stderr.log")));
    } finally {
        rmSync(root, { recursive: true, force: true });
    }
});
