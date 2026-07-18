// Block supply for one room: block creation, the shared draw pile, opening
// hands, refresh-block generation, and team carry-over. Every function takes
// the owning GameEngine as `engine`; GameEngine exposes each one as a method.
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

function createBlock(engine, blockSize, excludedShapeId = null) {
    const variants =
        GameConfig.blockShapeVariants[blockSize] ||
        GameConfig.blockShapeVariants[1];
    const availableVariants =
        excludedShapeId && variants.length > 1
            ? variants.filter(variant => variant.shapeId !== excludedShapeId)
            : variants;

    const variant =
        availableVariants[
            Math.floor(Math.random() * availableVariants.length)
        ];

    const cells = engine.cloneCells(variant.cells);

    return {
        id: engine.createBlockId(),
        shapeId: variant.shapeId,
        cells: cells,
        height: engine.getBlockHeight({ cells: cells })
    };
}

function getRandomBlock(engine) {
    const availableBlocks = {};

    for (const block in GameConfig.blockWeights) {
        const unlockLevel =
            GameConfig.blockUnlockLevels[block] || 1;

        if (engine.room.level >= unlockLevel) {
            availableBlocks[block] = GameConfig.blockWeights[block];
        }
    }

    const weightedPool = [];

    for (const block in availableBlocks) {
        const weight = availableBlocks[block];

        for (let i = 0; i < weight; i++) {
            weightedPool.push(Number(block));
        }
    }

    if (weightedPool.length === 0) {
        return engine.createBlock(1);
    }

    const randomIndex =
        Math.floor(Math.random() * weightedPool.length);

    return engine.createBlock(weightedPool[randomIndex]);
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
    const blockSize = engine.getBlockCellCount(currentBlock);

    if (blockSize < 3) {
        return engine.createRandomUnlockedBlock(3);
    }

    if (engine.isBlockSizeUnlocked(blockSize)) {
        return engine.createBlock(
            blockSize,
            typeof currentBlock === "number"
                ? null
                : currentBlock?.shapeId || null
        );
    }

    return engine.createRandomUnlockedBlock(3);
}

function createRandomUnlockedBlock(engine, minBlockSize = 1) {
    const blockSize = engine.getWeightedUnlockedBlockSize(minBlockSize);

    return engine.createBlock(blockSize);
}

function getWeightedUnlockedBlockSize(engine, minBlockSize = 1) {
    const weightedPool = [];

    for (const block in GameConfig.blockWeights) {
        const blockSize = Number(block);

        if (
            blockSize < minBlockSize ||
            !engine.isBlockSizeUnlocked(blockSize)
        ) {
            continue;
        }

        const weight = GameConfig.blockWeights[block] || 1;

        for (let i = 0; i < weight; i++) {
            weightedPool.push(blockSize);
        }
    }

    if (weightedPool.length === 0 && minBlockSize > 1) {
        return engine.getWeightedUnlockedBlockSize(1);
    }

    if (weightedPool.length === 0) {
        return 1;
    }

    return weightedPool[Math.floor(Math.random() * weightedPool.length)];
}

function isBlockSizeUnlocked(engine, blockSize) {
    const unlockLevel = GameConfig.blockUnlockLevels[blockSize] || 1;

    return (
        Boolean(GameConfig.blockShapeVariants[blockSize]) &&
        engine.room.level >= unlockLevel
    );
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
    createRandomUnlockedBlock,
    getWeightedUnlockedBlockSize,
    isBlockSizeUnlocked,
    isRefreshBlockSetUseful,
    scoreRefreshBlockSet,
    prepareTeamCarryOverBlocks
};
