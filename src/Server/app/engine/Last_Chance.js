const GameConfig = require("../Game_Config");

const RESCUED_STABILITY = 1;

function rewriteComponents(result, predicate, stability, collapsed) {
    const rewrittenIds = new Set();
    const components = (result.components || []).map(component => {
        if (!predicate(component)) return component;
        rewrittenIds.add(component.id);
        const rewritten = {
            ...component,
            stability,
            diagnostics: {
                ...component.diagnostics,
                collapsed
            }
        };
        if (collapsed && !(component.collapseEntryIndexes || []).length) {
            rewritten.collapseEntryIndexes = (component.entryIndexes || []).slice();
            rewritten.collapseBlockIds = (component.blockIds || []).slice();
        }
        return rewritten;
    });
    const analysis = result.analysis && Array.isArray(result.analysis.components)
        ? {
            ...result.analysis,
            components: result.analysis.components.map(component => {
                if (!rewrittenIds.has(component.id)) return component;
                const rewritten = { ...component, stability, collapsed };
                if (collapsed && !(component.collapseEntryIndexes || []).length) {
                    rewritten.collapseEntryIndexes = (component.entryIndexes || []).slice();
                    rewritten.collapseBlockIds = (component.blockIds || []).slice();
                }
                return rewritten;
            })
        }
        : result.analysis;

    return { components, analysis };
}

function rescuedResult(result) {
    const rewritten = rewriteComponents(
        result,
        component => Boolean(component.diagnostics?.collapsed),
        RESCUED_STABILITY,
        false
    );

    return {
        ...result,
        ...rewritten,
        stability: RESCUED_STABILITY,
        diagnostics: {
            ...result.diagnostics,
            collapsed: false,
            lastChanceRescuePending: true
        }
    };
}

function collapsedResult(result) {
    const rewritten = rewriteComponents(
        result,
        component => Number(component.stability) <= RESCUED_STABILITY,
        0,
        true
    );

    return {
        ...result,
        ...rewritten,
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
