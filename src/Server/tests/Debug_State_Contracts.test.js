const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { afterEach, test } = require("node:test");

const LobbyManager = require("../app/Lobby_Manager");
const { handleMessage } = require("../app/Server");
const {
    GameConfig,
    createPlayingEngine,
    latestMessage,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

function readGameConfig(env = {}) {
    const configPath = require.resolve("../app/Game_Config");
    const cachedModule = require.cache[configPath];
    const originalEnv = Object.fromEntries(Object.keys(env).map(name => [name, process.env[name]]));

    try {
        Object.assign(process.env, env);
        delete require.cache[configPath];
        return require("../app/Game_Config");
    } finally {
        for (const [name, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[name];
            } else {
                process.env[name] = value;
            }
        }
        require.cache[configPath] = cachedModule;
    }
}

test("latency pings echo only their nonce to the originating socket", async () => {
    const sent = [];
    const player = {
        id: "player-one",
        ws: { send: message => sent.push(JSON.parse(message)) }
    };

    await handleMessage(player, Buffer.from(JSON.stringify({
        type: "latency_ping",
        nonce: "probe-1"
    })));

    assert.deepEqual(sent, [{ type: "latency_pong", nonce: "probe-1" }]);
});

test("malformed latency pings do not emit a pong", async () => {
    const sent = [];
    const player = {
        id: "player-one",
        ws: { send: message => sent.push(message) }
    };

    await handleMessage(player, Buffer.from(JSON.stringify({ type: "latency_ping", nonce: 1 })));

    assert.deepEqual(sent, []);
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

test("Recovery score percentage is exposed and clamped from zero to one hundred", async () => {
    const lobbyManager = new LobbyManager();

    await lobbyManager.updateDebugConfig("recoveryHeightScorePercent", -10);
    assert.equal(GameConfig.scoring.recoveryHeightScorePercent, 0);
    await lobbyManager.updateDebugConfig("recoveryHeightScorePercent", 55);
    assert.equal(GameConfig.scoring.recoveryHeightScorePercent, 55);
    await lobbyManager.updateDebugConfig("recoveryHeightScorePercent", 120);
    assert.equal(lobbyManager.getDebugConfig().recoveryHeightScorePercent, 100);
});

test("stability difficulty and lateral share are the exposed stability tunables", async () => {
    const lobbyManager = new LobbyManager();
    const originalDifficulty = GameConfig.towerStabilityDifficulty;
    const originalLateralShare = GameConfig.towerLateralLoadShare;

    try {
        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", 250);
        assert.equal(GameConfig.towerStabilityDifficulty, 100);

        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", -40);
        assert.equal(GameConfig.towerStabilityDifficulty, 0);

        await lobbyManager.updateDebugConfig("towerStabilityDifficulty", 65);
        assert.equal(lobbyManager.getDebugConfig().towerStabilityDifficulty, 65);

        await lobbyManager.updateDebugConfig("towerLateralLoadShare", -1);
        assert.equal(GameConfig.towerLateralLoadShare, 0);
        await lobbyManager.updateDebugConfig("towerLateralLoadShare", 2);
        assert.equal(GameConfig.towerLateralLoadShare, 1);
        await lobbyManager.updateDebugConfig("towerLateralLoadShare", 0.4);
        assert.equal(lobbyManager.getDebugConfig().towerLateralLoadShare, 0.4);

        assert.equal(await lobbyManager.updateDebugConfig("towerOverhangWeight", 1), false);
        assert.equal(GameConfig.towerOverhangWeight, undefined);
    } finally {
        GameConfig.towerStabilityDifficulty = originalDifficulty;
        GameConfig.towerLateralLoadShare = originalLateralShare;
    }
});

test("stability tuning invalidates cached analysis without mutating the standing tower", async () => {
    const lobbyManager = new LobbyManager();
    const sent = [];
    const state = {
        state: "playing",
        towerStability: 37,
        towerStabilityResult: { stability: 37 },
        towerBlocks: [{ block: { id: "I" }, supportStability: 37 }]
    };
    lobbyManager.rooms = [{
        players: [{
            id: "P1",
            ws: { readyState: 1, send: value => sent.push(JSON.parse(value)) }
        }],
        engine: { room: state, stopBots() {} }
    }];
    
    const originalDifficulty = GameConfig.towerStabilityDifficulty;
const originalLateralShare = GameConfig.towerLateralLoadShare;

    await lobbyManager.updateDebugConfig("towerLateralLoadShare", 0.65);

    assert.equal(state.towerStabilityResult, null);
    assert.equal(state.towerStability, 37);
    assert.equal(state.towerBlocks[0].supportStability, 37);
    assert.equal(sent.at(-1).type, "debug_config");
    assert.equal(sent.at(-1).config.towerLateralLoadShare, 0.65);

    const currentCache = { stability: 37 };
    state.towerStabilityResult = currentCache;
    await lobbyManager.updateDebugConfig("towerLateralLoadShare", 0.65);
    assert.equal(state.towerStabilityResult, currentCache);

    await lobbyManager.updateDebugConfig("resetDebugConfig", true);
assert.equal(GameConfig.towerStabilityDifficulty, originalDifficulty);
assert.equal(GameConfig.towerLateralLoadShare, originalLateralShare);
assert.equal(state.towerStabilityResult, null);
assert.equal(state.towerBlocks[0].supportStability, 37);

test("Last Chance power toggle round-trips through debug config and resets", async () => {
    const lobbyManager = new LobbyManager();

    assert.equal(lobbyManager.getDebugConfig().powerLastChanceEnabled, false);
    await lobbyManager.updateDebugConfig("powerLastChanceEnabled", true);
    assert.equal(GameConfig.powerLastChanceEnabled, true);
    assert.equal(lobbyManager.getDebugConfig().powerLastChanceEnabled, true);

    await lobbyManager.updateDebugConfig("resetDebugConfig", true);
    assert.equal(GameConfig.powerLastChanceEnabled, false);
});

test("latency indicator toggle round-trips through debug config and resets", async () => {
    const lobbyManager = new LobbyManager();

    assert.equal(lobbyManager.getDebugConfig().showLatencyIndicator, true);
    await lobbyManager.updateDebugConfig("showLatencyIndicator", true);
    assert.equal(GameConfig.showLatencyIndicator, true);
    assert.equal(lobbyManager.getDebugConfig().showLatencyIndicator, true);

    await lobbyManager.updateDebugConfig("resetDebugConfig", true);
    assert.equal(GameConfig.showLatencyIndicator, true);
});

test("diagnostic defaults stay enabled outside EKS and EKS overrides disable them", () => {
    const developmentConfig = readGameConfig();
    const eksConfig = readGameConfig({
        CORP_TOWER_LATENCY_INDICATOR_ENABLED: "false",
        CORP_TOWER_LIVE_PREVIEW_ENABLED: "false"
    });
    const eksDeployment = fs.readFileSync(path.resolve(
        __dirname,
        "../../../infra/eks/apps/corp-tower/base/server-deployment.yaml"
    ), "utf8");
    const demoLauncher = fs.readFileSync(path.resolve(
        __dirname,
        "../../../scripts/backup/backup-server-up.sh"
    ), "utf8");

    assert.equal(developmentConfig.showLatencyIndicator, true);
    assert.equal(developmentConfig.towerStabilityFeedbackMode, "live_preview");
    assert.equal(eksConfig.showLatencyIndicator, false);
    assert.equal(eksConfig.towerStabilityFeedbackMode, "warnings_only");
    assert.match(eksDeployment, /name: CORP_TOWER_LATENCY_INDICATOR_ENABLED\s+value: "false"/);
    assert.match(eksDeployment, /name: CORP_TOWER_LIVE_PREVIEW_ENABLED\s+value: "false"/);
    assert.match(demoLauncher, /CORP_TOWER_LIVE_PREVIEW_ENABLED=false/);
});

test("debug feedback supports runtime live preview but rejects the retired meter mode", async () => {
    const lobbyManager = new LobbyManager();

    assert.equal(await lobbyManager.updateDebugConfig("towerStabilityFeedbackMode", "warnings_only"), true);
    assert.equal(GameConfig.towerStabilityFeedbackMode, "warnings_only");
    assert.equal(await lobbyManager.updateDebugConfig("towerStabilityFeedbackMode", "live_preview"), true);
    assert.equal(GameConfig.towerStabilityFeedbackMode, "live_preview");
    assert.equal(await lobbyManager.updateDebugConfig("towerStabilityFeedbackMode", "meter_only"), false);
    assert.equal(GameConfig.towerStabilityFeedbackMode, "live_preview");
});

test("transaction scoring controls clamp and reject unknown scoring keys", async () => {
    const lobbyManager = new LobbyManager();
    const original = {
        dangerousHeightFloor: GameConfig.scoring.dangerousHeightFloor,
        strongReinforcementActionShare: GameConfig.scoring.strongReinforcementActionShare,
        normalCombinedCapActionShare: GameConfig.scoring.normalCombinedCapActionShare,
        criticalSaveBonusActionShare: GameConfig.scoring.criticalSaveBonusActionShare,
        criticalCombinedCapActionShare: GameConfig.scoring.criticalCombinedCapActionShare
    };

    try {
        await lobbyManager.updateDebugConfig("dangerousHeightFloor", 0);
        await lobbyManager.updateDebugConfig("strongReinforcementActionShare", 2);
        await lobbyManager.updateDebugConfig("normalCombinedCapActionShare", 10);
        await lobbyManager.updateDebugConfig("criticalSaveBonusActionShare", 10);
        await lobbyManager.updateDebugConfig("criticalCombinedCapActionShare", 10);

        assert.equal(GameConfig.scoring.dangerousHeightFloor, 0.1);
        assert.equal(GameConfig.scoring.strongReinforcementActionShare, 1);
        assert.equal(GameConfig.scoring.normalCombinedCapActionShare, 3);
        assert.equal(GameConfig.scoring.criticalSaveBonusActionShare, 2);
        assert.equal(GameConfig.scoring.criticalCombinedCapActionShare, 3);

        assert.equal(await lobbyManager.updateDebugConfig("reinforceScorePerIntegrity", 1), false);
        assert.equal(GameConfig.scoring.reinforceScorePerIntegrity, undefined);
    } finally {
        Object.assign(GameConfig.scoring, original);
    }
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

test("game state carries the room's visual hook config", () => {
    const { engine, messages } = createPlayingEngine(1, 8);

    engine.broadcastGameState();

    const state = latestMessage(messages);

    assert.equal(typeof state.visualHooks, "object");
    assert.equal(state.visualHooks.impactBeat, GameConfig.visualHooks.impactBeat);
    assert.equal(state.visualHooks.screenShake, GameConfig.visualHooks.screenShake);

    // The durations ride game_state either way, whether or not the debug menu
    // has ever touched them.
    assert.equal(
        state.visualHooks.impactBeatWaveMs,
        GameConfig.visualHooks.impactBeatWaveMs
    );
    assert.equal(
        state.visualHooks.screenShakeMagnitudeUnits,
        GameConfig.visualHooks.screenShakeMagnitudeUnits
    );
});

test("visual hook toggles and durations round-trip through debug config and reset", async () => {
    const lobbyManager = new LobbyManager();
    const previousImpactBeat = GameConfig.visualHooks.impactBeat;
    const previousScreenShake = GameConfig.visualHooks.screenShake;
    const previousZoomOutMs = GameConfig.visualHooks.impactBeatZoomOutMs;
    const previousWaveMs = GameConfig.visualHooks.impactBeatWaveMs;
    const previousHoldMs = GameConfig.visualHooks.impactBeatHoldMs;
    const previousShakeMs = GameConfig.visualHooks.screenShakeMs;

    try {
        await lobbyManager.updateDebugConfig("visualHookImpactBeat", false);
        await lobbyManager.updateDebugConfig("visualHookScreenShake", false);
        await lobbyManager.updateDebugConfig("visualHookZoomOutMs", 900);
        await lobbyManager.updateDebugConfig("visualHookWaveMs", 900);
        await lobbyManager.updateDebugConfig("visualHookHoldMs", 900);
        await lobbyManager.updateDebugConfig("visualHookShakeMs", 900);

        assert.equal(GameConfig.visualHooks.impactBeat, false);
        assert.equal(GameConfig.visualHooks.screenShake, false);
        assert.equal(GameConfig.visualHooks.impactBeatZoomOutMs, 900);
        assert.equal(GameConfig.visualHooks.impactBeatWaveMs, 900);
        assert.equal(GameConfig.visualHooks.impactBeatHoldMs, 900);
        assert.equal(GameConfig.visualHooks.screenShakeMs, 900);
        assert.equal(lobbyManager.getDebugConfig().visualHookImpactBeat, false);
        assert.equal(lobbyManager.getDebugConfig().visualHookScreenShake, false);
        assert.equal(lobbyManager.getDebugConfig().visualHookZoomOutMs, 900);
        assert.equal(lobbyManager.getDebugConfig().visualHookShakeMs, 900);

        // Out-of-range values clamp rather than being rejected.
        await lobbyManager.updateDebugConfig("visualHookZoomOutMs", 50000);
        assert.equal(GameConfig.visualHooks.impactBeatZoomOutMs, 2000);

        lobbyManager.applyDefaultDebugConfig();

        assert.equal(GameConfig.visualHooks.impactBeat, true);
        assert.equal(GameConfig.visualHooks.screenShake, true);
        assert.equal(GameConfig.visualHooks.impactBeatZoomOutMs, previousZoomOutMs);
        assert.equal(GameConfig.visualHooks.impactBeatWaveMs, previousWaveMs);
        assert.equal(GameConfig.visualHooks.impactBeatHoldMs, previousHoldMs);
        assert.equal(GameConfig.visualHooks.screenShakeMs, previousShakeMs);

        // A raw, un-prefixed key (e.g. matching the game_state field name
        // rather than the debug_config one) stays unmapped and is rejected.
        assert.equal(
            await lobbyManager.updateDebugConfig("impactBeatWaveMs", 100),
            false
        );
    } finally {
        GameConfig.visualHooks.impactBeat = previousImpactBeat;
        GameConfig.visualHooks.screenShake = previousScreenShake;
        GameConfig.visualHooks.impactBeatZoomOutMs = previousZoomOutMs;
        GameConfig.visualHooks.impactBeatWaveMs = previousWaveMs;
        GameConfig.visualHooks.impactBeatHoldMs = previousHoldMs;
        GameConfig.visualHooks.screenShakeMs = previousShakeMs;
    }
});
