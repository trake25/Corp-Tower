const GameConfig = require("../Game_Config");

const RESCUED_STABILITY = 1;

function rescuedResult(result) {
    return {
        ...result,
        stability: RESCUED_STABILITY,
        diagnostics: {
            ...result.diagnostics,
            collapsed: false,
            lastChanceRescuePending: true
        }
    };
}

function collapsedResult(result) {
    return {
        ...result,
        stability: 0,
        diagnostics: {
            ...result.diagnostics,
            collapsed: true,
            lastChanceRescuePending: false
        }
    };
}

function resolve(engine, result, advancesRescue = false) {
    if (!GameConfig.powerLastChanceEnabled) {
        engine.room.lastChanceRescuePending = false;
        return result;
    }

    if (engine.room.lastChanceRescuePending) {
        if (!advancesRescue) {
            return rescuedResult(result);
        }

        if (result.stability > RESCUED_STABILITY) {
            engine.room.lastChanceRescuePending = false;
            return result;
        }

        engine.room.lastChanceRescuePending = false;
        return collapsedResult(result);
    }

    if (
        advancesRescue &&
        !engine.room.lastChanceRescueUsed &&
        result.stability <= 0
    ) {
        engine.room.lastChanceRescuePending = true;
        engine.room.lastChanceRescueUsed = true;
        return rescuedResult(result);
    }

    return result;
}

function reset(engine) {
    engine.room.lastChanceRescuePending = false;
    engine.room.lastChanceRescueUsed = false;
}

module.exports = {
    RESCUED_STABILITY,
    resolve,
    reset
};
