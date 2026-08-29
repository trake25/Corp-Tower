const GameConfig = require("../Game_Config");
const TowerStability = require("../Tower_Stability");

function getSupplyPackingEfficiency(engine) {
    const cellsPerBrick = Math.max(1, engine.getAverageBrickCellCount());
    const brickHeight = Math.max(0.1, engine.getAverageBrickHeight());
    const siteWidth = engine.getSupplySiteWidthEstimate(engine.room?.targetHeight);
    const ratio = Math.max(
        0.1,
        Number(GameConfig.supplyEffectiveWidthRatio) || 0.1
    );
    const effectiveWidth = Math.max(1, siteWidth * ratio + 0.5);

    return Math.max(
        0.05,
        Math.min(1, cellsPerBrick / (brickHeight * effectiveWidth))
    );
}

function getSupplySiteWidthEstimate(engine, targetHeight) {
    const slenderness = Math.max(
        0.1,
        Number(GameConfig.towerSiteSlendernessTarget) || 0.1
    );
    const minWidth = Math.max(1, Number(GameConfig.towerSiteWidthMin) || 1);
    const maxWidth = Math.min(
        Math.max(1, Number(GameConfig.towerGridWidth) || 1),
        Math.max(minWidth, Number(GameConfig.towerSiteWidthMax) || minWidth)
    );
    const raw = Math.max(0, Number(targetHeight) || 0) / slenderness;

    return Math.max(minWidth, Math.min(maxWidth, raw));
}

function getSiteWidthForHeight(engine, targetHeight) {
    const gridWidth = Math.max(1, Number(GameConfig.towerGridWidth) || 1);
    const slenderness = Math.max(
        0.1,
        Number(GameConfig.towerSiteSlendernessTarget) || 0.1
    );
    const minWidth = Math.max(1, Number(GameConfig.towerSiteWidthMin) || 1);
    const maxWidth = Math.min(
        gridWidth,
        Math.max(minWidth, Number(GameConfig.towerSiteWidthMax) || minWidth)
    );
    const required = Math.ceil(
        Math.max(0, Number(targetHeight) || 0) / slenderness
    );
    const evenWidth = Math.ceil(required / 2) * 2;
    const clamped = Math.max(minWidth, Math.min(maxWidth, evenWidth));

    return Math.max(2, clamped - (clamped % 2));
}

function getPlaceableColumnRange(engine) {
    const targetHeight = engine.room?.targetHeight;

    if (!Number.isFinite(Number(targetHeight))) {
        return {
            min: GameConfig.placeableColumnMin,
            max: GameConfig.placeableColumnMax
        };
    }

    const gridWidth = Math.max(1, Number(GameConfig.towerGridWidth) || 1);
    const width = engine.getSiteWidthForHeight(targetHeight);
    const min = Math.max(0, Math.round((gridWidth - width) / 2));

    return { min, max: Math.min(gridWidth - 1, min + width - 1) };
}

function getPlaceableOriginRange(engine, block) {
    const cellXs = (block?.cells || []).map(cell => Number(cell[0]));
    const width = cellXs.length
        ? Math.max(...cellXs) - Math.min(...cellXs) + 1
        : 1;
    const site = engine.getPlaceableColumnRange();
    const min = site.min;
    const max = site.max - width + 1;

    return { min, max: Math.max(min, max) };
}

function resolveColumnOriginX(engine, block, column) {
    const { min, max } = engine.getPlaceableOriginRange(block);
    const numeric = Number(column);
    const requested =
        column === null || column === undefined || !Number.isFinite(numeric)
            ? min
            : numeric;

    return Math.max(min, Math.min(max, Math.round(requested)));
}

function resolvePlacementOrigin(engine, block, column, originY) {
    const originX = engine.resolveColumnOriginX(block, column);
    const entries = engine.room.towerBlocks || [];
    const requested =
        originY === null || originY === undefined ? NaN : Number(originY);

    if (Number.isInteger(requested) && requested >= 0) {
        if (TowerStability.isPlacementLegal(entries, block, originX, requested)) {
            return TowerStability.settleBlock(entries, block, originX, requested);
        }
    }

    return TowerStability.settleBlock(entries, block, originX);
}

