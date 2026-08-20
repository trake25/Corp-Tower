const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const LobbyManager = require("../app/Lobby_Manager");
const {
    GameConfig,
    createPlayingEngine,
    latestMessage,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

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
            "towerStabilityMinHeight",
            "towerHeightPressureGain"
        ]) {
            assert.equal(await lobbyManager.updateDebugConfig(key, 1), false, key);
            assert.equal(GameConfig[key], undefined, key);
        }
    } finally {
        GameConfig.towerStabilityDifficulty = original;
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

// The bug this pins: a perfectly centred brick used to read as a loss, and the
// loss grew with height and level, because the stability score is
// min(lean, integrity) and sags on its own as the tower matures.

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

