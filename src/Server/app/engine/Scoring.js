const GameConfig = require("../Game_Config");

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
        placement: Number(breakdown.placement || 0),
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

function addPlacementScore(engine, player, block, effectiveHeight) {
    const scorePerHeight =
        Number(GameConfig.scoring.placementScorePerHeight) || 1;
    const points = Math.round(
        effectiveHeight *
            engine.room.level *
            scorePerHeight
    );

    player.levelScore += points;
    engine.recordScoreBreakdown(player, "placement", points);
    engine.queueScoreEvent("placement", {
        playerId: player.id,
        points: points,
        label: "Placement",
        meta: {
            effectiveHeight: effectiveHeight,
            blockHeight: engine.getBlockHeight(block),
            block: block
        }
    });

    console.log(`${player.id} gained ${points} score`);
    return points;
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
    addPlacementScore,
    awardCompletionBonuses,
    addBonusScore,
    getBonusScoreEventType,
    getBonusScoreEventLabel,
    addLevelScoreToLeaderboard,
    getLevelMVP
};
