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
        structural: Number(breakdown.structural || 0),
        criticalSave: Number(breakdown.criticalSave || 0),
        finisher: Number(breakdown.finisher || 0),
        precision: Number(breakdown.precision || 0),
        teamExact: Number(breakdown.team || 0),
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

function getStructuralAssessment(input) {
    const comparison = input.assessment || TowerStability.comparePlacement(
        input.beforeResult, input.afterResult, input.placedEntry
    );
    const reference = Math.max(
        0.0001, positive(GameConfig.scoring?.strongStructuralImprovement, 1)
    );

    const rawStructuralUtility = Number(comparison.directSupportShare || 0) > 0
        ? Number(comparison.rawStructuralUtility || 0)
        : 0;

    return {
        ...comparison,
        rawStructuralUtility,
        structuralValue: clamp01(rawStructuralUtility / reference)
    };
}

function getCriticalSavePreview(engine, input, assessment) {
    const claims = input.claimedKeys || engine.room?.criticalSaveClaimKeys || {};
    const beforeStability = Number(input.beforeResult?.stability ?? 100);
    const afterStability = Number(input.afterResult?.stability ?? 100);
    const stabilityConfig = input.stabilityConfig || engine.resolveStabilityConfig();
    const maturityHeight = Number(input.afterResult?.analysis?.height || 0);
    const maxClaims = Math.max(
        0, Math.floor(positive(GameConfig.scoring?.criticalSaveMaxPerLevel, 0))
    );
    const claimCount = Number(input.criticalSaveCount ?? Object.keys(claims).length) || 0;
    const reject = reason => ({ eligible: false, reason });

    if (Boolean(input.beforeResult?.diagnostics?.collapsed)) return reject("already_collapsed");
    if (beforeStability > Number(GameConfig.towerStabilityCriticalThreshold || 0)) return reject("not_critical");
    if (afterStability < Number(GameConfig.towerStabilityWarningThreshold || 0)) return reject("still_warning");
    if (!assessment.criticalSaveCandidate) return reject("no_direct_repair");
    if (assessment.criticalRiskReduction < positive(GameConfig.scoring?.criticalSaveMinRiskReduction)) return reject("risk_reduction");
    if (assessment.benefitedLoadShare < positive(GameConfig.scoring?.criticalSaveMinLoadShare)) return reject("load_share");
    if (assessment.directSupportShare <= 0) return reject("indirect_repair");
    if (maturityHeight < positive(stabilityConfig.towerStabilityMinHeight, 1)) return reject("opening");
    if (!assessment.repairClaimKey || claims[assessment.repairClaimKey]) return reject("claimed");
    if (claimCount >= maxClaims) return reject("level_cap");

    return { eligible: true, reason: null };
}

function classifyPlacement(heightPoints, structuralPoints, heightQuality, actionUnit) {
    const material = Math.max(1, Math.round(actionUnit * 0.1));
    const hasHeight = heightPoints >= material;
    const hasStructural = structuralPoints >= material;

    if (hasHeight && heightQuality < 0.9) return "dangerous_height";
    if (hasHeight && hasStructural) return "combined";
    if (hasHeight) return "useful_height";
    if (hasStructural) return "reinforcement";
    return "low_value";
}

function applyPlacementCap(heightPoints, structuralPoints, criticalSavePoints, cap) {
    const total = heightPoints + structuralPoints + criticalSavePoints;
    const excess = Math.max(0, total - cap);
    const critical = Math.max(0, criticalSavePoints - excess);
    const structural = Math.max(0, structuralPoints - Math.max(0, excess - criticalSavePoints));

    return {
        heightPoints,
        structuralPoints: structural,
        criticalSavePoints: critical,
        points: heightPoints + structural + critical,
        capHit: excess > 0
    };
}

