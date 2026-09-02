const TUNABLE_CLASSES = Object.freeze({
    RUNTIME_EXPOSED: "runtime-exposed",
    DESIGNER_ONLY: "designer-only",
    TRUE_CONTRACT: "true-contract"
});

const RUNTIME_EXPOSED_SERVER_FIELDS = Object.freeze({
    debugBotsEnabled: "debugBotsEnabled",
    showLatencyIndicator: "showLatencyIndicator",
    debugBotCount: "debugBotCount",
    debugBotStrategy: "debugBotStrategy",
    debugStartLevel: "debugStartLevel",
    debugBotDelayMin: "debugBotDelayMin",
    debugBotDelayMax: "debugBotDelayMax",
    placementCooldown: "placementCooldown",
    quickChatCooldownMs: "quickChatCooldownMs",
    towerStabilityFeedbackMode: "towerStabilityFeedbackMode",
    levelTimeLimitMs: "levelTimeLimitMs",
    startDelayMs: "startDelayMs",
    placementScorePopupDurationMs: "placementScorePopupDurationMs",
    finishScorePopupDurationMs: "finishScorePopupDurationMs",
    levelSummaryDelayMs: "levelSummaryDelayMs",
    impactScoreRequirement: "impactScoreRequirement",
    impactMinContributionShare: "impactMinContributionShare",
    impactInterval: "impactInterval",
    targetHeightMultiplier: "targetHeightMultiplier",
    levelSupplyMinSurplus: "levelSupplyMinSurplus",
    levelSupplyMaxSurplus: "levelSupplyMaxSurplus",
    minPrecisionBlocksPerLevel: "minPrecisionBlocksPerLevel",
    maxTeamCarryOverBlocks: "maxTeamCarryOverBlocks",
    refreshMinUsefulBlockHeight: "refreshMinUsefulBlockHeight",
    towerStabilityDifficulty: "towerStabilityDifficulty",
    towerLateralLoadShare: "towerLateralLoadShare",
    towerStructuralPoseMaxAngleDeg: "towerStructuralPoseMaxAngleDeg",
    supplyEffectiveWidthRatio: "supplyEffectiveWidthRatio",
    towerStabilityWarningThreshold: "towerStabilityWarningThreshold",
    towerStabilityCriticalThreshold: "towerStabilityCriticalThreshold",
    towerStabilityMoodThreshold: "towerStabilityMoodThreshold",
    powerUnlockLevel: "powerUnlockLevel",
    powerMaxSlots: "powerMaxSlots",
    powerActivationCooldownMs: "powerActivationCooldownMs",
    powerReplenishPileShare: "powerReplenishPileShare",
    powerLastChanceEnabled: "powerLastChanceEnabled",
    placementScorePerHeight: "scoring.placementScorePerHeight",
    recoveryHeightScorePercent: "scoring.recoveryHeightScorePercent",
    dangerousHeightFloor: "scoring.dangerousHeightFloor",
    strongReinforcementActionShare: "scoring.strongReinforcementActionShare",
    criticalSaveActionShare: "scoring.criticalSaveActionShare",
    perfectBuildFinisherActionShare: "scoring.perfectBuildFinisherActionShare",
    perfectBuildImpactRequirementShare: "scoring.perfectBuildImpactRequirementShare",
    visualHookImpactBeat: "visualHooks.impactBeat",
    visualHookScreenShake: "visualHooks.screenShake",
    visualHookZoomOutMs: "visualHooks.impactBeatZoomOutMs",
    visualHookWaveMs: "visualHooks.impactBeatWaveMs",
    visualHookHoldMs: "visualHooks.impactBeatHoldMs",
    visualHookShakeMs: "visualHooks.screenShakeMs"
});

const RUNTIME_EXPOSED_SERVER_KEYS = Object.freeze(
    Object.keys(RUNTIME_EXPOSED_SERVER_FIELDS)
);

const RUNTIME_EXPOSED_SERVER_PATHS = Object.freeze(
    Object.values(RUNTIME_EXPOSED_SERVER_FIELDS)
);

