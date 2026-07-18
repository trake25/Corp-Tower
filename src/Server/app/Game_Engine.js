const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");
const TowerStability = require("./Tower_Stability");
const BlockSupply = require("./engine/Block_Supply");
const Scoring = require("./engine/Scoring");
const Checkpoints = require("./engine/Checkpoints");

// Authoritative gameplay for one room. This class owns the room/level
// lifecycle, timers, and action validation; the heavier rule areas live in
// engine/ modules (Block_Supply, Scoring, Checkpoints) and are exposed here
// as delegating methods so callers and internal code use one interface.
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

    createRoom(players) {
        const startLevel = this.getConfiguredStartLevel();

        this.room = {
            id: null,
            players: players,
            level: startLevel,
            checkpointLevel: startLevel,
            checkpointScores: {},
            checkpointPolitics: {},
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
        this.saveCheckpointState();

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
            checkpointPolitics: snapshot.state.checkpointPolitics || {},
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
        this.ensureCheckpointState();
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
            console.error("Room persistence failed:", error.message);
        });
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
                player.politicsInventory = [];
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

        this.saveCheckpointState();
        this.startLevel();
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

        player.blocks = this.generateRefreshBlocks(player.blocks || []);

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

    checkWinCondition(finisher, finishingBlock) {
        if (this.room.currentHeight < this.room.targetHeight) {
            return;
        }

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

        console.log(`Level FAILED: ${reason}`);
        this.persistRoom();
        this.broadcastGameState();

        this.nextLevelTimer = setTimeout(() => {
            this.rollbackToCheckpoint();
        }, this.getPostLevelTransitionDelayMs());
    }

    nextLevel() {
        if (this.room.level >= GameConfig.maxLevel) {
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
            this.saveCheckpointState();
        }

        this.startLevel();
    }

    // --- Block supply: engine/Block_Supply.js ---

    getNextDrawBlock() { return BlockSupply.getNextDrawBlock(this); }
    createBlockId() { return BlockSupply.createBlockId(this); }
    cloneCells(cells) { return BlockSupply.cloneCells(this, cells); }
    getBlockHeight(block) { return BlockSupply.getBlockHeight(this, block); }
    getBlockCellCount(block) { return BlockSupply.getBlockCellCount(this, block); }
    createBlock(blockSize, excludedShapeId = null) { return BlockSupply.createBlock(this, blockSize, excludedShapeId); }
    getRandomBlock() { return BlockSupply.getRandomBlock(this); }
    getBlocksPerPlayer() { return BlockSupply.getBlocksPerPlayer(this); }
    buildDrawPile() { return BlockSupply.buildDrawPile(this); }
    getGeneratedDrawPileBlockCount() { return BlockSupply.getGeneratedDrawPileBlockCount(this); }
    generateDrawPileBlocks(blockCount) { return BlockSupply.generateDrawPileBlocks(this, blockCount); }
    generateSolvableOpeningHandBlocks() { return BlockSupply.generateSolvableOpeningHandBlocks(this); }
    isLevelBlockSupplyValid(blocks, minimumOpeningBlocks) { return BlockSupply.isLevelBlockSupplyValid(this, blocks, minimumOpeningBlocks); }
    getTotalBlockHeight(blocks) { return BlockSupply.getTotalBlockHeight(this, blocks); }
    countPrecisionBlocks(blocks) { return BlockSupply.countPrecisionBlocks(this, blocks); }
    hasExactHeightCombination(blocks, targetHeight) { return BlockSupply.hasExactHeightCombination(this, blocks, targetHeight); }
    shuffleBlocks(blocks) { return BlockSupply.shuffleBlocks(this, blocks); }
    dealOpeningHands() { return BlockSupply.dealOpeningHands(this); }
    drawBlockFromPile() { return BlockSupply.drawBlockFromPile(this); }
    refillPlayerBlock(player) { return BlockSupply.refillPlayerBlock(this, player); }
    trimInventory(blocks) { return BlockSupply.trimInventory(this, blocks); }
    generateRefreshBlocks(currentBlocks) { return BlockSupply.generateRefreshBlocks(this, currentBlocks); }
    createRefreshBlock(currentBlock) { return BlockSupply.createRefreshBlock(this, currentBlock); }
    createRandomUnlockedBlock(minBlockSize = 1) { return BlockSupply.createRandomUnlockedBlock(this, minBlockSize); }
    getWeightedUnlockedBlockSize(minBlockSize = 1) { return BlockSupply.getWeightedUnlockedBlockSize(this, minBlockSize); }
    isBlockSizeUnlocked(blockSize) { return BlockSupply.isBlockSizeUnlocked(this, blockSize); }
    isRefreshBlockSetUseful(blocks) { return BlockSupply.isRefreshBlockSetUseful(this, blocks); }
    scoreRefreshBlockSet(blocks) { return BlockSupply.scoreRefreshBlockSet(this, blocks); }
    prepareTeamCarryOverBlocks() { return BlockSupply.prepareTeamCarryOverBlocks(this); }

    // --- Scoring: engine/Scoring.js ---

    createScoreEvent(type, options = {}) { return Scoring.createScoreEvent(this, type, options); }
    queueScoreEvent(type, options = {}) { return Scoring.queueScoreEvent(this, type, options); }
    consumeScoreEvents() { return Scoring.consumeScoreEvents(this); }
    getPlayerScoreMap() { return Scoring.getPlayerScoreMap(this); }
    getTeamLevelScore() { return Scoring.getTeamLevelScore(this); }
    getPlayerBonusBreakdown(player) { return Scoring.getPlayerBonusBreakdown(this, player); }
    buildLevelSummary(options) { return Scoring.buildLevelSummary(this, options); }
    recordScoreBreakdown(player, key, points) { return Scoring.recordScoreBreakdown(this, player, key, points); }
    addPlacementScore(player, block, effectiveHeight) { return Scoring.addPlacementScore(this, player, block, effectiveHeight); }
    awardCompletionBonuses(finisher, exactFinish) { return Scoring.awardCompletionBonuses(this, finisher, exactFinish); }
    addBonusScore(player, points, label) { return Scoring.addBonusScore(this, player, points, label); }
    getBonusScoreEventType(label) { return Scoring.getBonusScoreEventType(this, label); }
    getBonusScoreEventLabel(label) { return Scoring.getBonusScoreEventLabel(this, label); }
    addLevelScoreToLeaderboard() { return Scoring.addLevelScoreToLeaderboard(this); }
    awardRefreshToken(player) { return Scoring.awardRefreshToken(this, player); }
    getLevelMVP() { return Scoring.getLevelMVP(this); }

    // --- Checkpoints: engine/Checkpoints.js ---

    clonePoliticsInventory(items = []) { return Checkpoints.clonePoliticsInventory(this, items); }
    saveCheckpointScores() { return Checkpoints.saveCheckpointScores(this); }
    saveCheckpointPolitics() { return Checkpoints.saveCheckpointPolitics(this); }
    saveCheckpointState() { return Checkpoints.saveCheckpointState(this); }
    ensureCheckpointScores() { return Checkpoints.ensureCheckpointScores(this); }
    ensureCheckpointPolitics() { return Checkpoints.ensureCheckpointPolitics(this); }
    ensureCheckpointState() { return Checkpoints.ensureCheckpointState(this); }
    restoreCheckpointScores() { return Checkpoints.restoreCheckpointScores(this); }
    restoreCheckpointPolitics() { return Checkpoints.restoreCheckpointPolitics(this); }
    awardCheckpointPolitics() { return Checkpoints.awardCheckpointPolitics(this); }
    isCheckpointLevel(level) { return Checkpoints.isCheckpointLevel(this, level); }
    getCheckpointScoreRequirement() { return Checkpoints.getCheckpointScoreRequirement(this); }
    getCheckpointMinContributionShare() { return Checkpoints.getCheckpointMinContributionShare(this); }
    getExpectedPlacementScoreForLevel(level) { return Checkpoints.getExpectedPlacementScoreForLevel(this, level); }
    getExpectedPlacementScoreForCheckpointBand(blockedLevel) { return Checkpoints.getExpectedPlacementScoreForCheckpointBand(this, blockedLevel); }
    getCheckpointBandScoreRequirement(blockedLevel) { return Checkpoints.getCheckpointBandScoreRequirement(this, blockedLevel); }
    getCheckpointScoreFailures(blockedLevel) { return Checkpoints.getCheckpointScoreFailures(this, blockedLevel); }
    getNextCheckpointLevel() { return Checkpoints.getNextCheckpointLevel(this); }
    getCheckpointScoreStatus(blockedLevel = null) { return Checkpoints.getCheckpointScoreStatus(this, blockedLevel); }
    hasMetCheckpointScoreRequirement(blockedLevel) { return Checkpoints.hasMetCheckpointScoreRequirement(this, blockedLevel); }
    failCheckpointScoreRequirement(blockedLevel) { return Checkpoints.failCheckpointScoreRequirement(this, blockedLevel); }
    rollbackToCheckpoint() { return Checkpoints.rollbackToCheckpoint(this); }
}

module.exports = GameEngine;
