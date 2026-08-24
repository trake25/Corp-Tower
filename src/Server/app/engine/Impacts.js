const GameConfig = require("../Game_Config");

function number(value) {
    return Number(value) || 0;
}

function saveImpactScores(engine) {
    if (!engine.room) return;

    engine.room.impactScores = {};
    engine.room.players.forEach(player => {
        engine.room.impactScores[player.id] = number(player.score);
    });
}

function saveImpactPowers(engine) {
    if (!engine.room) return;

    engine.room.impactPowers = {};
    engine.room.players.forEach(player => {
        engine.room.impactPowers[player.id] =
            engine.clonePowerInventory(player.powerInventory || []);
    });
}

function saveImpactContributions(engine) {
    if (!engine.room) return;

    engine.room.impactContributions = {};
    engine.room.players.forEach(player => {
        engine.room.impactContributions[player.id] =
            number(player.impactContribution);
    });
}

function saveImpactState(engine) {
    engine.saveImpactScores();
    engine.saveImpactPowers();
    engine.saveImpactContributions();
}

function ensureImpactScores(engine) {
    if (!engine.room.impactScores || Object.keys(engine.room.impactScores).length === 0) {
        engine.saveImpactScores();
    }
}

function ensureImpactPowers(engine) {
    if (!engine.room.impactPowers || Object.keys(engine.room.impactPowers).length === 0) {
        engine.saveImpactPowers();
    }
}

function ensureImpactContributions(engine) {
    if (!engine.room.impactContributions || Object.keys(engine.room.impactContributions).length === 0) {
        engine.saveImpactContributions();
    }
}

function getImpactRecoverableFailureLimit() {
    const configured = Number(GameConfig.impactRecoverableFailures);

    return Number.isFinite(configured)
        ? Math.max(0, Math.floor(configured))
        : 3;
}

function normalizeImpactFailureState(engine) {
    if (!engine.room) return;

    const limit = getImpactRecoverableFailureLimit();
    engine.room.impactFailureCount = Math.max(
        0,
        Math.min(limit + 1, Math.floor(number(engine.room.impactFailureCount)))
    );
    engine.room.lastImpactFailureReason = engine.room.lastImpactFailureReason || null;
    engine.room.failureTransitionCommitted = Boolean(engine.room.failureTransitionCommitted);
    engine.room.terminalCloseAt = Math.max(0, number(engine.room.terminalCloseAt));
    engine.room.terminalFailureReason = engine.room.terminalFailureReason || null;
    engine.room.terminalCloseRequested = Boolean(engine.room.terminalCloseRequested);
}

function ensureImpactState(engine) {
    engine.ensureImpactScores();
    engine.ensureImpactPowers();
    engine.ensureImpactContributions();
    normalizeImpactFailureState(engine);
}

function restoreImpactScores(engine) {
    const impactScores = engine.room.impactScores || {};

    engine.room.players.forEach(player => {
        player.score = number(impactScores[player.id]);
    });
}

function restoreImpactPowers(engine) {
    const impactPowers = engine.room.impactPowers || {};

    engine.room.players.forEach(player => {
        player.powerInventory = engine.clonePowerInventory(
            impactPowers[player.id] || []
        );
    });
}

function restoreImpactContributions(engine) {
    const contributions = engine.room.impactContributions || {};

    engine.room.players.forEach(player => {
        player.impactContribution = number(contributions[player.id]);
    });
}

function secureImpactCheckpoint(engine) {
    if (!engine.room) return;

    engine.room.impactFailureCount = 0;
    engine.room.lastImpactFailureReason = null;
    engine.room.failureTransitionCommitted = false;
    engine.room.terminalCloseAt = 0;
    engine.room.terminalFailureReason = null;
    engine.room.terminalCloseRequested = false;
}

