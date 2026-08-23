const GameEngine = require("../app/Game_Engine");
const TowerStability = require("../app/Tower_Stability");
const GameConfig = require("../app/Game_Config");
const BotManager = require("../app/Bot_Manager");

const STRATEGIES = ["cooperative", "mvp_greedy"];

const DEFAULT_LEVELS = 20;
const DEFAULT_RUNS = 100;

const SWEEP_DIFFICULTIES = [0, 50, 75, 95, 100];
const SWEEP_LEVEL_STEP = 5;

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
        engine.room.impactLevel = level;
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
    if (!actor.blocks || actor.blocks.length === 0) {
        return null;
    }

    const action = BotManager.chooseBotAction(actor, engine, strategy);

    if (action && action.type === "wait") {
        return { waiting: true, player: actor };
    }

    const blockIndex = Number(action?.blockIndex ?? 0);

    if (!actor.blocks[blockIndex]) {
        return null;
    }

    return {
        player: actor,
        blockIndex: blockIndex,
        column: action?.column ?? null,
        originY: action?.originY ?? null,
        height: engine.getBlockHeight(actor.blocks[blockIndex])
    };
}

function simulateSmartPlay(engine, strategy) {
    let placements = 0;
    let finisher = null;
    let finishingBlock = null;
    let brickHeightPlaced = 0;
    let gapPlacements = 0;
    let supportedCellsTotal = 0;

    const telemetry = {
        samples: 0,
        stabilitySum: 0,
        minStability: 100,
        balanceSum: 0,
        integritySum: 0,
        carriedLoadShareSum: 0,
        pathConcentrationSum: 0,
        weakestInterfaceHeightSum: 0,
        evaluatorMsSum: 0
    };

    const outcome = extra => ({
        completed: false,
        exact: false,
        overbuild: 0,
        collapsed: false,
        starved: false,
        placements: placements,
        brickHeightPlaced: brickHeightPlaced,
        gapPlacements: gapPlacements,
        supportedCells: supportedCellsTotal,
        clockMs: clock,
        efficiency:
            brickHeightPlaced > 0
                ? engine.room.currentHeight / brickHeightPlaced
                : 0,
        telemetry: telemetry,
        ...getScoreSummary(engine),
        ...extra
    });

    const sampleStability = (structure, evaluatorMs) => {
        const d = structure.diagnostics || {};
        const groups = Array.isArray(structure.analysis?.groups) ? structure.analysis.groups : [];
        const critical = groups.slice().sort((left, right) => {
            const leftRisk = Number(left.balanceRisk || 0) + Number(left.integrityRisk || 0);
            const rightRisk = Number(right.balanceRisk || 0) + Number(right.integrityRisk || 0);
            if (rightRisk !== leftRisk) return rightRisk - leftRisk;
            if (Number(right.carriedLoadShare || 0) !== Number(left.carriedLoadShare || 0)) {
                return Number(right.carriedLoadShare || 0) - Number(left.carriedLoadShare || 0);
            }
            return String(left.key || "").localeCompare(String(right.key || ""));
        })[0] || {};

        telemetry.samples += 1;
        telemetry.stabilitySum += structure.stability;
        telemetry.minStability = Math.min(telemetry.minStability, structure.stability);
        telemetry.balanceSum += Number(d.balance ?? 100);
        telemetry.integritySum += Number(d.integrity ?? 100);
        telemetry.carriedLoadShareSum += Number(critical.carriedLoadShare || 0);
        telemetry.pathConcentrationSum += Number(critical.pathConcentration || 0);
        telemetry.weakestInterfaceHeightSum += Number(critical.pivotY || 0);
        telemetry.evaluatorMsSum += evaluatorMs;
    };

    const cooldown = Math.max(0, Number(GameConfig.placementCooldown) || 0);
    const timeLimit = Math.max(1, engine.getLevelTimeLimitMs());
    let clock = 0;

    engine.room.players.forEach(player => {
        player.simReadyAt = 0;
    });

    while (engine.room.currentHeight < engine.room.targetHeight) {
        const actor = nextPlayerToAct(engine, clock);

        if (!actor) {
            return outcome({ starved: true });
        }

        clock = actor.readyAt;

        if (clock >= timeLimit) {
            return outcome({ timedOut: true });
        }

        const placement = chooseSmartPlacement(engine, strategy, actor.player);

        if (!placement) {
            return outcome({ starved: true });
        }

        actor.player.simReadyAt = clock + cooldown;

        if (placement.waiting) {
            continue;
        }

        const block = placement.player.blocks.splice(placement.blockIndex, 1)[0];
        const blockHeight = engine.getBlockHeight(block);
        const previousHeight = engine.room.currentHeight;
        const stabilityBefore = engine.room.towerStability ?? 100;
        const structureBefore = engine.room.towerStabilityDiagnostics || {};
        const placementPosition = engine.resolvePlacementOrigin(
            block, placement.column, placement.originY
        );
        const supportedCells = TowerStability.supportedCellsGained(
            engine.room.towerBlocks || [],
            block,
            placementPosition.originX,
            placementPosition.originY
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
        const stabilityConfig = engine.resolveStabilityConfig();
        const evaluationStartedAt = process.hrtime.bigint();
        const structure = TowerStability.evaluate(engine.room.towerBlocks, stabilityConfig);
        const evaluatorMs = Number(process.hrtime.bigint() - evaluationStartedAt) / 1000000;
        engine.room.towerStability = structure.stability;
        engine.room.towerStabilityDiagnostics = structure.diagnostics;
        engine.room.towerStructuralPose = structure.structuralPose;
        sampleStability(structure, evaluatorMs);
        if (structure.stability <= 0) {
            return outcome({ collapsed: true, placements: placements + 1 });
        }
        engine.addPlacementScore(
            placement.player, block, effectiveHeight, stabilityBefore
        );
        engine.addReinforceScore(
            placement.player, structureBefore, structure.diagnostics, supportedCells
        );
        if (supportedCells > 0) {
            gapPlacements += 1;
        }
        supportedCellsTotal += supportedCells;
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
        gateMet: meetsImpactGate(engine)
    };
}

function meetsImpactGate(engine) {
    return engine.hasMetImpactScoreRequirement(engine.room.level + 1);
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
        starved: 0,
        gateMet: 0,
        siteWidth: 0,
        averageEfficiency: 0,
        averageOverbuild: 0,
        averagePlacements: 0,
        averageTeamLevelScore: 0,
        averageMvpLevelScore: 0,
        averageScoreSpread: 0,
        requiredBrickHeight: 0,
        modelEfficiency: 0,
        pileClipped: 0,
        supplyValid: 0,
        averageGapPlacements: 0,
        averageSupportedCells: 0,
        averageClockUsedS: 0,
        samples: 0,
        stabilitySum: 0,
        minStability: 100,
        balanceSum: 0,
        integritySum: 0,
        carriedLoadShareSum: 0,
        pathConcentrationSum: 0,
        weakestInterfaceHeightSum: 0,
        evaluatorMsSum: 0
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
        stats.starved += result.starved ? 1 : 0;
        stats.gateMet += (result.completed && result.gateMet) ? 1 : 0;
        stats.siteWidth = engine.getSiteWidthForHeight(engine.room.targetHeight);
        stats.averageEfficiency += result.efficiency;
        stats.averageOverbuild += result.overbuild;
        stats.averagePlacements += result.placements;
        stats.averageTeamLevelScore += result.teamLevelScore;
        stats.averageMvpLevelScore += result.mvpLevelScore;
        stats.averageScoreSpread += result.scoreSpread;
        stats.averageGapPlacements += result.gapPlacements;
        stats.averageSupportedCells += result.supportedCells;
        stats.averageClockUsedS += result.clockMs / 1000;

        stats.requiredBrickHeight = Math.ceil(
            engine.room.targetHeight / engine.getSupplyPackingEfficiency()
        );
        stats.modelEfficiency = engine.getSupplyPackingEfficiency();
        stats.pileClipped += engine.room.pileClipped ? 1 : 0;
        stats.supplyValid += engine.room.lastOpeningHandValid ? 1 : 0;

        const t = result.telemetry;
        stats.samples += t.samples;
        stats.stabilitySum += t.stabilitySum;
        stats.balanceSum += t.balanceSum;
        stats.integritySum += t.integritySum;
        stats.carriedLoadShareSum += t.carriedLoadShareSum;
        stats.pathConcentrationSum += t.pathConcentrationSum;
        stats.weakestInterfaceHeightSum += t.weakestInterfaceHeightSum;
        stats.evaluatorMsSum += t.evaluatorMsSum;
        if (t.samples > 0) {
            stats.minStability = Math.min(stats.minStability, t.minStability);
        }
    }

    const perSample = sum => (stats.samples > 0 ? sum / stats.samples : 0);

    return {
        level: level,
        strategy: strategy,
        difficulty: Number(GameConfig.towerStabilityDifficulty) || 0,
        averageStability: perSample(stats.stabilitySum),
        minStability: stats.minStability,
        averageBalance: perSample(stats.balanceSum),
        averageIntegrity: perSample(stats.integritySum),
        averageCriticalCarriedLoadShare: perSample(stats.carriedLoadShareSum),
        averagePathConcentration: perSample(stats.pathConcentrationSum),
        averageWeakestInterfaceHeight: perSample(stats.weakestInterfaceHeightSum),
        averageEvaluatorMs: perSample(stats.evaluatorMsSum),
        targetHeight: stats.targetHeight,
        averagePileBlocks: stats.averagePileBlocks / runs,
        averageDrawPileAfterDeal: stats.averageDrawPileAfterDeal / runs,
        averageTotalHeight: stats.averageTotalHeight / runs,
        supplyHeight: stats.averageTotalHeight / runs,
        exactPossibleRate: stats.exactPossible / runs,
        smartCompletionRate: stats.smartCompleted / runs,
        smartExactRate: stats.smartExact / runs,
        collapseRate: stats.collapsed / runs,
        timeoutRate: stats.timedOut / runs,
        starvedRate: stats.starved / runs,
        gateMetRate: stats.gateMet / runs,
        siteWidth: stats.siteWidth,
        averageEfficiency: stats.averageEfficiency / runs,
        averageOverbuild: stats.averageOverbuild / runs,
        averagePlacements: stats.averagePlacements / runs,
        averageTeamLevelScore: stats.averageTeamLevelScore / runs,
        averageMvpLevelScore: stats.averageMvpLevelScore / runs,
        averageScoreSpread: stats.averageScoreSpread / runs,
        requiredBrickHeight: stats.requiredBrickHeight,
        modelEfficiency: stats.modelEfficiency,
        pileClippedRate: stats.pileClipped / runs,
        supplyValidRate: stats.supplyValid / runs,
        averageGapPlacements: stats.averageGapPlacements / runs,
        averageSupportedCells: stats.averageSupportedCells / runs,
        averageClockUsedS: stats.averageClockUsedS / runs
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
            "supplyHeight",
            "requiredBrickHeight",
            "modelEfficiency",
            "pileClipped",
            "supplyValidRate",
            "efficiency",
            "avgBlocks",
            "avgDrawAfterDeal",
            "avgHeight",
            "exactPossible",
            "smartComplete",
            "smartExact",
            "collapse",
            "timeout",
            "starved",
            "gatePassed",
            "avgOverbuild",
            "avgPlacements",
            "clockUsedS",
            "gapPlacements",
            "supportedCells",
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
                result.supplyHeight.toFixed(1),
                result.requiredBrickHeight,
                result.modelEfficiency.toFixed(3),
                percent(result.pileClippedRate),
                percent(result.supplyValidRate),
                result.averageEfficiency.toFixed(3),
                result.averagePileBlocks.toFixed(1),
                result.averageDrawPileAfterDeal.toFixed(1),
                result.averageTotalHeight.toFixed(1),
                percent(result.exactPossibleRate),
                percent(result.smartCompletionRate),
                percent(result.smartExactRate),
                percent(result.collapseRate),
                percent(result.timeoutRate),
                percent(result.starvedRate),
                percent(result.gateMetRate),
                result.averageOverbuild.toFixed(2),
                result.averagePlacements.toFixed(1),
                result.averageClockUsedS.toFixed(1),
                result.averageGapPlacements.toFixed(2),
                result.averageSupportedCells.toFixed(2),
                result.averageTeamLevelScore.toFixed(1),
                result.averageMvpLevelScore.toFixed(1),
                result.averageScoreSpread.toFixed(1)
            ].join(",")
        );
    });
}

