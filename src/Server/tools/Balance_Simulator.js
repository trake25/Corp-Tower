const GameEngine = require("../app/Game_Engine");
const TowerStability = require("../app/Tower_Stability");
const GameConfig = require("../app/Game_Config");
const BotManager = require("../app/Bot_Manager");

const STRATEGIES = ["cooperative", "mvp_greedy"];

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

// Each player is independently rate-limited by placementCooldown, so the room
// naturally interleaves rather than letting whoever holds the best brick place
// over and over. Modelling that matters for more than pacing: it is what spreads
// contribution across the three players, which is exactly what the Impact gate
// measures.
function nextPlayerToAct(engine, clock) {
    let next = null;

    engine.room.players.forEach(player => {
        if (!player.blocks || player.blocks.length === 0) {
            return;
        }

        const readyAt = Math.max(clock, Number(player.simReadyAt || 0));

        if (!next || readyAt < next.readyAt) {
            next = { player: player, readyAt: readyAt };
        }
    });

    return next;
}

function chooseSmartPlacement(engine, strategy, actor) {
    const remainingHeight =
        engine.room.targetHeight - engine.room.currentHeight;
    const candidates = [];

    (actor.blocks || []).forEach((block, blockIndex) => {
        candidates.push({
            player: actor,
            blockIndex: blockIndex,
            height: engine.getBlockHeight(block)
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

    if (strategy === "mvp_greedy") {
        return candidates.sort((a, b) => b.height - a.height)[0];
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

function chooseStablestColumn(engine, block, strategy) {
    return BotManager.chooseBotColumn(engine, block, strategy);
}

function simulateSmartPlay(engine, strategy) {
    let placements = 0;
    let finisher = null;
    let finishingBlock = null;
    let brickHeightPlaced = 0;

    const outcome = extra => ({
        completed: false,
        exact: false,
        overbuild: 0,
        collapsed: false,
        placements: placements,
        brickHeightPlaced: brickHeightPlaced,
        efficiency:
            brickHeightPlaced > 0
                ? engine.room.currentHeight / brickHeightPlaced
                : 0,
        ...getScoreSummary(engine),
        ...extra
    });

    const cooldown = Math.max(0, Number(GameConfig.placementCooldown) || 0);
    const timeLimit = Math.max(1, Number(GameConfig.levelTimeLimitMs) || 1);
    let clock = 0;

    engine.room.players.forEach(player => {
        player.simReadyAt = 0;
    });

    while (engine.room.currentHeight < engine.room.targetHeight) {
        const actor = nextPlayerToAct(engine, clock);

        if (!actor) {
            return outcome({});
        }

        clock = actor.readyAt;

        if (clock >= timeLimit) {
            return outcome({ timedOut: true });
        }

        const placement = chooseSmartPlacement(engine, strategy, actor.player);

        if (!placement) {
            return outcome({});
        }

        actor.player.simReadyAt = clock + cooldown;

        const block = placement.player.blocks.splice(placement.blockIndex, 1)[0];
        const blockHeight = engine.getBlockHeight(block);
        const previousHeight = engine.room.currentHeight;
        const stabilityBefore = engine.room.towerStability ?? 100;
        const structureBefore = engine.room.towerStabilityDiagnostics || {};
        const column = chooseStablestColumn(engine, block, strategy);
        const placementPosition = TowerStability.settleBlock(
            engine.room.towerBlocks || [], block, engine.resolveColumnOriginX(block, column)
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
        brickHeightPlaced += blockHeight;
        engine.room.towerBlocks.push({ playerId: placement.player.id, block, ...placementPosition });
        const structure = TowerStability.evaluate(engine.room.towerBlocks, GameConfig);
        engine.room.towerStability = structure.stability;
        engine.room.towerStabilityDiagnostics = structure.diagnostics;
        if (structure.stability <= 0) {
            return outcome({ collapsed: true, placements: placements + 1 });
        }
        engine.addPlacementScore(
            placement.player, block, effectiveHeight, stabilityBefore
        );
        engine.addReinforceScore(
            placement.player, structureBefore, structure.diagnostics
        );
        placements += 1;
        finisher = placement.player;
        finishingBlock = block;
        engine.refillPlayerBlock(placement.player);
    }

    const exact = engine.room.currentHeight === engine.room.targetHeight;

    engine.awardCompletionBonuses(finisher, exact);
    engine.addLevelScoreToLeaderboard();

    return outcome({
        completed: true,
        exact: exact,
        overbuild: Math.max(0, engine.room.currentHeight - engine.room.targetHeight),
        stability: engine.room.towerStability || 100
    });
}

function getScoreSummary(engine) {
    const scores = engine.room.players.map(player => player.levelScore || 0);
    const totalScore = scores.reduce((total, score) => total + score, 0);
    const mvpScore = Math.max(...scores);
    const minScore = Math.min(...scores);

    return {
        teamLevelScore: totalScore,
        mvpLevelScore: mvpScore,
        scoreSpread: mvpScore - minScore,
        gateMet: meetsImpactGate(engine, scores)
    };
}

// With an Impact every level, "did all three players clear their share?" is the
// gate that actually decides whether the team advances, so it is the number
// worth tuning against -- a level can complete and still roll the team back.
function meetsImpactGate(engine, scores) {
    const required =
        engine.getImpactMinContributionShare() *
        engine.room.targetHeight *
        engine.room.level *
        (Number(GameConfig.scoring.placementScorePerHeight) || 1);

    return scores.every(score => score >= required);
}

function runLevel(level, runs, strategy = "cooperative") {
    const stats = {
        targetHeight: 0,
        averagePileBlocks: 0,
        averageDrawPileAfterDeal: 0,
        averageTotalHeight: 0,
        exactPossible: 0,
        smartCompleted: 0,
        smartExact: 0,
        collapsed: 0,
        timedOut: 0,
        gateMet: 0,
        siteWidth: 0,
        averageEfficiency: 0,
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
        const result = withMutedConsole(() => simulateSmartPlay(engine, strategy));

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
        stats.collapsed += result.collapsed ? 1 : 0;
        stats.timedOut += result.timedOut ? 1 : 0;
        stats.gateMet += (result.completed && result.gateMet) ? 1 : 0;
        stats.siteWidth = engine.getSiteWidthForHeight(engine.room.targetHeight);
        stats.averageEfficiency += result.efficiency;
        stats.averageOverbuild += result.overbuild;
        stats.averagePlacements += result.placements;
        stats.averageTeamLevelScore += result.teamLevelScore;
        stats.averageMvpLevelScore += result.mvpLevelScore;
        stats.averageScoreSpread += result.scoreSpread;
    }

    return {
        level: level,
        strategy: strategy,
        targetHeight: stats.targetHeight,
        averagePileBlocks: stats.averagePileBlocks / runs,
        averageDrawPileAfterDeal: stats.averageDrawPileAfterDeal / runs,
        averageTotalHeight: stats.averageTotalHeight / runs,
        exactPossibleRate: stats.exactPossible / runs,
        smartCompletionRate: stats.smartCompleted / runs,
        smartExactRate: stats.smartExact / runs,
        collapseRate: stats.collapsed / runs,
        timeoutRate: stats.timedOut / runs,
        gateMetRate: stats.gateMet / runs,
        siteWidth: stats.siteWidth,
        averageEfficiency: stats.averageEfficiency / runs,
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
            "strategy",
            "target",
            "site",
            "efficiency",
            "avgBlocks",
            "avgDrawAfterDeal",
            "avgHeight",
            "exactPossible",
            "smartComplete",
            "smartExact",
            "collapse",
            "timeout",
            "gatePassed",
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
                result.strategy,
                result.targetHeight,
                result.siteWidth,
                result.averageEfficiency.toFixed(3),
                result.averagePileBlocks.toFixed(1),
                result.averageDrawPileAfterDeal.toFixed(1),
                result.averageTotalHeight.toFixed(1),
                percent(result.exactPossibleRate),
                percent(result.smartCompletionRate),
                percent(result.smartExactRate),
                percent(result.collapseRate),
                percent(result.timeoutRate),
                percent(result.gateMetRate),
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

    for (const strategy of STRATEGIES) {
        for (let level = 1; level <= levels; level++) {
            results.push(runLevel(level, runs, strategy));
        }
    }

    printResults(results);
}

if (require.main === module) {
    main();
}

module.exports = {
    runLevel
};