function awardImpactPower(engine) {
    if (!GameConfig.powerImpactMvpReward) return;

    const winner = engine.room.players.reduce((best, player) => {
        return !best || number(player.score) > number(best.score) ? player : best;
    }, null);

    if (!winner || (winner.powerInventory || []).length >= GameConfig.powerMaxSlots) {
        return;
    }

    const catalog = GameConfig.powerCatalog || {};
    const ids = Object.keys(catalog).filter(id => catalog[id].active);

    if (ids.length === 0) return;

    const powerId = ids[Math.floor(Math.random() * ids.length)];
    winner.powerInventory = winner.powerInventory || [];
    winner.powerInventory.push({
        id: powerId,
        earnedLevel: engine.room.level,
        source: "impact_mvp"
    });
    engine.room.pendingPowerEvents = engine.room.pendingPowerEvents || [];
    engine.room.pendingPowerEvents.push({
        id: `${engine.room.level}:impact-power:${winner.id}`,
        type: "power_impact_reward",
        playerId: winner.id,
        powerId,
        label: "Impact Power"
    });
}

function isImpactLevel(engine, level) {
    const interval = Math.max(1, Math.floor(number(GameConfig.impactInterval) || 1));

    return (level - 1) % interval === 0;
}

function getImpactScoreRequirement() {
    return Math.max(0, number(GameConfig.impactScoreRequirement));
}

function getImpactMinContributionShare() {
    return Math.max(0, Math.min(1, number(GameConfig.impactMinContributionShare)));
}

function getExpectedPlacementScoreForLevel(engine, level) {
    return engine.getExpectedNormalUsefulScoreForLevel(level);
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
    return Math.max(
        engine.getImpactScoreRequirement(),
        Math.round(
            engine.getExpectedPlacementScoreForImpactBand(blockedLevel) *
            engine.getImpactMinContributionShare()
        )
    );
}

function getImpactFailureStatus(engine) {
    const limit = getImpactRecoverableFailureLimit();
    const failureCount = Math.max(
        0,
        Math.min(limit + 1, Math.floor(number(engine.room?.impactFailureCount)))
    );

    return {
        failureCount,
        recoverableFailureLimit: limit,
        retriesRemaining: Math.max(0, limit - failureCount),
        lastChance: failureCount === limit,
        gameOver: failureCount > limit,
        lastFailureReason: engine.room?.lastImpactFailureReason || null
    };
}

function getImpactScoreStatus(engine, blockedLevel = null) {
    const nextImpactLevel = blockedLevel || engine.getNextImpactLevel();
    const requirement = engine.getImpactBandScoreRequirement(nextImpactLevel);
    const checkpointContributions = engine.room?.impactContributions || {};
    const failureStatus = engine.getImpactFailureStatus();

    return {
        requiredContribution: requirement,
        requiredBandScore: requirement,
        requiredScore: requirement,
        minContributionShare: engine.getImpactMinContributionShare(),
        impactLevel: engine.room?.impactLevel || 1,
        nextImpactLevel,
        ...failureStatus,
        players: (engine.room?.players || []).map(player => {
            const checkpointContribution = number(checkpointContributions[player.id]);
            const bankedBandContribution = Math.max(
                0,
                number(player.impactContribution) - checkpointContribution
            );
            const liveLevelContribution = number(player.levelImpactContribution);
            const bandContribution = bankedBandContribution + liveLevelContribution;
            const remainingContribution = Math.max(0, requirement - bandContribution);

            return {
                id: player.id,
                checkpointContribution,
                bankedBandContribution,
                liveLevelContribution,
                bandContribution,
                requiredContribution: requirement,
                remainingContribution,
                met: requirement <= 0 || bandContribution >= requirement,
                score: number(player.score),
                impactScore: checkpointContribution,
                bandScore: bankedBandContribution,
                requiredScore: requirement,
                requiredBandScore: requirement,
                remainingScore: remainingContribution
            };
        })
    };
}

