const GameConfig = require("../Game_Config");

function saveImpactScores(engine) {
    if (!engine.room) {
        return;
    }

    engine.room.impactScores = {};

    engine.room.players.forEach(player => {
        engine.room.impactScores[player.id] = player.score || 0;
    });
}

function saveImpactPowers(engine) {
    if (!engine.room) {
        return;
    }

    engine.room.impactPowers = {};

    engine.room.players.forEach(player => {
        engine.room.impactPowers[player.id] =
            engine.clonePowerInventory(player.powerInventory || []);
    });
}

function saveImpactState(engine) {
    engine.saveImpactScores();
    engine.saveImpactPowers();
}

function ensureImpactScores(engine) {
    if (
        !engine.room.impactScores ||
        Object.keys(engine.room.impactScores).length === 0
    ) {
        engine.saveImpactScores();
    }
}

function ensureImpactPowers(engine) {
    if (
        !engine.room.impactPowers ||
        Object.keys(engine.room.impactPowers).length === 0
    ) {
        engine.saveImpactPowers();
    }
}

function ensureImpactState(engine) {
    engine.ensureImpactScores();
    engine.ensureImpactPowers();
}

function restoreImpactScores(engine) {
    const impactScores = engine.room.impactScores || {};

    engine.room.players.forEach(player => {
        player.score = Number(impactScores[player.id] || 0);
    });
}

function restoreImpactPowers(engine) {
    if (GameConfig.powerLifetime !== "impact") {
        return;
    }

    const impactPowers = engine.room.impactPowers || {};

    engine.room.players.forEach(player => {
        player.powerInventory = engine.clonePowerInventory(
            impactPowers[player.id] || []
        );
    });
}

function awardImpactPower(engine) {
    const winner = engine.room.players.reduce((best, player) => {
        return !best || Number(player.score || 0) > Number(best.score || 0)
            ? player
            : best;
    }, null);
    if (!winner || (winner.powerInventory || []).length >= GameConfig.powerMaxSlots) {
        return;
    }
    const catalog = GameConfig.powerCatalog || {};
    const ids = Object.keys(catalog).filter(id => catalog[id].active);
    if (ids.length === 0) return;
    const powerId = ids[Math.floor(Math.random() * ids.length)];
    winner.powerInventory = winner.powerInventory || [];
    winner.powerInventory.push({ id: powerId, earnedLevel: engine.room.level, source: "impact_mvp" });
    engine.room.pendingPowerEvents = engine.room.pendingPowerEvents || [];
    engine.room.pendingPowerEvents.push({
        id: `${engine.room.level}:impact-power:${winner.id}`,
        type: "power_impact_reward",
        playerId: winner.id,
        powerId: powerId,
        label: "Impact Power"
    });
}

function isImpactLevel(engine, level) {
    const interval = Math.max(1, Number(GameConfig.impactInterval) || 1);

    return (level - 1) % interval === 0;
}

function getImpactScoreRequirement(engine) {
    return Math.max(0, Number(GameConfig.impactScoreRequirement) || 0);
}

function getImpactMinContributionShare(engine) {
    return Math.max(
        0,
        Math.min(
            1,
            Number(GameConfig.impactMinContributionShare) || 0
        )
    );
}

function getExpectedPlacementScoreForLevel(engine, level) {
    const scorePerHeight =
        Number(GameConfig.scoring?.placementScorePerHeight) || 1;

    return engine.getTargetHeightForLevel(level) * level * scorePerHeight;
}

function getExpectedPlacementScoreForImpactBand(engine, blockedLevel) {
    const impactLevel = engine.clampLevel(
        engine.room?.impactLevel || engine.room?.level || 1
    );
    const targetLevel = engine.clampLevel(
        blockedLevel || engine.getNextImpactLevel()
    );
    let expectedScore = 0;

    for (let level = impactLevel; level < targetLevel; level++) {
        expectedScore += engine.getExpectedPlacementScoreForLevel(level);
    }

    return expectedScore;
}

function getImpactBandScoreRequirement(engine, blockedLevel) {
    const share = engine.getImpactMinContributionShare();
    const bandRequirement = Math.round(
        engine.getExpectedPlacementScoreForImpactBand(blockedLevel) *
            share
    );

    return Math.max(
        engine.getImpactScoreRequirement(),
        bandRequirement
    );
}

function getImpactScoreFailures(engine, blockedLevel) {
    return engine.getImpactScoreStatus(blockedLevel).players
        .filter(player => !player.met);
}

