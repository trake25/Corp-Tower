const GameEngine = require("../app/Game_Engine");
const TowerStability = require("../app/Tower_Stability");

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
    let finisher = null;
    let finishingBlock = null;

    while (engine.room.currentHeight < engine.room.targetHeight) {
        const placement = chooseSmartPlacement(engine);

        if (!placement) {
            const scoreSummary = getScoreSummary(engine);

            return {
                completed: false,
                exact: false,
                overbuild: 0,
                placements: placements,
                ...scoreSummary
            };
        }

        const block = placement.player.blocks.splice(placement.blockIndex, 1)[0];
        const blockHeight = engine.getBlockHeight(block);
        const previousHeight = engine.room.currentHeight;
        const placementPosition = TowerStability.settleBlock(
            engine.room.towerBlocks || [], block, 7
        );
        const projected = [...(engine.room.towerBlocks || []), {
            playerId: placement.player.id, block, ...placementPosition
        }];
        const newHeight = TowerStability.topHeight(projected);
        const effectiveHeight = Math.max(
            0,
            Math.min(newHeight - previousHeight, engine.room.targetHeight - previousHeight)
        );

        placement.player.contributedHeight += effectiveHeight;
        engine.room.currentHeight = newHeight;
        engine.room.towerBlocks.push({ playerId: placement.player.id, block, ...placementPosition });
        const structure = TowerStability.evaluate(engine.room.towerBlocks, require("../app/Game_Config"));
        engine.room.towerStability = structure.stability;
        if (structure.stability <= 0) {
            return { completed: false, collapsed: true, placements: placements + 1, ...getScoreSummary(engine) };
        }
        engine.addPlacementScore(placement.player, block, effectiveHeight);
        placements += 1;
        finisher = placement.player;
        finishingBlock = block;
        engine.refillPlayerBlock(placement.player);
    }

    const exact = engine.room.currentHeight === engine.room.targetHeight;

    engine.awardCompletionBonuses(finisher, exact);
    engine.addLevelScoreToLeaderboard();

    const scoreSummary = getScoreSummary(engine);

    return {
        completed: true,
        exact: exact,
        overbuild: Math.max(0, engine.room.currentHeight - engine.room.targetHeight),
        placements: placements,
        collapsed: false,
        stability: engine.room.towerStability || 100,
        ...scoreSummary
    };
}

function getScoreSummary(engine) {
    const scores = engine.room.players.map(player => player.levelScore || 0);
    const totalScore = scores.reduce((total, score) => total + score, 0);
    const mvpScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    return {
        teamLevelScore: totalScore,
        mvpLevelScore: mvpScore,
        scoreSpread: mvpScore - minScore
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
        averagePlacements: 0,
        averageTeamLevelScore: 0,
        averageMvpLevelScore: 0,
        averageScoreSpread: 0
    };

    for (let i = 0; i < runs; i++) {
        const engine = createEngineForLevel(level);
        const allBlocks = [
            ...engine.room.drawPile,
            ...engine.room.players.flatMap(player => player.blocks || [])
        ];
        const drawPileAfterDeal = engine.room.drawPile.length;
        const totalHeight = engine.getTotalBlockHeight(allBlocks);
        const result = withMutedConsole(() => simulateSmartPlay(engine));

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
        stats.averageTeamLevelScore += result.teamLevelScore;
        stats.averageMvpLevelScore += result.mvpLevelScore;
        stats.averageScoreSpread += result.scoreSpread;
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
        averagePlacements: stats.averagePlacements / runs,
        averageTeamLevelScore: stats.averageTeamLevelScore / runs,
        averageMvpLevelScore: stats.averageMvpLevelScore / runs,
        averageScoreSpread: stats.averageScoreSpread / runs
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
            "avgPlacements",
            "avgTeamScore",
            "avgMvpScore",
            "avgScoreSpread"
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
                result.averagePlacements.toFixed(1),
                result.averageTeamLevelScore.toFixed(1),
                result.averageMvpLevelScore.toFixed(1),
                result.averageScoreSpread.toFixed(1)
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
