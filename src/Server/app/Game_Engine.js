const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");
const BlockSupply = require("./engine/Block_Supply");
const LastChance = require("./engine/Last_Chance");
const Placement = require("./engine/Placement");
const Scoring = require("./engine/Scoring");
const Impacts = require("./engine/Impacts");
const { safeSendJson } = require("./Socket_Transport");

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
        this.onRoomCloseRequested = options.onRoomCloseRequested || null;
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

        if (this.room.state === "game_over") {
            return Math.max(0, (this.room.terminalCloseAt || 0) - Date.now());
        }

        if (!this.room.endsAt) {
            return 0;
        }

        return Math.max(0, this.room.endsAt - Date.now());
    }

    captureRoundEndRemainingMs() {
        if (!this.room || Number.isFinite(this.room.roundEndRemainingMs)) {
            return;
        }

        if (this.room.state === "playing") {
            this.room.roundEndRemainingMs = this.getRemainingMs();
            return;
        }

        if (this.room.state === "starting") {
            this.room.roundEndRemainingMs = Math.max(
                0,
                Number(this.room.levelDurationMs) || 0
            );
        }
    }

    buildGameState(options = {}) {
        if (!this.room) {
            return null;
        }

        const placeableColumns = this.getPlaceableColumnRange(); const stateRemainingMs = this.getRemainingMs();
        const placementCooldownMs = Math.max(0, Number(GameConfig.placementCooldown) || 0);
        const now = Date.now();
        const gameState = {
            type: "game_state",
            stateRevision: Math.max(0, Number(this.room.stateRevision) || 0),
            state: this.room.state,
            level: this.room.level,
            impactLevel: this.room.impactLevel,
            impactInterval: Math.max(1, Number(GameConfig.impactInterval) || 1),
            currentHeight: this.room.currentHeight,
            targetHeight: this.room.targetHeight,
            impactScoreStatus: this.getImpactScoreStatus(),
            activeInventorySlots: this.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            placementCooldownMs,
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
            towerStabilityComponents: this.room.towerStabilityComponents || [],
            towerStructuralPose: this.room.towerStructuralPose || [],
            towerStabilityWarningThreshold: Math.max(0, Math.min(100, Math.round(Number(GameConfig.towerStabilityWarningThreshold) || 0))),
            towerStabilityCriticalThreshold: Math.max(0, Math.min(100, Math.round(Number(GameConfig.towerStabilityCriticalThreshold) || 0))),
            sideQuest: this.room.sideQuest || null,
            powerEvents: options.powerEvents || [],
            towerStabilityFeedbackMode: GameConfig.towerStabilityFeedbackMode,
            stateRemainingMs, levelDurationMs: Math.max(0, Number(this.room.levelDurationMs) || 0), secondsRemaining: Math.ceil(stateRemainingMs / 1000),
            roundEndRemainingMs: Number.isFinite(this.room.roundEndRemainingMs)
                ? Math.max(0, Number(this.room.roundEndRemainingMs))
                : null,
            outcomeId: this.room.outcomeId || "",
            resultsReady: Boolean(this.room.resultsReady),
            lastLevelSummary: this.room.lastLevelSummary,
            scoreEvents: options.scoreEvents || [],
            quickChatEvents: options.quickChatEvents || [],
            quickChatCooldownMs: Math.max(0, Number(GameConfig.quickChatCooldownMs) || 0),
            quickChatTemplates: GameConfig.quickChatTemplates || [],
            placementScorePopupDurationMs: this.getPlacementScorePopupDurationMs(),
            finishScorePopupDurationMs: this.getFinishScorePopupDurationMs(),
            scorePopupDurationMs: this.getMaxScorePopupDurationMs(),
            outcomeMinimumHoldMs: this.getOutcomeMinimumHoldMs(),
            levelSummaryDelayMs: GameConfig.levelSummaryDelayMs,
            players: this.room.players.map(player => ({
                id: player.id,
                isBot: Boolean(player.isBot),
                presence: ["connected", "disconnected", "left"].includes(player.presence)
                    ? player.presence
                    : "connected",
                score: player.score,
                levelScore: player.levelScore,
                levelImpactContribution: player.levelImpactContribution,
                impactContribution: player.impactContribution,
                contributedHeight: player.contributedHeight,
                blocks: player.blocks,
                powerInventory: player.powerInventory || [],
                placementCooldownRemainingMs: Math.max(
                    0,
                    placementCooldownMs - (now - (Number(player.lastPlacementTime) || 0))
                ),
                placementCooldownRequestId: String(player.lastPlacementRequestId || "")
            }))
        };

        if (options.snapshot) {
            gameState.snapshot = true;
        }

        if (options.resyncRequestId) {
            gameState.resyncRequestId = options.resyncRequestId;
        }

        return gameState;
    }

    buildGameStateSnapshot(resyncRequestId = "") {
        return this.buildGameState({
            snapshot: true,
            resyncRequestId
        });
    }

    broadcastGameState(options = {}) {
        if (!this.room) {
            return;
        }

        this.room.stateRevision = Math.max(
            0, Number(this.room.stateRevision) || 0
        ) + 1;

        const includeTransientEvents = options.includeTransientEvents !== false;
        this.commitBotDecisionOutcomes();

        const botInsight = includeTransientEvents
            ? this.consumeBotInsight()
            : null;
        const gameState = this.buildGameState({
            scoreEvents: includeTransientEvents ? this.consumeScoreEvents() : [],
            quickChatEvents: includeTransientEvents ? this.consumeQuickChatEvents() : [],
            powerEvents: includeTransientEvents ? this.consumePowerEvents() : []
        });

        if (this.onRoomMessage) {
            try {
                Promise.resolve(
                    this.onRoomMessage(this.room.id, gameState, { botInsight })
                ).catch(error => {
                    console.error("Room message publishing failed:", error.message);
                });
            } catch (error) {
                console.error("Room message publishing failed:", error.message);
            }
        }

        this.room.players.forEach(player => {
            if (player.isBot || !player.ws) {
                return;
            }

            safeSendJson(player.ws, gameState, "Game state send");
        });

        if (this.room.isSpectatorMatch && this.room.state === "game_completed") {
            this.requestRoomClose("game_completed", "home");
        }
    }

    createRoom(players) {
        const startLevel = this.getConfiguredStartLevel();

        this.room = {
            id: null,
            players: [],
            level: startLevel,
            impactLevel: startLevel,
            stateRevision: 0,
            impactScores: {},
            impactPowers: {},
            impactContributions: {},
            impactFailureCount: 0,
            lastImpactFailureReason: null,
            failureTransitionCommitted: false,
            terminalCloseAt: 0,
            terminalFailureReason: null,
            terminalCloseRequested: false,
            targetHeight: this.getTargetHeightForLevel(startLevel),
            currentHeight: 0,
            drawPile: [],
            drawPileStartCount: 0,
            teamCarryOverBlocks: [],
            towerBlocks: [],
            towerStability: 100,
            towerStabilityDiagnostics: {},
            towerStabilityComponents: [],
            towerStructuralPose: [],
            towerStabilityResult: null,
            historicalMaxStandingHeight: 0,
            rebuildScoreCount: 0,
            lastChanceRescuePending: false,
            lastChanceRescueUsed: false,
            state: "waiting",
            startsAt: 0,
            endsAt: 0,
            freezeEndsAt: 0,
            roundEndRemainingMs: null,
            outcomeId: "",
            outcomeReadyPlayerIds: {},
            outcomeReadyFallbackAt: 0,
            resultsReady: false,
            lastLevelSummary: null,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPowerEvents: [],
            pendingBotInsight: null,
            pendingBotDecisionOutcomes: {},
            botDecisionSequence: 0,
            botBehavior: {},
            sideQuest: null,
            criticalSaveClaimKeys: {},
            scoreEventSeq: 0
        };

        players.forEach(player => this.initializePlayerForRoom(player));
        this.saveImpactState();

        console.log("Room created:", this.room.id);
    }

    initializePlayerForRoom(player) {
        player.presence = "connected";
        player.score = player.score || 0;
        player.levelScore = 0;
        player.levelImpactContribution = 0;
        player.impactContribution = player.impactContribution || 0;
        player.scoreBreakdown = {};
        player.contributedHeight = 0;
        player.blocks = [];
        player.lastPlacementTime = 0;
        player.lastQuickChatTime = 0;
        player.powerInventory = [];
        player.lastPowerActivationTime = 0;
        this.room.players.push(player);
    }

    removePlayerFromRoom(playerId) {
        if (!this.room) {
            return;
        }

        const index = this.room.players.findIndex(player => player.id === playerId);

        if (index === -1) {
            return;
        }

        this.room.players.splice(index, 1);
    }

    hydrateRoom(snapshot, runtimePlayers) {
        this.clearTimers();

        this.room = {
            id: snapshot.id,
            players: runtimePlayers,
            level: snapshot.state.level,
            stateRevision: Math.max(0, Number(snapshot.state.stateRevision) || 0),
            impactLevel: snapshot.state.impactLevel,
            impactScores: snapshot.state.impactScores || {},
            impactPowers: snapshot.state.impactPowers || {},
            impactContributions: snapshot.state.impactContributions || {},
            impactFailureCount: snapshot.state.impactFailureCount || 0,
            lastImpactFailureReason: snapshot.state.lastImpactFailureReason || null,
            failureTransitionCommitted: Boolean(snapshot.state.failureTransitionCommitted),
            terminalCloseAt: snapshot.state.terminalCloseAt || 0,
            terminalFailureReason: snapshot.state.terminalFailureReason || null,
            terminalCloseRequested: Boolean(snapshot.state.terminalCloseRequested),
            targetHeight: snapshot.state.targetHeight,
            currentHeight: snapshot.state.currentHeight,
            drawPile: snapshot.state.drawPile || [],
            drawPileStartCount: snapshot.state.drawPileStartCount || 0,
            levelDurationMs: snapshot.state.levelDurationMs || 0,
            teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
            towerBlocks: snapshot.state.towerBlocks || [],
            towerStability: snapshot.state.towerStability ?? 100,
            towerStabilityDiagnostics: snapshot.state.towerStabilityDiagnostics || {},
            towerStabilityComponents: snapshot.state.towerStabilityComponents || [],
            towerStructuralPose: snapshot.state.towerStructuralPose || [],
            historicalMaxStandingHeight: Math.max(
                Number(snapshot.state.historicalMaxStandingHeight || 0),
                Number(snapshot.state.currentHeight || 0)
            ),
            rebuildScoreCount: Math.max(0, Math.floor(Number(snapshot.state.rebuildScoreCount) || 0)),
            lastChanceRescuePending: Boolean(snapshot.state.lastChanceRescuePending),
            lastChanceRescueUsed: Boolean(snapshot.state.lastChanceRescueUsed),
            state: snapshot.state.state,
            startsAt: snapshot.state.startsAt,
            endsAt: snapshot.state.endsAt,
            freezeEndsAt: snapshot.state.freezeEndsAt || 0,
            roundEndRemainingMs: Number.isFinite(snapshot.state.roundEndRemainingMs)
                ? Math.max(0, Number(snapshot.state.roundEndRemainingMs))
                : null,
            outcomeId: snapshot.state.outcomeId || "",
            outcomeReadyPlayerIds: snapshot.state.outcomeReadyPlayerIds || {},
            outcomeReadyFallbackAt: Math.max(0, Number(snapshot.state.outcomeReadyFallbackAt) || 0),
            resultsReady: Boolean(snapshot.state.resultsReady),
            lastLevelSummary: snapshot.state.lastLevelSummary,
            pendingScoreEvents: [],
            pendingQuickChatEvents: [],
            pendingPowerEvents: [],
            pendingBotInsight: null,
            pendingBotDecisionOutcomes: {},
            botDecisionSequence: 0,
            botBehavior: {},
            sideQuest: snapshot.state.sideQuest || null,
            criticalSaveClaimKeys: snapshot.state.criticalSaveClaimKeys || {},
            scoreEventSeq: 0
        };
        this.room.players.forEach(player => {
            player.levelImpactContribution = Number(player.levelImpactContribution || 0);
            player.impactContribution = Number(player.impactContribution || 0);
        });
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
            if (this.room.outcomeId && !this.room.resultsReady) {
                this.scheduleOutcomeReadyFallback(
                    Math.max(0, this.room.outcomeReadyFallbackAt - Date.now())
                );
                return;
            }
            this.nextLevelTimer = setTimeout(() => {
                this.nextLevel();
            }, Math.max(0, this.room.freezeEndsAt - Date.now()));
            return;
        }

        if (this.room.state === "failed") {
            if (this.room.outcomeId && !this.room.resultsReady) {
                this.scheduleOutcomeReadyFallback(
                    Math.max(0, this.room.outcomeReadyFallbackAt - Date.now())
                );
                return;
            }
            this.scheduleCheckpointRecovery(
                Math.max(0, this.room.freezeEndsAt - Date.now())
            );
            return;
        }

        if (this.room.state === "game_over") {
            if (this.room.outcomeId && !this.room.resultsReady) {
                this.scheduleOutcomeReadyFallback(
                    Math.max(0, this.room.outcomeReadyFallbackAt - Date.now())
                );
                return;
            }
            this.scheduleTerminalRoomClose(
                Math.max(0, this.room.terminalCloseAt - Date.now())
            );
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

        if (this.room.players.every(player => player.isBot)) {
            return;
        }

        this.onLevelOutcome(outcome).catch(error => {
            console.error("Level outcome recording failed:", error.message);
        });
    }

    recordBotDecision(bot, decision) {
        if (!this.room || !bot?.isBot || !decision || typeof decision !== "object") {
            return;
        }

        const personality = ["climber", "engineer", "opportunist"].includes(
            decision.personality
        )
            ? decision.personality
            : bot.botProfile?.personality || "climber";
        const normalized = {
            personality,
            intent: typeof decision.intent === "string" ? decision.intent : "wait",
            expectedPoints: Math.max(0, Math.round(Number(decision.expectedPoints) || 0)),
            heightGain: Math.max(0, Math.round(Number(decision.heightGain) || 0)),
            stability: Math.max(0, Math.round(Number(decision.stability) || 0)),
            risky: Boolean(decision.risky),
            bad: Boolean(decision.bad)
        };
        const behavior = this.room.botBehavior || (this.room.botBehavior = {});
        const botStats = behavior[bot.id] || (behavior[bot.id] = {
            personality,
            riskyDecisions: 0,
            badDecisions: 0,
            causedCollapse: 0,
            waits: 0,
            powerUses: 0,
            criticalSaves: 0
        });

        botStats.personality = personality;
        botStats.riskyDecisions += normalized.risky ? 1 : 0;
        botStats.badDecisions += normalized.bad ? 1 : 0;
        botStats.waits += normalized.intent === "wait" ? 1 : 0;

        this.room.botDecisionSequence = Math.max(
            0, Number(this.room.botDecisionSequence) || 0
        ) + 1;
        this.room.pendingBotInsight = {
            sequence: this.room.botDecisionSequence,
            botId: bot.id,
            ...normalized
        };
        this.room.pendingBotDecisionOutcomes = this.room.pendingBotDecisionOutcomes || {};
        this.room.pendingBotDecisionOutcomes[bot.id] = {
            intent: normalized.intent,
            fallenBlockIds: this.getFallenBlockIds(),
            criticalSavePoints: Number(bot.scoreBreakdown?.criticalSave || 0),
            powerInventoryCount: Array.isArray(bot.powerInventory)
                ? bot.powerInventory.length
                : 0
        };

        // A wait has no gameplay mutation to trigger the normal redraw boundary.
        if (normalized.intent === "wait") {
            this.broadcastGameState();
        }
    }

    getFallenBlockIds() {
        return new Set((this.room?.towerBlocks || []).flatMap(entry => {
            if (entry?.towerState !== "fallen") {
                return [];
            }

            const id = String(entry.block?.id ?? entry.blockId ?? "");
            return id ? [id] : [];
        }));
    }

    commitBotDecisionOutcomes() {
        const outcomes = this.room?.pendingBotDecisionOutcomes;

        if (!outcomes || typeof outcomes !== "object") {
            return;
        }

        const fallenBlockIds = this.getFallenBlockIds();

        Object.entries(outcomes).forEach(([botId, outcome]) => {
            const bot = this.room.players.find(player => player.id === botId);
            const stats = this.room.botBehavior?.[botId];

            if (!bot || !stats) {
                return;
            }

            if (
                outcome.intent !== "wait" &&
                [...fallenBlockIds].some(id => !outcome.fallenBlockIds.has(id))
            ) {
                stats.causedCollapse += 1;
            }

            if (Number(bot.scoreBreakdown?.criticalSave || 0) > outcome.criticalSavePoints) {
                stats.criticalSaves += 1;
            }

            if (
                outcome.intent === "power" &&
                Array.isArray(bot.powerInventory) &&
                bot.powerInventory.length < outcome.powerInventoryCount
            ) {
                stats.powerUses += 1;
            }
        });

        this.room.pendingBotDecisionOutcomes = {};
    }

    consumeBotInsight() {
        const insight = this.room?.pendingBotInsight || null;

        if (this.room) {
            this.room.pendingBotInsight = null;
        }

        return insight;
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

    getOutcomeMinimumHoldMs() {
        return Math.max(0, Number(GameConfig.outcomeMinimumHoldMs) || 0);
    }

    getOutcomeReadyFallbackMs() {
        return Math.max(1000, Number(GameConfig.outcomeReadyFallbackMs) || 30000);
    }

    isOutcomeState() {
        return ["finished", "failed", "game_over"].includes(this.room?.state);
    }

    outcomeGatePlayerIds() {
        if (!this.room) return [];
        return this.room.players
            .filter(player => !player.isBot && player.presence === "connected")
            .map(player => player.id);
    }

    beginOutcomeSynchronization() {
        if (!this.isOutcomeState()) return;

        const now = Date.now();
        this.room.outcomeId = `${this.room.level}:${this.room.state}:${now}`;
        this.room.outcomeReadyPlayerIds = {};
        this.room.resultsReady = false;
        this.room.outcomeReadyFallbackAt = now + this.getOutcomeReadyFallbackMs();
        if (this.room.state === "game_over") {
            this.room.terminalCloseAt = this.room.outcomeReadyFallbackAt;
        } else {
            this.room.freezeEndsAt = this.room.outcomeReadyFallbackAt;
        }
        this.persistRoom();
        this.broadcastGameState();
        this.scheduleOutcomeReadyFallback();
        this.refreshOutcomeReadiness();
    }

    scheduleOutcomeReadyFallback(delayMs = null) {
        if (!this.isOutcomeState() || this.room.resultsReady) return;
        clearTimeout(this.nextLevelTimer);
        const delay = delayMs === null
            ? Math.max(0, this.room.outcomeReadyFallbackAt - Date.now())
            : Math.max(0, Number(delayMs) || 0);
        this.nextLevelTimer = setTimeout(() => {
            this.beginResultsWindow();
        }, delay);
    }

    acknowledgeOutcomeReady(playerId, outcomeId) {
        if (!this.isOutcomeState() || this.room.resultsReady || outcomeId !== this.room.outcomeId) {
            return false;
        }
        if (!this.outcomeGatePlayerIds().includes(playerId)) {
            return false;
        }
        if (this.room.outcomeReadyPlayerIds[playerId]) {
            return true;
        }
        this.room.outcomeReadyPlayerIds[playerId] = true;
        this.persistRoom();
        this.refreshOutcomeReadiness();
        return true;
    }

    refreshOutcomeReadiness() {
        if (!this.isOutcomeState() || this.room.resultsReady) return false;
        const gatePlayerIds = this.outcomeGatePlayerIds();
        if (!gatePlayerIds.every(playerId => this.room.outcomeReadyPlayerIds[playerId])) {
            return false;
        }
        this.beginResultsWindow();
        return true;
    }

    beginResultsWindow() {
        if (!this.isOutcomeState() || this.room.resultsReady) return;
        clearTimeout(this.nextLevelTimer);
        this.nextLevelTimer = null;
        this.room.resultsReady = true;
        this.room.outcomeReadyFallbackAt = 0;
        const delay = Math.max(0, Number(GameConfig.levelSummaryDelayMs) || 0);
        if (this.room.state === "game_over") {
            this.room.terminalCloseAt = Date.now() + delay;
        } else {
            this.room.freezeEndsAt = Date.now() + delay;
        }
        this.persistRoom();
        this.broadcastGameState();
        if (this.room.state === "finished") {
            this.nextLevelTimer = setTimeout(() => this.nextLevel(), delay);
        } else if (this.room.state === "failed") {
            this.scheduleCheckpointRecovery(delay);
        } else {
            this.scheduleTerminalRoomClose(delay);
        }
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
        if (!this.room || this.room.state === "game_over") {
            return false;
        }

        this.clearTimers();

        this.room.failureTransitionCommitted = false;
        this.room.roundEndRemainingMs = null;
        this.room.outcomeId = "";
        this.room.outcomeReadyPlayerIds = {};
        this.room.outcomeReadyFallbackAt = 0;
        this.room.resultsReady = false;
        this.room.state = "starting";
        this.room.currentHeight = 0;
        this.room.towerBlocks = [];
        this.room.towerStability = 100;
        this.room.towerStabilityDiagnostics = {};
        this.room.towerStabilityComponents = [];
        this.room.towerStructuralPose = [];
        this.room.towerStabilityResult = null;
        const targetHeight = this.getTargetHeightForLevel(this.room.level);
        const targetChanged = this.room.targetHeight !== targetHeight;
        this.room.historicalMaxStandingHeight = 0;
        if (targetChanged) this.room.rebuildScoreCount = 0;
        this.resetLastChanceRescue();
        this.room.targetHeight = targetHeight;
        this.room.startsAt = Date.now() + GameConfig.startDelayMs;
        this.room.levelDurationMs = this.getLevelTimeLimitMs();
        this.room.endsAt = this.room.startsAt + this.room.levelDurationMs;
        this.room.lastLevelSummary = null;
        this.room.pendingScoreEvents = this.room.pendingScoreEvents || [];
        this.room.pendingBotInsight = null;
        this.room.pendingBotDecisionOutcomes = {};
        this.room.botBehavior = {};
        this.room.criticalSaveClaimKeys = {};
        this.setupSideQuest();
        this.grantDefaultPowers();

        this.room.players.forEach(player => {
            player.levelScore = 0;
            player.levelImpactContribution = 0;
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

        return true;
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

    closeRoom(reason, persist = true) {
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
        if (persist) {
            this.persistRoom();
        }
    }

    requestRoomClose(reason, destination = null) {
        if (!this.room || this.room.terminalCloseRequested || !this.onRoomCloseRequested) {
            return false;
        }

        this.room.terminalCloseRequested = true;
        Promise.resolve(
            this.onRoomCloseRequested(this.room.id, reason, destination)
        ).catch(error => {
            console.error("Room close request failed:", error.message);
        });

        return true;
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
        const baseDurationMs = Math.max(
            1000, Number(GameConfig.levelTimeLimitMs) || 1000
        );
        const resolvedLevel = Math.max(1, Number(level ?? this.room?.level) || 1);
        const perLevelDurationMs = Math.max(
            0, Number(GameConfig.levelTimePerLevelMs) || 0
        );

        return Math.round(
            baseDurationMs + (resolvedLevel - 1) * perLevelDurationMs
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
            resetScores: true,
            newRun: true
        });
    }

    restartAtLevel(level, options = {}) {
        if (!this.room) {
            return;
        }

        BotManager.stopBots(this);
        this.clearTimers();

        const targetLevel = this.clampLevel(level);
        const newRun = Boolean(options.newRun);

        this.room.level = targetLevel;
        if (newRun) {
            this.room.impactLevel = targetLevel;
            this.room.impactFailureCount = 0;
            this.room.lastImpactFailureReason = null;
            this.room.failureTransitionCommitted = false;
            this.room.terminalCloseAt = 0;
            this.room.terminalFailureReason = null;
            this.room.terminalCloseRequested = false;
        }
        this.room.drawPile = [];
        this.room.teamCarryOverBlocks = [];
        this.room.towerBlocks = [];
        this.room.currentHeight = 0;
        this.room.towerStability = 100;
        this.room.towerStabilityDiagnostics = {};
        this.room.towerStabilityComponents = [];
        this.room.towerStructuralPose = [];
        this.room.towerStabilityResult = null;
        this.room.historicalMaxStandingHeight = 0;
        this.room.rebuildScoreCount = 0;
        this.resetLastChanceRescue();
        this.room.targetHeight = this.getTargetHeightForLevel(targetLevel);
        this.room.lastLevelSummary = null;
        this.room.pendingScoreEvents = [];
        this.room.criticalSaveClaimKeys = {};
        this.room.scoreEventSeq = 0;

        this.room.players.forEach(player => {
            if (options.resetScores) {
                player.score = 0;
                player.impactContribution = 0;
                player.powerInventory = [];
            }

            player.levelScore = 0;
            player.levelImpactContribution = 0;
            player.scoreBreakdown = {};
            player.contributedHeight = 0;
            player.blocks = [];
            player.lastPlacementTime = 0;
            player.botLoopLevel = null;
        });

        if (newRun) {
            this.saveImpactState();
        }

        this.startLevel();
    }

    getSupplyPackingEfficiency() { return Placement.getSupplyPackingEfficiency(this); }
    getSupplySiteWidthEstimate(targetHeight) { return Placement.getSupplySiteWidthEstimate(this, targetHeight); }
    getSiteWidthForHeight(targetHeight) { return Placement.getSiteWidthForHeight(this, targetHeight); }
    getPlaceableColumnRange() { return Placement.getPlaceableColumnRange(this); }
    getPlaceableOriginRange(block) { return Placement.getPlaceableOriginRange(this, block); }
    resolveColumnOriginX(block, column) { return Placement.resolveColumnOriginX(this, block, column); }
    resolvePlacementOrigin(block, column, originY) { return Placement.resolvePlacementOrigin(this, block, column, originY); }
    placeBlock(playerId, blockIndex, column = null, originY = null, requestId = "") { return Placement.placeBlock(this, playerId, blockIndex, column, originY, requestId); }
    getStabilityPressure(level) { return Placement.getStabilityPressure(this, level); }
    resolveStabilityConfig(level) { return Placement.resolveStabilityConfig(this, level); }
    resolveLastChance(result, advancesRescue = false) { return LastChance.resolve(this, result, advancesRescue); }
    resetLastChanceRescue() { return LastChance.reset(this); }
    recalculateTowerStability(advancesLastChance = false, evaluatedResult = null) { return Placement.recalculateTowerStability(this, advancesLastChance, evaluatedResult); }
    checkWinCondition(finisher, finishingBlock) { return Placement.checkWinCondition(this, finisher, finishingBlock); }
    checkFailCondition() { return Placement.checkFailCondition(this); }
    anyPlayerCanRescueSupply() { return Placement.anyPlayerCanRescueSupply(this); }
    tryActivateBotReplenish() { return BotManager.tryActivateReplenish(this); }

    completeLevel(finisher, finishingBlock) {
        this.captureRoundEndRemainingMs();
        this.room.state = "finished";
        clearTimeout(this.levelTimer);
        clearInterval(this.tickTimer);

        const exactFinish =
            this.room.currentHeight === this.room.targetHeight;
        const overbuildHeight =
            Math.max(0, this.room.currentHeight - this.room.targetHeight);
        const previousTotalScores = this.getPlayerScoreMap();
        const nextLevel = this.room.level + 1;
        const perfectBuildImpact = exactFinish
            ? this.awardPerfectBuildImpact(this.getNextImpactLevel())
            : null;

        if (exactFinish) {
            this.queueScoreEvent("exact_finish", {
                label: "Perfect Build",
                displayOnly: true,
                meta: {
                    currentHeight: this.room.currentHeight,
                    targetHeight: this.room.targetHeight,
                    finisherId: finisher.id,
                    finisherPoints: this.getPerfectBuildFinisherPoints(),
                    impactRequirementShare: perfectBuildImpact.requirementShare,
                    impactCredits: perfectBuildImpact.credits
                }
            });
        } else {
            this.queueScoreEvent("overbuild_finish", {
                points: 0,
                label: "Target Reached",
                displayOnly: true,
                meta: {
                    currentHeight: this.room.currentHeight,
                    targetHeight: this.room.targetHeight,
                    overbuildHeight: overbuildHeight
                }
            });
        }

        const completionBonuses = this.awardCompletionBonuses(finisher, exactFinish);
        this.addLevelScoreToLeaderboard();

        if (
            nextLevel <= GameConfig.maxLevel &&
            this.isImpactLevel(nextLevel) &&
            !this.hasMetImpactScoreRequirement(nextLevel)
        ) {
            this.failImpactScoreRequirement(nextLevel);
            return;
        }

        const carriedBlockCount = this.prepareTeamCarryOverBlocks();

        const mvp = this.getLevelMVP();

        this.queueScoreEvent("mvp", {
            playerId: mvp.id,
            points: mvp.levelScore,
            label: "MVP",
            displayOnly: true
        });

        this.recordLevelOutcome("completed");
        this.room.lastLevelSummary = this.buildLevelSummary({
            result: "completed",
            exactFinish: exactFinish,
            overbuildHeight: overbuildHeight,
            perfectBuild: exactFinish ? {
                finisherId: finisher.id,
                finisherPoints: completionBonuses.perfectBuild,
                impactRequirement: perfectBuildImpact.requiredContribution,
                impactRequirementShare: perfectBuildImpact.requirementShare,
                impactCredits: perfectBuildImpact.credits
            } : null,
            finisher: finisher,
            finishingBlock: finishingBlock,
            carriedBlockCount: carriedBlockCount,
            mvp: mvp,
            previousTotalScores: previousTotalScores
        });

        this.beginOutcomeSynchronization();
    }

    failLevel(reason) {
        if (!["time_expired", "all_blocks_used", "not_enough_height_remaining"].includes(reason)) {
            return false;
        }
        return this.resolveCheckpointFailure({ reason });
    }

    nextLevel() {
        if (!this.room || this.room.state !== "finished") {
            return;
        }

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
            this.room.impactLevel = this.room.level;
            this.secureImpactCheckpoint();
            this.awardImpactPower();
            this.saveImpactState();
            this.persistRoom();
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
    buildLevelSummary(options) {
        this.commitBotDecisionOutcomes();
        const summary = Scoring.buildLevelSummary(this, options);

        if (!this.room.isSpectatorMatch) {
            return summary;
        }

        const impactStatus = this.getImpactScoreStatus();

        summary.botBehavior = this.room.players
            .filter(player => player.isBot)
            .map(player => {
                const breakdown = player.scoreBreakdown || {};
                const stats = this.room.botBehavior?.[player.id] || {};
                const impactPlayer = impactStatus?.players?.find(candidate => {
                    return candidate.id === player.id;
                });

                return {
                    id: player.id,
                    personality: stats.personality || player.botProfile?.personality || "climber",
                    score: Number(player.score || 0),
                    height: Number(player.contributedHeight || 0),
                    recovery: Number(breakdown.recovery || 0),
                    reinforcement: Number(breakdown.structural || 0),
                    criticalSaves: Number(stats.criticalSaves || 0),
                    impactContribution: Number(player.impactContribution || 0) +
                        Number(player.levelImpactContribution || 0),
                    impactMet: Boolean(impactPlayer?.met),
                    riskyDecisions: Number(stats.riskyDecisions || 0),
                    badDecisions: Number(stats.badDecisions || 0),
                    causedCollapse: Number(stats.causedCollapse || 0),
                    waits: Number(stats.waits || 0),
                    powerUses: Number(stats.powerUses || 0)
                };
            });

        return summary;
    }
    recordScoreBreakdown(player, key, points) { return Scoring.recordScoreBreakdown(this, player, key, points); }
    getActionUnit(level) { return Scoring.getActionUnit(this, level); }
    getExpectedNormalUsefulScoreForLevel(level) { return Scoring.getExpectedNormalUsefulScoreForLevel(this, level); }
    getPerfectBuildFinisherPoints() { return Scoring.getPerfectBuildFinisherPoints(this); }
    previewPlacementScore(input) { return Scoring.previewPlacementScore(this, input); }
    addPlacementScore(player, input) { return Scoring.addPlacementScore(this, player, input); }
    awardCompletionBonuses(finisher, exactFinish) { return Scoring.awardCompletionBonuses(this, finisher, exactFinish); }
    addBonusScore(player, points, label) { return Scoring.addBonusScore(this, player, points, label); }
    getBonusScoreEventType(label) { return Scoring.getBonusScoreEventType(this, label); }
    getBonusScoreEventLabel(label) { return Scoring.getBonusScoreEventLabel(this, label); }
    addLevelScoreToLeaderboard() { return Scoring.addLevelScoreToLeaderboard(this); }
    getLevelMVP() { return Scoring.getLevelMVP(this); }

    saveImpactScores() { return Impacts.saveImpactScores(this); }
    saveImpactPowers() { return Impacts.saveImpactPowers(this); }
    saveImpactContributions() { return Impacts.saveImpactContributions(this); }
    saveImpactState() { return Impacts.saveImpactState(this); }
    ensureImpactScores() { return Impacts.ensureImpactScores(this); }
    ensureImpactPowers() { return Impacts.ensureImpactPowers(this); }
    ensureImpactContributions() { return Impacts.ensureImpactContributions(this); }
    ensureImpactState() { return Impacts.ensureImpactState(this); }
    normalizeImpactFailureState() { return Impacts.normalizeImpactFailureState(this); }
    restoreImpactScores() { return Impacts.restoreImpactScores(this); }
    restoreImpactPowers() { return Impacts.restoreImpactPowers(this); }
    restoreImpactContributions() { return Impacts.restoreImpactContributions(this); }
    secureImpactCheckpoint() { return Impacts.secureImpactCheckpoint(this); }
    awardImpactPower() { return Impacts.awardImpactPower(this); }
    isImpactLevel(level) { return Impacts.isImpactLevel(this, level); }
    getImpactScoreRequirement() { return Impacts.getImpactScoreRequirement(this); }
    getImpactMinContributionShare() { return Impacts.getImpactMinContributionShare(this); }
    getExpectedPlacementScoreForLevel(level) { return Impacts.getExpectedPlacementScoreForLevel(this, level); }
    getExpectedPlacementScoreForImpactBand(blockedLevel) { return Impacts.getExpectedPlacementScoreForImpactBand(this, blockedLevel); }
    getImpactBandScoreRequirement(blockedLevel) { return Impacts.getImpactBandScoreRequirement(this, blockedLevel); }
    getImpactFailureStatus() { return Impacts.getImpactFailureStatus(this); }
    getImpactScoreFailures(blockedLevel) { return Impacts.getImpactScoreFailures(this, blockedLevel); }
    getNextImpactLevel() { return Impacts.getNextImpactLevel(this); }
    getImpactScoreStatus(blockedLevel = null) { return Impacts.getImpactScoreStatus(this, blockedLevel); }
    hasMetImpactScoreRequirement(blockedLevel) { return Impacts.hasMetImpactScoreRequirement(this, blockedLevel); }
    awardPerfectBuildImpact(blockedLevel = null) { return Impacts.awardPerfectBuildImpact(this, blockedLevel); }
    resolveCheckpointFailure(options) { return Impacts.resolveCheckpointFailure(this, options); }
    scheduleCheckpointRecovery(delayMs = null) { return Impacts.scheduleCheckpointRecovery(this, delayMs); }
    scheduleTerminalRoomClose(delayMs = null) { return Impacts.scheduleTerminalRoomClose(this, delayMs); }
    failImpactScoreRequirement(blockedLevel) { return Impacts.failImpactScoreRequirement(this, blockedLevel); }
    rollbackToImpact() { return Impacts.rollbackToImpact(this); }
}

module.exports = GameEngine;