function printStabilityResults(results) {
    console.log(
        [
            "difficulty",
            "level",
            "strategy",
            "target",
            "collapse",
            "smartComplete",
            "gatePassed",
            "avgStability",
            "minStability",
            "avgBalance",
            "avgIntegrity",
            "avgCriticalLoadShare",
            "avgPathConcentration",
            "avgWeakestInterfaceHeight",
            "avgEvaluatorMs",
            "avgTeamScore",
            "avgMvpScore"
        ].join(",")
    );

    results.forEach(result => {
        console.log(
            [
                result.difficulty,
                result.level,
                result.strategy,
                result.targetHeight,
                percent(result.collapseRate),
                percent(result.smartCompletionRate),
                percent(result.gateMetRate),
                result.averageStability.toFixed(1),
                result.minStability,
                result.averageBalance.toFixed(1),
                result.averageIntegrity.toFixed(1),
                result.averageCriticalCarriedLoadShare.toFixed(3),
                result.averagePathConcentration.toFixed(3),
                result.averageWeakestInterfaceHeight.toFixed(2),
                result.averageEvaluatorMs.toFixed(3),
                result.averageTeamLevelScore.toFixed(1),
                result.averageMvpLevelScore.toFixed(1)
            ].join(",")
        );
    });
}

function runSweep(levels, runs, difficulties, levelStep) {
    const original = GameConfig.towerStabilityDifficulty;
    const results = [];

    try {
        for (const difficulty of difficulties) {
            GameConfig.towerStabilityDifficulty = difficulty;

            for (const strategy of STRATEGIES) {
                for (let level = 1; level <= levels; level += levelStep) {
                    results.push(runLevel(level, runs, strategy));
                }
            }
        }
    } finally {
        GameConfig.towerStabilityDifficulty = original;
    }

    return results;
}

function main() {
    const sweep = process.argv[2] === "sweep";
    const levels = Number(process.argv[sweep ? 3 : 2]) || DEFAULT_LEVELS;
    const runs = Number(process.argv[sweep ? 4 : 3]) || DEFAULT_RUNS;

    if (sweep) {
        printStabilityResults(
            runSweep(levels, runs, SWEEP_DIFFICULTIES, SWEEP_LEVEL_STEP)
        );
        return;
    }

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
    runLevel,
    runSweep
};