function previewPlacementScore(engine, input = {}) {
    const level = Math.max(1, Number(engine.room?.level) || 1);
    const actionUnit = getActionUnit(engine, level);
    const averageHeight = Math.max(1, Number(engine.getAverageBrickHeight()) || 1);
    const effectiveHeight = positive(input.effectiveHeight);
    const assessment = getStructuralAssessment(input);
    const danger = clamp01(
        assessment.riskIncrease / Math.max(0.0001, positive(GameConfig.scoring?.fullDangerRiskIncrease, 1))
    );
    const heightQuality = 1 - (1 - clamp01(GameConfig.scoring?.dangerousHeightFloor)) * danger;
    const heightPoints = Math.round(actionUnit * (effectiveHeight / averageHeight) * heightQuality);
    const structuralPoints = Math.round(
        actionUnit * positive(GameConfig.scoring?.strongReinforcementActionShare) * assessment.structuralValue
    );
    const criticalSave = getCriticalSavePreview(engine, input, assessment);
    const criticalSavePoints = criticalSave.eligible
        ? Math.round(actionUnit * positive(GameConfig.scoring?.criticalSaveBonusActionShare))
        : 0;
    const capShare = criticalSave.eligible
        ? positive(GameConfig.scoring?.criticalCombinedCapActionShare)
        : positive(GameConfig.scoring?.normalCombinedCapActionShare);
    const cap = Math.round(Math.max(
        heightPoints,
        actionUnit * capShare
    ));
    const capped = applyPlacementCap(
        heightPoints, structuralPoints, criticalSavePoints, cap
    );

    return {
        ...capped,
        actionUnit,
        cap,
        effectiveHeight,
        heightQuality,
        danger,
        structuralValue: assessment.structuralValue,
        benefitedLoadShare: assessment.benefitedLoadShare,
        directSupportShare: assessment.directSupportShare,
        riskIncrease: assessment.riskIncrease,
        classification: classifyPlacement(
            capped.heightPoints, capped.structuralPoints, heightQuality, actionUnit
        ),
        criticalSave: criticalSave.eligible,
        criticalSaveRejection: criticalSave.reason,
        repairClaimKey: criticalSave.eligible ? assessment.repairClaimKey : null,
        impactEligiblePoints: capped.points,
        assessment
    };
}

function addPlacementScore(engine, player, input = {}) {
    const transaction = engine.previewPlacementScore(input);

    player.levelScore += transaction.points;
    player.levelImpactContribution = Number(player.levelImpactContribution || 0) +
        transaction.impactEligiblePoints;
    engine.recordScoreBreakdown(player, "height", transaction.heightPoints);
    engine.recordScoreBreakdown(player, "structural", transaction.structuralPoints);
    engine.recordScoreBreakdown(player, "criticalSave", transaction.criticalSavePoints);

    if (transaction.repairClaimKey) {
        engine.room.criticalSaveClaimKeys = engine.room.criticalSaveClaimKeys || {};
        engine.room.criticalSaveClaimKeys[transaction.repairClaimKey] = true;
    }

    engine.queueScoreEvent(transaction.criticalSave ? "critical_save" : "placement", {
        playerId: player.id,
        points: transaction.points,
        label: transaction.criticalSave ? "Critical Save" : "Placement",
        meta: {
            classification: transaction.classification,
            heightPoints: transaction.heightPoints,
            structuralPoints: transaction.structuralPoints,
            criticalSavePoints: transaction.criticalSavePoints,
            effectiveHeight: transaction.effectiveHeight,
            heightQuality: transaction.heightQuality,
            structuralValue: transaction.structuralValue,
            benefitedLoadShare: transaction.benefitedLoadShare
        }
    });

    console.log(`${player.id} gained ${transaction.points} score`);
    return transaction;
}

function awardCompletionBonuses(engine, finisher, exactFinish) {
    engine.addBonusScore(
        finisher,
        engine.room.level * GameConfig.scoring.finisherBonusPerLevel,
        "finisher"
    );

    if (exactFinish) {
        engine.addBonusScore(
            finisher,
            engine.room.level * GameConfig.scoring.precisionBonusPerLevel,
            "precision"
        );

        engine.room.players.forEach(player => {
            engine.addBonusScore(
                player,
                engine.room.level * GameConfig.scoring.teamExactBonusPerLevel,
                "team"
            );
        });
    }

    engine.room.players.forEach(player => {
        const share =
            engine.room.targetHeight === 0
                ? 0
                : player.contributedHeight / engine.room.targetHeight;

        if (share >= GameConfig.scoring.assistContributionThreshold) {
            engine.addBonusScore(
                player,
                engine.room.level * GameConfig.scoring.assistBonusPerLevel,
                "assist"
            );
        }
    });
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
        precision: "precision_bonus",
        team: "team_exact_bonus",
        assist: "assist_bonus"
    };

    return eventTypes[label] || "bonus";
}

function getBonusScoreEventLabel(engine, label) {
    const labels = {
        finisher: "Finisher",
        precision: "Precision",
        team: "Team Exact",
        assist: "Assist"
    };

    return labels[label] || "Bonus";
}

function addLevelScoreToLeaderboard(engine) {
    engine.room.players.forEach(player => {
        player.score += player.levelScore;
        player.impactContribution = Number(player.impactContribution || 0) +
            Number(player.levelImpactContribution || 0);
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
    previewPlacementScore,
    addPlacementScore,
    awardCompletionBonuses,
    addBonusScore,
    getBonusScoreEventType,
    getBonusScoreEventLabel,
    addLevelScoreToLeaderboard,
    getLevelMVP
};
