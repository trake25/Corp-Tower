// Game_Engine.js

const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");

class GameEngine {
    constructor(options = {}) {
        this.room = null;
        this.startTimer = null;
        this.levelTimer = null;
        this.nextLevelTimer = null;
        this.tickTimer = null;
        this.onRoomChanged = options.onRoomChanged || null;
        this.onRoomMessage = options.onRoomMessage || null;
    }

    // =========================
    // BROADCAST SYSTEM
    // =========================

    getRemainingMs() {
        if (!this.room || !this.room.endsAt) {
            return 0;
        }

        return Math.max(0, this.room.endsAt - Date.now());
    }

    broadcastGameState() {
        if (!this.room) {
            return;
        }

        const gameState = {
            type: "game_state",
            state: this.room.state,
            level: this.room.level,
            checkpointLevel: this.room.checkpointLevel,
            currentHeight: this.room.currentHeight,
            targetHeight: this.room.targetHeight,
            activeInventorySlots: this.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            drawPileCount: (this.room.drawPile || []).length,
            nextDrawBlock: this.getNextDrawBlock(),
            towerBlocks: this.room.towerBlocks || [],
            secondsRemaining: Math.ceil(this.getRemainingMs() / 1000),
            lastLevelSummary: this.room.lastLevelSummary,
            maxRefreshTokens: GameConfig.maxRefreshTokens,
            maxRefreshUsesPerLevel: GameConfig.maxRefreshUsesPerLevel,
            players: this.room.players.map(player => ({
                id: player.id,
                isBot: Boolean(player.isBot),
                score: player.score,
                levelScore: player.levelScore,
                contributedHeight: player.contributedHeight,
                refreshTokens: player.refreshTokens,
                refreshUsesRemaining: Math.max(
                    0,
                    GameConfig.maxRefreshUsesPerLevel - player.refreshUsesThisLevel
                ),
                blocks: player.blocks
            }))
        };

        if (this.onRoomMessage) {
            this.onRoomMessage(this.room.id, gameState);
        }

        this.room.players.forEach(player => {
            if (player.isBot || !player.ws) {
                return;
            }

            player.ws.send(JSON.stringify(gameState));
        });
    }

    // =========================
    // ROOM SYSTEM
    // =========================

    createRoom(players) {
        this.room = {
            id: null,
            players: players,
            level: 1,
            checkpointLevel: 1,
            targetHeight: this.getTargetHeightForLevel(1),
            currentHeight: 0,
            drawPile: [],
            teamCarryOverBlocks: [],
            towerBlocks: [],
            state: "waiting",
            startsAt: 0,
            endsAt: 0,
            lastLevelSummary: null
        };

        this.room.players.forEach(player => {
            player.score = player.score || 0;
            player.levelScore = 0;
            player.contributedHeight = 0;
            player.refreshTokens = 0;
            player.refreshUsesThisLevel = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
        });

        console.log("Room created:", this.room.id);
    }

    hydrateRoom(snapshot, runtimePlayers) {
        this.clearTimers();

        this.room = {
            id: snapshot.id,
            players: runtimePlayers,
            level: snapshot.state.level,
            checkpointLevel: snapshot.state.checkpointLevel,
            targetHeight: snapshot.state.targetHeight,
            currentHeight: snapshot.state.currentHeight,
            drawPile: snapshot.state.drawPile || [],
            teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
            towerBlocks: snapshot.state.towerBlocks || [],
            state: snapshot.state.state,
            startsAt: snapshot.state.startsAt,
            endsAt: snapshot.state.endsAt,
            lastLevelSummary: snapshot.state.lastLevelSummary
        };

        this.restoreTimersFromState();
    }

