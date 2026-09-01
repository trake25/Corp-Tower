const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const DebugConfig = require("../app/Debug_Config");
const Classification = require("../app/Tunable_Classification");
const {
    GameConfig,
    createPlayingEngine,
    originalGameConfig,
    QA_TUNING_BASELINE,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function configLeafPaths(value, prefix = "") {
    if (Array.isArray(value) || value === null || typeof value !== "object") {
        return [prefix];
    }

    return Object.entries(value).flatMap(([key, child]) => {
        const path = prefix ? `${prefix}.${key}` : key;
        return configLeafPaths(child, path);
    });
}

function valueAtPath(value, path) {
    return path.split(".").reduce((owner, key) => owner[key], value);
}

test("tunable classification has one approved class per entry", () => {
    const classifications = new Set(Classification.CLASSIFICATION_ENTRIES.map(entry => entry.classification));
    const identifiers = Classification.CLASSIFICATION_ENTRIES.map(entry => `${entry.scope}:${entry.path}`);

    assert.deepEqual(
        [...classifications].sort(),
        Object.values(Classification.TUNABLE_CLASSES).sort()
    );
    assert.equal(new Set(identifiers).size, identifiers.length);
});

test("every current Game Config leaf has exactly one server classification", () => {
    const actualPaths = configLeafPaths(GameConfig).sort();
    const classifiedEntries = Classification.CLASSIFICATION_ENTRIES.filter(entry => {
        return entry.scope === "server";
    });
    const classifiedPaths = classifiedEntries.map(entry => entry.path).sort();

    assert.deepEqual(classifiedPaths, actualPaths);
    for (const path of actualPaths) {
        assert.equal(classifiedEntries.filter(entry => entry.path === path).length, 1);
    }
    assert.equal(classifiedPaths.includes("scoring"), false);
    assert.equal(classifiedPaths.includes("visualHooks"), false);
    assert.ok(classifiedPaths.includes("scoring.placementScorePerHeight"));
    assert.ok(classifiedPaths.includes("visualHooks.impactBeat"));
});

test("current omitted calibrations and private lobby timings are designer-only", () => {
    for (const path of [
        "targetHeightBase",
        "targetHeightStepBase",
        "targetHeightStepGrowth",
        "targetHeightStepGrowthEvery",
        "levelTimePlannedEfficiency",
        "levelTimeSlack",
        "levelTimeSlackMin",
        "levelTimeSlackFullLevel",
        "impactRecoverableFailures",
        "lobbyReadyTimeoutMs",
        "privateLobbyStartCountdownMs",
        "privateLobbyReconnectPhaseMs",
        "privateLobbyGracePhaseMs"
    ]) {
        assert.ok(Classification.SERVER_DESIGNER_ONLY_PATHS.includes(path));
    }
});

test("runtime classification agrees with the Debug Config writable surface", () => {
    const snapshot = DebugConfig.snapshot();

    assert.deepEqual(
        [...Classification.RUNTIME_EXPOSED_SERVER_KEYS].sort(),
        Object.keys(snapshot).sort()
    );
    assert.equal(
        new Set(Classification.RUNTIME_EXPOSED_SERVER_PATHS).size,
        Classification.RUNTIME_EXPOSED_SERVER_PATHS.length
    );
    for (const [key, path] of Object.entries(Classification.RUNTIME_EXPOSED_SERVER_FIELDS)) {
        assert.deepEqual(snapshot[key], valueAtPath(GameConfig, path));
    }
    for (const path of [
        "towerSiteSlendernessTarget",
        "towerSiteWidthMin",
        "towerSiteWidthMax"
    ]) {
        assert.ok(Classification.SERVER_DESIGNER_ONLY_PATHS.includes(path));
        assert.equal(Classification.RUNTIME_EXPOSED_SERVER_PATHS.includes(path), false);
    }
});

test("retired client controls are classified as designer-only", () => {
    for (const path of [
        "TowerStack.snap_radius_units",
        "TowerStack.drag_grip_offset_units",
        "TowerStack.ghost_alpha",
        "TowerStack.snap_dot_radius",
        "TowerStack.snap_target_radius",
        "TowerStack.scroll_start_ratio",
        "BackgroundParallax.sky.parallax_ratio",
        "BackgroundParallax.ground.ease_speed"
    ]) {
        assert.ok(Classification.CLIENT_DESIGNER_ONLY_PATHS.includes(path));
    }
});

test("true contracts do not overlap server or client tunables", () => {
    const tunablePaths = new Set([
        ...Classification.RUNTIME_EXPOSED_SERVER_PATHS,
        ...Classification.SERVER_DESIGNER_ONLY_PATHS,
        ...Classification.CLIENT_DESIGNER_ONLY_PATHS
    ]);

    for (const path of Classification.TRUE_CONTRACTS) {
        assert.equal(tunablePaths.has(path), false);
    }
});

test("the QA baseline covers every current Game Config leaf", () => {
    assert.deepEqual(
        configLeafPaths(QA_TUNING_BASELINE).sort(),
        configLeafPaths(originalGameConfig).sort()
    );
});

test("playing fixtures preserve current keys and install deterministic values", () => {
    const expectedKeys = Object.keys(originalGameConfig).sort();
    const expectedPaths = configLeafPaths(originalGameConfig).sort();
    GameConfig.targetHeightBase = QA_TUNING_BASELINE.targetHeightBase + 100;
    GameConfig.lobbyReadyTimeoutMs = QA_TUNING_BASELINE.lobbyReadyTimeoutMs + 100;

    createPlayingEngine(1, 8);

    assert.deepEqual(Object.keys(GameConfig).sort(), expectedKeys);
    assert.deepEqual(configLeafPaths(GameConfig).sort(), expectedPaths);
    assert.equal(GameConfig.targetHeightBase, QA_TUNING_BASELINE.targetHeightBase);
    assert.equal(GameConfig.lobbyReadyTimeoutMs, QA_TUNING_BASELINE.lobbyReadyTimeoutMs);
    for (const path of expectedPaths) {
        assert.notEqual(valueAtPath(GameConfig, path), undefined);
    }
});

test("playing fixtures accept explicit tunable overrides", () => {
    const { engine } = createPlayingEngine(1, 8, {
        tunables: {
            towerGridWidth: 14,
            towerStabilityDifficulty: 60
        }
    });

    assert.equal(GameConfig.towerGridWidth, 14);
    assert.equal(GameConfig.towerStabilityDifficulty, 60);
    assert.equal(engine.getSiteWidthForHeight(8), QA_TUNING_BASELINE.towerSiteWidthMin);
});

test("fixture reset restores the original real Game Config state", () => {
    const expected = clone(originalGameConfig);
    createPlayingEngine(1, 8, {
        tunables: {
            targetHeightBase: QA_TUNING_BASELINE.targetHeightBase + 10
        }
    });
    delete GameConfig.lobbyReadyTimeoutMs;
    GameConfig.fixtureOnlyKey = true;

    resetFixtures();

    assert.deepEqual(GameConfig, expected);
});
