const GameConfig = require("../Game_Config");
const TowerStability = require("../Tower_Stability");

function createScoreEvent(engine, type, options = {}) {
    engine.room.scoreEventSeq = (engine.room.scoreEventSeq || 0) + 1;

    return {
        id: [
            engine.room.level,
            engine.room.scoreEventSeq,
            type
        ].join(":"),
        type: type,
        level: engine.room.level,
        playerId: options.playerId || null,
        points: Number(options.points || 0),
        label: options.label || type,
        displayOnly: Boolean(options.displayOnly),
        meta: options.meta || {}
    };
}

function queueScoreEvent(engine, type, options = {}) {
    if (!engine.room) {
        return null;
    }

    engine.room.pendingScoreEvents = engine.room.pendingScoreEvents || [];
    const event = engine.createScoreEvent(type, options);

    engine.room.pendingScoreEvents.push(event);
    return event;
}

function consumeScoreEvents(engine) {
    if (!engine.room) {
        return [];
    }

    const events = engine.room.pendingScoreEvents || [];
    engine.room.pendingScoreEvents = [];

    return events;
}

function getPlayerScoreMap(engine) {
    const scores = {};

    engine.room.players.forEach(player => {
        scores[player.id] = Number(player.score || 0);
    });

    return scores;
}

function getTeamLevelScore(engine) {
    return engine.room.players.reduce((total, player) => {
        return total + Number(player.levelScore || 0);
    }, 0);
}

function getPlayerBonusBreakdown(engine, player) {
    const breakdown = player.scoreBreakdown || {};

    return {
        height: Number(breakdown.height || 0),
        recovery: Number(breakdown.recovery || 0),
        structural: Number(breakdown.structural || 0),
        criticalSave: Number(breakdown.criticalSave || 0),
        finisher: Number(breakdown.finisher || 0),
        perfectBuild: Number(breakdown.perfectBuild || 0),
        assist: Number(breakdown.assist || 0)
    };
}

function buildLevelSummary(engine, options) {
    const mvp = options.mvp || engine.getLevelMVP();
    const previousTotalScores = options.previousTotalScores || {};
    const teamLevelScore = engine.getTeamLevelScore();

    return {
        result: options.result,
        reason: options.reason || null,
        failureReason: options.failureReason || null,
        failureStatus: options.failureStatus || null,
        level: engine.room.level,
        blockedLevel: options.blockedLevel || null,
        impactScoreRequirement:
            Number(options.impactScoreRequirement || 0),
        impactMinContributionShare:
            Number(options.impactMinContributionShare || 0),
        impactScoreStatus: options.impactScoreStatus || null,
        impactScoreFailures: options.impactScoreFailures || [],
        teamLevelScore: teamLevelScore,
        mvpId: mvp?.id || null,
        mvpScore: Number(mvp?.levelScore || 0),
        exactFinish: Boolean(options.exactFinish),
        overbuildHeight: Number(options.overbuildHeight || 0),
        perfectBuild: options.perfectBuild || null,
        finisherId: options.finisher?.id || null,
        finishingBlock: options.finishingBlock || null,
        carriedBlockCount: Number(options.carriedBlockCount || 0),
        sideQuest: engine.room.sideQuest || null,
        players: engine.room.players.map(player => {
            const previousTotalScore =
                Number(previousTotalScores[player.id] || 0);

            return {
                id: player.id,
                isBot: Boolean(player.isBot),
                levelScore: Number(player.levelScore || 0),
                previousTotalScore: previousTotalScore,
                finalTotalScore: Number(player.score || 0),
                contributedHeight: Number(player.contributedHeight || 0),
                levelImpactContribution: Number(player.levelImpactContribution || 0),
                impactContribution: Number(player.impactContribution || 0),
                isMvp: player.id === mvp?.id,
                bonusBreakdown: engine.getPlayerBonusBreakdown(player)
            };
        })
    };
}

