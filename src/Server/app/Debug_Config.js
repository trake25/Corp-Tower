const GameConfig = require("./Game_Config");

const FIELD_PATHS = {
    debugBotsEnabled: ["game", "debugBotsEnabled"],
    showLatencyIndicator: ["game", "showLatencyIndicator"],
    debugBotCount: ["game", "debugBotCount"],
    debugBotStrategy: ["game", "debugBotStrategy"],
    debugStartLevel: ["game", "debugStartLevel"],
    debugBotDelayMin: ["game", "debugBotDelayMin"],
    debugBotDelayMax: ["game", "debugBotDelayMax"],
    placementCooldown: ["game", "placementCooldown"],
    quickChatCooldownMs: ["game", "quickChatCooldownMs"],
    towerStabilityFeedbackMode: ["game", "towerStabilityFeedbackMode"],
    levelTimeLimitMs: ["game", "levelTimeLimitMs"],
    startDelayMs: ["game", "startDelayMs"],
    placementScorePopupDurationMs: ["game", "placementScorePopupDurationMs"],
    finishScorePopupDurationMs: ["game", "finishScorePopupDurationMs"],
    levelSummaryDelayMs: ["game", "levelSummaryDelayMs"],
    impactScoreRequirement: ["game", "impactScoreRequirement"],
    impactMinContributionShare: ["game", "impactMinContributionShare"],
    impactInterval: ["game", "impactInterval"],
    targetHeightMultiplier: ["game", "targetHeightMultiplier"],
    levelSupplyMinSurplus: ["game", "levelSupplyMinSurplus"],
    levelSupplyMaxSurplus: ["game", "levelSupplyMaxSurplus"],
    minPrecisionBlocksPerLevel: ["game", "minPrecisionBlocksPerLevel"],
    maxTeamCarryOverBlocks: ["game", "maxTeamCarryOverBlocks"],
    refreshMinUsefulBlockHeight: ["game", "refreshMinUsefulBlockHeight"],
    towerStabilityDifficulty: ["game", "towerStabilityDifficulty"],
    towerStructuralPoseMaxAngleDeg: ["game", "towerStructuralPoseMaxAngleDeg"],
    towerSiteSlendernessTarget: ["game", "towerSiteSlendernessTarget"],
    towerSiteWidthMin: ["game", "towerSiteWidthMin"],
    towerSiteWidthMax: ["game", "towerSiteWidthMax"],
    supplyEffectiveWidthRatio: ["game", "supplyEffectiveWidthRatio"],
    towerStabilityWarningThreshold: ["game", "towerStabilityWarningThreshold"],
    towerStabilityCriticalThreshold: ["game", "towerStabilityCriticalThreshold"],
    towerStabilityMoodThreshold: ["game", "towerStabilityMoodThreshold"],
    powerUnlockLevel: ["game", "powerUnlockLevel"],
    powerMaxSlots: ["game", "powerMaxSlots"],
    powerActivationCooldownMs: ["game", "powerActivationCooldownMs"],
    powerReplenishPileShare: ["game", "powerReplenishPileShare"],
    powerLastChanceEnabled: ["game", "powerLastChanceEnabled"],
    placementScorePerHeight: ["scoring", "placementScorePerHeight"],
    recoveryHeightScorePercent: ["scoring", "recoveryHeightScorePercent"],
    dangerousHeightFloor: ["scoring", "dangerousHeightFloor"],
    strongReinforcementActionShare: ["scoring", "strongReinforcementActionShare"],
    normalCombinedCapActionShare: ["scoring", "normalCombinedCapActionShare"],
    criticalSaveBonusActionShare: ["scoring", "criticalSaveBonusActionShare"],
    criticalCombinedCapActionShare: ["scoring", "criticalCombinedCapActionShare"],
    visualHookImpactBeat: ["visualHooks", "impactBeat"],
    visualHookScreenShake: ["visualHooks", "screenShake"],
    visualHookZoomOutMs: ["visualHooks", "impactBeatZoomOutMs"],
    visualHookWaveMs: ["visualHooks", "impactBeatWaveMs"],
    visualHookHoldMs: ["visualHooks", "impactBeatHoldMs"],
    visualHookShakeMs: ["visualHooks", "screenShakeMs"]
};

