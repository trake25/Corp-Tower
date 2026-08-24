const GameConfig = require("../app/Game_Config");
const {
    createEngineForLevel,
    percentile,
    simulateSmartPlay,
    withMutedConsole
} = require("./Balance_Simulator");

const STRATEGIES = ["cooperative", "mvp_greedy"];
const DEFAULT_START_LEVELS = 20;
const DEFAULT_RUNS = 100;

function number(value) {
    return Number(value) || 0;
}

function prepareLevel(engine, level) {
    engine.room.level = level;
    withMutedConsole(() => engine.startLevel());
    engine.clearTimers();
    engine.room.state = "playing";
}

function failureReason(result) {
    if (result.collapsed) return "tower_collapsed";
    if (result.timedOut) return "time_expired";
    if (result.starved) return "not_enough_height_remaining";
    return "all_blocks_used";
}

function recordAttemptFailure(engine, stats) {
    const status = engine.getImpactFailureStatus();

    stats.failures.push(status.failureCount);
    stats.rollbacks += status.gameOver ? 0 : 1;
    stats.lastChanceEntries += status.lastChance ? 1 : 0;
    stats.gameOvers += status.gameOver ? 1 : 0;
}

function runImpactBand(startLevel, strategy) {
    const engine = createEngineForLevel(startLevel);
    const checkpoint = engine.getNextImpactLevel();
    const stats = {
        checkpoint,
        failures: [],
        rollbacks: 0,
        lastChanceEntries: 0,
        gameOvers: 0,
        criticalSaves: 0,
        restoredAfterFailure: true,
        checkpointReset: false,
        passed: false,
        contributions: []
    };

    prepareLevel(engine, startLevel);

    while (engine.room.state !== "game_over" && !stats.passed) {
        const result = withMutedConsole(() => simulateSmartPlay(engine, strategy));
        stats.criticalSaves += number(result.telemetry?.score?.criticalSaves);

        if (!result.completed) {
            const checkpointScores = { ...engine.room.impactScores };
            const checkpointContributions = { ...engine.room.impactContributions };

            engine.failLevel(failureReason(result));
            engine.clearTimers();
            recordAttemptFailure(engine, stats);

            if (engine.room.state === "game_over") {
                stats.restoredAfterFailure = engine.room.players.every(player => {
                    return number(player.score) === number(checkpointScores[player.id]) &&
                        number(player.impactContribution) ===
                            number(checkpointContributions[player.id]);
                });
                break;
            }

            engine.rollbackToImpact();
            engine.clearTimers();
            engine.room.state = "playing";
            continue;
        }

        const nextLevel = engine.room.level + 1;

        if (nextLevel >= checkpoint) {
            engine.room.state = "finished";

            if (!engine.hasMetImpactScoreRequirement(checkpoint)) {
                const checkpointScores = { ...engine.room.impactScores };
                const checkpointContributions = { ...engine.room.impactContributions };

                engine.failImpactScoreRequirement(checkpoint);
                engine.clearTimers();
                recordAttemptFailure(engine, stats);

                if (engine.room.state === "game_over") {
                    stats.restoredAfterFailure = engine.room.players.every(player => {
                        return number(player.score) === number(checkpointScores[player.id]) &&
                            number(player.impactContribution) ===
                                number(checkpointContributions[player.id]);
                    });
                    break;
                }

                engine.rollbackToImpact();
                engine.clearTimers();
                engine.room.state = "playing";
                continue;
            }

            withMutedConsole(() => engine.nextLevel());
            engine.clearTimers();
            stats.checkpointReset = engine.room.impactLevel === checkpoint &&
                engine.room.impactFailureCount === 0;
            stats.passed = true;
            stats.contributions = engine.room.players.map(player => {
                return number(engine.room.impactContributions[player.id]);
            });
            break;
        }

        prepareLevel(engine, nextLevel);
    }

    if (stats.contributions.length === 0) {
        stats.contributions = engine.room.players.map(player => {
            return number(player.impactContribution);
        });
    }

    withMutedConsole(() => engine.closeRoom("impact_probe", false));

    return stats;
}

