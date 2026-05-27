// Game_Engine.js

const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");

class GameEngine {
    constructor() {
        this.room = null;
        this.startTimer = null;
        this.levelTimer = null;
        this.nextLevelTimer = null;
        this.tickTimer = null;
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
            secondsRemaining: Math.ceil(this.getRemainingMs() / 1000),
            lastLevelSummary: this.room.lastLevelSummary,
            players: this.room.players.map(player => ({
                id: player.id,
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
            players: players,
            level: 1,
            checkpointLevel: 1,
            targetHeight: GameConfig.targetHeightMultiplier,
            currentHeight: 0,
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
            player.carryOverBlocks = [];
            player.lastPlacementTime = 0;
        });

        console.log("Room created:", this.room.id);
    }

    startLevel() {
        this.clearTimers();

        this.room.state = "starting";
        this.room.currentHeight = 0;
        this.room.targetHeight =
            this.room.level * GameConfig.targetHeightMultiplier;
        this.room.startsAt = Date.now() + GameConfig.startDelayMs;
        this.room.endsAt = this.room.startsAt + GameConfig.levelTimeLimitMs;
        this.room.lastLevelSummary = null;

        this.room.players.forEach(player => {
            player.levelScore = 0;
            player.contributedHeight = 0;
            player.refreshUsesThisLevel = 0;
            player.lastPlacementTime = 0;
        });

        this.assignBlocks();

        console.log(`Level ${this.room.level} starting`);
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
    }

    stopBots() {
        BotManager.stopBots(this);
    }

    // =========================
    // BLOCK SYSTEM
    // =========================

    getRandomBlock() {
        const availableBlocks = {
            1: GameConfig.blockWeights[1],
            2: GameConfig.blockWeights[2],
            3: GameConfig.blockWeights[3]
        };

        for (const block in GameConfig.blockUnlockLevels) {
            const unlockLevel = GameConfig.blockUnlockLevels[block];

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

        const randomIndex =
            Math.floor(Math.random() * weightedPool.length);

        return weightedPool[randomIndex];
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

    assignBlocks() {
        const blocksPerPlayer = this.getBlocksPerPlayer();

        this.room.players.forEach(player => {
            const carryOverBlocks = player.carryOverBlocks || [];
            player.blocks = [...carryOverBlocks];

            while (player.blocks.length < blocksPerPlayer) {
                player.blocks.push(this.getRandomBlock());
            }

            player.blocks = this.trimInventory(player.blocks);
            player.carryOverBlocks = [];

            console.log(`${player.id} blocks:`, player.blocks);
        });
    }

    trimInventory(blocks) {
        const maxBlocks =
            GameConfig.maxActiveBlocks + GameConfig.maxCarryOverBlocks;

        if (blocks.length <= maxBlocks) {
            return blocks;
        }

        return [...blocks]
            .sort((a, b) => b - a)
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
        const previousHeight = this.room.currentHeight;
        const effectiveHeight = Math.max(
            0,
            Math.min(block, this.room.targetHeight - previousHeight)
        );

        player.lastPlacementTime = Date.now();
        player.contributedHeight += effectiveHeight;
        this.room.currentHeight += block;

        this.addPlacementScore(player, block, effectiveHeight);

        console.log(`${player.id} placed block (${block})`);
        console.log("Current Height:", this.room.currentHeight);

        this.checkWinCondition(player, block);

        if (this.room.state === "playing") {
            this.checkFailCondition();
        }

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
        player.blocks = [];

        const blocksPerPlayer = this.getBlocksPerPlayer();

        for (let i = 0; i < blocksPerPlayer; i++) {
            player.blocks.push(this.getRandomBlock());
        }

        console.log(`${player.id} refreshed blocks:`, player.blocks);
        this.checkFailCondition();
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

        const remainingPossibleHeight =
            this.room.players.reduce((total, player) => {
                return total + (player.blocks || []).reduce(
                    (sum, block) => sum + block,
                    0
                );
            }, 0);

        const neededHeight =
            this.room.targetHeight - this.room.currentHeight;

        if (allEmpty && this.room.currentHeight < this.room.targetHeight) {
            this.failLevel("all_blocks_used");
            return;
        }

        if (remainingPossibleHeight < neededHeight) {
            this.failLevel("not_enough_height_remaining");
        }
    }

    completeLevel(finisher, finishingBlock) {
        this.room.state = "finished";
        clearTimeout(this.levelTimer);
        clearInterval(this.tickTimer);

        const exactFinish =
            this.room.currentHeight === this.room.targetHeight;

        this.awardCompletionBonuses(finisher, exactFinish);
        this.prepareCarryOverBlocks();

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
            mvpId: mvp.id
        };

        this.showScoreboard();
        this.showLevelMVP();
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
        this.room.players.forEach(player => {
            player.carryOverBlocks = [];
            player.blocks = [];
            player.levelScore = 0;
            player.contributedHeight = 0;
        });

        console.log(`Rolling back to checkpoint level ${this.room.level}`);
        this.startLevel();
    }

    prepareCarryOverBlocks() {
        this.room.players.forEach(player => {
            const unusedBlocks = player.blocks || [];

            player.carryOverBlocks = [...unusedBlocks]
                .sort((a, b) => b - a)
                .slice(0, GameConfig.maxCarryOverBlocks);
        });
    }

    // =========================
    // SCORE SYSTEM
    // =========================

    addPlacementScore(player, block, effectiveHeight) {
        const basePoints = block * this.room.level;
        const efficiency =
            block === 0 ? 0 : effectiveHeight / block;
        const points = Math.round(basePoints * efficiency);

        player.score += points;
        player.levelScore += points;

        console.log(`${player.id} gained ${points} score`);
    }

    awardCompletionBonuses(finisher, exactFinish) {
        this.addBonusScore(finisher, this.room.level * 10, "finisher");

        if (exactFinish) {
            this.addBonusScore(finisher, this.room.level * 10, "precision");

            this.room.players.forEach(player => {
                this.addBonusScore(player, this.room.level * 5, "team");
            });
        }

        this.room.players.forEach(player => {
            const share =
                this.room.targetHeight === 0
                    ? 0
                    : player.contributedHeight / this.room.targetHeight;

            if (share >= 0.25) {
                this.addBonusScore(player, this.room.level * 6, "assist");
            }
        });
    }

    addBonusScore(player, points, label) {
        player.score += points;
        player.levelScore += points;

        console.log(`${player.id} gained ${points} ${label} bonus`);
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