function recordScoreBreakdown(engine, player, key, points) {
    player.scoreBreakdown = player.scoreBreakdown || {};
    player.scoreBreakdown[key] =
        Number(player.scoreBreakdown[key] || 0) + Number(points || 0);
}

function clamp01(value) {
    return Math.max(0, Math.min(1, Number(value) || 0));
}

function positive(value, fallback = 0) {
    return Math.max(0, Number(value) || fallback);
}

function getActionUnit(engine, level = engine.room?.level) {
    return Math.max(0, Number(level) || 0) *
        positive(GameConfig.scoring?.placementScorePerHeight, 1) *
        Math.max(1, Number(engine.getAverageBrickHeight()) || 1);
}

function getExpectedNormalUsefulScoreForLevel(engine, level) {
    return Math.round(
        Math.max(0, Number(engine.getTargetHeightForLevel(level)) || 0) *
        Math.max(0, Number(level) || 0) *
        positive(GameConfig.scoring?.placementScorePerHeight, 1)
    );
}

function getStructuralAssessment(engine, input) {
    const settledResult = input.settledResult || input.afterResult;
    const comparison = input.assessment || TowerStability.comparePlacement(
        input.beforeResult,
        settledResult,
        input.placedEntry
    );
    const peakComparison = input.peakAssessment || TowerStability.comparePlacement(
        input.beforeResult,
        input.peakResult || settledResult,
        input.placedEntry
    );
    const reference = Math.max(
        0.0001, positive(GameConfig.scoring?.strongStructuralImprovement, 1)
    );

    const rawStructuralUtility = Number(comparison.directSupportShare || 0) > 0
        ? Number(comparison.rawStructuralUtility || 0)
        : 0;

    return {
        ...comparison,
        riskIncrease: input.assessment && !input.peakAssessment
            ? Number(comparison.riskIncrease || 0)
            : peakComparison.riskIncrease,
        affectedPeakRisk: peakComparison.affectedAfterRisk,
        rawStructuralUtility,
        structuralValue: clamp01(rawStructuralUtility / reference)
    };
}

function getCriticalSavePreview(engine, input, assessment) {
    const claims = input.claimedKeys || engine.room?.criticalSaveClaimKeys || {};
    const beforeStability = Number(
        assessment.criticalSupportBeforeStability ??
        assessment.criticalInterfaceBefore?.supportStability ??
        assessment.affectedBeforeStability ??
        input.beforeResult?.stability ??
        100
    );
    const afterStability = Number(
        assessment.criticalSupportAfterStability ??
        assessment.criticalInterfaceAfter?.supportStability ??
        assessment.affectedAfterStability ??
        input.settledResult?.stability ??
        input.afterResult?.stability ??
        100
    );
    const stabilityConfig = input.stabilityConfig || engine.resolveStabilityConfig();
    const maturityHeight = Number((input.settledResult || input.afterResult)?.analysis?.height || 0);
    const maxClaims = Math.max(
        0, Math.floor(positive(GameConfig.scoring?.criticalSaveMaxPerLevel, 0))
    );
    const claimCount = Number(input.criticalSaveCount ?? Object.keys(claims).length) || 0;
    const reject = reason => ({ eligible: false, reason });

    if (Boolean(input.beforeResult?.diagnostics?.collapsed)) return reject("already_collapsed");
    if (Boolean(input.collapseSummary?.anyFallen)) return reject("collapse");
    if (Boolean(input.lastChanceRescued)) return reject("last_chance");
    if (positive(input.newHeightRows) > 0) return reject("new_height");
    if ((input.recoveryRows || []).length > 0) return reject("recovery");
    const criticalThreshold = Number(GameConfig.towerStabilityCriticalThreshold || 0);
    if (beforeStability > criticalThreshold) return reject("not_critical");
    if (afterStability <= criticalThreshold) return reject("still_critical");
    if (!assessment.criticalSaveCandidate) return reject("no_direct_repair");
    if (assessment.criticalRiskReduction < positive(GameConfig.scoring?.criticalSaveMinRiskReduction)) return reject("risk_reduction");
    if (assessment.benefitedLoadShare < positive(GameConfig.scoring?.criticalSaveMinLoadShare)) return reject("load_share");
    if (assessment.directSupportShare <= 0) return reject("indirect_repair");
    if (maturityHeight < positive(stabilityConfig.towerStabilityMinHeight, 1)) return reject("opening");
    if (!assessment.repairClaimKey || claims[assessment.repairClaimKey]) return reject("claimed");
    if (claimCount >= maxClaims) return reject("level_cap");

    return { eligible: true, reason: null };
}

