const GameConfig = require("../Game_Config");

function getNextDrawBlock(engine) {
    const drawPile = engine.room?.drawPile || [];

    if (drawPile.length === 0) {
        return null;
    }

    return drawPile[0];
}

function createBlockId(engine) {
    return `B${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cloneCells(engine, cells) {
    return cells.map(cell => [Number(cell[0]), Number(cell[1])]);
}

function getBlockHeight(engine, block) {
    if (typeof block === "number") {
        return block;
    }

    if (!block || typeof block !== "object") {
        return 0;
    }

    if (Number.isFinite(Number(block.height))) {
        return Number(block.height);
    }

    if (!Array.isArray(block.cells) || block.cells.length === 0) {
        return 0;
    }

    const rows = block.cells.map(cell => Number(cell[1]));
    return Math.max(...rows) - Math.min(...rows) + 1;
}

function getBlockCellCount(engine, block) {
    if (typeof block === "number") {
        return block;
    }

    if (Array.isArray(block?.cells)) {
        return block.cells.length;
    }

    return engine.getBlockHeight(block);
}

function pickWeightedShape(engine, excludedShapeId = null) {
    const shapes = GameConfig.brickShapes || [];

    if (shapes.length === 0) {
        return null;
    }

    const weights = GameConfig.brickWeights || {};
    const weightedPool = [];

    shapes.forEach(shape => {
        if (
            excludedShapeId &&
            shapes.length > 1 &&
            shape.shapeId === excludedShapeId
        ) {
            return;
        }

        const weight = Math.max(1, Number(weights[shape.shapeId]) || 1);

        for (let i = 0; i < weight; i++) {
            weightedPool.push(shape);
        }
    });

    if (weightedPool.length === 0) {
        return shapes[Math.floor(Math.random() * shapes.length)];
    }

    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

function normalizeCells(cells) {
    const minX = Math.min(...cells.map(cell => Number(cell[0])));
    const minY = Math.min(...cells.map(cell => Number(cell[1])));
    return cells.map(cell => [Number(cell[0]) - minX, Number(cell[1]) - minY]);
}

function rotateCellsCW(cells) {
    return normalizeCells(cells.map(cell => [Number(cell[1]), -Number(cell[0])]));
}

function reflectCellsX(cells) {
    return normalizeCells(cells.map(cell => [-Number(cell[0]), Number(cell[1])]));
}

function getRotations(cells) {
    const rotations = [];
    const seen = new Set();
    let current = normalizeCells(cells);

    for (let i = 0; i < 4; i++) {
        const rotationKey = current
            .map(cell => cell.join(","))
            .sort()
            .join("|");

        if (!seen.has(rotationKey)) {
            seen.add(rotationKey);
            rotations.push(current);
        }

        current = rotateCellsCW(current);
    }

    return rotations;
}

function getOrientations(cells) {
    const orientations = [];
    const seen = new Set();

    [cells, reflectCellsX(cells)].forEach(startCells => {
        let current = normalizeCells(startCells);

        for (let i = 0; i < 4; i++) {
            const orientationKey = current
                .map(cell => cell.join(","))
                .sort()
                .join("|");

            if (!seen.has(orientationKey)) {
                seen.add(orientationKey);
                orientations.push(current);
            }

            current = rotateCellsCW(current);
        }
    });

    return orientations;
}

function createBlock(engine, shapeId = null, excludedShapeId = null) {
    const shapes = GameConfig.brickShapes || [];
    let shape = shapeId
        ? shapes.find(candidate => candidate.shapeId === shapeId)
        : null;

    if (!shape) {
        shape = engine.pickWeightedShape(excludedShapeId);
    }

    if (!shape) {
        return null;
    }

    const orientations = getOrientations(shape.cells);
    const orientation = orientations[Math.floor(Math.random() * orientations.length)];
    const cells = engine.cloneCells(orientation);

    return {
        id: engine.createBlockId(),
        shapeId: shape.shapeId,
        cells: cells,
        height: engine.getBlockHeight({ cells: cells })
    };
}

function getRandomBlock(engine) {
    return engine.createBlock(null);
}

function getBlocksPerPlayer(engine) {
    let blocksPerPlayer = 1;

    for (const level in GameConfig.inventoryScaling) {
        if (engine.room.level >= Number(level)) {
            blocksPerPlayer = GameConfig.inventoryScaling[level];
        }
    }

    return Math.min(blocksPerPlayer, GameConfig.maxActiveBlocks);
}

function buildDrawPile(engine) {
    const teamCarryOverBlocks = engine.room.teamCarryOverBlocks || [];
    const generatedDrawPileBlocks =
        engine.generateDrawPileBlocks(engine.getGeneratedDrawPileBlockCount());

    engine.room.drawPile = engine.shuffleBlocks([
        ...teamCarryOverBlocks,
        ...generatedDrawPileBlocks
    ]);
    engine.room.teamCarryOverBlocks = [];
    engine.room.drawPileStartCount = engine.room.drawPile.length;

    console.log(
        `Level ${engine.room.level} draw pile: ${engine.room.drawPile.length} blocks`
    );
}

function getAverageBrickHeight(engine) {
    const shapes = GameConfig.brickShapes || [];
    let weightedHeight = 0;
    let totalWeight = 0;

    shapes.forEach(shape => {
        const weight = Number(GameConfig.brickWeights?.[shape.shapeId] ?? 1);
        const rotations = getRotations(shape.cells);
        const rotationHeight = rotations.reduce((total, cells) => {
            return total + engine.getBlockHeight({ cells: cells });
        }, 0);

        weightedHeight += weight * (rotationHeight / rotations.length);
        totalWeight += weight;
    });

    return totalWeight > 0 ? weightedHeight / totalWeight : 1;
}

function getAverageBrickCellCount(engine) {
    const shapes = GameConfig.brickShapes || [];
    let weightedCells = 0;
    let totalWeight = 0;

    shapes.forEach(shape => {
        const weight = Number(GameConfig.brickWeights?.[shape.shapeId] ?? 1);

        weightedCells += weight * (shape.cells || []).length;
        totalWeight += weight;
    });

    return totalWeight > 0 ? weightedCells / totalWeight : 1;
}

function getLevelSupplyMaxSurplus(requiredBrickHeight) {
    const flat = Math.max(0, Number(GameConfig.levelSupplyMaxSurplus) || 0);
    const share = Math.max(0, Number(GameConfig.levelSupplyMaxSurplusShare) || 0);

    return flat + Math.ceil(requiredBrickHeight * share);
}

function getSupplyCoverageShare(engine) {
    const start = Math.max(0, Number(GameConfig.levelSupplyCoverageStart) || 0);
    const end = Math.max(0, Number(GameConfig.levelSupplyCoverageEnd) || 0);
    const fullLevel = Math.max(1, Number(GameConfig.levelSupplyCoverageFullLevel) || 1);
    const level = Math.max(1, Number(engine.room?.level) || 1);
    const ramp = Math.min(1, (level - 1) / Math.max(1, fullLevel - 1));

    return start + (end - start) * ramp;
}

function getSuppliedBrickHeight(engine, requiredBrickHeight) {
    return Math.ceil(requiredBrickHeight * getSupplyCoverageShare(engine));
}

function getGeneratedDrawPileBlockCount(engine) {
    const averageBrickHeight = Math.max(1, engine.getAverageBrickHeight());
    const requiredBrickHeight = getSuppliedBrickHeight(engine, Math.ceil(
        engine.room.targetHeight / engine.getSupplyPackingEfficiency()
    ));
    const maxSurplus = getLevelSupplyMaxSurplus(requiredBrickHeight);
    const bandCenter =
        (GameConfig.levelSupplyMinSurplus + maxSurplus) / 2;
    const openingHandHeight =
        engine.room.players.length *
        engine.getBlocksPerPlayer() *
        averageBrickHeight;
    const carryOverHeight =
        engine.getTotalBlockHeight(engine.room.teamCarryOverBlocks || []);
    const shortfall =
        requiredBrickHeight + bandCenter - openingHandHeight - carryOverHeight;
    const desired = Math.ceil(shortfall / averageBrickHeight);

    engine.room.pileClipped = desired > GameConfig.maxGeneratedDrawPileBlocks;

    return Math.max(
        0,
        Math.min(desired, GameConfig.maxGeneratedDrawPileBlocks)
    );
}

function generateDrawPileBlocks(engine, blockCount) {
    const blocks = [];

    for (let i = 0; i < blockCount; i++) {
        blocks.push(engine.getRandomBlock());
    }

    return blocks;
}

function generateSolvableOpeningHandBlocks(engine) {
    const attempts = Math.max(1, GameConfig.openingHandGenerationAttempts);
    let fallbackBlocks = [];
    const openingHandBlockCount =
        engine.room.players.length * engine.getBlocksPerPlayer();

    for (let attempt = 0; attempt < attempts; attempt++) {
        const newBlocks = [];

        while (newBlocks.length < openingHandBlockCount) {
            newBlocks.push(engine.getRandomBlock());
        }

        const combinedBlocks = [
            ...(engine.room.drawPile || []),
            ...newBlocks
        ];

        fallbackBlocks = newBlocks;

        if (
            engine.isLevelBlockSupplyValid(
                combinedBlocks,
                openingHandBlockCount
            )
        ) {
            engine.room.lastOpeningHandValid = true;
            return newBlocks;
        }
    }

    engine.room.lastOpeningHandValid = false;
    return fallbackBlocks;
}

function isLevelBlockSupplyValid(engine, blocks, minimumOpeningBlocks) {
    const targetHeight = engine.room.targetHeight;
    const requiredBrickHeight = getSuppliedBrickHeight(engine, Math.ceil(
        targetHeight / engine.getSupplyPackingEfficiency()
    ));
    const minTotalHeight =
        requiredBrickHeight + GameConfig.levelSupplyMinSurplus;
    const maxTotalHeight =
        requiredBrickHeight + getLevelSupplyMaxSurplus(requiredBrickHeight);
    const totalHeight = engine.getTotalBlockHeight(blocks);

    return (
        blocks.length >= minimumOpeningBlocks &&
        totalHeight >= minTotalHeight &&
        totalHeight <= maxTotalHeight &&
        engine.countPrecisionBlocks(blocks) >=
            Math.min(
                GameConfig.minPrecisionBlocksPerLevel,
                blocks.length
            ) &&
        engine.hasExactHeightCombination(blocks, targetHeight)
    );
}

function getTotalBlockHeight(engine, blocks) {
    return (blocks || []).reduce((total, block) => {
        return total + engine.getBlockHeight(block);
    }, 0);
}

function countPrecisionBlocks(engine, blocks) {
    return (blocks || []).filter(block => {
        return engine.getBlockHeight(block) <= 2;
    }).length;
}

function hasExactHeightCombination(engine, blocks, targetHeight) {
    if (!(targetHeight > 0)) {
        return true;
    }

    const reachableHeights = new Set([0]);

    for (const block of blocks || []) {
        const blockHeight = engine.getBlockHeight(block);

        if (blockHeight <= 0) {
            continue;
        }

        for (const height of [...reachableHeights]) {
            const nextHeight = height + blockHeight;

            if (nextHeight === targetHeight) {
                return true;
            }

            if (nextHeight < targetHeight) {
                reachableHeights.add(nextHeight);
            }
        }
    }

    return false;
}

function shuffleBlocks(engine, blocks) {
    const shuffled = [...blocks];

    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
}

function dealOpeningHands(engine) {
    const blocksPerPlayer = engine.getBlocksPerPlayer();
    const openingHandBlocks = engine.generateSolvableOpeningHandBlocks();
    let nextBlockIndex = 0;

    engine.room.players.forEach(player => {
        player.blocks = [];

        while (player.blocks.length < blocksPerPlayer) {
            player.blocks.push(openingHandBlocks[nextBlockIndex]);
            nextBlockIndex += 1;
        }

        player.blocks = engine.trimInventory(player.blocks);
    });
}

function drawBlockFromPile(engine) {
    if (!engine.room.drawPile || engine.room.drawPile.length === 0) {
        return null;
    }

    return engine.room.drawPile.shift();
}

function refillPlayerBlock(engine, player) {
    const blocksPerPlayer = engine.getBlocksPerPlayer();
    player.blocks = player.blocks || [];

    while (
        player.blocks.length < blocksPerPlayer &&
        (engine.room.drawPile || []).length > 0
    ) {
        player.blocks.push(engine.drawBlockFromPile());
    }
}

function trimInventory(engine, blocks) {
    const maxBlocks = GameConfig.maxActiveBlocks;

    if (blocks.length <= maxBlocks) {
        return blocks;
    }

    return [...blocks]
        .sort((a, b) => {
            const heightDiff =
                engine.getBlockHeight(b) - engine.getBlockHeight(a);

            if (heightDiff !== 0) {
                return heightDiff;
            }

            return engine.getBlockCellCount(b) - engine.getBlockCellCount(a);
        })
        .slice(0, maxBlocks);
}

function generateRefreshBlocks(engine, currentBlocks) {
    const blockCount = (currentBlocks || []).length;

    if (blockCount <= 0) {
        return [];
    }

    const attempts = Math.max(1, GameConfig.refreshGenerationAttempts);
    let bestBlocks = [];
    let bestScore = -1;

    for (let attempt = 0; attempt < attempts; attempt++) {
        const blocks = currentBlocks.map(block => {
            return engine.createRefreshBlock(block);
        });

        if (engine.isRefreshBlockSetUseful(blocks)) {
            return blocks;
        }

        const score = engine.scoreRefreshBlockSet(blocks);

        if (score > bestScore) {
            bestScore = score;
            bestBlocks = blocks;
        }
    }

    return bestBlocks;
}

function getReplenishBlockCount(engine) {
    const share = Math.max(
        0,
        Math.min(1, Number(GameConfig.powerReplenishPileShare) || 0)
    );
    const pileSize =
        Number(engine.room.drawPileStartCount) ||
        (engine.room.drawPile || []).length;

    return Math.max(1, Math.round(share * pileSize));
}

function generateReplenishBlocks(engine) {
    const blockCount = engine.getReplenishBlockCount();

    if (!engine.room.drawPile) {
        engine.room.drawPile = [];
    }

    for (let i = 0; i < blockCount; i++) {
        engine.room.drawPile.push(engine.getRandomBlock());
    }

    return blockCount;
}

function createRefreshBlock(engine, currentBlock) {
    const currentShapeId =
        typeof currentBlock === "number" ? null : currentBlock?.shapeId || null;

    return engine.createBlock(null, currentShapeId);
}

function isRefreshBlockSetUseful(engine, blocks) {
    const remainingHeight =
        Math.max(1, engine.room.targetHeight - engine.room.currentHeight);
    const usefulHeight =
        Math.min(remainingHeight, GameConfig.refreshMinUsefulBlockHeight);

    return (blocks || []).some(block => {
        const blockHeight = engine.getBlockHeight(block);

        return (
            blockHeight <= remainingHeight &&
            blockHeight >= usefulHeight
        );
    });
}

function scoreRefreshBlockSet(engine, blocks) {
    const remainingHeight =
        Math.max(1, engine.room.targetHeight - engine.room.currentHeight);

    return (blocks || []).reduce((score, block) => {
        const blockHeight = engine.getBlockHeight(block);

        if (blockHeight > remainingHeight) {
            return score;
        }

        return score + blockHeight;
    }, 0);
}

function prepareTeamCarryOverBlocks(engine) {
    const unusedHandBlocks = engine.room.players.flatMap(player => {
        return player.blocks || [];
    });
    const unusedDrawPileBlocks = engine.room.drawPile || [];

    engine.room.teamCarryOverBlocks = [
        ...unusedHandBlocks,
        ...unusedDrawPileBlocks
    ]
        .sort((a, b) => {
            const heightDiff =
                engine.getBlockHeight(a) - engine.getBlockHeight(b);

            if (heightDiff !== 0) {
                return heightDiff;
            }

            return engine.getBlockCellCount(a) - engine.getBlockCellCount(b);
        })
        .slice(0, GameConfig.maxTeamCarryOverBlocks);

    engine.room.drawPile = [];

    return engine.room.teamCarryOverBlocks.length;
}

module.exports = {
    getNextDrawBlock,
    createBlockId,
    cloneCells,
    getBlockHeight,
    getBlockCellCount,
    pickWeightedShape,
    createBlock,
    getRandomBlock,
    getBlocksPerPlayer,
    buildDrawPile,
    getAverageBrickHeight,
    getAverageBrickCellCount,
    getGeneratedDrawPileBlockCount,
    generateDrawPileBlocks,
    generateSolvableOpeningHandBlocks,
    isLevelBlockSupplyValid,
    getTotalBlockHeight,
    countPrecisionBlocks,
    hasExactHeightCombination,
    shuffleBlocks,
    dealOpeningHands,
    drawBlockFromPile,
    refillPlayerBlock,
    trimInventory,
    getReplenishBlockCount,
    generateReplenishBlocks,
    generateRefreshBlocks,
    createRefreshBlock,
    isRefreshBlockSetUseful,
    scoreRefreshBlockSet,
    prepareTeamCarryOverBlocks
};
