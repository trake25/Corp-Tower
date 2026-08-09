"use strict";

// Deterministic stability calibration probe. Tooling only -- not required by
// the running server/client, not copied into the Docker image.
//
// The Balance Simulator's bots pick a max-stability placement every turn, so
// they build clean, symmetric towers with no wide-base-narrow-spire or
// overhang cases to sample -- see testing.md#balance-simulator. This script
// instead constructs a handful of canonical tower archetypes by hand at
// several heights and levels, and evaluates each directly against
// TowerStability.evaluate() through the same resolveStabilityConfig() path
// the server and Bot Manager use, so what it reports is calibrated against
// the real, resolved physics constants -- not a hand-copied approximation.

const GameEngine = require("../app/Game_Engine");
const TowerStability = require("../app/Tower_Stability");
const GameConfig = require("../app/Game_Config");

const LEVELS = [1, 5, 15, 25];
const HEIGHT_FRACTIONS = [0.1, 0.3, 0.6, 0.9, 1.0];

function createPlayers() {
    return [
        { id: "P1", score: 0 },
        { id: "P2", score: 0 },
        { id: "P3", score: 0 }
    ];
}

function withMutedConsole(callback) {
    const originalLog = console.log;

    console.log = () => {};

    try {
        return callback();
    } finally {
        console.log = originalLog;
    }
}

function createEngineForLevel(level) {
    const engine = new GameEngine();

    withMutedConsole(() => {
        engine.createRoom(createPlayers());
        engine.room.level = level;
        engine.room.impactLevel = level;
        engine.room.targetHeight = engine.getTargetHeightForLevel(level);
    });

    return engine;
}

// A single-row entry `width` cells wide, `width` cells wide at column
// `originX`, row `originY`. Not a real tetromino -- evaluate() only reads cell
// positions, so a synthetic rectangular row is the simplest way to author an
// exact tower shape by hand.
function rowEntry(width, originX, originY) {
    const cells = [];

    for (let x = 0; x < width; x++) {
        cells.push([x, 0]);
    }

    return { block: { cells: cells }, originX: originX, originY: originY };
}

function centeredOriginX(siteWidth, width) {
    return Math.max(0, Math.floor((siteWidth - width) / 2));
}

// Each archetype builds a `height`-tall tower on a `siteWidth`-wide plot.
const ARCHETYPES = {
    // Every row spans the whole site -- the best site usage a tower can post.
    wellPackedFullSite: (siteWidth, height) => {
        const entries = [];

        for (let y = 0; y < height; y++) {
            entries.push(rowEntry(siteWidth, 0, y));
        }

        return entries;
    },

    // Every row spans the width the supply model itself assumes a tower
    // occupies (getSupplyPackingEfficiency's effectiveWidth) -- the reference
    // density "playing to the game's own expectation" should read as safe.
    modelTypical: (siteWidth, height) => {
        const ratio = Math.max(0.1, Number(GameConfig.supplyEffectiveWidthRatio) || 0.5);
        const width = Math.max(1, Math.min(siteWidth, Math.round(siteWidth * ratio + 0.5)));
        const originX = centeredOriginX(siteWidth, width);
        const entries = [];

        for (let y = 0; y < height; y++) {
            entries.push(rowEntry(width, originX, y));
        }

        return entries;
    },

    // A full-width base for the first few rows, then a 2-wide spire the rest
    // of the way up -- the exploit the ground-row-only slenderness measure
    // used to miss entirely (see the plan's Context section).
    wideBaseNarrowSpire: (siteWidth, height) => {
        const entries = [];
        const baseRows = Math.min(3, height);

        for (let y = 0; y < baseRows; y++) {
            entries.push(rowEntry(siteWidth, 0, y));
        }

        const spireWidth = Math.min(2, siteWidth);
        const spireOriginX = centeredOriginX(siteWidth, spireWidth);

        for (let y = baseRows; y < height; y++) {
            entries.push(rowEntry(spireWidth, spireOriginX, y));
        }

        return entries;
    },

    // A 3-wide row that alternates left/right each row, so every row but the
    // first overhangs on one side -- exercises overhangPenalty and lean.
    overhangHeavy: (siteWidth, height) => {
        const width = Math.min(3, siteWidth);
        const maxOriginX = Math.max(0, siteWidth - width);
        const centerX = Math.floor(maxOriginX / 2);
        const entries = [];

        for (let y = 0; y < height; y++) {
            const shift = y % 2 === 0 ? 1 : -1;
            const originX = Math.max(0, Math.min(maxOriginX, centerX + shift));

            entries.push(rowEntry(width, originX, y));
        }

        return entries;
    },

    // Uniformly 2-wide from the ground up -- the height-optimal, stability-
    // free spire that motivated the two-axis Integrity redesign in the first
    // place (docs/context/backend.md).
    twoWideSpire: (siteWidth, height) => {
        const width = Math.min(2, siteWidth);
        const originX = centeredOriginX(siteWidth, width);
        const entries = [];

        for (let y = 0; y < height; y++) {
            entries.push(rowEntry(width, originX, y));
        }

        return entries;
    }
};

