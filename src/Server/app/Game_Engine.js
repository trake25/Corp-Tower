const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");
const TowerStability = require("./Tower_Stability");
const BlockSupply = require("./engine/Block_Supply");
const Scoring = require("./engine/Scoring");
const Impacts = require("./engine/Impacts");

class GameEngine {
    constructor(options = {}) {
        this.room = null;
        this.startTimer = null;
        this.levelTimer = null;
        this.nextLevelTimer = null;
        this.tickTimer = null;
        this.onRoomChanged = options.onRoomChanged || null;
        this.onRoomMessage = options.onRoomMessage || null;
        this.onLevelOutcome = options.onLevelOutcome || null;
    }

    getRemainingMs() {
        if (!this.room) {
            return 0;
        }

        if (this.room.state === "starting") {
            return Math.max(0, (this.room.startsAt || 0) - Date.now());
        }

        if (this.room.state === "finished" || this.room.state === "failed") {
            return Math.max(0, (this.room.freezeEndsAt || 0) - Date.now());
        }

        if (!this.room.endsAt) {
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
        const placeableColumns = this.getPlaceableColumnRange();
        const gameState = {
            type: "game_state",
            state: this.room.state,
            level: this.room.level,
            impactLevel: this.room.impactLevel,
            impactInterval: Math.max(1, Number(GameConfig.impactInterval) || 1),
            currentHeight: this.room.currentHeight,
            targetHeight: this.room.targetHeight,
            impactScoreStatus: this.getImpactScoreStatus(),
            activeInventorySlots: this.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            drawPileCount: (this.room.drawPile || []).length,
            nextDrawBlock: this.getNextDrawBlock(),
            towerBlocks: this.room.towerBlocks || [],
            towerGridWidth: Math.max(1, Number(GameConfig.towerGridWidth) || 1),
            placeableColumnMin: placeableColumns.min,
            placeableColumnMax: placeableColumns.max,
            accessibility: { ...(GameConfig.accessibility || {}) },
            visualHooks: { ...(GameConfig.visualHooks || {}) },
            towerStability: this.room.towerStability ?? 100,
            towerStabilityDiagnostics: this.room.towerStabilityDiagnostics || {},
            sideQuest: this.room.sideQuest || null,
            powerEvents: this.consumePowerEvents(),
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
            players: this.room.players.map(player => ({
                id: player.id,
                isBot: Boolean(player.isBot),
                score: player.score,
                levelScore: player.levelScore,
                contributedHeight: player.contributedHeight,
                blocks: player.blocks,
                powerInventory: player.powerInventory || []
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
            impactLevel: startLevel,
            impactScores: {},
            impactPowers: {},
            targetHeight: this.getTargetHeightForLevel(startLevel),
            currentHeight: 0,
            drawPile: [],
            drawPileStartCount: 0,
            teamCarryOverBlocks: [],
            towerBlocks: [],
            towerStability: 100,
            towerStabilityDiagnostics: {},
            state: "waiting",
            startsAt: 0,
            endsAt: 0,
            freezeEndsAt: 0,
            lastLevelSummary: null,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPowerEvents: [],
            sideQuest: null,
            scoreEventSeq: 0
        };

        this.room.players.forEach(player => {
            player.score = player.score || 0;
            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.lastQuickChatTime = 0;
            player.powerInventory = [];
            player.lastPowerActivationTime = 0;
            player.lastQuickChatTime = 0;
        });
        this.saveImpactState();

        console.log("Room created:", this.room.id);
    }

    hydrateRoom(snapshot, runtimePlayers) {
        this.clearTimers();

        this.room = {
            id: snapshot.id,
            players: runtimePlayers,
            level: snapshot.state.level,
            impactLevel: snapshot.state.impactLevel,
            impactScores: snapshot.state.impactScores || {},
            impactPowers: snapshot.state.impactPowers || {},
            targetHeight: snapshot.state.targetHeight,
            currentHeight: snapshot.state.currentHeight,
            drawPile: snapshot.state.drawPile || [],
            drawPileStartCount: snapshot.state.drawPileStartCount || 0,
            levelDurationMs: snapshot.state.levelDurationMs || 0,
            teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
            towerBlocks: snapshot.state.towerBlocks || [],
            towerStability: snapshot.state.towerStability ?? 100,
            towerStabilityDiagnostics: snapshot.state.towerStabilityDiagnostics || {},
            state: snapshot.state.state,
            startsAt: snapshot.state.startsAt,
            endsAt: snapshot.state.endsAt,
            freezeEndsAt: snapshot.state.freezeEndsAt || 0,
            lastLevelSummary: snapshot.state.lastLevelSummary,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPowerEvents: [],
            sideQuest: snapshot.state.sideQuest || null,
            scoreEventSeq: 0
        };
        const hiddenCount = Math.max(0, Number(snapshot.state.drawPileHiddenCount) || 0);

        if (hiddenCount > 0) {
            this.room.drawPile.push(...this.generateDrawPileBlocks(hiddenCount));
        }

        this.ensureImpactState();
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
                this.rollbackToImpact();
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

    recordLevelOutcome(outcome) {
        if (!this.onLevelOutcome || !this.room) {
            return;
        }

        if (this.room.players.some(player => player.isBot)) {
            return;
        }

        this.onLevelOutcome(outcome).catch(error => {
            console.error("Level outcome recording failed:", error.message);
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

    consumePowerEvents() {
        const events = this.room?.pendingPowerEvents || [];
        if (this.room) this.room.pendingPowerEvents = [];
        return events;
    }

    clonePowerInventory(items = []) {
        return items.map(item => ({ ...item }));
    }

    setupSideQuest() {
        if (this.room.level < GameConfig.powerUnlockLevel) { this.room.sideQuest = null; return; }
        const quest = { id: "exact_finish", type: "exact_finish", label: "First to finish exactly" };
        this.room.sideQuest = { ...quest, claimedBy: null, rewardId: "replenish" };
    }

    grantDefaultPowers() {
        if (!GameConfig.powerGuaranteedBaseline) return;
        if (this.room.level < GameConfig.powerUnlockLevel) return;
        this.room.players.forEach(player => {
            const hasReplenish = (player.powerInventory || []).some(item => item.id === "replenish");
            if (!hasReplenish && player.powerInventory.length < GameConfig.powerMaxSlots) {
                player.powerInventory.push({ id: "replenish", earnedLevel: this.room.level });
            }
        });
    }

    tryCompleteSideQuest(player, block, exactFinish) {
        const quest = this.room.sideQuest;
        if (!quest || quest.claimedBy) return;
        const complete = (quest.type === "place_size" && this.getBlockCellCount(block) === quest.size) || (quest.type === "exact_finish" && exactFinish);
        if (!complete || player.powerInventory.length >= GameConfig.powerMaxSlots) return;
        quest.claimedBy = player.id;
        player.powerInventory.push({ id: quest.rewardId, earnedLevel: this.room.level });
        this.room.pendingPowerEvents.push({ id: `${this.room.level}:quest:${player.id}`, type: "power_earned", playerId: player.id, powerId: quest.rewardId, label: "Power earned" });
    }

    activatePower(playerId, slot) {
        if (!this.room || this.room.state !== "playing") return false;
        if (this.getRemainingMs() <= 3000) return false;
        const player = this.room.players.find(p => p.id === playerId);
        if (!player || !Number.isInteger(Number(slot))) return false;
        if (Date.now() - Number(player.lastPowerActivationTime || 0) < GameConfig.powerActivationCooldownMs) return false;
        const item = player.powerInventory[Number(slot)];
        if (!item) return false;
        player.powerInventory.splice(Number(slot), 1);
        player.lastPowerActivationTime = Date.now();
        const impactStatusPlayers = this.getImpactScoreStatus().players;
        this.room.players.forEach(target => {
            if (item.id === "copy_score") {
                target.score = player.score;
                this.room.impactScores[target.id] = player.score;
            }
            if (item.id === "refresh") {
                target.blocks = this.generateRefreshBlocks(target.blocks || []);
            }
            if (item.id === "score_cap") {
                target.score = impactStatusPlayers.find(p => p.id === target.id)?.requiredScore || target.score;
                target.scoreCap = null;
                target.scoreCapCasterId = null;
            }
        });
        let blocksAdded = 0;
        if (item.id === "replenish") {
            blocksAdded = this.generateReplenishBlocks();
            this.room.players.forEach(target => this.refillPlayerBlock(target));
        }
        this.room.pendingPowerEvents.push({ id: `${this.room.level}:power:${Date.now()}`, type: "power_activated", playerId, powerId: item.id, label: GameConfig.powerCatalog[item.id].title, meta: { blocksAdded } });
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
        this.room.levelDurationMs = this.getLevelTimeLimitMs();
        this.room.endsAt = this.room.startsAt + this.room.levelDurationMs;
        this.room.lastLevelSummary = null;
        this.room.pendingScoreEvents = this.room.pendingScoreEvents || [];
        this.setupSideQuest();
        this.grantDefaultPowers();

        this.room.players.forEach(player => {
            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
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
        }, this.room.levelDurationMs || this.getLevelTimeLimitMs());

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

    buildTargetHeightCurve() {
        const base = Math.max(1, Number(GameConfig.targetHeightBase) || 1);
        const stepBase = Math.max(0, Number(GameConfig.targetHeightStepBase) || 0);
        const stepGrowth = Math.max(0, Number(GameConfig.targetHeightStepGrowth) || 0);
        const stepEvery = Math.max(1, Number(GameConfig.targetHeightStepGrowthEvery) || 1);
        const scale = (Number(GameConfig.targetHeightMultiplier) || 3) / 3;
        const maxLevel = Math.max(1, Number(GameConfig.maxLevel) || 1);
        const cacheKey = [
            base, stepBase, stepGrowth, stepEvery, scale, maxLevel
        ].join(":");

        if (this.targetHeightCurveCache?.key === cacheKey) {
            return this.targetHeightCurveCache.curve;
        }

        const curve = [0, Math.max(1, Math.round(base * scale))];
        let unscaled = base;

        for (let level = 2; level <= maxLevel; level++) {
            const step = stepBase + stepGrowth * Math.floor((level - 2) / stepEvery);

            unscaled += step;
            curve[level] = Math.max(1, Math.round(unscaled * scale));
        }

        this.targetHeightCurveCache = { key: cacheKey, curve: curve };

        return curve;
    }

    getTargetHeightForLevel(level) {
        const curve = this.buildTargetHeightCurve();
        const target = curve[this.clampLevel(level)];

        if (!Number.isFinite(target)) {
            return Math.max(1, level * GameConfig.targetHeightMultiplier);
        }

        return target;
    }

    getLevelTimeLimitMs(targetHeight, level) {
        const floor = Math.max(1000, Number(GameConfig.levelTimeLimitMs) || 1000);
        const height = Math.max(0, Number(
            targetHeight ?? this.room?.targetHeight
        ) || 0);

        if (height <= 0) {
            return floor;
        }

        const efficiency = Math.max(
            0.05,
            Math.min(1, Number(GameConfig.levelTimePlannedEfficiency) || 0.05)
        );
        const slackStart = Math.max(0.1, Number(GameConfig.levelTimeSlack) || 1);
        const slackEnd = Math.max(
            0.1, Math.min(slackStart, Number(GameConfig.levelTimeSlackMin) || slackStart)
        );
        const slackFullLevel = Math.max(
            1, Number(GameConfig.levelTimeSlackFullLevel) || 1
        );
        const resolvedLevel = Math.max(1, Number(level ?? this.room?.level) || 1);
        const slackRamp = Math.min(1, (resolvedLevel - 1) / Math.max(1, slackFullLevel - 1));
        const slack = slackStart + (slackEnd - slackStart) * slackRamp;
        const cooldown = Math.max(1, Number(GameConfig.placementCooldown) || 1);
        const players = Math.max(1, this.room?.players?.length || 1);
        const heightPerPlacement = Math.max(
            0.1,
            this.getAverageBrickHeight() * efficiency
        );
        const placementsNeeded = Math.ceil(height / heightPerPlacement);
        const derived = Math.ceil(placementsNeeded / players) * cooldown * slack;

        return Math.max(floor, Math.round(derived));
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
        this.room.impactLevel = targetLevel;
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
                player.powerInventory = [];
            }

            player.levelScore = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.botLoopLevel = null;
        });

        this.saveImpactState();
        this.startLevel();
    }

    getSupplyPackingEfficiency() {
        const cellsPerBrick = Math.max(1, this.getAverageBrickCellCount());
        const brickHeight = Math.max(0.1, this.getAverageBrickHeight());
        const siteWidth = this.getSupplySiteWidthEstimate(this.room?.targetHeight);
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

    getSupplySiteWidthEstimate(targetHeight) {
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

    getSiteWidthForHeight(targetHeight) {
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

    getPlaceableColumnRange() {
        const targetHeight = this.room?.targetHeight;

        if (!Number.isFinite(Number(targetHeight))) {
            return {
                min: GameConfig.placeableColumnMin,
                max: GameConfig.placeableColumnMax
            };
        }

        const gridWidth = Math.max(1, Number(GameConfig.towerGridWidth) || 1);
        const width = this.getSiteWidthForHeight(targetHeight);
        const min = Math.max(0, Math.round((gridWidth - width) / 2));

        return { min, max: Math.min(gridWidth - 1, min + width - 1) };
    }

    getPlaceableOriginRange(block) {
        const cellXs = (block?.cells || []).map(cell => Number(cell[0]));
        const width = cellXs.length
            ? Math.max(...cellXs) - Math.min(...cellXs) + 1
            : 1;
        const site = this.getPlaceableColumnRange();
        const min = site.min;
        const max = site.max - width + 1;

        return { min, max: Math.max(min, max) };
    }

    resolveColumnOriginX(block, column) {
        const { min, max } = this.getPlaceableOriginRange(block);
        const numeric = Number(column);
        const requested =
            column === null || column === undefined || !Number.isFinite(numeric)
                ? min
                : numeric;

        return Math.max(min, Math.min(max, Math.round(requested)));
    }

    resolvePlacementOrigin(block, column, originY) {
        const originX = this.resolveColumnOriginX(block, column);
        const entries = this.room.towerBlocks || [];
        const requested =
            originY === null || originY === undefined ? NaN : Number(originY);

        if (Number.isInteger(requested) && requested >= 0) {
            if (TowerStability.isPlacementLegal(entries, block, originX, requested)) {
                return TowerStability.settleBlock(entries, block, originX, requested);
            }
        }

        return TowerStability.settleBlock(entries, block, originX);
    }

    placeBlock(playerId, blockIndex, column = null, originY = null) {
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
        const stabilityBefore = this.room.towerStability ?? 100;
        const structureBefore = this.room.towerStabilityDiagnostics || {};
        const placement = this.resolvePlacementOrigin(block, column, originY);
        const supportedCells = TowerStability.supportedCellsGained(
            this.room.towerBlocks || [], block, placement.originX, placement.originY
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
        const placedEntry = {
            playerId: player.id,
            block: block,
            height: blockHeight,
            effectiveHeight: effectiveHeight,
            baseHeight: placement.originY,
            originX: placement.originX,
            originY: placement.originY
        };
        this.room.towerBlocks.push(placedEntry);
        this.refillPlayerBlock(player);

        this.addPlacementScore(player, block, effectiveHeight, stabilityBefore, previousHeight);

        this.tryCompleteSideQuest(player, block, this.room.currentHeight === this.room.targetHeight);

        console.log(`${player.id} placed block (${blockHeight})`);

        this.recalculateTowerStability();

        placedEntry.balanceDelta = TowerStability.balanceDelta(
            structureBefore,
            this.room.towerStabilityDiagnostics || {},
            this.resolveStabilityConfig()
        );

        this.addReinforceScore(
            player, structureBefore, this.room.towerStabilityDiagnostics || {}, supportedCells
        );

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

    getStabilityPressure(level) {
        const difficulty = Math.max(
            0,
            Math.min(100, Number(GameConfig.towerStabilityDifficulty) || 0)
        );
        const curve = GameConfig.towerStabilityPressure || {};
        const floor = Math.max(0, Math.min(1, Number(curve.floor) || 0));
        const fullLevel = Math.max(1, Number(curve.fullPressureLevel) || 1);
        const resolvedLevel = Math.max(
            1,
            Number(level ?? this.room?.level) || 1
        );
        const levelRamp = Math.min(1, resolvedLevel / fullLevel);

        return (difficulty / 100) * (floor + (1 - floor) * levelRamp);
    }

    resolveStabilityConfig(level) {
        const anchors = GameConfig.towerStabilityAnchors || {};
        const forgiving = anchors.forgiving || {};
        const harsh = anchors.harsh || {};
        const pressure = this.getStabilityPressure(level);
        const resolved = {
            towerMaxTiltAngleDeg: GameConfig.towerMaxTiltAngleDeg,
            towerBaseHalfWidthFloor: GameConfig.towerBaseHalfWidthFloor,
            towerSiteWidth: this.getSiteWidthForHeight(this.room?.targetHeight),
            towerTargetHeight: this.room?.targetHeight,
            towerStabilityPressureApplied: pressure
        };

        for (const key of Object.keys(forgiving)) {
            const from = Number(forgiving[key]);
            const to = Number(harsh[key] ?? forgiving[key]);
            resolved[key] = from + (to - from) * pressure;
        }

        return resolved;
    }

    recalculateTowerStability() {
        const result = TowerStability.evaluate(
            this.room.towerBlocks || [], this.resolveStabilityConfig()
        );
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
            !this.anyPlayerCanRescueSupply()
        ) {
            this.failLevel("not_enough_height_remaining");
        }
    }

    anyPlayerCanRescueSupply() {
        return this.room.players.some(player => {
            return (player.powerInventory || []).some(item => {
                return item && item.id === "replenish";
            });
        });
    }

    completeLevel(finisher, finishingBlock) {
        this.room.state = "finished";
        this.room.freezeEndsAt =
            Date.now() + this.getPostLevelTransitionDelayMs() + GameConfig.startDelayMs;
        clearTimeout(this.levelTimer);
        clearInterval(this.tickTimer);
        this.recordLevelOutcome("completed");

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
        this.room.freezeEndsAt =
            Date.now() + this.getPostLevelTransitionDelayMs() + GameConfig.startDelayMs;
        this.clearTimers();
        this.recordLevelOutcome("failed");

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
            this.rollbackToImpact();
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
        const opensImpact = this.isImpactLevel(nextLevel);

        if (
            opensImpact &&
            !this.hasMetImpactScoreRequirement(nextLevel)
        ) {
            this.failImpactScoreRequirement(nextLevel);
            return;
        }

        this.room.level = nextLevel;

        if (opensImpact) {
            this.awardImpactPower();
            this.room.impactLevel = this.room.level;
            this.saveImpactState();
        }

        this.startLevel();
    }

    getNextDrawBlock() { return BlockSupply.getNextDrawBlock(this); }
    createBlockId() { return BlockSupply.createBlockId(this); }
    cloneCells(cells) { return BlockSupply.cloneCells(this, cells); }
    getBlockHeight(block) { return BlockSupply.getBlockHeight(this, block); }
    getBlockCellCount(block) { return BlockSupply.getBlockCellCount(this, block); }
    pickWeightedShape(excludedShapeId = null) { return BlockSupply.pickWeightedShape(this, excludedShapeId); }
    createBlock(shapeId = null, excludedShapeId = null) { return BlockSupply.createBlock(this, shapeId, excludedShapeId); }
    getRandomBlock() { return BlockSupply.getRandomBlock(this); }
    getBlocksPerPlayer() { return BlockSupply.getBlocksPerPlayer(this); }
    buildDrawPile() { return BlockSupply.buildDrawPile(this); }
    getAverageBrickHeight() { return BlockSupply.getAverageBrickHeight(this); }
    getAverageBrickCellCount() { return BlockSupply.getAverageBrickCellCount(this); }
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
    getReplenishBlockCount() { return BlockSupply.getReplenishBlockCount(this); }
    generateReplenishBlocks() { return BlockSupply.generateReplenishBlocks(this); }
    generateRefreshBlocks(currentBlocks) { return BlockSupply.generateRefreshBlocks(this, currentBlocks); }
    createRefreshBlock(currentBlock) { return BlockSupply.createRefreshBlock(this, currentBlock); }
    isRefreshBlockSetUseful(blocks) { return BlockSupply.isRefreshBlockSetUseful(this, blocks); }
    scoreRefreshBlockSet(blocks) { return BlockSupply.scoreRefreshBlockSet(this, blocks); }
    prepareTeamCarryOverBlocks() { return BlockSupply.prepareTeamCarryOverBlocks(this); }

    createScoreEvent(type, options = {}) { return Scoring.createScoreEvent(this, type, options); }
    queueScoreEvent(type, options = {}) { return Scoring.queueScoreEvent(this, type, options); }
    consumeScoreEvents() { return Scoring.consumeScoreEvents(this); }
    getPlayerScoreMap() { return Scoring.getPlayerScoreMap(this); }
    getTeamLevelScore() { return Scoring.getTeamLevelScore(this); }
    getPlayerBonusBreakdown(player) { return Scoring.getPlayerBonusBreakdown(this, player); }
    buildLevelSummary(options) { return Scoring.buildLevelSummary(this, options); }
    recordScoreBreakdown(player, key, points) { return Scoring.recordScoreBreakdown(this, player, key, points); }
    addPlacementScore(player, block, effectiveHeight, stabilityBefore, heightBefore) { return Scoring.addPlacementScore(this, player, block, effectiveHeight, stabilityBefore, heightBefore); }
    addReinforceScore(player, before, after, supportedCells = 0) { return Scoring.addReinforceScore(this, player, before, after, supportedCells); }
    getPlacementStabilityMultiplier(stabilityBefore, heightBefore) { return Scoring.getPlacementStabilityMultiplier(this, stabilityBefore, heightBefore); }
    getReinforceScoreCap(heightAfter) { return Scoring.getReinforceScoreCap(this, heightAfter); }
    awardCompletionBonuses(finisher, exactFinish) { return Scoring.awardCompletionBonuses(this, finisher, exactFinish); }
    addBonusScore(player, points, label) { return Scoring.addBonusScore(this, player, points, label); }
    getBonusScoreEventType(label) { return Scoring.getBonusScoreEventType(this, label); }
    getBonusScoreEventLabel(label) { return Scoring.getBonusScoreEventLabel(this, label); }
    addLevelScoreToLeaderboard() { return Scoring.addLevelScoreToLeaderboard(this); }
    getLevelMVP() { return Scoring.getLevelMVP(this); }

    saveImpactScores() { return Impacts.saveImpactScores(this); }
    saveImpactPowers() { return Impacts.saveImpactPowers(this); }
    saveImpactState() { return Impacts.saveImpactState(this); }
    ensureImpactScores() { return Impacts.ensureImpactScores(this); }
    ensureImpactPowers() { return Impacts.ensureImpactPowers(this); }
    ensureImpactState() { return Impacts.ensureImpactState(this); }
    restoreImpactScores() { return Impacts.restoreImpactScores(this); }
    restoreImpactPowers() { return Impacts.restoreImpactPowers(this); }
    awardImpactPower() { return Impacts.awardImpactPower(this); }
    isImpactLevel(level) { return Impacts.isImpactLevel(this, level); }
    getImpactScoreRequirement() { return Impacts.getImpactScoreRequirement(this); }
    getImpactMinContributionShare() { return Impacts.getImpactMinContributionShare(this); }
    getExpectedPlacementScoreForLevel(level) { return Impacts.getExpectedPlacementScoreForLevel(this, level); }
    getExpectedPlacementScoreForImpactBand(blockedLevel) { return Impacts.getExpectedPlacementScoreForImpactBand(this, blockedLevel); }
    getImpactBandScoreRequirement(blockedLevel) { return Impacts.getImpactBandScoreRequirement(this, blockedLevel); }
    getImpactScoreFailures(blockedLevel) { return Impacts.getImpactScoreFailures(this, blockedLevel); }
    getNextImpactLevel() { return Impacts.getNextImpactLevel(this); }
    getImpactScoreStatus(blockedLevel = null) { return Impacts.getImpactScoreStatus(this, blockedLevel); }
    hasMetImpactScoreRequirement(blockedLevel) { return Impacts.hasMetImpactScoreRequirement(this, blockedLevel); }
    failImpactScoreRequirement(blockedLevel) { return Impacts.failImpactScoreRequirement(this, blockedLevel); }
    rollbackToImpact() { return Impacts.rollbackToImpact(this); }
}

module.exports = GameEngine;