function getImpactScoreFailures(engine, blockedLevel) {
    return engine.getImpactScoreStatus(blockedLevel).players.filter(player => !player.met);
}

function getNextImpactLevel(engine) {
    const interval = Math.max(1, Math.floor(number(GameConfig.impactInterval) || 1));
    const currentLevel = engine.room?.level || 1;
    const offset = (currentLevel - 1) % interval;

    return Math.min(GameConfig.maxLevel, currentLevel + interval - offset);
}

function hasMetImpactScoreRequirement(engine, blockedLevel) {
    return engine.getImpactScoreFailures(blockedLevel).length === 0;
}

function clearAttemptState(engine) {
    engine.room.drawPile = [];
    engine.room.drawPileStartCount = 0;
    engine.room.teamCarryOverBlocks = [];
    engine.room.criticalSaveClaimKeys = {};
    engine.room.sideQuest = null;

    engine.room.players.forEach(player => {
        player.blocks = [];
        player.levelScore = 0;
        player.levelImpactContribution = 0;
        player.scoreBreakdown = {};
        player.contributedHeight = 0;
        player.scoreCap = null;
        player.scoreCapCasterId = null;
    });
}

function buildFailureSummary(engine, options) {
    return engine.buildLevelSummary({
        result: options.result,
        reason: options.reason,
        failureReason: options.failureReason || options.reason,
        blockedLevel: options.blockedLevel,
        exactFinish: false,
        overbuildHeight: 0,
        finisher: null,
        finishingBlock: null,
        carriedBlockCount: 0,
        mvp: options.mvp,
        previousTotalScores: options.previousTotalScores,
        impactScoreRequirement: options.impactScoreStatus.requiredContribution,
        impactMinContributionShare: engine.getImpactMinContributionShare(),
        impactScoreStatus: options.impactScoreStatus,
        impactScoreFailures: options.impactScoreFailures,
        failureStatus: options.failureStatus
    });
}

function queueFailureEvents(engine, options) {
    if (options.reason === "impact_score_requirement") {
        engine.queueScoreEvent("impact_failed", {
            label: "Impact Failed",
            displayOnly: true,
            meta: {
                blockedLevel: options.blockedLevel,
                impactScoreRequirement: options.impactScoreStatus.requiredContribution,
                impactMinContributionShare: engine.getImpactMinContributionShare(),
                impactScoreFailures: options.impactScoreFailures
            }
        });
    }

    if (options.mvp) {
        engine.queueScoreEvent("mvp", {
            playerId: options.mvp.id,
            points: number(options.mvp.levelScore),
            label: "MVP",
            displayOnly: true
        });
    }
}

function scheduleCheckpointRecovery(engine, delayMs = null) {
    if (!engine.room || engine.room.state !== "failed") return;

    const delay = delayMs === null
        ? engine.getPostLevelTransitionDelayMs()
        : Math.max(0, number(delayMs));

    engine.nextLevelTimer = setTimeout(() => {
        engine.rollbackToImpact();
    }, delay);
}

function scheduleTerminalRoomClose(engine, delayMs = null) {
    if (!engine.room || engine.room.state !== "game_over") return;

    const delay = delayMs === null
        ? Math.max(0, number(engine.room.terminalCloseAt) - Date.now())
        : Math.max(0, number(delayMs));

    engine.nextLevelTimer = setTimeout(() => {
        engine.requestRoomClose("failure_limit_reached", "home");
    }, delay);
}