function assignStandingComponents(entries, result) {
    for (const component of result.components || []) {
        for (const entryIndex of component.entryIndexes || []) {
            const entry = entries[entryIndex];
            if (!entry || entry.towerState === "fallen") continue;
            entry.towerState = "standing";
            entry.componentId = component.id;
        }
    }
}

function collapseComponents(engine, result) {
    if (!result.diagnostics?.collapsed) return [];
    const entries = engine.room.towerBlocks || [];
    const collapsed = (result.components || []).filter(component => component.diagnostics?.collapsed);
    const applied = [];

    for (const component of collapsed) {
        const direction = component.diagnostics?.leanDirection || "center";
        const entryIndexes = component.collapseEntryIndexes || component.entryIndexes || [];
        const blockIds = [];
        for (const entryIndex of entryIndexes) {
            const entry = entries[entryIndex];
            if (!entry || entry.towerState === "fallen") continue;
            entry.towerState = "fallen";
            entry.componentId = component.id;
            entry.collapseDirection = direction;
            const id = String(entry.block?.id ?? entry.blockId ?? "");
            if (id) blockIds.push(id);
        }
        if (blockIds.length === 0) continue;
        engine.queueScoreEvent("tower_component_collapsed", {
            label: "Tower Component Collapsed",
            displayOnly: true,
            meta: {
                componentId: component.id,
                blockIds,
                direction
            }
        });
        applied.push({
            componentId: component.id,
            entryIndexes: entryIndexes.slice(),
            blockIds,
            direction
        });
    }

    return applied;
}

function placeBlock(engine, playerId, blockIndex, column = null, originY = null) {
    if (engine.room.state !== "playing") {
        console.log("Cannot place block, level not active");
        return;
    }

    const player = engine.room.players.find(p => p.id === playerId);

    if (!player) {
        console.log("Player not found");
        return;
    }

    const currentTime = Date.now();
    const timeSinceLastPlacement = currentTime - player.lastPlacementTime;

    if (timeSinceLastPlacement < GameConfig.placementCooldown) {
        console.log(`${player.id} still on cooldown`);
        return;
    }

    if (!player.blocks || player.blocks.length === 0) {
        console.log(`${player.id} has no blocks`);
        return;
    }

    if (
        blockIndex === undefined ||
        blockIndex < 0 ||
        blockIndex >= player.blocks.length
    ) {
        console.log("Invalid block index");
        return;
    }

    const block = player.blocks.splice(blockIndex, 1)[0];
    const blockHeight = engine.getBlockHeight(block);
    const previousHeight = engine.room.currentHeight;
    const stabilityConfig = engine.resolveStabilityConfig();
    const structureBefore = engine.room.towerStabilityResult || TowerStability.evaluate(
        engine.room.towerBlocks || [], stabilityConfig
    );
    const placement = engine.resolvePlacementOrigin(block, column, originY);
    player.lastPlacementTime = Date.now();
    engine.room.towerBlocks = engine.room.towerBlocks || [];
    const placedEntry = {
        playerId: player.id,
        block: block,
        height: blockHeight,
        effectiveHeight: 0,
        baseHeight: placement.originY,
        originX: placement.originX,
        originY: placement.originY,
        towerState: "standing",
        componentId: null
    };
    engine.room.towerBlocks.push(placedEntry);
    engine.refillPlayerBlock(player);

    console.log(`${player.id} placed block (${blockHeight})`);

    const peakResult = TowerStability.evaluate(engine.room.towerBlocks, stabilityConfig);
    let settledResult = engine.recalculateTowerStability(true, peakResult);
    const lastChanceRescued = Boolean(
        peakResult.diagnostics?.collapsed && !settledResult.diagnostics?.collapsed
    );
    assignStandingComponents(engine.room.towerBlocks, settledResult);
    const collapsedSlices = [];
    const maxIterations = engine.room.towerBlocks.length;

    for (let iteration = 0; iteration < maxIterations && settledResult.diagnostics?.collapsed; iteration += 1) {
        const applied = collapseComponents(engine, settledResult);
        if (applied.length === 0) break;
        collapsedSlices.push(...applied);
        settledResult = engine.recalculateTowerStability(false);
        assignStandingComponents(engine.room.towerBlocks, settledResult);
    }

    engine.room.currentHeight = TowerStability.topHeight(engine.room.towerBlocks);

    placedEntry.balanceDelta = TowerStability.balanceDelta(
        structureBefore.diagnostics,
        peakResult.diagnostics,
        stabilityConfig
    );

    const collapseSummary = {
        anyFallen: collapsedSlices.length > 0,
        entryIndexes: Array.from(new Set(collapsedSlices.flatMap(slice => slice.entryIndexes))).sort((left, right) => left - right),
        blockIds: Array.from(new Set(collapsedSlices.flatMap(slice => slice.blockIds))).sort()
    };
    const transaction = engine.addPlacementScore(player, {
        block,
        placedEntry,
        beforeResult: structureBefore,
        peakResult,
        settledResult,
        afterResult: settledResult,
        stabilityConfig,
        previousHeight,
        settledHeight: engine.room.currentHeight,
        historicalMaxStandingHeight: engine.room.historicalMaxStandingHeight,
        recoveryCreditedRows: engine.room.recoveryCreditedRows,
        collapseSummary,
        lastChanceRescued
    });
    placedEntry.effectiveHeight = transaction.newHeight;
    player.contributedHeight += transaction.newHeight;
    engine.tryCompleteSideQuest(player, block, engine.room.currentHeight === engine.room.targetHeight);

    engine.checkWinCondition(player, block);

    if (engine.room.state === "playing") {
        engine.checkFailCondition();
    }

    engine.persistRoom();
    engine.broadcastGameState();
}

