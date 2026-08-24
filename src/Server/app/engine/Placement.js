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
    const projectedBlocks = [...(engine.room.towerBlocks || []), {
        playerId: player.id, block, originX: placement.originX, originY: placement.originY
    }];
    const newHeight = TowerStability.topHeight(projectedBlocks);
    const heightGain = Math.max(0, newHeight - previousHeight);
    const effectiveHeight = Math.max(
        0,
        Math.min(heightGain, engine.room.targetHeight - previousHeight)
    );

    player.lastPlacementTime = Date.now();
    player.contributedHeight += effectiveHeight;
    engine.room.currentHeight = newHeight;
    engine.room.towerBlocks = engine.room.towerBlocks || [];
    const placedEntry = {
        playerId: player.id,
        block: block,
        height: blockHeight,
        effectiveHeight: effectiveHeight,
        baseHeight: placement.originY,
        originX: placement.originX,
        originY: placement.originY
    };
    engine.room.towerBlocks.push(placedEntry);
    engine.refillPlayerBlock(player);

    console.log(`${player.id} placed block (${blockHeight})`);

    const structureAfter = engine.recalculateTowerStability(true);

    placedEntry.balanceDelta = TowerStability.balanceDelta(
        structureBefore.diagnostics,
        structureAfter.diagnostics,
        stabilityConfig
    );

    engine.addPlacementScore(player, {
        block,
        effectiveHeight,
        placedEntry,
        beforeResult: structureBefore,
        afterResult: structureAfter,
        stabilityConfig
    });
    engine.tryCompleteSideQuest(player, block, engine.room.currentHeight === engine.room.targetHeight);

    if (engine.room.towerStability <= 0) {
        engine.failLevel("tower_collapsed");
    } else {
        engine.checkWinCondition(player, block);
    }

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

function recalculateTowerStability(engine, advancesLastChance = false) {
    const evaluated = TowerStability.evaluate(
        engine.room.towerBlocks || [], engine.resolveStabilityConfig()
    );
    const result = engine.resolveLastChance(evaluated, advancesLastChance);
    const previous = engine.room.towerStability ?? 100;
    engine.room.towerStability = result.stability;
    engine.room.towerStabilityDiagnostics = result.diagnostics;
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

    const remainingPossibleHeight =
        engine.room.players.reduce((total, player) => {
            return total + (player.blocks || []).reduce((sum, block) => {
                return sum + engine.getBlockHeight(block);
            }, 0);
        }, 0) + engine.getTotalBlockHeight(engine.room.drawPile || []);

    const neededHeight = engine.room.targetHeight - engine.room.currentHeight;

    if (
        allEmpty &&
        drawPileEmpty &&
        engine.room.currentHeight < engine.room.targetHeight
    ) {
        engine.failLevel("all_blocks_used");
        return;
    }

    if (
        remainingPossibleHeight < neededHeight &&
        !engine.anyPlayerCanRescueSupply()
    ) {
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