// Mirrors Balance_Simulator's sampleStability so the two tools report lean on
// the same 0-100 scale (100 = straight, 0 = at the collapse threshold).
function leanScore(diagnostics, config) {
    const collapseThreshold = Math.max(
        0.0001, Number(config.towerCollapseTiltScore) || 0.0001
    );

    return Math.round(
        (1 - Math.min(1, Math.abs(Number(diagnostics.tiltScore) || 0) / collapseThreshold)) * 100
    );
}

function run() {
    console.log(
        [
            "archetype", "level", "target", "siteWidth", "height", "heightFraction",
            "stability", "integrity", "lean", "slenderness", "heightProgress", "collapsed"
        ].join(",")
    );

    for (const level of LEVELS) {
        const engine = createEngineForLevel(level);
        const targetHeight = engine.room.targetHeight;
        const siteWidth = engine.getSiteWidthForHeight(targetHeight);
        const config = engine.resolveStabilityConfig(level);

        for (const [name, build] of Object.entries(ARCHETYPES)) {
            for (const fraction of HEIGHT_FRACTIONS) {
                const height = Math.max(1, Math.round(targetHeight * fraction));
                const entries = build(siteWidth, height);
                const result = TowerStability.evaluate(entries, config);
                const d = result.diagnostics;

                console.log(
                    [
                        name,
                        level,
                        targetHeight,
                        siteWidth,
                        height,
                        fraction.toFixed(2),
                        result.stability,
                        d.integrity,
                        leanScore(d, config),
                        d.slenderness.toFixed(2),
                        d.heightProgress.toFixed(2),
                        d.collapsed
                    ].join(",")
                );
            }
        }
    }
}

// A real regression, not a hypothetical: docs/context/backend.md records that
// a single narrow opening brick once
// collapsed 47% of runs at high pressure, because site usage is at its worst
// on the very first placement. Fails loudly rather than requiring a human to
// notice it in the CSV.
function assertOpeningBrickSurvives() {
    let failures = 0;

    for (const level of LEVELS) {
        const engine = createEngineForLevel(level);
        const config = engine.resolveStabilityConfig(level);
        const entries = [rowEntry(1, 0, 0)];
        const result = TowerStability.evaluate(entries, config);

        if (result.diagnostics.collapsed) {
            failures += 1;
            console.error(
                `FAIL: single opening brick collapses at level ${level} ` +
                `(stability ${result.stability})`
            );
        }
    }

    if (failures > 0) {
        throw new Error(`${failures} level(s) collapse on the opening brick alone`);
    }

    console.log("\nOK: single opening brick never collapses at any sampled level.");
}

if (require.main === module) {
    run();
    assertOpeningBrickSurvives();
}

module.exports = {
    ARCHETYPES,
    createEngineForLevel,
    leanScore,
    rowEntry
};