function getStabilityPressure(engine, level) {
    const difficulty = Math.max(
        0,
        Math.min(100, Number(GameConfig.towerStabilityDifficulty) || 0)
    );
    const curve = GameConfig.towerStabilityPressure || {};
    const floor = Math.max(0, Math.min(1, Number(curve.floor) || 0));
    const fullLevel = Math.max(1, Number(curve.fullPressureLevel) || 1);
    const resolvedLevel = Math.max(
        1,
        Number(level ?? engine.room?.level) || 1
    );
    const levelRamp = Math.min(1, resolvedLevel / fullLevel);

    return (difficulty / 100) * (floor + (1 - floor) * levelRamp);
}

function getStabilityRiskScale() {
    const difficulty = Math.max(
        0,
        Math.min(100, Number(GameConfig.towerStabilityDifficulty) || 0)
    ) / 100;
    const curve = GameConfig.towerStabilityPressure || {};
    const power = Math.max(1, Number(curve.difficultyCurvePower) || 2);

    return Math.pow(difficulty, power);
}

function resolveStabilityConfig(engine, level) {
    const anchors = GameConfig.towerStabilityAnchors || {};
    const forgiving = anchors.forgiving || {};
    const harsh = anchors.harsh || {};
    const pressure = engine.getStabilityPressure(level);
    const riskScale = getStabilityRiskScale();
    const resolved = {
        towerMaxTiltAngleDeg: GameConfig.towerMaxTiltAngleDeg,
        towerPoseMaxAngleDeg: GameConfig.towerStructuralPoseMaxAngleDeg,
        towerPoseMaxDipUnits: GameConfig.towerStructuralPoseMaxDipUnits,
        towerBaseHalfWidthFloor: GameConfig.towerBaseHalfWidthFloor,
        towerStructuralPoseRigidRisk: GameConfig.towerStructuralPoseRigidRisk,
        towerStructuralPoseIntegritySwayShare: GameConfig.towerStructuralPoseIntegritySwayShare,
        towerSiteWidth: engine.getSiteWidthForHeight(engine.room?.targetHeight),
        towerTargetHeight: engine.room?.targetHeight,
        towerStabilityPressureApplied: pressure,
        towerStabilityRiskScaleApplied: riskScale
    };

    for (const key of Object.keys(forgiving)) {
        const from = Number(forgiving[key]);
        const to = Number(harsh[key] ?? forgiving[key]);
        resolved[key] = from + (to - from) * pressure;
    }

    return resolved;
}

