const GameEngine = require("./Game_Engine");

const DEFAULT_LEVELS = 20;
const DEFAULT_RUNS = 1000;

function createPlayers() {
    return [
        { id: "P1", score: 0 },
        { id: "P2", score: 0 },
        { id: "P3", score: 0 }
    ];
}

function createEngineForLevel(level) {
    const engine = new GameEngine();

    withMutedConsole(() => {
        engine.createRoom(createPlayers());
        engine.room.level = level;
        engine.room.targetHeight = engine.getTargetHeightForLevel(level);
        engine.room.teamCarryOverBlocks = [];
        engine.buildDrawPile();
        engine.dealOpeningHands();
    });

    return engine;
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

function chooseSmartPlacement(engine) {
    const remainingHeight =
        engine.room.targetHeight - engine.room.currentHeight;
    const candidates = [];

    engine.room.players.forEach(player => {
        (player.blocks || []).forEach((block, blockIndex) => {
            candidates.push({
                player: player,
                blockIndex: blockIndex,
                height: engine.getBlockHeight(block)
            });
        });
    });

    if (candidates.length === 0) {
        return null;
    }

    const exact = candidates.find(candidate => {
        return candidate.height === remainingHeight;
    });

    if (exact) {
        return exact;
    }

    const nonOverkill = candidates.filter(candidate => {
        return candidate.height <= remainingHeight;
    });

    if (nonOverkill.length > 0) {
        return nonOverkill.sort((a, b) => {
            if (remainingHeight <= 3) {
                return a.height - b.height;
            }

            return b.height - a.height;
        })[0];
    }

    return candidates.sort((a, b) => a.height - b.height)[0];
}

function simulateSmartPlay(engine) {
    let placements = 0;

    while (engine.room.currentHeight < engine.room.targetHeight) {
        const placement = chooseSmartPlacement(engine);

        if (!placement) {
            return {
                completed: false,
                exact: false,
                overbuild: 0,
                placements: placements
            };
        }

        const block = placement.player.blocks.splice(placement.blockIndex, 1)[0];
        engine.room.currentHeight += engine.getBlockHeight(block);
        placements += 1;
        engine.refillPlayerBlock(placement.player);
    }

    return {
        completed: true,
        exact: engine.room.currentHeight === engine.room.targetHeight,
        overbuild: Math.max(0, engine.room.currentHeight - engine.room.targetHeight),
        placements: placements
    };
}

function runLevel(level, runs) {
    const stats = {
        targetHeight: 0,
        averagePileBlocks: 0,
        averageDrawPileAfterDeal: 0,
        averageTotalHeight: 0,
        exactPossible: 0,
        smartCompleted: 0,
        smartExact: 0,
        averageOverbuild: 0,
        averagePlacements: 0
    };

    for (let i = 0; i < runs; i++) {
        const engine = createEngineForLevel(level);
        const allBlocks = [
            ...engine.room.drawPile,
            ...engine.room.players.flatMap(player => player.blocks || [])
        ];
        const drawPileAfterDeal = engine.room.drawPile.length;
        const totalHeight = engine.getTotalBlockHeight(allBlocks);
        const result = simulateSmartPlay(engine);

        stats.targetHeight = engine.room.targetHeight;
        stats.averagePileBlocks += allBlocks.length;
        stats.averageDrawPileAfterDeal += drawPileAfterDeal;
        stats.averageTotalHeight += totalHeight;
        stats.exactPossible += engine.hasExactHeightCombination(
            allBlocks,
            engine.room.targetHeight
        ) ? 1 : 0;
        stats.smartCompleted += result.completed ? 1 : 0;
        stats.smartExact += result.exact ? 1 : 0;
        stats.averageOverbuild += result.overbuild;
        stats.averagePlacements += result.placements;
    }

    return {
        level: level,
        targetHeight: stats.targetHeight,
        averagePileBlocks: stats.averagePileBlocks / runs,
        averageDrawPileAfterDeal: stats.averageDrawPileAfterDeal / runs,
        averageTotalHeight: stats.averageTotalHeight / runs,
        exactPossibleRate: stats.exactPossible / runs,
        smartCompletionRate: stats.smartCompleted / runs,
        smartExactRate: stats.smartExact / runs,
        averageOverbuild: stats.averageOverbuild / runs,
        averagePlacements: stats.averagePlacements / runs
    };
}

function percent(value) {
    return `${(value * 100).toFixed(1)}%`;
}

function printResults(results) {
    console.log(
        [
            "level",
            "target",
            "avgBlocks",
            "avgDrawAfterDeal",
            "avgHeight",
            "exactPossible",
            "smartComplete",
            "smartExact",
            "avgOverbuild",
            "avgPlacements"
        ].join(",")
    );

    results.forEach(result => {
        console.log(
            [
                result.level,
                result.targetHeight,
                result.averagePileBlocks.toFixed(1),
                result.averageDrawPileAfterDeal.toFixed(1),
                result.averageTotalHeight.toFixed(1),
                percent(result.exactPossibleRate),
                percent(result.smartCompletionRate),
                percent(result.smartExactRate),
                result.averageOverbuild.toFixed(2),
                result.averagePlacements.toFixed(1)
            ].join(",")
        );
    });
}

function main() {
    const levels = Number(process.argv[2]) || DEFAULT_LEVELS;
    const runs = Number(process.argv[3]) || DEFAULT_RUNS;
    const results = [];

    for (let level = 1; level <= levels; level++) {
        results.push(runLevel(level, runs));
    }

    printResults(results);
}

if (require.main === module) {
    main();
}

module.exports = {
    runLevel
};