function resolveCheckpointFailure(engine, options = {}) {
    if (!engine.room || engine.room.failureTransitionCommitted) return false;

    const reason = options.reason || "unknown_failure";
    const fromImpactGate = Boolean(options.fromImpactGate);
    const validState = fromImpactGate
        ? engine.room.state === "finished"
        : engine.room.state === "playing" || engine.room.state === "starting";

    if (!validState) return false;

    engine.room.failureTransitionCommitted = true;
    engine.room.impactFailureCount = Math.min(
        getImpactRecoverableFailureLimit() + 1,
        Math.max(0, Math.floor(number(engine.room.impactFailureCount))) + 1
    );
    engine.room.lastImpactFailureReason = reason;
    engine.clearTimers();
    engine.stopBots();

    const blockedLevel = options.blockedLevel || null;
    const impactScoreStatus = engine.getImpactScoreStatus(blockedLevel);
    const impactScoreFailures = impactScoreStatus.players.filter(player => !player.met);
    const failureStatus = engine.getImpactFailureStatus();
    const mvp = engine.getLevelMVP();
    const previousTotalScores = engine.getPlayerScoreMap();
    const transitionDelay = engine.getPostLevelTransitionDelayMs();

    engine.recordLevelOutcome("failed");
    queueFailureEvents(engine, {
        reason,
        blockedLevel,
        impactScoreStatus,
        impactScoreFailures,
        mvp
    });

    if (failureStatus.gameOver) {
        engine.room.state = "game_over";
        engine.room.freezeEndsAt = 0;
        engine.room.terminalFailureReason = reason;
        engine.room.terminalCloseAt = Date.now() + transitionDelay;
        engine.room.terminalCloseRequested = false;
        engine.restoreImpactScores();
        engine.restoreImpactPowers();
        engine.restoreImpactContributions();
        clearAttemptState(engine);
        engine.room.lastLevelSummary = buildFailureSummary(engine, {
            result: "game_over",
            reason: "failure_limit_reached",
            failureReason: reason,
            blockedLevel,
            impactScoreStatus,
            impactScoreFailures,
            failureStatus,
            mvp,
            previousTotalScores: engine.getPlayerScoreMap()
        });
        engine.persistRoom();
        engine.broadcastGameState();
        scheduleTerminalRoomClose(engine);
        return true;
    }

    engine.room.state = "failed";
    engine.room.freezeEndsAt = Date.now() + transitionDelay;
    engine.room.lastLevelSummary = buildFailureSummary(engine, {
        result: "failed",
        reason,
        blockedLevel,
        impactScoreStatus,
        impactScoreFailures,
        failureStatus,
        mvp,
        previousTotalScores
    });
    engine.persistRoom();
    engine.broadcastGameState();
    scheduleCheckpointRecovery(engine);

    return true;
}

function failImpactScoreRequirement(engine, blockedLevel) {
    return resolveCheckpointFailure(engine, {
        reason: "impact_score_requirement",
        blockedLevel,
        fromImpactGate: true
    });
}

function rollbackToImpact(engine) {
    if (!engine.room || engine.room.state !== "failed") return false;

    engine.room.level = engine.room.impactLevel;
    engine.restoreImpactScores();
    engine.restoreImpactPowers();
    engine.restoreImpactContributions();
    clearAttemptState(engine);
    engine.startLevel();

    return true;
}

module.exports = {
    saveImpactScores,
    saveImpactPowers,
    saveImpactContributions,
    saveImpactState,
    ensureImpactScores,
    ensureImpactPowers,
    ensureImpactContributions,
    ensureImpactState,
    normalizeImpactFailureState,
    restoreImpactScores,
    restoreImpactPowers,
    restoreImpactContributions,
    secureImpactCheckpoint,
    awardImpactPower,
    isImpactLevel,
    getImpactScoreRequirement,
    getImpactMinContributionShare,
    getExpectedPlacementScoreForLevel,
    getExpectedPlacementScoreForImpactBand,
    getImpactBandScoreRequirement,
    getImpactFailureStatus,
    getImpactScoreFailures,
    getNextImpactLevel,
    getImpactScoreStatus,
    hasMetImpactScoreRequirement,
    clearAttemptState,
    resolveCheckpointFailure,
    scheduleCheckpointRecovery,
    scheduleTerminalRoomClose,
    failImpactScoreRequirement,
    rollbackToImpact
};
