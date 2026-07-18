// Checkpoints for one room: score/politics snapshots, rollback, the
// checkpoint score gate, and its per-player status payload. Every function
// takes the owning GameEngine as `engine`; GameEngine exposes each one as a
// method.
const GameConfig = require("../Game_Config");

function clonePoliticsInventory(engine, items = []) {
    return items.map(item => ({ ...item }));
}

function saveCheckpointScores(engine) {
    if (!engine.room) {
        return;
    }

    engine.room.checkpointScores = {};

    engine.room.players.forEach(player => {
        engine.room.checkpointScores[player.id] = player.score || 0;
    });
}

function saveCheckpointPolitics(engine) {
    if (!engine.room) {
        return;
    }

    engine.room.checkpointPolitics = {};

    engine.room.players.forEach(player => {
        engine.room.checkpointPolitics[player.id] =
            engine.clonePoliticsInventory(player.politicsInventory || []);
    });
}

function saveCheckpointState(engine) {
    engine.saveCheckpointScores();
    engine.saveCheckpointPolitics();
}

function ensureCheckpointScores(engine) {
    if (
        !engine.room.checkpointScores ||
        Object.keys(engine.room.checkpointScores).length === 0
    ) {
        engine.saveCheckpointScores();
    }
}

function ensureCheckpointPolitics(engine) {
    if (
        !engine.room.checkpointPolitics ||
        Object.keys(engine.room.checkpointPolitics).length === 0
    ) {
        engine.saveCheckpointPolitics();
    }
}

function ensureCheckpointState(engine) {
    engine.ensureCheckpointScores();
    engine.ensureCheckpointPolitics();
}

function restoreCheckpointScores(engine) {
    const checkpointScores = engine.room.checkpointScores || {};

    engine.room.players.forEach(player => {
        player.score = Number(checkpointScores[player.id] || 0);
    });
}

function restoreCheckpointPolitics(engine) {
    if (GameConfig.politicsLifetime !== "checkpoint") {
        return;
    }

    const checkpointPolitics = engine.room.checkpointPolitics || {};

    engine.room.players.forEach(player => {
        player.politicsInventory = engine.clonePoliticsInventory(
            checkpointPolitics[player.id] || []
        );
    });
}

function awardCheckpointPolitics(engine) {
    const winner = engine.room.players.reduce((best, player) => {
        return !best || Number(player.score || 0) > Number(best.score || 0)
            ? player
            : best;
    }, null);
    if (!winner || (winner.politicsInventory || []).length >= GameConfig.politicsMaxSlots) {
        return;
    }
    const ids = Object.keys(GameConfig.politicsCatalog || {});
    if (ids.length === 0) return;
    const politicsId = ids[Math.floor(Math.random() * ids.length)];
    winner.politicsInventory = winner.politicsInventory || [];
    winner.politicsInventory.push({ id: politicsId, earnedLevel: engine.room.level, source: "checkpoint_mvp" });
    engine.room.pendingPoliticsEvents = engine.room.pendingPoliticsEvents || [];
    engine.room.pendingPoliticsEvents.push({
        id: `${engine.room.level}:checkpoint-politics:${winner.id}`,
        type: "politics_checkpoint_reward",
        playerId: winner.id,
        politicsId: politicsId,
        label: "Checkpoint Politics"
    });
}

function isCheckpointLevel(engine, level) {
    const interval = Math.max(1, Number(GameConfig.checkpointInterval) || 1);

    return (level - 1) % interval === 0;
}

function getCheckpointScoreRequirement(engine) {
    return Math.max(0, Number(GameConfig.checkpointScoreRequirement) || 0);
}

function getCheckpointMinContributionShare(engine) {
    return Math.max(
        0,
        Math.min(
            1,
            Number(GameConfig.checkpointMinContributionShare) || 0
        )
    );
}

function getExpectedPlacementScoreForLevel(engine, level) {
    const scorePerHeight =
        Number(GameConfig.scoring?.placementScorePerHeight) || 1;

    return engine.getTargetHeightForLevel(level) * level * scorePerHeight;
}

function getExpectedPlacementScoreForCheckpointBand(engine, blockedLevel) {
    const checkpointLevel = engine.clampLevel(
        engine.room?.checkpointLevel || engine.room?.level || 1
    );
    const targetLevel = engine.clampLevel(
        blockedLevel || engine.getNextCheckpointLevel()
    );
    let expectedScore = 0;

    for (let level = checkpointLevel; level < targetLevel; level++) {
        expectedScore += engine.getExpectedPlacementScoreForLevel(level);
    }

    return expectedScore;
}

function getCheckpointBandScoreRequirement(engine, blockedLevel) {
    const share = engine.getCheckpointMinContributionShare();
    const bandRequirement = Math.round(
        engine.getExpectedPlacementScoreForCheckpointBand(blockedLevel) *
            share
    );

    return Math.max(
        engine.getCheckpointScoreRequirement(),
        bandRequirement
    );
}

function getCheckpointScoreFailures(engine, blockedLevel) {
    return engine.getCheckpointScoreStatus(blockedLevel).players
        .filter(player => !player.met);
}

