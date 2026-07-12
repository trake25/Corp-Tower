// Game_Engine.js

const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");
const TowerStability = require("./Tower_Stability");

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

        const scoreEvents = this.consumeScoreEvents();
        const quickChatEvents = this.consumeQuickChatEvents();
        const gameState = {
            type: "game_state",
            state: this.room.state,
            level: this.room.level,
            checkpointLevel: this.room.checkpointLevel,
            currentHeight: this.room.currentHeight,
            targetHeight: this.room.targetHeight,
            checkpointScoreStatus: this.getCheckpointScoreStatus(),
            activeInventorySlots: this.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            drawPileCount: (this.room.drawPile || []).length,
            nextDrawBlock: this.getNextDrawBlock(),
            towerBlocks: this.room.towerBlocks || [],
            towerStability: this.room.towerStability ?? 100,
            towerStabilityDiagnostics: this.room.towerStabilityDiagnostics || {},
            sideQuest: this.room.sideQuest || null,
            politicsEvents: this.consumePoliticsEvents(),
            towerStabilityFeedbackMode: GameConfig.towerStabilityFeedbackMode,
            secondsRemaining: Math.ceil(this.getRemainingMs() / 1000),
            lastLevelSummary: this.room.lastLevelSummary,
            scoreEvents: scoreEvents,
            quickChatEvents: quickChatEvents,
            quickChatCooldownMs: Math.max(0, Number(GameConfig.quickChatCooldownMs) || 0),
            quickChatTemplates: GameConfig.quickChatTemplates || [],
            placementScorePopupDurationMs: this.getPlacementScorePopupDurationMs(),
            finishScorePopupDurationMs: this.getFinishScorePopupDurationMs(),
            scorePopupDurationMs: this.getMaxScorePopupDurationMs(),
            levelSummaryDelayMs: GameConfig.levelSummaryDelayMs,
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
                ,politicsInventory: player.politicsInventory || []
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
        const startLevel = this.getConfiguredStartLevel();

        this.room = {
            id: null,
            players: players,
            level: startLevel,
            checkpointLevel: startLevel,
            checkpointScores: {},
            targetHeight: this.getTargetHeightForLevel(startLevel),
            currentHeight: 0,
            drawPile: [],
            teamCarryOverBlocks: [],
            towerBlocks: [],
            towerStability: 100,
            towerStabilityDiagnostics: {},
            state: "waiting",
            startsAt: 0,
            endsAt: 0,
            lastLevelSummary: null,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPoliticsEvents: [],
            sideQuest: null,
            scoreEventSeq: 0
        };

        this.room.players.forEach(player => {
            player.score = player.score || 0;
            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.refreshTokens = 0;
            player.refreshUsesThisLevel = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.lastQuickChatTime = 0;
            player.politicsInventory = [];
            player.lastPoliticsActivationTime = 0;
            player.lastQuickChatTime = 0;
        });
        this.saveCheckpointScores();

        console.log("Room created:", this.room.id);
    }

    hydrateRoom(snapshot, runtimePlayers) {
        this.clearTimers();

        this.room = {
            id: snapshot.id,
            players: runtimePlayers,
            level: snapshot.state.level,
            checkpointLevel: snapshot.state.checkpointLevel,
            checkpointScores: snapshot.state.checkpointScores || {},
            targetHeight: snapshot.state.targetHeight,
            currentHeight: snapshot.state.currentHeight,
            drawPile: snapshot.state.drawPile || [],
            teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
            towerBlocks: snapshot.state.towerBlocks || [],
            towerStability: snapshot.state.towerStability ?? 100,
            towerStabilityDiagnostics: snapshot.state.towerStabilityDiagnostics || {},
            state: snapshot.state.state,
            startsAt: snapshot.state.startsAt,
            endsAt: snapshot.state.endsAt,
            lastLevelSummary: snapshot.state.lastLevelSummary,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPoliticsEvents: [],
            sideQuest: snapshot.state.sideQuest || null,
            scoreEventSeq: 0
        };
        this.ensureCheckpointScores();
        this.recalculateTowerStability();

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
            }, this.getPostLevelTransitionDelayMs());
            return;
        }

        if (this.room.state === "failed") {
            this.nextLevelTimer = setTimeout(() => {
                this.rollbackToCheckpoint();
            }, this.getPostLevelTransitionDelayMs());
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

    createScoreEvent(type, options = {}) {
        this.room.scoreEventSeq = (this.room.scoreEventSeq || 0) + 1;

        return {
            id: [
                this.room.level,
                this.room.scoreEventSeq,
                type
            ].join(":"),
            type: type,
            level: this.room.level,
            playerId: options.playerId || null,
            points: Number(options.points || 0),
            label: options.label || type,
            displayOnly: Boolean(options.displayOnly),
            meta: options.meta || {}
        };
    }

    queueScoreEvent(type, options = {}) {
        if (!this.room) {
            return null;
        }

        this.room.pendingScoreEvents = this.room.pendingScoreEvents || [];
        const event = this.createScoreEvent(type, options);

        this.room.pendingScoreEvents.push(event);
        return event;
    }

    consumeScoreEvents() {
        if (!this.room) {
            return [];
        }

        const events = this.room.pendingScoreEvents || [];
        this.room.pendingScoreEvents = [];

        return events;
    }

    queueQuickChat(player, slot) {
        if (!this.room || this.room.state !== "playing") {
            return false;
        }

        const templates = Array.isArray(GameConfig.quickChatTemplates)
            ? GameConfig.quickChatTemplates
            : [];
        const slotIndex = Number(slot);

        if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= templates.length) {
            return false;
        }

        const now = Date.now();
        const cooldownMs = Math.max(0, Number(GameConfig.quickChatCooldownMs) || 0);
        if (now - Number(player.lastQuickChatTime || 0) < cooldownMs) {
            return false;
        }

        player.lastQuickChatTime = now;
        this.room.pendingQuickChatEvents = this.room.pendingQuickChatEvents || [];
        this.room.pendingQuickChatEvents.push({
            id: [this.room.level, now, player.id, slotIndex].join(":"),
            playerId: player.id,
            slot: slotIndex,
            text: String(templates[slotIndex]),
            createdAt: now
        });
        this.broadcastGameState();
        return true;
    }

    consumeQuickChatEvents() {
        const events = this.room?.pendingQuickChatEvents || [];
        if (this.room) {
            this.room.pendingQuickChatEvents = [];
        }
        return events;
    }

    consumePoliticsEvents() {
        const events = this.room?.pendingPoliticsEvents || [];
        if (this.room) this.room.pendingPoliticsEvents = [];
        return events;
    }

    setupSideQuest() {
        if (this.room.level < GameConfig.politicsUnlockLevel) { this.room.sideQuest = null; return; }
        const sizes = Object.keys(GameConfig.blockShapeVariants).map(Number).filter(size => this.isBlockSizeUnlocked(size) && size >= 4);
        const options = sizes.map(size => ({ id: `place_${size}`, type: "place_size", size, label: `First to place a ${size}-cell block` }));
        options.push({ id: "exact_finish", type: "exact_finish", label: "First to finish exactly" });
        this.room.sideQuest = { ...options[Math.floor(Math.random() * options.length)], claimedBy: null, rewardId: Object.keys(GameConfig.politicsCatalog)[Math.floor(Math.random() * 3)] };
    }

    tryCompleteSideQuest(player, block, exactFinish) {
        const quest = this.room.sideQuest;
        if (!quest || quest.claimedBy) return;
        const complete = (quest.type === "place_size" && this.getBlockCellCount(block) === quest.size) || (quest.type === "exact_finish" && exactFinish);
        if (!complete || player.politicsInventory.length >= GameConfig.politicsMaxSlots) return;
        quest.claimedBy = player.id;
        player.politicsInventory.push({ id: quest.rewardId, earnedLevel: this.room.level });
        this.room.pendingPoliticsEvents.push({ id: `${this.room.level}:quest:${player.id}`, type: "politics_earned", playerId: player.id, politicsId: quest.rewardId, label: "Politics earned" });
    }

    activatePolitics(playerId, slot, targetPlayerId) {
        if (!this.room || this.room.state !== "playing") return false;
        if (this.getRemainingMs() <= 3000) return false;
        const player = this.room.players.find(p => p.id === playerId);
        const target = this.room.players.find(p => p.id === targetPlayerId);
        if (!player || !target || !Number.isInteger(Number(slot))) return false;
        if (Date.now() - Number(player.lastPoliticsActivationTime || 0) < GameConfig.politicsActivationCooldownMs) return false;
        const item = player.politicsInventory[Number(slot)];
        if (!item) return false;
        player.politicsInventory.splice(Number(slot), 1);
        player.lastPoliticsActivationTime = Date.now();
        if (item.id === "copy_score") {
            target.score = player.score;
            this.room.checkpointScores[target.id] = player.score;
        }
        if (item.id === "free_refresh") { if (target.refreshTokens < GameConfig.maxRefreshTokens) target.refreshTokens++; else target.blocks = this.generateRefreshBlocks(target.blocks || []); }
        if (item.id === "score_cap") {
            target.score = this.getCheckpointScoreStatus().players.find(p => p.id === target.id)?.requiredScore || target.score;
            target.scoreCap = null;
            target.scoreCapCasterId = null;
        }
        this.room.pendingPoliticsEvents.push({ id: `${this.room.level}:politics:${Date.now()}`, type: "politics_activated", playerId, targetPlayerId, politicsId: item.id, label: GameConfig.politicsCatalog[item.id].title, meta: { tintTargetScore: item.id !== "free_refresh", tintTargetToken: item.id === "free_refresh", tintDurationMs: 4000 } });
        this.persistRoom(); this.broadcastGameState(); return true;
    }

    getPostLevelTransitionDelayMs() {
        const levelSummaryDelayMs =
            Math.max(0, Number(GameConfig.levelSummaryDelayMs) || 0);

        return this.getMaxScorePopupDurationMs() + levelSummaryDelayMs;
    }

    getPlacementScorePopupDurationMs() {
        return Math.max(
            0,
            Number(GameConfig.placementScorePopupDurationMs) || 0
        );
    }

    getFinishScorePopupDurationMs() {
        return Math.max(
            0,
            Number(GameConfig.finishScorePopupDurationMs) || 0
        );
    }

    getMaxScorePopupDurationMs() {
        return Math.max(
            this.getPlacementScorePopupDurationMs(),
            this.getFinishScorePopupDurationMs()
        );
    }

    startLevel() {
        this.clearTimers();

        this.room.state = "starting";
        this.room.currentHeight = 0;
        this.room.towerBlocks = [];
        this.room.towerStability = 100;
        this.room.towerStabilityDiagnostics = {};
        this.room.targetHeight =
            this.getTargetHeightForLevel(this.room.level);
        this.room.startsAt = Date.now() + GameConfig.startDelayMs;
        this.room.endsAt = this.room.startsAt + GameConfig.levelTimeLimitMs;
        this.room.lastLevelSummary = null;
        this.room.pendingScoreEvents = [];
        this.setupSideQuest();

        this.room.players.forEach(player => {
            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.refreshUsesThisLevel = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.lastQuickChatTime = 0;
            player.scoreCap = null;
            player.scoreCapCasterId = null;
            if (GameConfig.politicsLifetime === "level") {
                player.politicsInventory = [];
            }
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

    getConfiguredStartLevel() {
        return this.clampLevel(GameConfig.debugStartLevel || 1);
    }

    clampLevel(level) {
        return Math.max(
            1,
            Math.min(GameConfig.maxLevel, Math.floor(Number(level) || 1))
        );
    }

    restartAtConfiguredStartLevel() {
        this.restartAtLevel(this.getConfiguredStartLevel(), {
            resetScores: true
        });
    }

    restartAtLevel(level, options = {}) {
        if (!this.room) {
            return;
        }

        BotManager.stopBots(this);
        this.clearTimers();

        const targetLevel = this.clampLevel(level);

        this.room.level = targetLevel;
        this.room.checkpointLevel = targetLevel;
        this.room.drawPile = [];
        this.room.teamCarryOverBlocks = [];
        this.room.towerBlocks = [];
        this.room.currentHeight = 0;
        this.room.towerStability = 100;
        this.room.towerStabilityDiagnostics = {};
        this.room.targetHeight = this.getTargetHeightForLevel(targetLevel);
        this.room.lastLevelSummary = null;
        this.room.pendingScoreEvents = [];
        this.room.scoreEventSeq = 0;

        this.room.players.forEach(player => {
            if (options.resetScores) {
                player.score = 0;
            }

            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.refreshTokens = 0;
            player.refreshUsesThisLevel = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.botLoopLevel = null;
        });

        this.saveCheckpointScores();
        this.startLevel();
    }

    getNextDrawBlock() {
        const drawPile = this.room?.drawPile || [];

        if (drawPile.length === 0) {
            return null;
        }

        return drawPile[0];
    }

    saveCheckpointScores() {
        if (!this.room) {
            return;
        }

        this.room.checkpointScores = {};

        this.room.players.forEach(player => {
            this.room.checkpointScores[player.id] = player.score || 0;
        });
    }

    ensureCheckpointScores() {
        if (
            !this.room.checkpointScores ||
            Object.keys(this.room.checkpointScores).length === 0
        ) {
            this.saveCheckpointScores();
        }
    }

    restoreCheckpointScores() {
        const checkpointScores = this.room.checkpointScores || {};

        this.room.players.forEach(player => {
            player.score = Number(checkpointScores[player.id] || 0);
        });
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

    createBlock(blockSize, excludedShapeId = null) {
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
        const generatedDrawPileBlocks =
            this.generateDrawPileBlocks(this.getGeneratedDrawPileBlockCount());

        this.room.drawPile = this.shuffleBlocks([
            ...teamCarryOverBlocks,
            ...generatedDrawPileBlocks
        ]);
        this.room.teamCarryOverBlocks = [];

        console.log(
            `Level ${this.room.level} draw pile: ${this.room.drawPile.length} blocks`
        );
    }

    getGeneratedDrawPileBlockCount() {
        let generatedBlockCount = 0;

        for (const level in GameConfig.generatedDrawPileScaling || {}) {
            if (this.room.level >= Number(level)) {
                generatedBlockCount =
                    GameConfig.generatedDrawPileScaling[level];
            }
        }

        return Math.min(
            generatedBlockCount,
            GameConfig.maxGeneratedDrawPileBlocks
        );
    }

    generateDrawPileBlocks(blockCount) {
        const blocks = [];

        for (let i = 0; i < blockCount; i++) {
            blocks.push(this.getRandomBlock());
        }

        return blocks;
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
        const placement = TowerStability.settleBlock(
            this.room.towerBlocks || [], block, GameConfig.towerGridWidth
        );
        const projectedBlocks = [...(this.room.towerBlocks || []), {
            playerId: player.id, block, originX: placement.originX, originY: placement.originY
        }];
        const newHeight = TowerStability.topHeight(projectedBlocks);
        const heightGain = Math.max(0, newHeight - previousHeight);
        const effectiveHeight = Math.max(
            0,
            Math.min(heightGain, this.room.targetHeight - previousHeight)
        );

        player.lastPlacementTime = Date.now();
        player.contributedHeight += effectiveHeight;
        this.room.currentHeight = newHeight;
        this.room.towerBlocks = this.room.towerBlocks || [];
        this.room.towerBlocks.push({
            playerId: player.id,
            block: block,
            height: blockHeight,
            effectiveHeight: effectiveHeight,
            baseHeight: placement.originY,
            originX: placement.originX,
            originY: placement.originY
        });
        this.refillPlayerBlock(player);

        this.addPlacementScore(player, block, effectiveHeight);

        this.tryCompleteSideQuest(player, block, this.room.currentHeight === this.room.targetHeight);

        console.log(`${player.id} placed block (${blockHeight})`);
        console.log("Current Height:", this.room.currentHeight);

        this.recalculateTowerStability();

        if (this.room.towerStability <= 0) {
            this.failLevel("tower_collapsed");
        } else {
            this.checkWinCondition(player, block);
        }

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
        // Refresh does not top up to the max - it re-rolls whatever the
        // player currently holds. If they have 1 block left, they get 1
        // new block. Using refresh on a full hand replaces all blocks.
        player.blocks = this.generateRefreshBlocks(player.blocks || []);

        console.log(`${player.id} refreshed blocks:`, player.blocks);
        this.checkFailCondition();
        this.persistRoom();
        this.broadcastGameState();
    }

    recalculateTowerStability() {
        const result = TowerStability.evaluate(this.room.towerBlocks || [], GameConfig);
        const previous = this.room.towerStability ?? 100;
        this.room.towerStability = result.stability;
        this.room.towerStabilityDiagnostics = result.diagnostics;
        if (previous > GameConfig.towerStabilityCriticalThreshold && result.stability <= GameConfig.towerStabilityCriticalThreshold) {
            this.queueScoreEvent("tower_critical", { label: "Tower Critical", displayOnly: true });
        } else if (previous > GameConfig.towerStabilityWarningThreshold && result.stability <= GameConfig.towerStabilityWarningThreshold) {
            this.queueScoreEvent("tower_warning", { label: "Tower Wobbling", displayOnly: true });
        }
    }

    generateRefreshBlocks(currentBlocks) {
        const blockCount = (currentBlocks || []).length;

        if (blockCount <= 0) {
            return [];
        }

        const attempts = Math.max(1, GameConfig.refreshGenerationAttempts);
        let bestBlocks = [];
        let bestScore = -1;

        for (let attempt = 0; attempt < attempts; attempt++) {
            const blocks = currentBlocks.map(block => {
                return this.createRefreshBlock(block);
            });

            if (this.isRefreshBlockSetUseful(blocks)) {
                return blocks;
            }

            const score = this.scoreRefreshBlockSet(blocks);

            if (score > bestScore) {
                bestScore = score;
                bestBlocks = blocks;
            }
        }

        return bestBlocks;
    }

    createRefreshBlock(currentBlock) {
        const blockSize = this.getBlockCellCount(currentBlock);

        if (blockSize < 3) {
            return this.createRandomUnlockedBlock(3);
        }

        if (this.isBlockSizeUnlocked(blockSize)) {
            return this.createBlock(
                blockSize,
                typeof currentBlock === "number"
                    ? null
                    : currentBlock?.shapeId || null
            );
        }

        return this.createRandomUnlockedBlock(3);
    }

    createRandomUnlockedBlock(minBlockSize = 1) {
        const blockSize = this.getWeightedUnlockedBlockSize(minBlockSize);

        return this.createBlock(blockSize);
    }

    getWeightedUnlockedBlockSize(minBlockSize = 1) {
        const weightedPool = [];

        for (const block in GameConfig.blockWeights) {
            const blockSize = Number(block);

            if (
                blockSize < minBlockSize ||
                !this.isBlockSizeUnlocked(blockSize)
            ) {
                continue;
            }

            const weight = GameConfig.blockWeights[block] || 1;

            for (let i = 0; i < weight; i++) {
                weightedPool.push(blockSize);
            }
        }

        if (weightedPool.length === 0 && minBlockSize > 1) {
            return this.getWeightedUnlockedBlockSize(1);
        }

        if (weightedPool.length === 0) {
            return 1;
        }

        return weightedPool[Math.floor(Math.random() * weightedPool.length)];
    }

    isBlockSizeUnlocked(blockSize) {
        const unlockLevel = GameConfig.blockUnlockLevels[blockSize] || 1;

        return (
            Boolean(GameConfig.blockShapeVariants[blockSize]) &&
            this.room.level >= unlockLevel
        );
    }

    isRefreshBlockSetUseful(blocks) {
        const remainingHeight =
            Math.max(1, this.room.targetHeight - this.room.currentHeight);
        const usefulHeight =
            Math.min(remainingHeight, GameConfig.refreshMinUsefulBlockHeight);

        return (blocks || []).some(block => {
            const blockHeight = this.getBlockHeight(block);

            return (
                blockHeight <= remainingHeight &&
                blockHeight >= usefulHeight
            );
        });
    }

    scoreRefreshBlockSet(blocks) {
        const remainingHeight =
            Math.max(1, this.room.targetHeight - this.room.currentHeight);

        return (blocks || []).reduce((score, block) => {
            const blockHeight = this.getBlockHeight(block);

            if (blockHeight > remainingHeight) {
                return score;
            }

            return score + blockHeight;
        }, 0);
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

    getPlayerScoreMap() {
        const scores = {};

        this.room.players.forEach(player => {
            scores[player.id] = Number(player.score || 0);
        });

        return scores;
    }

    getTeamLevelScore() {
        return this.room.players.reduce((total, player) => {
            return total + Number(player.levelScore || 0);
        }, 0);
    }

    getPlayerBonusBreakdown(player) {
        const breakdown = player.scoreBreakdown || {};

        return {
            placement: Number(breakdown.placement || 0),
            finisher: Number(breakdown.finisher || 0),
            precision: Number(breakdown.precision || 0),
            teamExact: Number(breakdown.team || 0),
            assist: Number(breakdown.assist || 0)
        };
    }

    buildLevelSummary(options) {
        const mvp = options.mvp || this.getLevelMVP();
        const previousTotalScores = options.previousTotalScores || {};
        const teamLevelScore = this.getTeamLevelScore();

        return {
            result: options.result,
            reason: options.reason || null,
            level: this.room.level,
            blockedLevel: options.blockedLevel || null,
            checkpointScoreRequirement:
                Number(options.checkpointScoreRequirement || 0),
            checkpointMinContributionShare:
                Number(options.checkpointMinContributionShare || 0),
            checkpointScoreStatus: options.checkpointScoreStatus || null,
            checkpointScoreFailures: options.checkpointScoreFailures || [],
            teamLevelScore: teamLevelScore,
            mvpId: mvp?.id || null,
            mvpScore: Number(mvp?.levelScore || 0),
            exactFinish: Boolean(options.exactFinish),
            overbuildHeight: Number(options.overbuildHeight || 0),
            finisherId: options.finisher?.id || null,
            finishingBlock: options.finishingBlock || null,
            carriedBlockCount: Number(options.carriedBlockCount || 0),
            players: this.room.players.map(player => {
                const previousTotalScore =
                    Number(previousTotalScores[player.id] || 0);

                return {
                    id: player.id,
                    isBot: Boolean(player.isBot),
                    levelScore: Number(player.levelScore || 0),
                    previousTotalScore: previousTotalScore,
                    finalTotalScore: Number(player.score || 0),
                    contributedHeight: Number(player.contributedHeight || 0),
                    isMvp: player.id === mvp?.id,
                    bonusBreakdown: this.getPlayerBonusBreakdown(player)
                };
            })
        };
    }

    completeLevel(finisher, finishingBlock) {
        this.room.state = "finished";
        clearTimeout(this.levelTimer);
        clearInterval(this.tickTimer);

        const exactFinish =
            this.room.currentHeight === this.room.targetHeight;
        const overbuildHeight =
            Math.max(0, this.room.currentHeight - this.room.targetHeight);
        const previousTotalScores = this.getPlayerScoreMap();

        if (exactFinish) {
            this.queueScoreEvent("exact_finish", {
                label: "Perfect Fit",
                displayOnly: true,
                meta: {
                    currentHeight: this.room.currentHeight,
                    targetHeight: this.room.targetHeight
                }
            });
        } else {
            this.queueScoreEvent("overbuild_finish", {
                points: overbuildHeight,
                label: "Target Reached",
                displayOnly: true,
                meta: {
                    currentHeight: this.room.currentHeight,
                    targetHeight: this.room.targetHeight,
                    overbuildHeight: overbuildHeight
                }
            });
        }

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

        this.queueScoreEvent("mvp", {
            playerId: mvp.id,
            points: mvp.levelScore,
            label: "MVP",
            displayOnly: true
        });

        this.room.lastLevelSummary = this.buildLevelSummary({
            result: "completed",
            exactFinish: exactFinish,
            overbuildHeight: overbuildHeight,
            finisher: finisher,
            finishingBlock: finishingBlock,
            carriedBlockCount: carriedBlockCount,
            mvp: mvp,
            previousTotalScores: previousTotalScores
        });

        this.showScoreboard();
        this.showLevelMVP();
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.nextLevel();
        }, this.getPostLevelTransitionDelayMs());
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
        const previousTotalScores = this.getPlayerScoreMap();

        this.queueScoreEvent("mvp", {
            playerId: mvp.id,
            points: mvp.levelScore,
            label: "MVP",
            displayOnly: true
        });

        this.room.lastLevelSummary = this.buildLevelSummary({
            result: "failed",
            reason: reason,
            exactFinish: false,
            overbuildHeight: 0,
            finisher: null,
            finishingBlock: null,
            carriedBlockCount: 0,
            mvp: mvp,
            previousTotalScores: previousTotalScores
        });

        this.showScoreboard();
        this.showLevelMVP();

        console.log(`Level FAILED: ${reason}`);
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.rollbackToCheckpoint();
        }, this.getPostLevelTransitionDelayMs());
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

        const nextLevel = this.room.level + 1;
        const opensCheckpoint = this.isCheckpointLevel(nextLevel);

        if (
            opensCheckpoint &&
            !this.hasMetCheckpointScoreRequirement(nextLevel)
        ) {
            this.failCheckpointScoreRequirement(nextLevel);
            return;
        }

        this.room.level = nextLevel;

        if (opensCheckpoint) {
            this.awardCheckpointPolitics();
            this.room.checkpointLevel = this.room.level;
            this.saveCheckpointScores();
        }

        console.log(`\n=== LEVEL ${this.room.level} QUEUED ===`);
        this.startLevel();
    }

    awardCheckpointPolitics() {
        const winner = this.room.players.reduce((best, player) => {
            return !best || Number(player.score || 0) > Number(best.score || 0)
                ? player
                : best;
        }, null);
        if (!winner || (winner.politicsInventory || []).length >= GameConfig.politicsMaxSlots) {
            return;
        }
        const ids = Object.keys(GameConfig.politicsCatalog || {});
        if (ids.length === 0) return;
        const politicsId = ids[Math.floor(Math.random() * ids.length)];
        winner.politicsInventory = winner.politicsInventory || [];
        winner.politicsInventory.push({ id: politicsId, earnedLevel: this.room.level, source: "checkpoint_mvp" });
        this.room.pendingPoliticsEvents = this.room.pendingPoliticsEvents || [];
        this.room.pendingPoliticsEvents.push({
            id: `${this.room.level}:checkpoint-politics:${winner.id}`,
            type: "politics_checkpoint_reward",
            playerId: winner.id,
            politicsId: politicsId,
            label: "Checkpoint Politics"
        });
    }

    isCheckpointLevel(level) {
        const interval = Math.max(1, Number(GameConfig.checkpointInterval) || 1);

        return (level - 1) % interval === 0;
    }

    getCheckpointScoreRequirement() {
        return Math.max(0, Number(GameConfig.checkpointScoreRequirement) || 0);
    }

    getCheckpointMinContributionShare() {
        return Math.max(
            0,
            Math.min(
                1,
                Number(GameConfig.checkpointMinContributionShare) || 0
            )
        );
    }

    getExpectedPlacementScoreForLevel(level) {
        const scorePerHeight =
            Number(GameConfig.scoring?.placementScorePerHeight) || 1;

        return this.getTargetHeightForLevel(level) * level * scorePerHeight;
    }

    getExpectedPlacementScoreForCheckpointBand(blockedLevel) {
        const checkpointLevel = this.clampLevel(
            this.room?.checkpointLevel || this.room?.level || 1
        );
        const targetLevel = this.clampLevel(
            blockedLevel || this.getNextCheckpointLevel()
        );
        let expectedScore = 0;

        for (let level = checkpointLevel; level < targetLevel; level++) {
            expectedScore += this.getExpectedPlacementScoreForLevel(level);
        }

        return expectedScore;
    }

    getCheckpointBandScoreRequirement(blockedLevel) {
        const share = this.getCheckpointMinContributionShare();
        const bandRequirement = Math.round(
            this.getExpectedPlacementScoreForCheckpointBand(blockedLevel) *
                share
        );

        return Math.max(
            this.getCheckpointScoreRequirement(),
            bandRequirement
        );
    }

    getCheckpointScoreFailures(blockedLevel) {
        return this.getCheckpointScoreStatus(blockedLevel).players
            .filter(player => !player.met);
    }

    getNextCheckpointLevel() {
        const interval = Math.max(1, Number(GameConfig.checkpointInterval) || 1);
        const currentLevel = this.room?.level || 1;
        const offset = (currentLevel - 1) % interval;

        return Math.min(
            GameConfig.maxLevel,
            currentLevel + interval - offset
        );
    }

    getCheckpointScoreStatus(blockedLevel = null) {
        const nextCheckpointLevel =
            blockedLevel || this.getNextCheckpointLevel();
        const requirement =
            this.getCheckpointBandScoreRequirement(nextCheckpointLevel);
        const checkpointScores = this.room?.checkpointScores || {};

        return {
            requiredScore: requirement,
            requiredBandScore: requirement,
            minContributionShare: this.getCheckpointMinContributionShare(),
            checkpointLevel: this.room?.checkpointLevel || 1,
            nextCheckpointLevel: nextCheckpointLevel,
            players: (this.room?.players || []).map(player => {
                const score = Number(player.score || 0);
                const checkpointScore =
                    Number(checkpointScores[player.id] || 0);
                const requiredScore = checkpointScore + requirement;
                const bandScore = Math.max(0, score - checkpointScore);

                return {
                    id: player.id,
                    score: score,
                    checkpointScore: checkpointScore,
                    bandScore: bandScore,
                    requiredScore: requiredScore,
                    requiredBandScore: requirement,
                    remainingScore: Math.max(0, requiredScore - score),
                    met: requirement <= 0 || score >= requiredScore
                };
            })
        };
    }

    hasMetCheckpointScoreRequirement(blockedLevel) {
        return this.getCheckpointScoreFailures(blockedLevel).length === 0;
    }

    failCheckpointScoreRequirement(blockedLevel) {
        this.room.state = "failed";
        this.clearTimers();

        const mvp = this.getLevelMVP();
        const previousTotalScores = this.getPlayerScoreMap();
        const checkpointScoreStatus =
            this.getCheckpointScoreStatus(blockedLevel);
        const failures = checkpointScoreStatus.players.filter(player => {
            return !player.met;
        });
        const requirement = checkpointScoreStatus.requiredBandScore;

        this.queueScoreEvent("checkpoint_failed", {
            label: "Checkpoint Failed",
            displayOnly: true,
            meta: {
                blockedLevel: blockedLevel,
                checkpointScoreRequirement: requirement,
                checkpointMinContributionShare:
                    this.getCheckpointMinContributionShare(),
                checkpointScoreFailures: failures
            }
        });
        this.queueScoreEvent("mvp", {
            playerId: mvp.id,
            points: mvp.levelScore,
            label: "MVP",
            displayOnly: true
        });

        this.room.lastLevelSummary = this.buildLevelSummary({
            result: "failed",
            reason: "checkpoint_score_requirement",
            blockedLevel: blockedLevel,
            exactFinish: false,
            overbuildHeight: 0,
            finisher: null,
            finishingBlock: null,
            carriedBlockCount: 0,
            mvp: mvp,
            previousTotalScores: previousTotalScores,
            checkpointScoreRequirement: requirement,
            checkpointMinContributionShare:
                this.getCheckpointMinContributionShare(),
            checkpointScoreStatus: checkpointScoreStatus,
            checkpointScoreFailures: failures
        });

        console.log(
            `Checkpoint score requirement failed before level ${blockedLevel}`
        );
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.rollbackToCheckpoint();
        }, this.getPostLevelTransitionDelayMs());
    }

    rollbackToCheckpoint() {
        this.room.level = this.room.checkpointLevel;
        this.room.drawPile = [];
        this.room.teamCarryOverBlocks = [];
        this.restoreCheckpointScores();

        this.room.players.forEach(player => {
            player.blocks = [];
            player.levelScore = 0;
            player.scoreBreakdown = {};
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

    recordScoreBreakdown(player, key, points) {
        player.scoreBreakdown = player.scoreBreakdown || {};
        player.scoreBreakdown[key] =
            Number(player.scoreBreakdown[key] || 0) + Number(points || 0);
    }

    addPlacementScore(player, block, effectiveHeight) {
        const scorePerHeight =
            Number(GameConfig.scoring.placementScorePerHeight) || 1;
        const points = Math.round(
            effectiveHeight *
                this.room.level *
                scorePerHeight
        );

        //player.score += points; //Only add to levelScore during gameplay
        player.levelScore += points;
        this.recordScoreBreakdown(player, "placement", points);
        this.queueScoreEvent("placement", {
            playerId: player.id,
            points: points,
            label: "Placement",
            meta: {
                effectiveHeight: effectiveHeight,
                blockHeight: this.getBlockHeight(block),
                block: block
            }
        });

        console.log(`${player.id} gained ${points} score`);
        return points;
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
        const safePoints = Math.round(Number(points) || 0);

        if (safePoints <= 0) {
            return 0;
        }

        //player.score += points; // Only add to levelScore during gameplay
        player.levelScore += safePoints;
        this.recordScoreBreakdown(player, label, safePoints);
        this.queueScoreEvent(this.getBonusScoreEventType(label), {
            playerId: player.id,
            points: safePoints,
            label: this.getBonusScoreEventLabel(label)
        });

        console.log(`${player.id} gained ${safePoints} ${label} bonus`);
        return safePoints;
    }

    getBonusScoreEventType(label) {
        const eventTypes = {
            finisher: "finisher_bonus",
            precision: "precision_bonus",
            team: "team_exact_bonus",
            assist: "assist_bonus"
        };

        return eventTypes[label] || "bonus";
    }

    getBonusScoreEventLabel(label) {
        const labels = {
            finisher: "Finisher",
            precision: "Precision",
            team: "Team Exact",
            assist: "Assist"
        };

        return labels[label] || "Bonus";
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
