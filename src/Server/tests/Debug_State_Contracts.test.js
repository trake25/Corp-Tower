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

        assert.equal(await lobbyManager.updateDebugConfig("towerOverhangWeight", 1), false);
        assert.equal(GameConfig.towerOverhangWeight, undefined);
    } finally {
        GameConfig.towerStabilityDifficulty = original;
    }
});

test("Last Chance power toggle round-trips through debug config and resets", async () => {
    const lobbyManager = new LobbyManager();

    assert.equal(lobbyManager.getDebugConfig().powerLastChanceEnabled, false);
    await lobbyManager.updateDebugConfig("powerLastChanceEnabled", true);
    assert.equal(GameConfig.powerLastChanceEnabled, true);
    assert.equal(lobbyManager.getDebugConfig().powerLastChanceEnabled, true);

    await lobbyManager.updateDebugConfig("resetDebugConfig", true);
    assert.equal(GameConfig.powerLastChanceEnabled, false);
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