function getNextCheckpointLevel(engine) {
    const interval = Math.max(1, Number(GameConfig.checkpointInterval) || 1);
    const currentLevel = engine.room?.level || 1;
    const offset = (currentLevel - 1) % interval;

    return Math.min(
        GameConfig.maxLevel,
        currentLevel + interval - offset
    );
}

function getCheckpointScoreStatus(engine, blockedLevel = null) {
    const nextCheckpointLevel =
        blockedLevel || engine.getNextCheckpointLevel();
    const requirement =
        engine.getCheckpointBandScoreRequirement(nextCheckpointLevel);
    const checkpointScores = engine.room?.checkpointScores || {};

    return {
        requiredScore: requirement,
        requiredBandScore: requirement,
        minContributionShare: engine.getCheckpointMinContributionShare(),
        checkpointLevel: engine.room?.checkpointLevel || 1,
        nextCheckpointLevel: nextCheckpointLevel,
        players: (engine.room?.players || []).map(player => {
            const score = Number(player.score || 0);
            const checkpointScore =
                Number(checkpointScores[player.id] || 0);
            const requiredScore = checkpointScore + requirement;
            const bandScore = Math.max(0, score - checkpointScore);

            return {
                id: player.id,
                score: score,
                checkpointScore: checkpointScore,
                bandScore: bandScore,
                requiredScore: requiredScore,
                requiredBandScore: requirement,
                remainingScore: Math.max(0, requiredScore - score),
                met: requirement <= 0 || score >= requiredScore
            };
        })
    };
}

function hasMetCheckpointScoreRequirement(engine, blockedLevel) {
    return engine.getCheckpointScoreFailures(blockedLevel).length === 0;
}

function failCheckpointScoreRequirement(engine, blockedLevel) {
    engine.room.state = "failed";
    engine.clearTimers();

    const mvp = engine.getLevelMVP();
    const previousTotalScores = engine.getPlayerScoreMap();
    const checkpointScoreStatus =
        engine.getCheckpointScoreStatus(blockedLevel);
    const failures = checkpointScoreStatus.players.filter(player => {
        return !player.met;
    });
    const requirement = checkpointScoreStatus.requiredBandScore;

    engine.queueScoreEvent("checkpoint_failed", {
        label: "Checkpoint Failed",
        displayOnly: true,
        meta: {
            blockedLevel: blockedLevel,
            checkpointScoreRequirement: requirement,
            checkpointMinContributionShare:
                engine.getCheckpointMinContributionShare(),
            checkpointScoreFailures: failures
        }
    });
    engine.queueScoreEvent("mvp", {
        playerId: mvp.id,
        points: mvp.levelScore,
        label: "MVP",
        displayOnly: true
    });

    engine.room.lastLevelSummary = engine.buildLevelSummary({
        result: "failed",
        reason: "checkpoint_score_requirement",
        blockedLevel: blockedLevel,
        exactFinish: false,
        overbuildHeight: 0,
        finisher: null,
        finishingBlock: null,
        carriedBlockCount: 0,
        mvp: mvp,
        previousTotalScores: previousTotalScores,
        checkpointScoreRequirement: requirement,
        checkpointMinContributionShare:
            engine.getCheckpointMinContributionShare(),
        checkpointScoreStatus: checkpointScoreStatus,
        checkpointScoreFailures: failures
    });

    console.log(
        `Checkpoint score requirement failed before level ${blockedLevel}`
    );
    engine.persistRoom();
    engine.broadcastGameState();

    engine.nextLevelTimer = setTimeout(() => {
        engine.rollbackToCheckpoint();
    }, engine.getPostLevelTransitionDelayMs());
}

function rollbackToCheckpoint(engine) {
    engine.room.level = engine.room.checkpointLevel;
    engine.room.drawPile = [];
    engine.room.teamCarryOverBlocks = [];
    engine.restoreCheckpointScores();
    engine.restoreCheckpointPolitics();

    engine.room.players.forEach(player => {
        player.blocks = [];
        player.levelScore = 0;
        player.scoreBreakdown = {};
        player.contributedHeight = 0;
    });

    console.log(`Rolling back to checkpoint level ${engine.room.level}`);
    engine.startLevel();
}

module.exports = {
    clonePoliticsInventory,
    saveCheckpointScores,
    saveCheckpointPolitics,
    saveCheckpointState,
    ensureCheckpointScores,
    ensureCheckpointPolitics,
    ensureCheckpointState,
    restoreCheckpointScores,
    restoreCheckpointPolitics,
    awardCheckpointPolitics,
    isCheckpointLevel,
    getCheckpointScoreRequirement,
    getCheckpointMinContributionShare,
    getExpectedPlacementScoreForLevel,
    getExpectedPlacementScoreForCheckpointBand,
    getCheckpointBandScoreRequirement,
    getCheckpointScoreFailures,
    getNextCheckpointLevel,
    getCheckpointScoreStatus,
    hasMetCheckpointScoreRequirement,
    failCheckpointScoreRequirement,
    rollbackToCheckpoint
};