    restoreTimersFromState() {
        if (!this.room) {
            return;
        }

        this.clearTimers();

        if (this.room.state === "starting") {
            this.startTimer = setTimeout(() => {
                this.beginPlaying();
            }, Math.max(0, this.room.startsAt - Date.now()));
            return;
        }

        if (this.room.state === "playing") {
            this.levelTimer = setTimeout(() => {
                this.failLevel("time_expired");
            }, Math.max(0, this.room.endsAt - Date.now()));

            this.tickTimer = setInterval(() => {
                this.broadcastGameState();
                this.persistRoom();
            }, 1000);

            BotManager.startBots(this);
            return;
        }

        if (this.room.state === "finished") {
            this.nextLevelTimer = setTimeout(() => {
                this.nextLevel();
            }, GameConfig.nextLevelDelayMs);
            return;
        }

        if (this.room.state === "failed") {
            this.nextLevelTimer = setTimeout(() => {
                this.rollbackToCheckpoint();
            }, GameConfig.failRestartDelayMs);
        }
    }

    persistRoom() {
        if (!this.onRoomChanged || !this.room) {
            return;
        }

        this.onRoomChanged(this.room).catch(error => {
            console.log("Room persistence failed:", error.message);
        });
    }

    startLevel() {
        this.clearTimers();

        this.room.state = "starting";
        this.room.currentHeight = 0;
        this.room.towerBlocks = [];
        this.room.targetHeight =
            this.getTargetHeightForLevel(this.room.level);
        this.room.startsAt = Date.now() + GameConfig.startDelayMs;
        this.room.endsAt = this.room.startsAt + GameConfig.levelTimeLimitMs;
        this.room.lastLevelSummary = null;

        this.room.players.forEach(player => {
            player.levelScore = 0;
            player.contributedHeight = 0;
            player.refreshUsesThisLevel = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
        });

        this.buildDrawPile();
        this.dealOpeningHands();

        console.log(`Level ${this.room.level} starting`);
        this.persistRoom();
        this.broadcastGameState();

        this.startTimer = setTimeout(() => {
            this.beginPlaying();
        }, GameConfig.startDelayMs);
    }

    beginPlaying() {
        if (this.room.state !== "starting") {
            return;
        }

        this.room.state = "playing";
        console.log(`Level ${this.room.level} started`);

        this.levelTimer = setTimeout(() => {
            this.failLevel("time_expired");
        }, GameConfig.levelTimeLimitMs);

        this.tickTimer = setInterval(() => {
            this.broadcastGameState();
        }, 1000);

        BotManager.startBots(this);
        this.persistRoom();
        this.broadcastGameState();
    }

    clearTimers() {
        clearTimeout(this.startTimer);
        clearTimeout(this.levelTimer);
        clearTimeout(this.nextLevelTimer);
        clearInterval(this.tickTimer);

        this.startTimer = null;
        this.levelTimer = null;
        this.nextLevelTimer = null;
        this.tickTimer = null;
    }

    closeRoom(reason) {
        if (!this.room) {
            return;
        }

        BotManager.stopBots(this);
        this.clearTimers();
        this.room.state = "closed";
        this.room.lastLevelSummary = {
            result: "closed",
            reason: reason
        };

        this.room.players.forEach(player => {
            player.botLoopLevel = null;
        });

        console.log(`Room closed: ${reason}`);
        this.persistRoom();
    }

    stopBots() {
        BotManager.stopBots(this);
    }

    // =========================
    // LEVEL TUNING
    // =========================

    getTargetHeightForLevel(level) {
        const curve = GameConfig.targetHeightCurve || [];
        const targetBand = curve.find(band => {
            return (
                level >= Number(band.minLevel) &&
                level <= Number(band.maxLevel)
            );
        });

        if (!targetBand) {
            return level * GameConfig.targetHeightMultiplier;
        }

        const curveTarget = (
            Number(targetBand.baseHeight) +
            (level - Number(targetBand.baseLevel)) *
                Number(targetBand.heightPerLevel)
        );

        return Math.max(
            1,
            Math.round(curveTarget * (GameConfig.targetHeightMultiplier / 3))
        );
    }

    getNextDrawBlock() {
        const drawPile = this.room?.drawPile || [];

        if (drawPile.length === 0) {
            return null;
        }

        return drawPile[0];
    }

    // =========================
    // BLOCK SYSTEM
    // =========================

