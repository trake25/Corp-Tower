const TUNABLE_CLASSES = Object.freeze({
    RUNTIME_EXPOSED: "runtime-exposed",
    DESIGNER_ONLY: "designer-only",
    TRUE_CONTRACT: "true-contract"
});

const RUNTIME_EXPOSED_SERVER_KEYS = Object.freeze([
    "debugBotsEnabled", "showLatencyIndicator", "debugBotCount", "debugBotStrategy",
    "debugStartLevel", "debugBotDelayMin", "debugBotDelayMax", "placementCooldown",
    "quickChatCooldownMs", "towerStabilityFeedbackMode", "levelTimeLimitMs", "startDelayMs",
    "placementScorePopupDurationMs", "finishScorePopupDurationMs", "levelSummaryDelayMs",
    "impactScoreRequirement", "impactMinContributionShare", "impactInterval",
    "targetHeightMultiplier", "levelSupplyMinSurplus", "levelSupplyMaxSurplus",
    "minPrecisionBlocksPerLevel", "maxTeamCarryOverBlocks", "refreshMinUsefulBlockHeight",
    "towerStabilityDifficulty", "towerLateralLoadShare", "towerStructuralPoseMaxAngleDeg",
    "supplyEffectiveWidthRatio", "towerStabilityWarningThreshold",
    "towerStabilityCriticalThreshold", "towerStabilityMoodThreshold", "powerUnlockLevel",
    "powerMaxSlots", "powerActivationCooldownMs", "powerReplenishPileShare",
    "powerLastChanceEnabled", "placementScorePerHeight", "recoveryHeightScorePercent",
    "dangerousHeightFloor", "strongReinforcementActionShare", "normalCombinedCapActionShare",
    "criticalSaveBonusActionShare", "criticalCombinedCapActionShare", "visualHookImpactBeat",
    "visualHookScreenShake", "visualHookZoomOutMs", "visualHookWaveMs", "visualHookHoldMs",
    "visualHookShakeMs"
]);

const SERVER_DESIGNER_ONLY_PATHS = Object.freeze([
    "towerGridWidth", "placeableColumnMin", "placeableColumnMax",
    "towerSiteSlendernessTarget", "towerSiteWidthMin", "towerSiteWidthMax",
    "towerMaxTiltAngleDeg", "towerStructuralPoseMaxDipUnits", "towerStructuralPoseRigidRisk",
    "towerStructuralPoseIntegritySwayShare", "towerVisibleRowCapacity", "towerScrollStartRatio",
    "towerScrollEasePower", "towerTopIndicatorClearanceRows", "towerStabilityPressure",
    "towerSupportDifficultyPressure", "towerStabilityAnchors", "towerBaseHalfWidthFloor",
    "powerLifetime", "powerGuaranteedBaseline", "powerImpactMvpReward", "powerCatalog",
    "brickShapes", "brickWeights", "inventoryScaling", "maxActiveBlocks",
    "maxGeneratedDrawPileBlocks", "levelSupplyMaxSurplusShare", "levelSupplyCoverageStart",
    "levelSupplyCoverageEnd", "levelSupplyCoverageFullLevel", "openingHandGenerationAttempts",
    "refreshGenerationAttempts", "accessibility", "visualHooks.impactBeatMinZoom",
    "visualHooks.collapseDebrisLifetimeMs", "visualHooks.screenShakeMagnitudeUnits",
    "scoring.strongStructuralImprovement", "scoring.fullDangerRiskIncrease",
    "scoring.criticalSaveMinRiskReduction", "scoring.criticalSaveMinLoadShare",
    "scoring.criticalSaveMaxPerLevel", "scoring.finisherBonusPerLevel",
    "scoring.precisionBonusPerLevel", "scoring.teamExactBonusPerLevel",
    "scoring.assistBonusPerLevel", "scoring.assistContributionThreshold",
    "debugBotStabilityTolerance", "debugBotGapCandidates"
]);

const CLIENT_DESIGNER_ONLY_PATHS = Object.freeze([
    "TowerStack.scroll_start_ratio", "TowerStack.scroll_ease_power",
    "TowerStack.top_indicator_clearance_units", "TowerStack.brick_unit_size",
    "TowerStack.drop_duration", "TowerStack.tilt_ease_speed", "TowerStack.collapse_tilt_deg",
    "TowerStack.top_padding", "TowerStack.bottom_padding", "BackgroundParallax.sky.parallax_ratio",
    "BackgroundParallax.sky.ease_speed", "BackgroundParallax.ground.parallax_ratio",
    "BackgroundParallax.ground.ease_speed", "TowerStack.snap_radius_units",
    "TowerStack.drag_grip_offset_units", "TowerStack.ghost_alpha",
    "TowerStack.snap_dot_radius", "TowerStack.snap_target_radius"
]);