const RULES = {
    debugBotsEnabled: ["bool"],
    showLatencyIndicator: ["bool"],
    debugBotCount: ["int", 0, 2],
    debugBotStrategy: ["enum", ["cooperative", "mvp_greedy"]],
    debugStartLevel: ["int", 1, () => GameConfig.maxLevel],
    debugBotDelayMin: ["int", 250, 10000],
    debugBotDelayMax: ["int", 250, 10000],
    placementCooldown: ["int", 0, 5000],
    quickChatCooldownMs: ["int", 1000, 30000],
    towerStabilityFeedbackMode: ["enum", ["warnings_only", "live_preview"]],
    levelTimeLimitMs: ["int", 5000, 120000],
    startDelayMs: ["int", 0, 10000],
    placementScorePopupDurationMs: ["int", 500, 10000],
    finishScorePopupDurationMs: ["int", 500, 10000],
    levelSummaryDelayMs: ["int", 1000, 10000],
    impactScoreRequirement: ["int", 0, 1000000],
    impactMinContributionShare: ["number", 0, 1],
    impactInterval: ["int", 1, 10],
    targetHeightMultiplier: ["int", 1, 20],
    levelSupplyMinSurplus: ["int", 0, 20],
    levelSupplyMaxSurplus: ["int", 0, 30],
    minPrecisionBlocksPerLevel: ["int", 0, 9],
    maxTeamCarryOverBlocks: ["int", 0, 12],
    refreshMinUsefulBlockHeight: ["int", 1, 6],
    towerStabilityDifficulty: ["int", 0, 100],
    towerStructuralPoseMaxAngleDeg: ["int", 2, 20],
    towerSiteSlendernessTarget: ["number", 1, 12],
    towerSiteWidthMin: ["int", 2, 8],
    towerSiteWidthMax: ["int", 2, 8],
    supplyEffectiveWidthRatio: ["number", 0.1, 2],
    towerStabilityWarningThreshold: ["int", 0, 100],
    towerStabilityCriticalThreshold: ["int", 0, 100],
    towerStabilityMoodThreshold: ["int", 1, 50],
    powerUnlockLevel: ["int", 1, () => GameConfig.maxLevel],
    powerMaxSlots: ["int", 1, 6],
    powerActivationCooldownMs: ["int", 0, 30000],
    powerReplenishPileShare: ["number", 0, 1],
    powerLastChanceEnabled: ["bool"],
    placementScorePerHeight: ["int", 1, 25],
    recoveryHeightScorePercent: ["int", 0, 100],
    dangerousHeightFloor: ["number", 0.1, 1],
    strongReinforcementActionShare: ["number", 0.1, 1],
    normalCombinedCapActionShare: ["number", 1, 3],
    criticalSaveBonusActionShare: ["number", 0.1, 2],
    criticalCombinedCapActionShare: ["number", 1, 3],
    visualHookImpactBeat: ["bool"],
    visualHookScreenShake: ["bool"],
    visualHookZoomOutMs: ["int", 100, 2000],
    visualHookWaveMs: ["int", 100, 2000],
    visualHookHoldMs: ["int", 0, 3000],
    visualHookShakeMs: ["int", 0, 2000]
};

function target(name) {
    return name === "game" ? GameConfig : GameConfig[name];
}

function snapshot() {
    return Object.fromEntries(Object.entries(FIELD_PATHS).map(([key, path]) => {
        return [key, target(path[0])[path[1]]];
    }));
}

const DEFAULTS = snapshot();

function applyDefaults() {
    for (const [key, value] of Object.entries(DEFAULTS)) {
        const path = FIELD_PATHS[key];
        target(path[0])[path[1]] = value;
    }
}

function resolveBound(value) {
    return typeof value === "function" ? value() : value;
}

function applyValue(key, value) {
    const rule = RULES[key];
    const path = FIELD_PATHS[key];

    if (!rule || !path) {
        return false;
    }

    const owner = target(path[0]);
    const property = path[1];
    const kind = rule[0];

    if (kind === "bool") {
        owner[property] = Boolean(value);
    } else if (kind === "enum") {
        const candidate = String(value);
        if (!rule[1].includes(candidate)) return false;
        owner[property] = candidate;
    } else {
        const numeric = Number(value);
        const current = Number(owner[property]);
        const source = Number.isFinite(numeric) ? numeric : current;
        const min = resolveBound(rule[1]);
        const max = resolveBound(rule[2]);
        const clamped = Math.max(min, Math.min(max, source));
        owner[property] = kind === "int" ? Math.floor(clamped) : clamped;
    }

    GameConfig.debugBotDelayMax = Math.max(
        GameConfig.debugBotDelayMin,
        GameConfig.debugBotDelayMax
    );
    GameConfig.levelSupplyMaxSurplus = Math.max(
        GameConfig.levelSupplyMinSurplus,
        GameConfig.levelSupplyMaxSurplus
    );
    GameConfig.towerStabilityCriticalThreshold = Math.min(
        GameConfig.towerStabilityWarningThreshold,
        GameConfig.towerStabilityCriticalThreshold
    );

    return true;
}

module.exports = {
    snapshot,
    applyDefaults,
    applyValue
};