function recalculateTowerStability(engine, advancesLastChance = false, evaluatedResult = null) {
    const evaluated = evaluatedResult || TowerStability.evaluate(
        engine.room.towerBlocks || [], engine.resolveStabilityConfig()
    );
    const result = engine.resolveLastChance(evaluated, advancesLastChance);
    const previous = engine.room.towerStability ?? 100;
    engine.room.towerStability = result.stability;
    engine.room.towerStabilityDiagnostics = result.diagnostics;
    engine.room.towerStabilityComponents = (result.components || []).map(component => ({
        id: component.id,
        blockIds: component.blockIds,
        grounded: component.grounded,
        height: component.analysis?.height || 0,
        stability: component.stability,
        diagnostics: component.diagnostics,
        structuralPose: component.structuralPose
    }));
    engine.room.towerStructuralPose = result.structuralPose;
    engine.room.towerStabilityResult = result;
    if (previous > GameConfig.towerStabilityCriticalThreshold && result.stability <= GameConfig.towerStabilityCriticalThreshold) {
        engine.queueScoreEvent("tower_critical", { label: "Tower Critical", displayOnly: true });
    } else if (previous > GameConfig.towerStabilityWarningThreshold && result.stability <= GameConfig.towerStabilityWarningThreshold) {
        engine.queueScoreEvent("tower_warning", { label: "Tower Wobbling", displayOnly: true });
    }

    return result;
}

function checkWinCondition(engine, finisher, finishingBlock) {
    if (engine.room.currentHeight < engine.room.targetHeight) {
        return;
    }

    engine.completeLevel(finisher, finishingBlock);
}

function checkFailCondition(engine) {
    if (engine.room.state !== "playing") {
        return;
    }

    const allEmpty = engine.room.players.every(player => {
        return !player.blocks || player.blocks.length === 0;
    });
    const drawPileEmpty = !engine.room.drawPile || engine.room.drawPile.length === 0;
    const remainingPossibleHeight = engine.room.players.reduce((total, player) => {
        return total + (player.blocks || []).reduce((sum, block) => {
            return sum + engine.getBlockHeight(block);
        }, 0);
    }, 0) + engine.getTotalBlockHeight(engine.room.drawPile || []);
    const neededHeight = engine.room.targetHeight - engine.room.currentHeight;
    const supplyExhausted = allEmpty && drawPileEmpty && neededHeight > 0;
    const supplyInsufficient = remainingPossibleHeight < neededHeight;

    if (!supplyExhausted && !supplyInsufficient) {
        return;
    }

    if (engine.tryActivateBotReplenish()) {
        return;
    }

    if (engine.anyPlayerCanRescueSupply()) {
        return;
    }

    if (supplyExhausted) {
        engine.failLevel("all_blocks_used");
        return;
    }

    if (supplyInsufficient) {
        engine.failLevel("not_enough_height_remaining");
    }
}

function anyPlayerCanRescueSupply(engine) {
    return engine.room.players.some(player => {
        return (player.powerInventory || []).some(item => {
            return item && item.id === "replenish";
        });
    });
}

module.exports = {
    getSupplyPackingEfficiency,
    getSupplySiteWidthEstimate,
    getSiteWidthForHeight,
    getPlaceableColumnRange,
    getPlaceableOriginRange,
    resolveColumnOriginX,
    resolvePlacementOrigin,
    placeBlock,
    getStabilityPressure,
    getStabilityRiskScale,
    resolveStabilityConfig,
    recalculateTowerStability,
    checkWinCondition,
    checkFailCondition,
    anyPlayerCanRescueSupply
};