const SERVER_DESIGNER_ONLY_PATHS = Object.freeze([
    "accessibility.parallelPlacement", "brickShapes", "brickWeights.I", "brickWeights.L",
    "brickWeights.O", "brickWeights.T", "brickWeights.Z", "debugBotGapCandidates",
    "debugBotStabilityTolerance", "failRestartDelayMs", "impactRecoverableFailures",
    "inventoryScaling.1", "levelSupplyCoverageEnd", "levelSupplyCoverageFullLevel",
    "levelSupplyCoverageStart", "levelSupplyMaxSurplusShare", "levelTimePlannedEfficiency",
    "levelTimeSlack", "levelTimeSlackFullLevel", "levelTimeSlackMin", "lobbyReadyTimeoutMs",
    "maxActiveBlocks", "maxGeneratedDrawPileBlocks", "maxLevel", "nextLevelDelayMs",
    "openingHandGenerationAttempts", "placeableColumnMax", "placeableColumnMin",
    "playersPerRoom", "powerCatalog.copy_score.active", "powerCatalog.copy_score.category",
    "powerCatalog.copy_score.title", "powerCatalog.refresh.active",
    "powerCatalog.refresh.category", "powerCatalog.refresh.title",
    "powerCatalog.replenish.active", "powerCatalog.replenish.category",
    "powerCatalog.replenish.title", "powerCatalog.score_cap.active",
    "powerCatalog.score_cap.category", "powerCatalog.score_cap.title",
    "powerGuaranteedBaseline", "powerImpactMvpReward", "powerLifetime",
    "privateLobbyGracePhaseMs", "privateLobbyReconnectPhaseMs",
    "privateLobbyStartCountdownMs", "quickChatTemplates", "refreshGenerationAttempts",
    "scoring.assistBonusPerLevel", "scoring.assistContributionThreshold",
    "scoring.criticalSaveMaxPerLevel", "scoring.criticalSaveMinLoadShare",
    "scoring.criticalSaveMinRiskReduction", "scoring.finisherBonusPerLevel",
    "scoring.fullDangerRiskIncrease", "scoring.strongStructuralImprovement",
    "targetHeightBase", "targetHeightStepBase", "targetHeightStepGrowth",
    "targetHeightStepGrowthEvery", "towerBaseHalfWidthFloor", "towerGridWidth",
    "towerMaxTiltAngleDeg", "towerScrollEasePower", "towerScrollStartRatio",
    "towerSiteSlendernessTarget", "towerSiteWidthMax", "towerSiteWidthMin",
    "towerStabilityAnchors.forgiving.towerBalanceCollapseOffsetShare",
    "towerStabilityAnchors.forgiving.towerBalanceSafeOffsetShare",
    "towerStabilityAnchors.forgiving.towerHeightPressureGain",
    "towerStabilityAnchors.forgiving.towerRedundancyBonus",
    "towerStabilityAnchors.forgiving.towerStabilityMinHeight",
    "towerStabilityAnchors.forgiving.towerStructuralLoadExponent",
    "towerStabilityAnchors.forgiving.towerStructuralSeverity",
    "towerStabilityAnchors.forgiving.towerSupportCollapseLoadPerContact",
    "towerStabilityAnchors.forgiving.towerSupportSafeLoadPerContact",
    "towerStabilityAnchors.harsh.towerBalanceCollapseOffsetShare",
    "towerStabilityAnchors.harsh.towerBalanceSafeOffsetShare",
    "towerStabilityAnchors.harsh.towerHeightPressureGain",
    "towerStabilityAnchors.harsh.towerRedundancyBonus",
    "towerStabilityAnchors.harsh.towerStabilityMinHeight",
    "towerStabilityAnchors.harsh.towerStructuralLoadExponent",
    "towerStabilityAnchors.harsh.towerStructuralSeverity",
    "towerStabilityAnchors.harsh.towerSupportCollapseLoadPerContact",
    "towerStabilityAnchors.harsh.towerSupportSafeLoadPerContact",
    "towerStabilityPressure.difficultyCurvePower", "towerStabilityPressure.floor",
    "towerStabilityPressure.fullPressureLevel", "towerStructuralPoseIntegritySwayShare",
    "towerStructuralPoseMaxDipUnits", "towerStructuralPoseRigidRisk",
    "towerSupportDifficultyPressure.midpoint", "towerSupportDifficultyPressure.steepness",
    "towerTopIndicatorClearanceRows", "towerVisibleRowCapacity",
    "visualHooks.collapseDebrisLifetimeMs", "visualHooks.impactBeatMinZoom",
    "visualHooks.screenShakeMagnitudeUnits"
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
    ...RUNTIME_EXPOSED_SERVER_PATHS.map(path => ({
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

module.exports = {
    CLASSIFICATION_ENTRIES,
    CLIENT_DESIGNER_ONLY_PATHS,
    RUNTIME_EXPOSED_SERVER_FIELDS,
    RUNTIME_EXPOSED_SERVER_KEYS,
    RUNTIME_EXPOSED_SERVER_PATHS,
    SERVER_DESIGNER_ONLY_PATHS,
    TRUE_CONTRACTS,
    TUNABLE_CLASSES
};
