"use strict";

const { spawn } = require("node:child_process");
const { cpus, platform, totalmem } = require("node:os");
const { createWriteStream, mkdirSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");

const SERVER = resolve(__dirname, "..");
const ROOT = resolve(SERVER, "../..");
const ARTIFACTS = join(ROOT, "task", "balance-runs");
const HEARTBEAT_SECONDS = 5;

function positiveInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number) || number < 1) {
        throw new Error(`${label} must be a positive integer`);
    }
    return number;
}

function hostProfile(host = { platform: platform(), cpuCount: cpus().length, memoryBytes: totalmem() }) {
    const memoryGiB = Math.round((host.memoryBytes / (1024 ** 3)) * 10) / 10;
    const constrained = host.cpuCount <= 4 || memoryGiB < 8;
    const standard = !constrained && (host.cpuCount < 8 || memoryGiB < 16);
    const tier = constrained ? "constrained" : standard ? "standard" : "performance";
    const limits = {
        constrained: { maxUnits: 24, deadlineSeconds: 45, maxDeadlineSeconds: 180 },
        standard: { maxUnits: 120, deadlineSeconds: 180, maxDeadlineSeconds: 600 },
        performance: { maxUnits: 400, deadlineSeconds: 600, maxDeadlineSeconds: 1800 }
    }[tier];
    return { platform: host.platform, cpuCount: host.cpuCount, memoryGiB, tier, ...limits };
}

function parseCli(argv) {
    const [kind, ...args] = argv;
    if (!["simulate", "stability", "probe", "impact"].includes(kind)) {
        throw new Error("usage: Balance_Run.js <simulate|stability|probe|impact> [levels] [runs] [--allow-expensive] [--max-seconds N]");
    }
    const values = [];
    let allowExpensive = false;
    let maxSeconds = null;
    for (let index = 0; index < args.length; index++) {
        const arg = args[index];
        if (arg === "--allow-expensive") {
            allowExpensive = true;
            continue;
        }
        if (arg === "--max-seconds") {
            maxSeconds = positiveInteger(args[++index], "--max-seconds");
            continue;
        }
        if (arg.startsWith("--")) {
            throw new Error(`unknown option ${arg}`);
        }
        values.push(arg);
    }
    if (kind === "probe" && values.length) {
        throw new Error("balance:probe accepts no numeric sample arguments");
    }
    if (kind !== "probe" && values.length > 2) {
        throw new Error(`${kind} accepts at most <levels> <runs>`);
    }
    return {
        kind,
        levels: values[0] ? positiveInteger(values[0], "levels") : null,
        runs: values[1] ? positiveInteger(values[1], "runs") : null,
        allowExpensive,
        maxSeconds
    };
}

function planRun(input, profile = hostProfile()) {
    const defaults = {
        simulate: { levels: 1, runs: 1 },
        stability: { levels: 5, runs: 1 },
        impact: { levels: 1, runs: 1 }
    };
    const levels = input.levels || defaults[input.kind]?.levels || null;
    const runs = input.runs || defaults[input.kind]?.runs || null;
    let script;
    let args;
    let workUnits;
    let runProfile = "full";
    if (input.kind === "simulate") {
        script = "Balance_Simulator.js";
        args = [String(levels), String(runs)];
        workUnits = 2 * levels * runs;
    } else if (input.kind === "stability") {
        script = "Balance_Simulator.js";
        args = ["sweep", String(levels), String(runs)];
        workUnits = 12 * Math.ceil(levels / 5) * runs;
    } else if (input.kind === "impact") {
        script = "Impact_Balance_Probe.js";
        args = [String(levels), String(runs)];
        workUnits = levels * (levels + 1) * runs;
    } else {
        script = "Stability_Probe.js";
        runProfile = input.allowExpensive ? "full" : "pilot";
        args = [];
        workUnits = runProfile === "pilot" ? 14 : 1200;
    }
    const exceedsBudget = workUnits > profile.maxUnits;
    if (!input.allowExpensive && exceedsBudget) {
        throw new Error(
            `${input.kind} requests ${workUnits} work units; ${profile.tier} hosts allow ${profile.maxUnits}. ` +
            "Use smaller samples or pass --allow-expensive with an explicit --max-seconds deadline."
        );
    }
    if (input.allowExpensive && exceedsBudget && !input.maxSeconds) {
        throw new Error("--allow-expensive requires an explicit --max-seconds deadline when the host budget is exceeded");
    }
    const deadlineSeconds = input.maxSeconds || profile.deadlineSeconds;
    if (deadlineSeconds > profile.maxDeadlineSeconds) {
        throw new Error(`${profile.tier} hosts cap --max-seconds at ${profile.maxDeadlineSeconds}`);
    }
    return { ...profile, kind: input.kind, script, args, levels, runs, workUnits, runProfile, deadlineSeconds };
}