function runImpactProbe(startLevels = DEFAULT_START_LEVELS, runs = DEFAULT_RUNS) {
    const results = [];
    const interval = Math.max(1, Math.floor(number(GameConfig.impactInterval) || 1));

    for (const strategy of STRATEGIES) {
        for (let startLevel = 1; startLevel <= startLevels; startLevel += interval) {
            const stats = {
                startLevel,
                strategy,
                expectedPool: 0,
                requiredContribution: 0,
                passes: 0,
                checkpointResets: 0,
                rollbacks: [],
                lastChanceEntries: 0,
                gameOvers: 0,
                criticalSaveRuns: 0,
                restoredAfterFailure: 0,
                contributions: [],
                shares: [],
                shortfalls: []
            };

            for (let run = 0; run < runs; run++) {
                const engine = createEngineForLevel(startLevel);
                const checkpoint = engine.getNextImpactLevel();
                const expectedPool = engine.getExpectedPlacementScoreForImpactBand(checkpoint);
                const requiredContribution = engine.getImpactBandScoreRequirement(checkpoint);

                withMutedConsole(() => engine.closeRoom("impact_probe", false));
                stats.expectedPool = expectedPool;
                stats.requiredContribution = requiredContribution;

                const result = runImpactBand(startLevel, strategy);
                stats.passes += result.passed ? 1 : 0;
                stats.checkpointResets += result.checkpointReset ? 1 : 0;
                stats.rollbacks.push(result.rollbacks);
                stats.lastChanceEntries += result.lastChanceEntries;
                stats.gameOvers += result.gameOvers;
                stats.criticalSaveRuns += result.criticalSaves > 0 ? 1 : 0;
                stats.restoredAfterFailure += result.restoredAfterFailure ? 1 : 0;
                result.contributions.forEach(contribution => {
                    stats.contributions.push(contribution);
                    stats.shares.push(expectedPool > 0 ? contribution / expectedPool : 0);
                    stats.shortfalls.push(Math.max(0, requiredContribution - contribution));
                });
            }

            results.push({
                startLevel,
                checkpoint: startLevel + interval - ((startLevel - 1) % interval),
                strategy,
                expectedPool: stats.expectedPool,
                requiredContribution: stats.requiredContribution,
                allPlayerPassRate: stats.passes / runs,
                checkpointResetRate: stats.checkpointResets / runs,
                contributionP10: percentile(stats.contributions, 0.1),
                contributionP50: percentile(stats.contributions, 0.5),
                contributionP90: percentile(stats.contributions, 0.9),
                expectedPoolShareP10: percentile(stats.shares, 0.1),
                expectedPoolShareP50: percentile(stats.shares, 0.5),
                expectedPoolShareP90: percentile(stats.shares, 0.9),
                individualShortfallP50: percentile(stats.shortfalls, 0.5),
                rollbackP10: percentile(stats.rollbacks, 0.1),
                rollbackP50: percentile(stats.rollbacks, 0.5),
                rollbackP90: percentile(stats.rollbacks, 0.9),
                lastChanceEntryRate: stats.lastChanceEntries / runs,
                gameOverRate: stats.gameOvers / runs,
                criticalSaveRunRate: stats.criticalSaveRuns / runs,
                restoredAfterFailureRate: stats.restoredAfterFailure / runs
            });
        }
    }

    return results;
}

function printImpactProbe(results) {
    console.log([
        "startLevel",
        "checkpoint",
        "strategy",
        "expectedPool",
        "requiredContribution",
        "allPlayerPass",
        "checkpointReset",
        "contributionP10",
        "contributionP50",
        "contributionP90",
        "poolShareP10",
        "poolShareP50",
        "poolShareP90",
        "shortfallP50",
        "rollbackP10",
        "rollbackP50",
        "rollbackP90",
        "lastChance",
        "gameOver",
        "criticalSaveRun",
        "restoredAfterFailure"
    ].join(","));

    results.forEach(result => {
        console.log([
            result.startLevel,
            result.checkpoint,
            result.strategy,
            result.expectedPool,
            result.requiredContribution,
            result.allPlayerPassRate.toFixed(3),
            result.checkpointResetRate.toFixed(3),
            result.contributionP10.toFixed(1),
            result.contributionP50.toFixed(1),
            result.contributionP90.toFixed(1),
            result.expectedPoolShareP10.toFixed(3),
            result.expectedPoolShareP50.toFixed(3),
            result.expectedPoolShareP90.toFixed(3),
            result.individualShortfallP50.toFixed(1),
            result.rollbackP10.toFixed(1),
            result.rollbackP50.toFixed(1),
            result.rollbackP90.toFixed(1),
            result.lastChanceEntryRate.toFixed(3),
            result.gameOverRate.toFixed(3),
            result.criticalSaveRunRate.toFixed(3),
            result.restoredAfterFailureRate.toFixed(3)
        ].join(","));
    });
}

function main() {
    const startLevels = Number(process.argv[2]) || DEFAULT_START_LEVELS;
    const runs = Number(process.argv[3]) || DEFAULT_RUNS;

    printImpactProbe(runImpactProbe(startLevels, runs));
}

if (require.main === module) {
    main();
}

module.exports = {
    runImpactBand,
    runImpactProbe
};