function classifyPlacement(heightPoints, recoveryPoints, structuralPoints, heightQuality, actionUnit) {
    const material = Math.max(1, Math.round(actionUnit * 0.1));
    const hasHeight = heightPoints >= material;
    const hasStructural = structuralPoints >= material;
    const hasRecovery = recoveryPoints > 0;

    if (hasHeight && heightQuality < 0.9) return "dangerous_height";
    if (hasHeight && hasStructural) return "combined";
    if (hasHeight) return "useful_height";
    if (hasRecovery && hasStructural) return "combined";
    if (hasRecovery) return "recovery";
    if (hasStructural) return "reinforcement";
    return "low_value";
}

function classifyHeightRows(engine, input) {
    if (!Number.isFinite(Number(input.previousHeight))) {
        return {
            newHeightRows: positive(input.effectiveHeight),
            recoveryRows: []
        };
    }

    const previousHeight = Math.max(0, Math.floor(Number(input.previousHeight) || 0));
    const settledHeight = Math.max(previousHeight, Math.floor(Number(input.settledHeight) || 0));
    const targetValue = Number(input.targetHeight ?? engine.room?.targetHeight);
    const scorableHeight = Number.isFinite(targetValue)
        ? Math.min(settledHeight, Math.max(0, Math.floor(targetValue)))
        : settledHeight;
    const historicalMaximum = Math.max(0, Math.floor(Number(
        input.historicalMaxStandingHeight ?? engine.room?.historicalMaxStandingHeight
    ) || 0));
    let newHeightRows = 0;
    const recoveryRows = [];

    for (let row = previousHeight + 1; row <= scorableHeight; row += 1) {
        if (row > historicalMaximum) {
            newHeightRows += 1;
        } else {
            recoveryRows.push(row);
        }
    }

    return { newHeightRows, recoveryRows };
}

function getRebuildScoreMultipliers(engine, rows, input) {
    if (rows.recoveryRows.length === 0) {
        return { recovery: 1, structural: 1 };
    }

    const rebuildCount = Math.max(0, Math.floor(Number(
        input.rebuildScoreCount ?? engine.room?.rebuildScoreCount
    ) || 0));
    const recovery = 0.5 ** rebuildCount;

    return { recovery, structural: recovery };
}