function artifactPaths(kind) {
    mkdirSync(ARTIFACTS, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
    const base = `${stamp}-${kind}-${process.pid}`;
    return {
        stdout: join(ARTIFACTS, `${base}.stdout`),
        stderr: join(ARTIFACTS, `${base}.stderr`)
    };
}

function runPlan(plan) {
    const artifacts = artifactPaths(plan.kind);
    const stdout = createWriteStream(artifacts.stdout);
    const stderr = createWriteStream(artifacts.stderr);
    const startedAt = Date.now();
    let timedOut = false;
    let stdoutBytes = 0;
    let stderrBytes = 0;
    const child = spawn(process.execPath, [join(__dirname, plan.script), ...plan.args], {
        cwd: SERVER,
        env: { ...process.env, BALANCE_RUN_PROFILE: plan.runProfile },
        stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => {
        stdoutBytes += chunk.length;
        stdout.write(chunk);
    });
    child.stderr.on("data", chunk => {
        stderrBytes += chunk.length;
        stderr.write(chunk);
    });
    const runId = relative(ROOT, artifacts.stdout).replaceAll("\\", "/");
    console.log(JSON.stringify({
        event: "balance.start",
        kind: plan.kind,
        profile: plan.tier,
        platform: plan.platform,
        cpuCount: plan.cpuCount,
        memoryGiB: plan.memoryGiB,
        workUnits: plan.workUnits,
        deadlineSeconds: plan.deadlineSeconds,
        artifact: runId
    }));
    const heartbeat = setInterval(() => {
        console.log(JSON.stringify({
            event: "balance.heartbeat",
            kind: plan.kind,
            elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
            deadlineSeconds: plan.deadlineSeconds,
            artifact: runId
        }));
    }, HEARTBEAT_SECONDS * 1000);
    const deadline = setTimeout(() => {
        timedOut = true;
        child.kill();
        setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, plan.deadlineSeconds * 1000);
    return new Promise((resolveRun, rejectRun) => {
        child.once("error", rejectRun);
        child.once("close", (code, signal) => {
            clearInterval(heartbeat);
            clearTimeout(deadline);
            stdout.end();
            stderr.end();
            Promise.all([
                new Promise(done => stdout.once("finish", done)),
                new Promise(done => stderr.once("finish", done))
            ]).then(() => {
                const status = timedOut ? "timeout" : code === 0 ? "complete" : "failed";
                console.log(JSON.stringify({
                    event: `balance.${status}`,
                    kind: plan.kind,
                    elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
                    exitCode: timedOut ? 124 : code,
                    signal,
                    stdoutBytes,
                    stderrBytes,
                    artifact: runId
                }));
                resolveRun(timedOut ? 124 : code || 1);
            }, rejectRun);
        });
    });
}

async function main() {
    const plan = planRun(parseCli(process.argv.slice(2)));
    process.exitCode = await runPlan(plan);
}

if (require.main === module) {
    main().catch(error => {
        console.error(`balance.guardrail: ${error.message}`);
        process.exitCode = 2;
    });
}

module.exports = { hostProfile, parseCli, planRun };