function getNextImpactLevel(engine) {
    const interval = Math.max(1, Number(GameConfig.impactInterval) || 1);
    const currentLevel = engine.room?.level || 1;
    const offset = (currentLevel - 1) % interval;

    return Math.min(
        GameConfig.maxLevel,
        currentLevel + interval - offset
    );
}

function getImpactScoreStatus(engine, blockedLevel = null) {
    const nextImpactLevel =
        blockedLevel || engine.getNextImpactLevel();
    const requirement =
        engine.getImpactBandScoreRequirement(nextImpactLevel);
    const impactScores = engine.room?.impactScores || {};

    return {
        requiredScore: requirement,
        requiredBandScore: requirement,
        minContributionShare: engine.getImpactMinContributionShare(),
        impactLevel: engine.room?.impactLevel || 1,
        nextImpactLevel: nextImpactLevel,
        players: (engine.room?.players || []).map(player => {
            const score = Number(player.score || 0);
            const impactScore =
                Number(impactScores[player.id] || 0);
            const requiredScore = impactScore + requirement;
            const bandScore = Math.max(0, score - impactScore);

            return {
                id: player.id,
                score: score,
                impactScore: impactScore,
                bandScore: bandScore,
                requiredScore: requiredScore,
                requiredBandScore: requirement,
                remainingScore: Math.max(0, requiredScore - score),
                met: requirement <= 0 || score >= requiredScore
            };
        })
    };
}

function hasMetImpactScoreRequirement(engine, blockedLevel) {
    return engine.getImpactScoreFailures(blockedLevel).length === 0;
}

function failImpactScoreRequirement(engine, blockedLevel) {
    engine.room.state = "failed";
    engine.clearTimers();

    const mvp = engine.getLevelMVP();
    const previousTotalScores = engine.getPlayerScoreMap();
    const impactScoreStatus =
        engine.getImpactScoreStatus(blockedLevel);
    const failures = impactScoreStatus.players.filter(player => {
        return !player.met;
    });
    const requirement = impactScoreStatus.requiredBandScore;

    engine.queueScoreEvent("impact_failed", {
        label: "Impact Failed",
        displayOnly: true,
        meta: {
            blockedLevel: blockedLevel,
            impactScoreRequirement: requirement,
            impactMinContributionShare:
                engine.getImpactMinContributionShare(),
            impactScoreFailures: failures
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
        reason: "impact_score_requirement",
        blockedLevel: blockedLevel,
        exactFinish: false,
        overbuildHeight: 0,
        finisher: null,
        finishingBlock: null,
        carriedBlockCount: 0,
        mvp: mvp,
        previousTotalScores: previousTotalScores,
        impactScoreRequirement: requirement,
        impactMinContributionShare:
            engine.getImpactMinContributionShare(),
        impactScoreStatus: impactScoreStatus,
        impactScoreFailures: failures
    });

    console.log(
        `Impact score requirement failed before level ${blockedLevel}`
    );
    engine.persistRoom();
    engine.broadcastGameState();

    engine.nextLevelTimer = setTimeout(() => {
        engine.rollbackToImpact();
    }, engine.getPostLevelTransitionDelayMs());
}

function rollbackToImpact(engine) {
    engine.room.level = engine.room.impactLevel;
    engine.room.drawPile = [];
    engine.room.teamCarryOverBlocks = [];
    engine.restoreImpactScores();
    engine.restoreImpactPowers();

    engine.room.players.forEach(player => {
        player.blocks = [];
        player.levelScore = 0;
        player.scoreBreakdown = {};
        player.contributedHeight = 0;
    });

    console.log(`Rolling back to impact level ${engine.room.level}`);
    engine.startLevel();
}

module.exports = {
    saveImpactScores,
    saveImpactPowers,
    saveImpactState,
    ensureImpactScores,
    ensureImpactPowers,
    ensureImpactState,
    restoreImpactScores,
    restoreImpactPowers,
    awardImpactPower,
    isImpactLevel,
    getImpactScoreRequirement,
    getImpactMinContributionShare,
    getExpectedPlacementScoreForLevel,
    getExpectedPlacementScoreForImpactBand,
    getImpactBandScoreRequirement,
    getImpactScoreFailures,
    getNextImpactLevel,
    getImpactScoreStatus,
    hasMetImpactScoreRequirement,
    failImpactScoreRequirement,
    rollbackToImpact
};
