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

    const cells = engine.cloneCells(shape.cells);

    return {
        id: engine.createBlockId(),
        shapeId: shape.shapeId,
        cells: cells,
        anchorX: Number(shape.anchorX) || 0,
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

    console.log(
        `Level ${engine.room.level} draw pile: ${engine.room.drawPile.length} blocks`
    );
}

function getGeneratedDrawPileBlockCount(engine) {
    let generatedBlockCount = 0;

    for (const level in GameConfig.generatedDrawPileScaling || {}) {
        if (engine.room.level >= Number(level)) {
            generatedBlockCount =
                GameConfig.generatedDrawPileScaling[level];
        }
    }

    return Math.min(
        generatedBlockCount,
        GameConfig.maxGeneratedDrawPileBlocks
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
            return newBlocks;
        }
    }

    return fallbackBlocks;
}

function isLevelBlockSupplyValid(engine, blocks, minimumOpeningBlocks) {
    const targetHeight = engine.room.targetHeight;
    const minTotalHeight =
        targetHeight + GameConfig.levelSupplyMinSurplus;
    const maxTotalHeight =
        targetHeight + GameConfig.levelSupplyMaxSurplus;
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
    const reachableHeights = new Set([0]);

    (blocks || []).forEach(block => {
        const blockHeight = engine.getBlockHeight(block);
        const nextHeights = new Set(reachableHeights);

        reachableHeights.forEach(height => {
            const nextHeight = height + blockHeight;

            if (nextHeight <= targetHeight) {
                nextHeights.add(nextHeight);
            }
        });

        reachableHeights.clear();
        nextHeights.forEach(height => reachableHeights.add(height));
    });

    return reachableHeights.has(targetHeight);
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
    generateRefreshBlocks,
    createRefreshBlock,
    isRefreshBlockSetUseful,
    scoreRefreshBlockSet,
    prepareTeamCarryOverBlocks
};
