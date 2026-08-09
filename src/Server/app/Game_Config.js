const GameConfig = {

    maxLevel: 99,
    debugStartLevel: 1,
    placementCooldown: 1500,    // testing phase at 500ms, 1 during release
    quickChatCooldownMs: 3000,
    quickChatTemplates: [
        "Place Block!",
        "Sorry!",
        "Hello!"
    ],
    targetHeightMultiplier: 3,
    targetHeightBase: 30,
    targetHeightStepBase: 10,
    targetHeightStepGrowth: 5,
    targetHeightStepGrowthEvery: 3,
    startDelayMs: 4000,
    levelTimeLimitMs: 60000,
    levelTimePlannedEfficiency: 0.55,
    levelTimeSlack: 3.0,
    levelTimeSlackMin: 1.5,
    levelTimeSlackFullLevel: 25,
    nextLevelDelayMs: 1000, // testing 0.5, release 1
    failRestartDelayMs: 1000, // testing 0.5, release 1
    placementScorePopupDurationMs: 2000,
    finishScorePopupDurationMs: 2000,
    levelSummaryDelayMs: 4000,  // testing 2, release 4
    impactInterval: 2,
    impactScoreRequirement: 0,
    impactMinContributionShare: 0.30,
    impactExpectedStabilityMultiplier: 0.85,
    towerGridWidth: 8, //14 SnapGrid.gd previous values const GRID_WIDTH := 14 const GRID_CENTER_COL := 6.5
    placeableColumnMin: 2,
    placeableColumnMax: 5,
    towerSiteSlendernessTarget: 6.75,
    towerSiteWidthMin: 8,
    towerSiteWidthMax: 8,
    towerMaxTiltAngleDeg: 18,   //18 Visual only, higher tilt is more dramatic
    towerStabilityDifficulty: 95,   // 0 forgiving, 100 harsh, 90 default, 95 tuned
    towerStabilityPressure: {
        floor: 0.55,
        fullPressureLevel: 8
    },
    towerStabilityAnchors: {
        forgiving: {
            towerOverhangWeight: 0.02,
            towerLaneImbalanceWeight: 0.03,
            towerCollapseTiltScore: 4.00,
            towerSlendernessSafe: 2.40,
            towerSlendernessMax: 5.00,
            towerSupportDeficitMax: 0.85,
            towerStabilityMinHeight: 10,
            towerHeightPressureGain: 0.0
        },
        harsh: {
            towerOverhangWeight: 0.34,
            towerLaneImbalanceWeight: 0.30,
            towerCollapseTiltScore: 0.75,
            towerSlendernessSafe: 1.30,
            towerSlendernessMax: 2.20,
            towerSupportDeficitMax: 0.15,
            towerStabilityMinHeight: 8,
            towerHeightPressureGain: 1.3
        }
    },
    towerBaseHalfWidthFloor: 1.0,
    towerStabilityWarningThreshold: 75,
    towerStabilityCriticalThreshold: 45,
    towerStabilityMoodThreshold: 2,
    towerStabilityFeedbackMode: "warnings_only",
    powerUnlockLevel: 1,
    powerMaxSlots: 3,
    powerActivationCooldownMs: 3000,
    powerLifetime: "impact",
    powerGuaranteedBaseline: false,
    powerImpactMvpReward: false,
    powerReplenishPileShare: 0.25,
    powerCatalog: {
        score_cap: { category: "Offensive", title: "Score Cap", active: false },
        copy_score: { category: "Defensive", title: "Copy Score", active: false },
        refresh: { category: "Utility", title: "Refresh", active: false },
        replenish: { category: "Utility", title: "Replenish", active: true }
    },
    brickShapes: [
        { shapeId: "I", cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
        { shapeId: "O", cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
        { shapeId: "L", cells: [[0, 0], [1, 0], [0, 1], [0, 2]] },
        { shapeId: "T", cells: [[1, 0], [0, 1], [1, 1], [2, 1]] },
        { shapeId: "Z", cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }
    ],
    brickWeights: {
        I: 1,
        O: 3,
        L: 2,
        T: 2,
        Z: 2
    },
    inventoryScaling: {
        1: 3
    },
    maxActiveBlocks: 3,
    maxTeamCarryOverBlocks: 3,
    maxGeneratedDrawPileBlocks: 4096,
    supplyEffectiveWidthRatio: 0.35,
    levelSupplyMinSurplus: 0,
    levelSupplyMaxSurplus: 4,    
    levelSupplyMaxSurplusShare: 0.08,    
    levelSupplyCoverageStart: 1.05,
    levelSupplyCoverageEnd: 0.75,
    levelSupplyCoverageFullLevel: 15,
    minPrecisionBlocksPerLevel: 3,
    openingHandGenerationAttempts: 1000,
    refreshGenerationAttempts: 100,
    refreshMinUsefulBlockHeight: 2,
    accessibility: {
        parallelPlacement: false
    },
    visualHooks: {
        impactBeat: true,
        screenShake: true,
        impactBeatMinZoom: 0.3,
        impactBeatZoomOutMs: 900,
        impactBeatWaveMs: 1100,
        impactBeatHoldMs: 0,
        screenShakeMs: 460,
        screenShakeMagnitudeUnits: 0.22
    },
    scoring: {
        placementScorePerHeight: 10,        
        placementStabilityFloor: 0.5,
        placementStabilityFloorAtTarget: 0.15,        
        reinforceScorePerIntegrity: 4,
        reinforceScorePerLean: 35,
        reinforceScorePerSupportedCell: 10,       
        reinforceScoreCapShare: 1,
        reinforceScoreCapShareAtTarget: 3,
        finisherBonusPerLevel: 0,
        precisionBonusPerLevel: 20,
        teamExactBonusPerLevel: 15,
        assistBonusPerLevel: 0,
        assistContributionThreshold: 0.25
    },
    debugBotsEnabled: process.env.CORP_TOWER_BOTS_ENABLED === "true",    //testing true, release false
    debugBotCount: 2,
    debugBotDelayMin: 1500,
    debugBotDelayMax: 6000,
    debugBotStrategy: "mvp_greedy",
    debugBotStabilityTolerance: 5,
    debugBotGapCandidates: 6,
};

module.exports = GameConfig;
