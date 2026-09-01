const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const DebugConfig = require("../app/Debug_Config");
const Classification = require("../app/Tunable_Classification");
const {
    GameConfig,
    createPlayingEngine,
    QA_TUNING_BASELINE,
    resetFixtures
} = require("./helpers/Game_Engine_Fixture");

afterEach(resetFixtures);

test("tunable classification has one approved class per entry", () => {
    const classifications = new Set(Classification.CLASSIFICATION_ENTRIES.map(entry => entry.classification));
    const identifiers = Classification.CLASSIFICATION_ENTRIES.map(entry => `${entry.scope}:${entry.path}`);

    assert.deepEqual(
        [...classifications].sort(),
        Object.values(Classification.TUNABLE_CLASSES).sort()
    );
    assert.equal(new Set(identifiers).size, identifiers.length);
});

test("runtime classification agrees with the Debug Config writable surface", () => {
    assert.deepEqual(
        [...Classification.RUNTIME_EXPOSED_SERVER_KEYS].sort(),
        Object.keys(DebugConfig.snapshot()).sort()
    );
    for (const key of ["towerSiteSlendernessTarget", "towerSiteWidthMin", "towerSiteWidthMax"]) {
        assert.ok(Classification.SERVER_DESIGNER_ONLY_PATHS.includes(key));
        assert.equal(Classification.RUNTIME_EXPOSED_SERVER_KEYS.includes(key), false);
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
        ...Classification.RUNTIME_EXPOSED_SERVER_KEYS,
        ...Classification.SERVER_DESIGNER_ONLY_PATHS,
        ...Classification.CLIENT_DESIGNER_ONLY_PATHS
    ]);

    for (const path of Classification.TRUE_CONTRACTS) {
        assert.equal(tunablePaths.has(path), false);
    }
});

test("the QA baseline covers the classified fixture inputs", () => {
    assert.deepEqual(
        Object.keys(QA_TUNING_BASELINE).sort(),
        [...Classification.SERVER_QA_BASELINE_PATHS].sort()
    );
});

test("playing fixtures replace live calibration and accept explicit overrides", () => {
    GameConfig.towerGridWidth = 99;
    GameConfig.towerStabilityDifficulty = 99;

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