    createBlockId() {
        return `B${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    }

    cloneCells(cells) {
        return cells.map(cell => [Number(cell[0]), Number(cell[1])]);
    }

    getBlockHeight(block) {
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

    getBlockCellCount(block) {
        if (typeof block === "number") {
            return block;
        }

        if (Array.isArray(block?.cells)) {
            return block.cells.length;
        }

        return this.getBlockHeight(block);
    }

    createBlock(blockSize) {
        const variants =
            GameConfig.blockShapeVariants[blockSize] ||
            GameConfig.blockShapeVariants[1];

        const variant =
            variants[Math.floor(Math.random() * variants.length)];

        const cells = this.cloneCells(variant.cells);

        return {
            id: this.createBlockId(),
            shapeId: variant.shapeId,
            cells: cells,
            height: this.getBlockHeight({ cells: cells })
        };
    }

    getRandomBlock() {
        const availableBlocks = {};

        for (const block in GameConfig.blockWeights) {
            const unlockLevel =
                GameConfig.blockUnlockLevels[block] || 1;

            if (this.room.level >= unlockLevel) {
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
            return this.createBlock(1);
        }

        const randomIndex =
            Math.floor(Math.random() * weightedPool.length);

        return this.createBlock(weightedPool[randomIndex]);
    }

    getBlocksPerPlayer() {
        let blocksPerPlayer = 1;

        for (const level in GameConfig.inventoryScaling) {
            if (this.room.level >= Number(level)) {
                blocksPerPlayer = GameConfig.inventoryScaling[level];
            }
        }

        return Math.min(blocksPerPlayer, GameConfig.maxActiveBlocks);
    }

    buildDrawPile() {
        const teamCarryOverBlocks = this.room.teamCarryOverBlocks || [];
        this.room.drawPile = this.shuffleBlocks(teamCarryOverBlocks);
        this.room.teamCarryOverBlocks = [];

        console.log(
            `Level ${this.room.level} draw pile: ${this.room.drawPile.length} blocks`
        );
    }

    generateSolvableOpeningHandBlocks() {
        const attempts = Math.max(1, GameConfig.openingHandGenerationAttempts);
        let fallbackBlocks = [];
        const openingHandBlockCount =
            this.room.players.length * this.getBlocksPerPlayer();

        for (let attempt = 0; attempt < attempts; attempt++) {
            const newBlocks = [];

            while (newBlocks.length < openingHandBlockCount) {
                newBlocks.push(this.getRandomBlock());
            }

            const combinedBlocks = [
                ...(this.room.drawPile || []),
                ...newBlocks
            ];

            fallbackBlocks = newBlocks;

            if (
                this.isLevelBlockSupplyValid(
                    combinedBlocks,
                    openingHandBlockCount
                )
            ) {
                return newBlocks;
            }
        }

        return fallbackBlocks;
    }

    isLevelBlockSupplyValid(blocks, minimumOpeningBlocks) {
        const targetHeight = this.room.targetHeight;
        const minTotalHeight =
            targetHeight + GameConfig.levelSupplyMinSurplus;
        const maxTotalHeight =
            targetHeight + GameConfig.levelSupplyMaxSurplus;
        const totalHeight = this.getTotalBlockHeight(blocks);

        return (
            blocks.length >= minimumOpeningBlocks &&
            totalHeight >= minTotalHeight &&
            totalHeight <= maxTotalHeight &&
            this.countPrecisionBlocks(blocks) >=
                Math.min(
                    GameConfig.minPrecisionBlocksPerLevel,
                    blocks.length
                ) &&
            this.hasExactHeightCombination(blocks, targetHeight)
        );
    }

    getTotalBlockHeight(blocks) {
        return (blocks || []).reduce((total, block) => {
            return total + this.getBlockHeight(block);
        }, 0);
    }

    countPrecisionBlocks(blocks) {
        return (blocks || []).filter(block => {
            return this.getBlockHeight(block) <= 2;
        }).length;
    }

    hasExactHeightCombination(blocks, targetHeight) {
        const reachableHeights = new Set([0]);

        (blocks || []).forEach(block => {
            const blockHeight = this.getBlockHeight(block);
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

    shuffleBlocks(blocks) {
        const shuffled = [...blocks];

        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        return shuffled;
    }

    dealOpeningHands() {
        const blocksPerPlayer = this.getBlocksPerPlayer();
        const openingHandBlocks = this.generateSolvableOpeningHandBlocks();
        let nextBlockIndex = 0;

        this.room.players.forEach(player => {
            player.blocks = [];

            while (player.blocks.length < blocksPerPlayer) {
                player.blocks.push(openingHandBlocks[nextBlockIndex]);
                nextBlockIndex += 1;
            }

            player.blocks = this.trimInventory(player.blocks);

            console.log(`${player.id} blocks:`, player.blocks);
        });
    }

    drawBlockFromPile() {
        if (!this.room.drawPile || this.room.drawPile.length === 0) {
            return null;
        }

        return this.room.drawPile.shift();
    }

    refillPlayerBlock(player) {
        const blocksPerPlayer = this.getBlocksPerPlayer();

        while (
            player.blocks.length < blocksPerPlayer &&
            (this.room.drawPile || []).length > 0
        ) {
            player.blocks.push(this.drawBlockFromPile());
        }
    }

    trimInventory(blocks) {
        const maxBlocks = GameConfig.maxActiveBlocks;

        if (blocks.length <= maxBlocks) {
            return blocks;
        }

        return [...blocks]
            .sort((a, b) => {
                const heightDiff =
                    this.getBlockHeight(b) - this.getBlockHeight(a);

                if (heightDiff !== 0) {
                    return heightDiff;
                }

                return this.getBlockCellCount(b) - this.getBlockCellCount(a);
            })
            .slice(0, maxBlocks);
    }

    placeBlock(playerId, blockIndex) {
        if (this.room.state !== "playing") {
            console.log("Cannot place block, level not active");
            return;
        }

        const player =
            this.room.players.find(p => p.id === playerId);

        if (!player) {
            console.log("Player not found");
            return;
        }

        const currentTime = Date.now();
        const timeSinceLastPlacement =
            currentTime - player.lastPlacementTime;

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
        const blockHeight = this.getBlockHeight(block);
        const previousHeight = this.room.currentHeight;
        const effectiveHeight = Math.max(
            0,
            Math.min(blockHeight, this.room.targetHeight - previousHeight)
        );

        player.lastPlacementTime = Date.now();
        player.contributedHeight += effectiveHeight;
        this.room.currentHeight += blockHeight;
        this.room.towerBlocks = this.room.towerBlocks || [];
        this.room.towerBlocks.push({
            playerId: player.id,
            block: block,
            height: blockHeight,
            effectiveHeight: effectiveHeight,
            baseHeight: previousHeight
        });
        this.refillPlayerBlock(player);

        this.addPlacementScore(player, block, effectiveHeight);

        console.log(`${player.id} placed block (${blockHeight})`);
        console.log("Current Height:", this.room.currentHeight);

        this.checkWinCondition(player, block);

        if (this.room.state === "playing") {
            this.checkFailCondition();
        }

        this.persistRoom();
        this.broadcastGameState();
    }

    refreshBlocks(playerId) {
        if (this.room.state !== "playing" && this.room.state !== "starting") {
            console.log("Cannot refresh, level not active");
            return;
        }

        const player =
            this.room.players.find(p => p.id === playerId);

        if (!player) {
            console.log("Player not found");
            return;
        }

        if (player.refreshTokens <= 0) {
            console.log(`${player.id} has no refresh tokens`);
            return;
        }

        if (player.refreshUsesThisLevel >= GameConfig.maxRefreshUsesPerLevel) {
            console.log(`${player.id} used all refreshes this level`);
            return;
        }

        if (
            this.room.state === "playing" &&
            this.getRemainingMs() <= GameConfig.refreshLockoutMs
        ) {
            console.log("Cannot refresh during final lockout");
            return;
        }

        player.refreshTokens -= 1;
        player.refreshUsesThisLevel += 1;

        // Replace only the blocks currently in the player's inventory.
        // Refresh does not top up to the max — it re-rolls whatever the
        // player currently holds. If they have 1 block left, they get 1
        // new block. Using refresh on a full hand replaces all blocks.
        const countToRefresh = (player.blocks || []).length;
        player.blocks = [];

        for (let i = 0; i < countToRefresh; i++) {
            player.blocks.push(this.getRandomBlock());
        }

        console.log(`${player.id} refreshed blocks:`, player.blocks);
        this.checkFailCondition();
        this.persistRoom();
        this.broadcastGameState();
    }

    // =========================
    // GAME RULES
    // =========================

    checkWinCondition(finisher, finishingBlock) {
        if (this.room.currentHeight < this.room.targetHeight) {
            return;
        }

        console.log("TARGET REACHED. LEVEL COMPLETED.");
        this.completeLevel(finisher, finishingBlock);
    }

    checkFailCondition() {
        if (this.room.state !== "playing") {
            return;
        }

        const allEmpty =
            this.room.players.every(player => {
                return !player.blocks || player.blocks.length === 0;
            });
        const drawPileEmpty =
            !this.room.drawPile || this.room.drawPile.length === 0;

        const remainingPossibleHeight =
            this.room.players.reduce((total, player) => {
                return total + (player.blocks || []).reduce((sum, block) => {
                    return sum + this.getBlockHeight(block);
                }, 0);
            }, 0) + this.getTotalBlockHeight(this.room.drawPile || []);

        const neededHeight =
            this.room.targetHeight - this.room.currentHeight;

        if (
            allEmpty &&
            drawPileEmpty &&
            this.room.currentHeight < this.room.targetHeight
        ) {
            this.failLevel("all_blocks_used");
            return;
        }

        if (
            remainingPossibleHeight < neededHeight &&
            !this.anyPlayerCanRefresh()
        ) {
            this.failLevel("not_enough_height_remaining");
        }
    }

    anyPlayerCanRefresh() {
        if (
            this.room.state === "playing" &&
            this.getRemainingMs() <= GameConfig.refreshLockoutMs
        ) {
            return false;
        }

        return this.room.players.some(player => {
            return (
                player.refreshTokens > 0 &&
                player.refreshUsesThisLevel < GameConfig.maxRefreshUsesPerLevel
            );
        });
    }

    completeLevel(finisher, finishingBlock) {
        this.room.state = "finished";
        clearTimeout(this.levelTimer);
        clearInterval(this.tickTimer);

        const exactFinish =
            this.room.currentHeight === this.room.targetHeight;

        this.awardCompletionBonuses(finisher, exactFinish);
        // ADD LEVEL SCORE TO LEADERBOARD SCORE WHEN LEVEL IS COMPLETED
        this.addLevelScoreToLeaderboard();
        const carriedBlockCount = this.prepareTeamCarryOverBlocks();

        const mvp = this.getLevelMVP();
        this.awardRefreshToken(mvp);

        if (exactFinish) {
            this.room.players.forEach(player => {
                this.awardRefreshToken(player);
            });
        }

        this.room.lastLevelSummary = {
            result: "completed",
            level: this.room.level,
            exactFinish: exactFinish,
            finisherId: finisher.id,
            finishingBlock: finishingBlock,
            carriedBlockCount: carriedBlockCount,
            mvpId: mvp.id
        };

        this.showScoreboard();
        this.showLevelMVP();
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.nextLevel();
        }, GameConfig.nextLevelDelayMs);
    }

    failLevel(reason) {
        if (
            this.room.state !== "playing" &&
            this.room.state !== "starting"
        ) {
            return;
        }

        this.room.state = "failed";
        this.clearTimers();

        const mvp = this.getLevelMVP();

        this.room.lastLevelSummary = {
            result: "failed",
            level: this.room.level,
            reason: reason,
            mvpId: mvp.id
        };

        this.showScoreboard();
        this.showLevelMVP();

        console.log(`Level FAILED: ${reason}`);
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.rollbackToCheckpoint();
        }, GameConfig.failRestartDelayMs);
    }

    // =========================
    // GAME FLOW
    // =========================

    nextLevel() {
        if (this.room.level >= GameConfig.maxLevel) {
            console.log("\nGAME COMPLETED!");
            this.room.state = "game_completed";
            this.persistRoom();
            this.broadcastGameState();
            return;
        }

        this.room.level += 1;

        if ((this.room.level - 1) % GameConfig.checkpointInterval === 0) {
            this.room.checkpointLevel = this.room.level;
        }

        console.log(`\n=== LEVEL ${this.room.level} QUEUED ===`);
        this.startLevel();
    }

    rollbackToCheckpoint() {
        this.room.level = this.room.checkpointLevel;
        this.room.drawPile = [];
        this.room.teamCarryOverBlocks = [];

        this.room.players.forEach(player => {
            player.blocks = [];
            player.levelScore = 0;
            player.contributedHeight = 0;
        });

        console.log(`Rolling back to checkpoint level ${this.room.level}`);
        this.startLevel();
    }

    prepareTeamCarryOverBlocks() {
        const unusedHandBlocks = this.room.players.flatMap(player => {
            return player.blocks || [];
        });
        const unusedDrawPileBlocks = this.room.drawPile || [];

        this.room.teamCarryOverBlocks = [
            ...unusedHandBlocks,
            ...unusedDrawPileBlocks
        ]
            .sort((a, b) => {
                const heightDiff =
                    this.getBlockHeight(a) - this.getBlockHeight(b);

                if (heightDiff !== 0) {
                    return heightDiff;
                }

                return this.getBlockCellCount(a) - this.getBlockCellCount(b);
            })
            .slice(0, GameConfig.maxTeamCarryOverBlocks);

        this.room.drawPile = [];

        return this.room.teamCarryOverBlocks.length;
    }

    // =========================
    // SCORE SYSTEM
    // =========================

    addPlacementScore(player, block, effectiveHeight) {
        const points = Math.round(effectiveHeight * this.room.level);

        //player.score += points; //Only add to levelScore during gameplay
        player.levelScore += points;

        console.log(`${player.id} gained ${points} score`);
    }

    awardCompletionBonuses(finisher, exactFinish) {
        this.addBonusScore(
            finisher,
            this.room.level * GameConfig.scoring.finisherBonusPerLevel,
            "finisher"
        );

        if (exactFinish) {
            this.addBonusScore(
                finisher,
                this.room.level * GameConfig.scoring.precisionBonusPerLevel,
                "precision"
            );

            this.room.players.forEach(player => {
                this.addBonusScore(
                    player,
                    this.room.level * GameConfig.scoring.teamExactBonusPerLevel,
                    "team"
                );
            });
        }

        this.room.players.forEach(player => {
            const share =
                this.room.targetHeight === 0
                    ? 0
                    : player.contributedHeight / this.room.targetHeight;

            if (share >= GameConfig.scoring.assistContributionThreshold) {
                this.addBonusScore(
                    player,
                    this.room.level * GameConfig.scoring.assistBonusPerLevel,
                    "assist"
                );
            }
        });
    }

    addBonusScore(player, points, label) {
        //player.score += points; // Only add to levelScore during gameplay
        player.levelScore += points;

        console.log(`${player.id} gained ${points} ${label} bonus`);
    }

    addLevelScoreToLeaderboard() {
        // Add levelScore to main score only when level is completed
        this.room.players.forEach(player => {
            player.score += player.levelScore;
            console.log(`${player.id} level score (${player.levelScore}) added to leaderboard score. New total: ${player.score}`);
        });
    }

    awardRefreshToken(player) {
        player.refreshTokens = Math.min(
            GameConfig.maxRefreshTokens,
            player.refreshTokens + 1
        );
    }

    getLevelMVP() {
        let mvp = this.room.players[0];

        this.room.players.forEach(player => {
            if (player.levelScore > mvp.levelScore) {
                mvp = player;
            }
        });

        return mvp;
    }

    showLevelMVP() {
        const mvp = this.getLevelMVP();

        console.log(
            `Level MVP: ${mvp.id} (${mvp.levelScore} level score)`
        );
    }

    showScoreboard() {
        console.log("\n=== SCOREBOARD ===");

        this.room.players.forEach(player => {
            console.log(
                `${player.id}: ${player.score} total / ${player.levelScore} level`
            );
        });
    }
}

module.exports = GameEngine;
