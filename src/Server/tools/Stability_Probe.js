"use strict";

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

const ARCHETYPES = {
    wellPackedFullSite: (siteWidth, height) => {
        const entries = [];

        for (let y = 0; y < height; y++) {
            entries.push(rowEntry(siteWidth, 0, y));
        }

        return entries;
    },

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