const TRUE_CONTRACTS = Object.freeze([
    "TutorialLessons.DEFAULTS.level-1-parity"
]);

const CLASSIFICATION_ENTRIES = Object.freeze([
    ...RUNTIME_EXPOSED_SERVER_KEYS.map(path => ({
        scope: "server",
        path,
        classification: TUNABLE_CLASSES.RUNTIME_EXPOSED
    })),
    ...SERVER_DESIGNER_ONLY_PATHS.map(path => ({
        scope: "server",
        path,
        classification: TUNABLE_CLASSES.DESIGNER_ONLY
    })),
    ...CLIENT_DESIGNER_ONLY_PATHS.map(path => ({
        scope: "client",
        path,
        classification: TUNABLE_CLASSES.DESIGNER_ONLY
    })),
    ...TRUE_CONTRACTS.map(path => ({
        scope: "contract",
        path,
        classification: TUNABLE_CLASSES.TRUE_CONTRACT
    }))
]);

const SERVER_QA_BASELINE_PATHS = Object.freeze([
    "maxLevel", "debugStartLevel", "playersPerRoom", "placementCooldown", "quickChatCooldownMs",
    "quickChatTemplates", "targetHeightMultiplier", "targetHeightBase", "targetHeightStepBase",
    "targetHeightStepGrowth", "targetHeightStepGrowthEvery", "startDelayMs", "levelTimeLimitMs",
    "levelTimePlannedEfficiency", "levelTimeSlack", "levelTimeSlackMin", "levelTimeSlackFullLevel",
    "nextLevelDelayMs", "failRestartDelayMs", "placementScorePopupDurationMs",
    "finishScorePopupDurationMs", "levelSummaryDelayMs", "impactInterval", "impactScoreRequirement",
    "impactMinContributionShare", "impactRecoverableFailures", "towerGridWidth", "placeableColumnMin",
    "placeableColumnMax", "towerSiteSlendernessTarget", "towerSiteWidthMin", "towerSiteWidthMax",
    "towerMaxTiltAngleDeg", "towerStructuralPoseMaxAngleDeg", "towerStructuralPoseMaxDipUnits",
    "towerStructuralPoseRigidRisk", "towerStructuralPoseIntegritySwayShare", "towerVisibleRowCapacity",
    "towerScrollStartRatio", "towerScrollEasePower", "towerTopIndicatorClearanceRows",
    "towerStabilityDifficulty", "towerLateralLoadShare", "towerStabilityPressure",
    "towerSupportDifficultyPressure", "towerStabilityAnchors", "towerBaseHalfWidthFloor",
    "towerStabilityWarningThreshold", "towerStabilityCriticalThreshold", "towerStabilityMoodThreshold",
    "towerStabilityFeedbackMode", "powerUnlockLevel", "powerMaxSlots", "powerActivationCooldownMs",
    "powerLastChanceEnabled", "powerLifetime", "powerGuaranteedBaseline", "powerImpactMvpReward",
    "powerReplenishPileShare", "powerCatalog", "brickShapes", "brickWeights", "inventoryScaling",
    "maxActiveBlocks", "maxTeamCarryOverBlocks", "maxGeneratedDrawPileBlocks", "supplyEffectiveWidthRatio",
    "levelSupplyMinSurplus", "levelSupplyMaxSurplus", "levelSupplyMaxSurplusShare",
    "levelSupplyCoverageStart", "levelSupplyCoverageEnd", "levelSupplyCoverageFullLevel",
    "minPrecisionBlocksPerLevel", "openingHandGenerationAttempts", "refreshGenerationAttempts",
    "refreshMinUsefulBlockHeight", "accessibility", "visualHooks", "scoring", "debugBotsEnabled",
    "showLatencyIndicator", "debugBotCount", "debugBotDelayMin", "debugBotDelayMax", "debugBotStrategy",
    "debugBotStabilityTolerance", "debugBotGapCandidates"
]);

module.exports = {
    CLASSIFICATION_ENTRIES,
    CLIENT_DESIGNER_ONLY_PATHS,
    RUNTIME_EXPOSED_SERVER_KEYS,
    SERVER_DESIGNER_ONLY_PATHS,
    SERVER_QA_BASELINE_PATHS,
    TRUE_CONTRACTS,
    TUNABLE_CLASSES
};