function previewPlacementScore(engine, input = {}) {
    const level = Math.max(1, Number(engine.room?.level) || 1);
    const actionUnit = getActionUnit(engine, level);
    const rowValue = level * positive(GameConfig.scoring?.placementScorePerHeight, 1);
    const rows = classifyHeightRows(engine, input);
    const rebuildMultipliers = getRebuildScoreMultipliers(engine, rows, input);
    const assessment = getStructuralAssessment(engine, input);
    const danger = clamp01(
        assessment.riskIncrease / Math.max(0.0001, positive(GameConfig.scoring?.fullDangerRiskIncrease, 1))
    );
    const heightQuality = 1 - (1 - clamp01(GameConfig.scoring?.dangerousHeightFloor)) * danger;
    const collapse = Boolean(input.collapseSummary?.anyFallen);
    const effectiveHeight = collapse ? 0 : rows.newHeightRows;
    const heightPoints = collapse ? 0 : Math.round(rows.newHeightRows * rowValue * heightQuality);
    const recoveryShare = clamp01(positive(GameConfig.scoring?.recoveryHeightScorePercent) / 100);
    const recoveryPoints = collapse ? 0 : Math.round(
        rows.recoveryRows.length * rowValue * heightQuality * recoveryShare * rebuildMultipliers.recovery
    );
    const reinforcementPoints = collapse || assessment.isActiveTower === false ? 0 : Math.round(
        actionUnit * positive(GameConfig.scoring?.strongReinforcementActionShare) *
        assessment.structuralValue * rebuildMultipliers.structural
    );
    const criticalSave = collapse
        ? { eligible: false, reason: "collapse" }
        : getCriticalSavePreview(engine, {
            ...input,
            newHeightRows: rows.newHeightRows,
            recoveryRows: rows.recoveryRows
        }, assessment);
    const criticalSavePoints = criticalSave.eligible
        ? Math.round(actionUnit * positive(GameConfig.scoring?.criticalSaveActionShare))
        : 0;
    const structuralPoints = criticalSave.eligible ? 0 : reinforcementPoints;
    const points = heightPoints + recoveryPoints + structuralPoints + criticalSavePoints;

    return {
        heightPoints,
        recoveryPoints,
        structuralPoints,
        criticalSavePoints,
        points,
        actionUnit,
        effectiveHeight,
        newHeight: effectiveHeight,
        recoveredHeight: collapse ? 0 : rows.recoveryRows.length,
        recoveryRows: collapse ? [] : rows.recoveryRows,
        heightQuality,
        danger,
        structuralValue: assessment.structuralValue,
        benefitedLoadShare: assessment.benefitedLoadShare,
        directSupportShare: assessment.directSupportShare,
        riskIncrease: assessment.riskIncrease,
        classification: collapse
            ? "collapse"
            : criticalSave.eligible
                ? "critical_save"
                : classifyPlacement(
                    heightPoints, recoveryPoints, structuralPoints, heightQuality, actionUnit
                ),
        criticalSave: criticalSave.eligible,
        criticalSaveRejection: criticalSave.reason,
        repairClaimKey: criticalSave.eligible ? assessment.repairClaimKey : null,
        collapse,
        impactEligiblePoints: collapse ? 0 : points,
        assessment
    };
}

function addPlacementScore(engine, player, input = {}) {
    const transaction = engine.previewPlacementScore(input);

    player.levelScore += transaction.points;
    player.levelImpactContribution = Number(player.levelImpactContribution || 0) +
        transaction.impactEligiblePoints;
    engine.recordScoreBreakdown(player, "height", transaction.heightPoints);
    engine.recordScoreBreakdown(player, "recovery", transaction.recoveryPoints);
    engine.recordScoreBreakdown(player, "structural", transaction.structuralPoints);
    engine.recordScoreBreakdown(player, "criticalSave", transaction.criticalSavePoints);

    if (transaction.repairClaimKey) {
        engine.room.criticalSaveClaimKeys = engine.room.criticalSaveClaimKeys || {};
        engine.room.criticalSaveClaimKeys[transaction.repairClaimKey] = true;
    }

    if (transaction.recoveryRows.length > 0) {
        engine.room.rebuildScoreCount = Math.max(
            0, Math.floor(Number(engine.room.rebuildScoreCount) || 0)
        ) + 1;
    }
    engine.room.historicalMaxStandingHeight = Math.max(
        Number(engine.room.historicalMaxStandingHeight || 0),
        Number(input.settledHeight ?? engine.room.currentHeight ?? 0)
    );

    if (!transaction.collapse) engine.queueScoreEvent(transaction.criticalSave ? "critical_save" : "placement", {
        playerId: player.id,
        points: transaction.points,
        label: transaction.criticalSave ? "Critical Save" : (transaction.classification === "recovery" ? "Recovery" : "Placement"),
        meta: {
            classification: transaction.classification,
            heightPoints: transaction.heightPoints,
            recoveryPoints: transaction.recoveryPoints,
            structuralPoints: transaction.structuralPoints,
            criticalSavePoints: transaction.criticalSavePoints,
            effectiveHeight: transaction.effectiveHeight,
            newHeight: transaction.newHeight,
            recoveredHeight: transaction.recoveredHeight,
            heightQuality: transaction.heightQuality,
            structuralValue: transaction.structuralValue,
            benefitedLoadShare: transaction.benefitedLoadShare
        }
    });

    console.log(`${player.id} gained ${transaction.points} score`);
    return transaction;
}

function getPerfectBuildFinisherPoints(engine) {
    return Math.round(
        engine.getActionUnit() *
        positive(GameConfig.scoring?.perfectBuildFinisherActionShare)
    );
}

function awardCompletionBonuses(engine, finisher, exactFinish) {
    const awards = {
        finisher: engine.addBonusScore(
            finisher,
            engine.room.level * GameConfig.scoring.finisherBonusPerLevel,
            "finisher"
        ),
        perfectBuild: 0,
        assists: {}
    };

    if (exactFinish) {
        awards.perfectBuild = engine.addBonusScore(
            finisher,
            getPerfectBuildFinisherPoints(engine),
            "perfectBuild"
        );
    }

    engine.room.players.forEach(player => {
        const share =
            engine.room.targetHeight === 0
                ? 0
                : player.contributedHeight / engine.room.targetHeight;

        if (share >= GameConfig.scoring.assistContributionThreshold) {
            awards.assists[player.id] = engine.addBonusScore(
                player,
                engine.room.level * GameConfig.scoring.assistBonusPerLevel,
                "assist"
            );
        }
    });

    return awards;
}

function addBonusScore(engine, player, points, label) {
    const safePoints = Math.round(Number(points) || 0);

    if (safePoints <= 0) {
        return 0;
    }

    player.levelScore += safePoints;
    engine.recordScoreBreakdown(player, label, safePoints);
    engine.queueScoreEvent(engine.getBonusScoreEventType(label), {
        playerId: player.id,
        points: safePoints,
        label: engine.getBonusScoreEventLabel(label)
    });

    console.log(`${player.id} gained ${safePoints} ${label} bonus`);
    return safePoints;
}

function getBonusScoreEventType(engine, label) {
    const eventTypes = {
        finisher: "finisher_bonus",
        perfectBuild: "precision_bonus",
        assist: "assist_bonus"
    };

    return eventTypes[label] || "bonus";
}

function getBonusScoreEventLabel(engine, label) {
    const labels = {
        finisher: "Finisher",
        perfectBuild: "Perfect Build",
        assist: "Assist"
    };

    return labels[label] || "Bonus";
}

function addLevelScoreToLeaderboard(engine) {
    engine.room.players.forEach(player => {
        player.score += player.levelScore;
        player.impactContribution = Number(player.impactContribution || 0) +
            Number(player.levelImpactContribution || 0);
        player.levelImpactContribution = 0;
        console.log(`${player.id} level score (${player.levelScore}) added to leaderboard score. New total: ${player.score}`);
    });
}

function getLevelMVP(engine) {
    let mvp = engine.room.players[0];

    engine.room.players.forEach(player => {
        if (player.levelScore > mvp.levelScore) {
            mvp = player;
        }
    });

    return mvp;
}

module.exports = {
    createScoreEvent,
    queueScoreEvent,
    consumeScoreEvents,
    getPlayerScoreMap,
    getTeamLevelScore,
    getPlayerBonusBreakdown,
    buildLevelSummary,
    recordScoreBreakdown,
    getActionUnit,
    getExpectedNormalUsefulScoreForLevel,
    getPerfectBuildFinisherPoints,
    previewPlacementScore,
    addPlacementScore,
    awardCompletionBonuses,
    addBonusScore,
    getBonusScoreEventType,
    getBonusScoreEventLabel,
    addLevelScoreToLeaderboard,
    getLevelMVP
};
