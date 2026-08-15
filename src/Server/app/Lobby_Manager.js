const GameEngine = require("./Game_Engine");
const GameConfig = require("./Game_Config");
const { RedisState, stripRuntimePlayer } = require("./Redis_State");
const ProfileStore = require("./Profile_Store");

const MAX_OPEN_ROOM_CLAIM_ATTEMPTS = 5;

const DEFAULT_DEBUG_CONFIG = {
    debugBotsEnabled: GameConfig.debugBotsEnabled,
    debugBotCount: GameConfig.debugBotCount,
    debugBotStrategy: GameConfig.debugBotStrategy,
    debugStartLevel: GameConfig.debugStartLevel,
    debugBotDelayMin: GameConfig.debugBotDelayMin,
    debugBotDelayMax: GameConfig.debugBotDelayMax,
    placementCooldown: GameConfig.placementCooldown,
    quickChatCooldownMs: GameConfig.quickChatCooldownMs,
    towerStabilityFeedbackMode: GameConfig.towerStabilityFeedbackMode,
    levelTimeLimitMs: GameConfig.levelTimeLimitMs,
    startDelayMs: GameConfig.startDelayMs,
    placementScorePopupDurationMs: GameConfig.placementScorePopupDurationMs,
    finishScorePopupDurationMs: GameConfig.finishScorePopupDurationMs,
    levelSummaryDelayMs: GameConfig.levelSummaryDelayMs,
    impactScoreRequirement: GameConfig.impactScoreRequirement,
    impactMinContributionShare: GameConfig.impactMinContributionShare,
    impactInterval: GameConfig.impactInterval,
    targetHeightMultiplier: GameConfig.targetHeightMultiplier,
    levelSupplyMinSurplus: GameConfig.levelSupplyMinSurplus,
    levelSupplyMaxSurplus: GameConfig.levelSupplyMaxSurplus,
    minPrecisionBlocksPerLevel: GameConfig.minPrecisionBlocksPerLevel,
    maxTeamCarryOverBlocks: GameConfig.maxTeamCarryOverBlocks,
    refreshMinUsefulBlockHeight: GameConfig.refreshMinUsefulBlockHeight,
    towerStabilityDifficulty: GameConfig.towerStabilityDifficulty,
    towerMaxTiltAngleDeg: GameConfig.towerMaxTiltAngleDeg,
    towerSiteSlendernessTarget: GameConfig.towerSiteSlendernessTarget,
    towerSiteWidthMin: GameConfig.towerSiteWidthMin,
    towerSiteWidthMax: GameConfig.towerSiteWidthMax,
    supplyEffectiveWidthRatio: GameConfig.supplyEffectiveWidthRatio,
    towerStabilityWarningThreshold: GameConfig.towerStabilityWarningThreshold,
    towerStabilityCriticalThreshold: GameConfig.towerStabilityCriticalThreshold,
    towerStabilityMoodThreshold: GameConfig.towerStabilityMoodThreshold,
    powerUnlockLevel: GameConfig.powerUnlockLevel,
    powerMaxSlots: GameConfig.powerMaxSlots,
    powerActivationCooldownMs: GameConfig.powerActivationCooldownMs,
    powerReplenishPileShare: GameConfig.powerReplenishPileShare,
    placementScorePerHeight: GameConfig.scoring.placementScorePerHeight,
    placementStabilityFloor: GameConfig.scoring.placementStabilityFloor,
    reinforceScorePerIntegrity: GameConfig.scoring.reinforceScorePerIntegrity,
    reinforceScorePerLean: GameConfig.scoring.reinforceScorePerLean,
    finisherBonusPerLevel: GameConfig.scoring.finisherBonusPerLevel,
    precisionBonusPerLevel: GameConfig.scoring.precisionBonusPerLevel,
    teamExactBonusPerLevel: GameConfig.scoring.teamExactBonusPerLevel,
    assistBonusPerLevel: GameConfig.scoring.assistBonusPerLevel,
    assistContributionThreshold: GameConfig.scoring.assistContributionThreshold,
    visualHookImpactBeat: GameConfig.visualHooks.impactBeat,
    visualHookScreenShake: GameConfig.visualHooks.screenShake,
    visualHookZoomOutMs: GameConfig.visualHooks.impactBeatZoomOutMs,
    visualHookWaveMs: GameConfig.visualHooks.impactBeatWaveMs,
    visualHookHoldMs: GameConfig.visualHooks.impactBeatHoldMs,
    visualHookShakeMs: GameConfig.visualHooks.screenShakeMs
};

class LobbyManager {
    constructor(stateStore = new RedisState()) {
        this.stateStore = stateStore;
        this.profileStore = new ProfileStore();
        this.rooms = [];
        this.connectedPlayers = new Map();
        this.roomReconnectTimers = new Map();
        this.roomLobbyTimers = new Map();
        this.botCounter = 1;
    }

    async start() {
        await this.stateStore.connect();
        await this.profileStore.connect();

        await this.stateStore.subscribeToPlayerAssignments(message => {
            this.handlePlayerAssignment(message).catch(error => {
                console.error("Player assignment handling failed:", error.message);
            });
        });

        console.log(
            `Lobby state: ${this.stateStore.enabled ? "Redis" : "memory"} (${this.stateStore.getPodId()})`
        );
    }

    async handlePlayerAssignment({ playerId, roomId, sourcePodId }) {
        if (sourcePodId === this.stateStore.getPodId()) {
            return;
        }

        const player = this.connectedPlayers.get(playerId);

        if (!player || player.room) {
            return;
        }

        await this.resumePlayer(player, roomId);
    }

    resolveIdentityFields(reconnectRequest, identity) {
        if (identity && identity.userId) {
            return {
                profileId: identity.userId,
                displayName: identity.displayName || null
            };
        }

        return {
            profileId: reconnectRequest.profileId || null,
            displayName: null
        };
    }

    async createPlayer(ws, reconnectRequest = {}, identity = null) {
        const identityFields = this.resolveIdentityFields(reconnectRequest, identity);
        const existingSession =
            await this.stateStore.getSession(reconnectRequest.reconnectToken);

        if (
            existingSession &&
            existingSession.playerId === reconnectRequest.playerId
        ) {
            const player = {
                id: existingSession.playerId,
                sessionId: existingSession.sessionId,
                profileId: identityFields.profileId,
                displayName: identityFields.displayName,
                ws: ws,
                score: 0,
                lastPlacementTime: 0
            };

            this.connectedPlayers.set(player.id, player);
            await this.stateStore.saveSession({
                ...existingSession,
                connected: true
            });

            await this.resumePlayer(player, existingSession.roomId);
            return player;
        }

        const sessionId = this.stateStore.createReconnectToken();
        const player = {
            id: await this.stateStore.nextPlayerId(),
            sessionId: sessionId,
            profileId: identityFields.profileId,
            displayName: identityFields.displayName,
            ws: ws,
            score: 0,
            lastPlacementTime: 0
        };

        this.connectedPlayers.set(player.id, player);
        await this.stateStore.saveSession({
            sessionId: sessionId,
            reconnectToken: sessionId,
            playerId: player.id,
            roomId: null,
            connected: true
        });

        return player;
    }

    async addPlayer(player) {
        this.resetParticipantState(player);
        this.connectedPlayers.set(player.id, player);
        await this.joinOrCreateRoom(player);
    }

    async resumePlayer(player, roomId) {
        if (!roomId) {
            await this.addPlayer(player);
            return;
        }

        let room = this.rooms.find(activeRoom => String(activeRoom.id) === String(roomId));

        if (!room) {
            room = await this.hydrateRoom(roomId);
        }

        if (!room) {
            await this.addPlayer(player);
            return;
        }

        const roomPlayer =
            room.players.find(candidate => candidate.id === player.id);

        if (!roomPlayer) {
            await this.addPlayer(player);
            return;
        }

        roomPlayer.ws = player.ws;
        roomPlayer.sessionId = player.sessionId;
        roomPlayer.profileId = player.profileId || roomPlayer.profileId;
        roomPlayer.displayName = player.displayName || roomPlayer.displayName || null;
        player.room = room;
        this.cancelRoomReconnectExpiry(room.id);

        await this.stateStore.saveSession({
            sessionId: player.sessionId,
            reconnectToken: player.sessionId,
            playerId: player.id,
            roomId: room.id,
            connected: true
        });

        const roster = await this.buildRoomRoster(room);

        this.sendPlayer(player, {
            type: "room_resumed",
            playerId: player.id,
            reconnectToken: player.sessionId,
            reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
            roomId: room.id,
            level: room.engine.room.level,
            targetHeight: room.engine.room.targetHeight,
            impactScoreStatus: room.engine.getImpactScoreStatus(),
            activeInventorySlots: room.engine.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            blocks: roomPlayer.blocks || [],
            drawPileCount: (room.engine.room.drawPile || []).length,
            nextDrawBlock: room.engine.getNextDrawBlock(),
            roster: roster,
            matchStarted: Boolean(room.matchStarted),
            lobby: room.matchStarted ? null : this.buildLobbyPayload(room)
        });

        if (room.matchStarted) {
            room.engine.broadcastGameState();
        }
    }

    async removePlayer(player) {
        this.connectedPlayers.delete(player.id);

        await this.stateStore.markSessionDisconnected(player);

        if (player.room && !player.room.matchStarted) {
            await this.evictLobbyPlayer(player.room, player, "player_left_lobby");
            this.resetBotCounterIfIdle();
            console.log(`${player.id} left the lobby by disconnecting`);
            return;
        }

        if (player.room) {
            const roomPlayer =
                player.room.players.find(candidate => candidate.id === player.id);

            if (roomPlayer) {
                roomPlayer.ws = null;
            }

            await this.stateStore.saveRoom(
                player.room,
                player.room.ownerPodId === this.stateStore.getPodId()
            );

            this.scheduleRoomReconnectExpiry(player.room);
        }

        this.resetBotCounterIfIdle();
        console.log(`${player.id} disconnected; reconnect TTL active`);
    }

    scheduleRoomReconnectExpiry(room) {
        if (!room || this.roomReconnectTimers.has(room.id)) {
            return;
        }

        const ttlMs = this.stateStore.getReconnectTtlSeconds() * 1000;

        const timer = setTimeout(() => {
            this.handleRoomReconnectExpired(room.id).catch(error => {
                console.error("Reconnect expiry handling failed:", error.message);
            });
        }, ttlMs);

        if (timer.unref) {
            timer.unref();
        }

        this.roomReconnectTimers.set(room.id, timer);
    }

    cancelRoomReconnectExpiry(roomId) {
        const timer = this.roomReconnectTimers.get(roomId);

        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.roomReconnectTimers.delete(roomId);
    }

    async handleRoomReconnectExpired(roomId) {
        this.roomReconnectTimers.delete(roomId);

        const room =
            this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room) {
            return;
        }

        const hasConnectedRealPlayer =
            room.players.some(roomPlayer => {
                return this.isConnectedRealPlayer(roomPlayer);
            });

        if (hasConnectedRealPlayer) {
            return;
        }

        await this.closeRoom(
            room,
            "reconnect_ttl_expired"
        );
    }

    resetParticipantState(player) {
        player.score = player.score || 0;
        player.levelScore = player.levelScore || 0;
        player.scoreBreakdown = player.scoreBreakdown || {};
        player.contributedHeight = player.contributedHeight || 0;
        player.blocks = player.blocks || [];
        player.lastPlacementTime = player.lastPlacementTime || 0;
        player.botLoopLevel = null;
        player.room = null;
    }

    isConnectedRealPlayer(player) {
        return (
            !player.isBot &&
            player.ws &&
            player.ws.readyState === 1
        );
    }

    sendPlayer(player, message) {
        if (player?.ws && player.ws.readyState === 1) {
            player.ws.send(JSON.stringify(message));
        }
    }

    async closeRoom(room, reason) {
        if (!room) {
            return;
        }

        const existingRoom =
            this.rooms.find(activeRoom => activeRoom.id === room.id);

        if (!existingRoom) {
            return;
        }

        console.log(`Closing room ${room.id}: ${reason}`);
        this.cancelRoomReconnectExpiry(room.id);
        this.cancelLobbyReadyTimeout(room.id);
        room.engine.closeRoom(reason);

        this.rooms = this.rooms.filter(
            activeRoom => activeRoom.id !== room.id
        );

        await this.stateStore.deleteRoom(room.id);
        await this.stateStore.removeOpenRoom(room.id);

        room.players.forEach(roomPlayer => {
            const shouldNotify = this.isConnectedRealPlayer(roomPlayer);

            this.resetParticipantState(roomPlayer);

            if (roomPlayer.isBot) {
                return;
            }

            if (shouldNotify) {
                this.sendPlayer(roomPlayer, {
                    type: "room_closed",
                    reason: reason
                });
            }
        });

        this.resetBotCounterIfIdle();
    }

    resetBotCounterIfIdle() {
        const hasBots = this.rooms.some(room => {
            return room.players.some(player => player.isBot);
        });

        if (!hasBots) {
            this.botCounter = 1;
        }
    }

    getRealPlayers() {
        const players = [];
        const seen = new Set();

        const addPlayer = player => {
            if (
                player.isBot ||
                !player.ws ||
                player.ws.readyState !== 1 ||
                seen.has(player.id)
            ) {
                return;
            }

            seen.add(player.id);
            players.push(player);
        };

        this.rooms.forEach(room => {
            room.players.forEach(addPlayer);
        });

        return players;
    }

    broadcastDebugConfig() {
        const message = {
            type: "debug_config",
            config: this.getDebugConfig()
        };

        this.getRealPlayers().forEach(player => {
            this.sendPlayer(player, message);
        });
    }

    getDebugConfig() {
        return {
            debugBotsEnabled: GameConfig.debugBotsEnabled,
            debugBotCount: GameConfig.debugBotCount,
            debugBotStrategy: GameConfig.debugBotStrategy,
            debugStartLevel: GameConfig.debugStartLevel,
            debugBotDelayMin: GameConfig.debugBotDelayMin,
            debugBotDelayMax: GameConfig.debugBotDelayMax,
            placementCooldown: GameConfig.placementCooldown,
            quickChatCooldownMs: GameConfig.quickChatCooldownMs,
            towerStabilityFeedbackMode: GameConfig.towerStabilityFeedbackMode,
            levelTimeLimitMs: GameConfig.levelTimeLimitMs,
            startDelayMs: GameConfig.startDelayMs,
            placementScorePopupDurationMs: GameConfig.placementScorePopupDurationMs,
            finishScorePopupDurationMs: GameConfig.finishScorePopupDurationMs,
            levelSummaryDelayMs: GameConfig.levelSummaryDelayMs,
            impactScoreRequirement: GameConfig.impactScoreRequirement,
            impactMinContributionShare:
                GameConfig.impactMinContributionShare,
            impactInterval: GameConfig.impactInterval,
            targetHeightMultiplier: GameConfig.targetHeightMultiplier,
            levelSupplyMinSurplus: GameConfig.levelSupplyMinSurplus,
            levelSupplyMaxSurplus: GameConfig.levelSupplyMaxSurplus,
            minPrecisionBlocksPerLevel: GameConfig.minPrecisionBlocksPerLevel,
            maxTeamCarryOverBlocks: GameConfig.maxTeamCarryOverBlocks,
            refreshMinUsefulBlockHeight: GameConfig.refreshMinUsefulBlockHeight,
            towerStabilityDifficulty: GameConfig.towerStabilityDifficulty,
            towerMaxTiltAngleDeg: GameConfig.towerMaxTiltAngleDeg,
            towerSiteSlendernessTarget: GameConfig.towerSiteSlendernessTarget,
            towerSiteWidthMin: GameConfig.towerSiteWidthMin,
            towerSiteWidthMax: GameConfig.towerSiteWidthMax,
            supplyEffectiveWidthRatio: GameConfig.supplyEffectiveWidthRatio,
            towerStabilityWarningThreshold:
                GameConfig.towerStabilityWarningThreshold,
            towerStabilityCriticalThreshold:
                GameConfig.towerStabilityCriticalThreshold,
            towerStabilityMoodThreshold:
                GameConfig.towerStabilityMoodThreshold,
            powerUnlockLevel: GameConfig.powerUnlockLevel,
            powerMaxSlots: GameConfig.powerMaxSlots,
            powerActivationCooldownMs: GameConfig.powerActivationCooldownMs,
            powerReplenishPileShare: GameConfig.powerReplenishPileShare,
            placementScorePerHeight: GameConfig.scoring.placementScorePerHeight,
            placementStabilityFloor: GameConfig.scoring.placementStabilityFloor,
            reinforceScorePerIntegrity:
                GameConfig.scoring.reinforceScorePerIntegrity,
            reinforceScorePerLean: GameConfig.scoring.reinforceScorePerLean,
            finisherBonusPerLevel: GameConfig.scoring.finisherBonusPerLevel,
            precisionBonusPerLevel: GameConfig.scoring.precisionBonusPerLevel,
            teamExactBonusPerLevel: GameConfig.scoring.teamExactBonusPerLevel,
            assistBonusPerLevel: GameConfig.scoring.assistBonusPerLevel,
            assistContributionThreshold:
                GameConfig.scoring.assistContributionThreshold,
            visualHookImpactBeat: GameConfig.visualHooks.impactBeat,
            visualHookScreenShake: GameConfig.visualHooks.screenShake,
            visualHookZoomOutMs: GameConfig.visualHooks.impactBeatZoomOutMs,
            visualHookWaveMs: GameConfig.visualHooks.impactBeatWaveMs,
            visualHookHoldMs: GameConfig.visualHooks.impactBeatHoldMs,
            visualHookShakeMs: GameConfig.visualHooks.screenShakeMs
        };
    }

    applyDefaultDebugConfig() {
        GameConfig.debugBotsEnabled = DEFAULT_DEBUG_CONFIG.debugBotsEnabled;
        GameConfig.debugBotCount = DEFAULT_DEBUG_CONFIG.debugBotCount;
        GameConfig.debugBotStrategy = DEFAULT_DEBUG_CONFIG.debugBotStrategy;
        GameConfig.debugStartLevel = DEFAULT_DEBUG_CONFIG.debugStartLevel;
        GameConfig.debugBotDelayMin = DEFAULT_DEBUG_CONFIG.debugBotDelayMin;
        GameConfig.debugBotDelayMax = DEFAULT_DEBUG_CONFIG.debugBotDelayMax;
        GameConfig.placementCooldown = DEFAULT_DEBUG_CONFIG.placementCooldown;
        GameConfig.quickChatCooldownMs = DEFAULT_DEBUG_CONFIG.quickChatCooldownMs;
        GameConfig.towerStabilityFeedbackMode = DEFAULT_DEBUG_CONFIG.towerStabilityFeedbackMode;
        GameConfig.levelTimeLimitMs = DEFAULT_DEBUG_CONFIG.levelTimeLimitMs;
        GameConfig.startDelayMs = DEFAULT_DEBUG_CONFIG.startDelayMs;
        GameConfig.placementScorePopupDurationMs =
            DEFAULT_DEBUG_CONFIG.placementScorePopupDurationMs;
        GameConfig.finishScorePopupDurationMs =
            DEFAULT_DEBUG_CONFIG.finishScorePopupDurationMs;
        GameConfig.levelSummaryDelayMs =
            DEFAULT_DEBUG_CONFIG.levelSummaryDelayMs;
        GameConfig.impactScoreRequirement =
            DEFAULT_DEBUG_CONFIG.impactScoreRequirement;
        GameConfig.impactMinContributionShare =
            DEFAULT_DEBUG_CONFIG.impactMinContributionShare;
        GameConfig.impactInterval = DEFAULT_DEBUG_CONFIG.impactInterval;
        GameConfig.targetHeightMultiplier =
            DEFAULT_DEBUG_CONFIG.targetHeightMultiplier;
        GameConfig.levelSupplyMinSurplus =
            DEFAULT_DEBUG_CONFIG.levelSupplyMinSurplus;
        GameConfig.levelSupplyMaxSurplus =
            DEFAULT_DEBUG_CONFIG.levelSupplyMaxSurplus;
        GameConfig.minPrecisionBlocksPerLevel =
            DEFAULT_DEBUG_CONFIG.minPrecisionBlocksPerLevel;
        GameConfig.maxTeamCarryOverBlocks =
            DEFAULT_DEBUG_CONFIG.maxTeamCarryOverBlocks;
        GameConfig.refreshMinUsefulBlockHeight =
            DEFAULT_DEBUG_CONFIG.refreshMinUsefulBlockHeight;
        GameConfig.towerStabilityDifficulty =
            DEFAULT_DEBUG_CONFIG.towerStabilityDifficulty;
        GameConfig.towerMaxTiltAngleDeg = DEFAULT_DEBUG_CONFIG.towerMaxTiltAngleDeg;
        GameConfig.towerSiteSlendernessTarget =
            DEFAULT_DEBUG_CONFIG.towerSiteSlendernessTarget;
        GameConfig.towerSiteWidthMin = DEFAULT_DEBUG_CONFIG.towerSiteWidthMin;
        GameConfig.towerSiteWidthMax = DEFAULT_DEBUG_CONFIG.towerSiteWidthMax;
        GameConfig.supplyEffectiveWidthRatio =
            DEFAULT_DEBUG_CONFIG.supplyEffectiveWidthRatio;
        GameConfig.towerStabilityWarningThreshold =
            DEFAULT_DEBUG_CONFIG.towerStabilityWarningThreshold;
        GameConfig.towerStabilityCriticalThreshold =
            DEFAULT_DEBUG_CONFIG.towerStabilityCriticalThreshold;
        GameConfig.towerStabilityMoodThreshold =
            DEFAULT_DEBUG_CONFIG.towerStabilityMoodThreshold;
        GameConfig.powerUnlockLevel = DEFAULT_DEBUG_CONFIG.powerUnlockLevel;
        GameConfig.powerMaxSlots = DEFAULT_DEBUG_CONFIG.powerMaxSlots;
        GameConfig.powerActivationCooldownMs =
            DEFAULT_DEBUG_CONFIG.powerActivationCooldownMs;
        GameConfig.powerReplenishPileShare =
            DEFAULT_DEBUG_CONFIG.powerReplenishPileShare;
        GameConfig.scoring.placementScorePerHeight =
            DEFAULT_DEBUG_CONFIG.placementScorePerHeight;
        GameConfig.scoring.placementStabilityFloor =
            DEFAULT_DEBUG_CONFIG.placementStabilityFloor;
        GameConfig.scoring.reinforceScorePerIntegrity =
            DEFAULT_DEBUG_CONFIG.reinforceScorePerIntegrity;
        GameConfig.scoring.reinforceScorePerLean =
            DEFAULT_DEBUG_CONFIG.reinforceScorePerLean;
        GameConfig.scoring.finisherBonusPerLevel =
            DEFAULT_DEBUG_CONFIG.finisherBonusPerLevel;
        GameConfig.scoring.precisionBonusPerLevel =
            DEFAULT_DEBUG_CONFIG.precisionBonusPerLevel;
        GameConfig.scoring.teamExactBonusPerLevel =
            DEFAULT_DEBUG_CONFIG.teamExactBonusPerLevel;
        GameConfig.scoring.assistBonusPerLevel =
            DEFAULT_DEBUG_CONFIG.assistBonusPerLevel;
        GameConfig.scoring.assistContributionThreshold =
            DEFAULT_DEBUG_CONFIG.assistContributionThreshold;
        GameConfig.visualHooks.impactBeat =
            DEFAULT_DEBUG_CONFIG.visualHookImpactBeat;
        GameConfig.visualHooks.screenShake =
            DEFAULT_DEBUG_CONFIG.visualHookScreenShake;
        GameConfig.visualHooks.impactBeatZoomOutMs =
            DEFAULT_DEBUG_CONFIG.visualHookZoomOutMs;
        GameConfig.visualHooks.impactBeatWaveMs =
            DEFAULT_DEBUG_CONFIG.visualHookWaveMs;
        GameConfig.visualHooks.impactBeatHoldMs =
            DEFAULT_DEBUG_CONFIG.visualHookHoldMs;
        GameConfig.visualHooks.screenShakeMs =
            DEFAULT_DEBUG_CONFIG.visualHookShakeMs;
    }

    async resetDebugConfigToDefaults() {
        const previousBotsEnabled = GameConfig.debugBotsEnabled;
        const previousBotCount = GameConfig.debugBotCount;
        const previousStartLevel = GameConfig.debugStartLevel;

        this.applyDefaultDebugConfig();

        if (!GameConfig.debugBotsEnabled) {
            this.rooms.forEach(room => {
                room.engine.stopBots();
            });
        }

        if (
            previousBotsEnabled !== GameConfig.debugBotsEnabled ||
            previousBotCount !== GameConfig.debugBotCount
        ) {
            await this.refreshMatchmaking();
        }

        if (previousStartLevel !== GameConfig.debugStartLevel) {
            await this.restartRoomsAtDebugStartLevel();
        }

        this.broadcastDebugConfig();
    }

    async updateDebugConfig(key, value) {
        if (key === "resetDebugConfig") {
            await this.resetDebugConfigToDefaults();
            return true;
        }

        if (key === "restartLevel") {
            await this.restartRoomsAtCurrentLevel();
            return true;
        }

        const numberValue = Number(value);
        const clampInt = (currentValue, minValue, maxValue) => {
            const sourceValue =
                Number.isFinite(numberValue) ? numberValue : Number(currentValue);

            return Math.max(
                minValue,
                Math.min(maxValue, Math.floor(sourceValue))
            );
        };
        const clampNumber = (currentValue, minValue, maxValue) => {
            const sourceValue =
                Number.isFinite(numberValue) ? numberValue : Number(currentValue);

            return Math.max(
                minValue,
                Math.min(maxValue, sourceValue)
            );
        };
        const setGameInt = (configKey, minValue, maxValue) => () => {
            GameConfig[configKey] = clampInt(
                GameConfig[configKey],
                minValue,
                maxValue
            );
        };
        const setGameNumber = (configKey, minValue, maxValue) => () => {
            GameConfig[configKey] = clampNumber(
                GameConfig[configKey],
                minValue,
                maxValue
            );
        };
        const setScoringInt = (configKey, minValue, maxValue) => () => {
            GameConfig.scoring[configKey] = clampInt(
                GameConfig.scoring[configKey],
                minValue,
                maxValue
            );
        };
        const setScoringNumber = (configKey, minValue, maxValue) => () => {
            GameConfig.scoring[configKey] = clampNumber(
                GameConfig.scoring[configKey],
                minValue,
                maxValue
            );
        };
        const setVisualHookInt = (configKey, minValue, maxValue) => () => {
            GameConfig.visualHooks[configKey] = clampInt(
                GameConfig.visualHooks[configKey],
                minValue,
                maxValue
            );
        };
        const debugConfigSetters = {
            debugBotsEnabled: () => {
                GameConfig.debugBotsEnabled = Boolean(value);
            },
            debugBotCount: setGameInt("debugBotCount", 0, 2),
            debugBotStrategy: () => {
                const strategy = String(value);

                GameConfig.debugBotStrategy = ["cooperative", "mvp_greedy"].includes(strategy)
                    ? strategy
                    : GameConfig.debugBotStrategy;
            },
            debugStartLevel: setGameInt("debugStartLevel", 1, GameConfig.maxLevel),
            debugBotDelayMin: setGameInt("debugBotDelayMin", 250, 10000),
            debugBotDelayMax: setGameInt("debugBotDelayMax", 250, 10000),
            placementCooldown: setGameInt("placementCooldown", 0, 5000),
            quickChatCooldownMs: setGameInt("quickChatCooldownMs", 1000, 30000),
            towerStabilityFeedbackMode: () => {
                const mode = String(value);
                if (["warnings_only", "meter_only", "live_preview"].includes(mode)) {
                    GameConfig.towerStabilityFeedbackMode = mode;
                }
            },
            levelTimeLimitMs: setGameInt("levelTimeLimitMs", 5000, 120000),
            startDelayMs: setGameInt("startDelayMs", 0, 10000),
            placementScorePopupDurationMs:
                setGameInt("placementScorePopupDurationMs", 500, 10000),
            finishScorePopupDurationMs:
                setGameInt("finishScorePopupDurationMs", 500, 10000),
            levelSummaryDelayMs: setGameInt("levelSummaryDelayMs", 1000, 10000),
            impactScoreRequirement:
                setGameInt("impactScoreRequirement", 0, 1000000),
            impactMinContributionShare:
                setGameNumber("impactMinContributionShare", 0, 1),
            impactInterval: setGameInt("impactInterval", 1, 10),
            targetHeightMultiplier: setGameInt("targetHeightMultiplier", 1, 20),
            levelSupplyMinSurplus: setGameInt("levelSupplyMinSurplus", 0, 20),
            levelSupplyMaxSurplus: setGameInt("levelSupplyMaxSurplus", 0, 30),
            minPrecisionBlocksPerLevel: setGameInt("minPrecisionBlocksPerLevel", 0, 9),
            maxTeamCarryOverBlocks: setGameInt("maxTeamCarryOverBlocks", 0, 12),
            refreshMinUsefulBlockHeight: setGameInt("refreshMinUsefulBlockHeight", 1, 6),
            towerStabilityDifficulty:
                setGameInt("towerStabilityDifficulty", 0, 100),
            towerMaxTiltAngleDeg: setGameInt("towerMaxTiltAngleDeg", 5, 60),
            towerSiteSlendernessTarget:
                setGameNumber("towerSiteSlendernessTarget", 1, 12),
            towerSiteWidthMin: setGameInt("towerSiteWidthMin", 2, 8),
            towerSiteWidthMax: setGameInt("towerSiteWidthMax", 2, 8),
            supplyEffectiveWidthRatio:
                setGameNumber("supplyEffectiveWidthRatio", 0.1, 2),
            towerStabilityWarningThreshold:
                setGameInt("towerStabilityWarningThreshold", 0, 100),
            towerStabilityCriticalThreshold:
                setGameInt("towerStabilityCriticalThreshold", 0, 100),
            towerStabilityMoodThreshold:
                setGameInt("towerStabilityMoodThreshold", 1, 50),
            powerUnlockLevel: setGameInt("powerUnlockLevel", 1, GameConfig.maxLevel),
            powerMaxSlots: setGameInt("powerMaxSlots", 1, 6),
            powerActivationCooldownMs:
                setGameInt("powerActivationCooldownMs", 0, 30000),
            powerReplenishPileShare:
                setGameNumber("powerReplenishPileShare", 0, 1),
            placementScorePerHeight: setScoringInt("placementScorePerHeight", 1, 25),
            placementStabilityFloor:
                setScoringNumber("placementStabilityFloor", 0, 1),
            reinforceScorePerIntegrity:
                setScoringNumber("reinforceScorePerIntegrity", 0, 25),
            reinforceScorePerLean:
                setScoringNumber("reinforceScorePerLean", 0, 200),
            finisherBonusPerLevel: setScoringInt("finisherBonusPerLevel", 0, 25),
            precisionBonusPerLevel: setScoringInt("precisionBonusPerLevel", 0, 25),
            teamExactBonusPerLevel: setScoringInt("teamExactBonusPerLevel", 0, 25),
            assistBonusPerLevel: setScoringInt("assistBonusPerLevel", 0, 25),
            assistContributionThreshold:
                setScoringNumber("assistContributionThreshold", 0, 1),
            visualHookImpactBeat: () => {
                GameConfig.visualHooks.impactBeat = Boolean(value);
            },
            visualHookScreenShake: () => {
                GameConfig.visualHooks.screenShake = Boolean(value);
            },
            visualHookZoomOutMs: setVisualHookInt("impactBeatZoomOutMs", 100, 2000),
            visualHookWaveMs: setVisualHookInt("impactBeatWaveMs", 100, 2000),
            visualHookHoldMs: setVisualHookInt("impactBeatHoldMs", 0, 3000),
            visualHookShakeMs: setVisualHookInt("screenShakeMs", 0, 2000)
        };

        if (!debugConfigSetters[key]) {
            console.log("Rejected unknown debug config:", key);
            return false;
        }

        debugConfigSetters[key]();

        if (GameConfig.debugBotDelayMax < GameConfig.debugBotDelayMin) {
            GameConfig.debugBotDelayMax = GameConfig.debugBotDelayMin;
        }

        if (GameConfig.levelSupplyMaxSurplus < GameConfig.levelSupplyMinSurplus) {
            GameConfig.levelSupplyMaxSurplus = GameConfig.levelSupplyMinSurplus;
        }

        if (
            GameConfig.towerStabilityCriticalThreshold >
            GameConfig.towerStabilityWarningThreshold
        ) {
            GameConfig.towerStabilityCriticalThreshold =
                GameConfig.towerStabilityWarningThreshold;
        }

        if (key === "debugBotsEnabled" || key === "debugBotCount") {
            if (!GameConfig.debugBotsEnabled) {
                this.rooms.forEach(room => {
                    room.engine.stopBots();
                });
            }

            await this.refreshMatchmaking();
        }

        if (key === "debugStartLevel") {
            await this.restartRoomsAtDebugStartLevel();
        }

        this.broadcastDebugConfig();
        return true;
    }

    async restartRoomsAtDebugStartLevel() {
        await Promise.all(this.rooms.map(async room => {
            if (!room.engine?.room || room.engine.room.state === "closed") {
                return;
            }

            room.engine.restartAtConfiguredStartLevel();
            await this.stateStore.saveRoom(
                room,
                room.ownerPodId === this.stateStore.getPodId()
            );
        }));
    }

    async restartRoomsAtCurrentLevel() {
        await Promise.all(this.rooms.map(async room => {
            if (!room.engine?.room || room.engine.room.state === "closed") {
                return;
            }

            room.engine.restartAtLevel(room.engine.room.level, {
                resetScores: false
            });
            await this.stateStore.saveRoom(
                room,
                room.ownerPodId === this.stateStore.getPodId()
            );
        }));
    }

    createBot() {
        return {
            id: "BOT" + this.botCounter++,
            score: 0,
            lastPlacementTime: 0,
            isBot: true
        };
    }

    fillRoomWithBotsIfNeeded(room) {
        if (!GameConfig.debugBotsEnabled) {
            return;
        }

        const freeSlots = GameConfig.playersPerRoom - room.players.length;
        const desiredBotCount = Math.min(GameConfig.debugBotCount, Math.max(0, freeSlots));

        for (let i = 0; i < desiredBotCount; i++) {
            const bot = this.createBot();
            room.engine.initializePlayerForRoom(bot);
            room.readyPlayerIds.add(bot.id);
        }
    }

    async syncRoomBots(room) {
        const realCount = room.players.filter(player => !player.isBot).length;
        const currentBots = room.players.filter(player => player.isBot);
        const desiredBotCount = GameConfig.debugBotsEnabled
            ? Math.min(GameConfig.debugBotCount, Math.max(0, GameConfig.playersPerRoom - realCount))
            : 0;

        while (currentBots.length > desiredBotCount) {
            const bot = currentBots.pop();
            room.engine.removePlayerFromRoom(bot.id);
            room.readyPlayerIds.delete(bot.id);
        }

        while (currentBots.length < desiredBotCount) {
            const bot = this.createBot();
            room.engine.initializePlayerForRoom(bot);
            room.readyPlayerIds.add(bot.id);
            currentBots.push(bot);
        }

        if (room.players.length >= GameConfig.playersPerRoom) {
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
            await this.stateStore.removeOpenRoom(room.id);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, this.isRoomOwner(room));
        await this.broadcastLobbyUpdate(room);
    }

    async refreshMatchmaking() {
        for (const room of this.rooms) {
            if (room.matchStarted || room.players.length >= GameConfig.playersPerRoom) {
                continue;
            }

            if (!this.isRoomOwner(room)) {
                continue;
            }

            await this.syncRoomBots(room);
        }
    }

    async joinOrCreateRoom(player) {
        await this.stateStore.withMatchmakingLock(async () => {
            const room = await this.claimOpenRoom();

            if (room) {
                await this.addPlayerToRoom(room, player);
            } else {
                await this.createRoom([player]);
            }
        });
    }

    async claimOpenRoom() {
        const attemptedIds = new Set();

        for (let attempts = 0; attempts < MAX_OPEN_ROOM_CLAIM_ATTEMPTS; attempts++) {
            const roomId = await this.stateStore.claimOpenRoomId();

            if (roomId === null) {
                return null;
            }

            if (attemptedIds.has(roomId)) {
                await this.stateStore.markRoomOpen(roomId);
                return null;
            }

            attemptedIds.add(roomId);

            const localRoom =
                this.rooms.find(activeRoom => String(activeRoom.id) === String(roomId));

            if (localRoom) {
                if (
                    this.isRoomOwner(localRoom) &&
                    !localRoom.matchStarted &&
                    localRoom.players.length < GameConfig.playersPerRoom
                ) {
                    return localRoom;
                }

                continue;
            }

            const snapshot = await this.stateStore.getRoom(roomId);

            if (!snapshot || snapshot.matchStarted || (snapshot.players || []).length >= GameConfig.playersPerRoom) {
                continue;
            }

            if (snapshot.ownerPodId !== this.stateStore.getPodId()) {
                await this.stateStore.markRoomOpen(roomId);
                continue;
            }

            const room = await this.hydrateRoom(roomId);

            if (room && !room.matchStarted && room.players.length < GameConfig.playersPerRoom) {
                return room;
            }
        }

        return null;
    }

    async addPlayerToRoom(room, player) {
        player.room = room;
        room.engine.initializePlayerForRoom(player);
        this.connectedPlayers.set(player.id, player);

        if (room.players.length >= GameConfig.playersPerRoom) {
            await this.stateStore.removeOpenRoom(room.id);
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, this.isRoomOwner(room));

        const payload = await this.buildRoomJoinedPayload(room);

        this.sendPlayer(player, {
            ...payload,
            playerId: player.id,
            reconnectToken: player.sessionId,
            reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
            blocks: player.blocks
        });

        await this.broadcastLobbyUpdate(room);
    }

    async createRoom(roomPlayers) {
        const engine = this.createEngine();
        engine.createRoom([]);

        const room = {
            id: await this.stateStore.nextRoomId(),
            ownerPodId: this.stateStore.getPodId(),
            players: engine.room.players,
            engine: engine
        };

        engine.room.id = room.id;

        room.matchStarted = false;
        room.readyPlayerIds = new Set();
        room.lobbyDeadlineAt = 0;

        roomPlayers.forEach(player => {
            player.room = room;
            engine.initializePlayerForRoom(player);

            if (player.isBot) {
                room.readyPlayerIds.add(player.id);
            } else {
                this.connectedPlayers.set(player.id, player);
            }
        });

        this.rooms.push(room);
        await this.subscribeRoom(room.id);

        this.fillRoomWithBotsIfNeeded(room);

        if (room.players.length >= GameConfig.playersPerRoom) {
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
            await this.stateStore.removeOpenRoom(room.id);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, true);

        console.log(`Room ${room.id} created with ${room.players.length} players`);

        const payload = await this.buildRoomJoinedPayload(room);

        for (const player of roomPlayers) {
            if (player.isBot) {
                continue;
            }

            this.sendPlayer(player, {
                ...payload,
                playerId: player.id,
                reconnectToken: player.sessionId,
                reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
                blocks: player.blocks
            });
        }
    }

    async buildRoomJoinedPayload(room) {
        const engine = room.engine;
        const roster = await this.buildRoomRoster(room);

        return {
            type: "room_created",
            roomId: room.id,
            level: engine.room.level,
            targetHeight: engine.room.targetHeight,
            impactScoreStatus: engine.getImpactScoreStatus(),
            activeInventorySlots: engine.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            drawPileCount: (engine.room.drawPile || []).length,
            nextDrawBlock: engine.getNextDrawBlock(),
            roster: roster,
            matchStarted: false,
            lobby: this.buildLobbyPayload(room)
        };
    }

    getLobbySecondsRemaining(room) {
        if (!room || !room.lobbyDeadlineAt) {
            return 0;
        }

        return Math.max(
            0,
            Math.ceil((room.lobbyDeadlineAt - Date.now()) / 1000)
        );
    }

    buildLobbyPayload(room) {
        return {
            readyPlayerIds: Array.from(room.readyPlayerIds || []),
            readySecondsRemaining: this.getLobbySecondsRemaining(room),
            timerActive: Boolean(room.lobbyDeadlineAt)
        };
    }

    async broadcastLobbyUpdate(room) {
        const payload = {
            type: "lobby_update",
            roomId: room.id,
            roster: await this.buildRoomRoster(room),
            ...this.buildLobbyPayload(room)
        };

        room.players.forEach(roomPlayer => {
            if (this.isConnectedRealPlayer(roomPlayer)) {
                this.sendPlayer(roomPlayer, payload);
            }
        });
    }

    async toggleLobbyReady(player) {
        const room = player.room;

        if (!room || room.matchStarted) {
            return;
        }

        if (room.readyPlayerIds.has(player.id)) {
            room.readyPlayerIds.delete(player.id);
        } else {
            room.readyPlayerIds.add(player.id);
        }

        await this.broadcastLobbyUpdate(room);

        const isFull = room.players.length >= GameConfig.playersPerRoom;
        const allReady = isFull && room.players.every(
            roomPlayer => room.readyPlayerIds.has(roomPlayer.id)
        );

        if (allReady) {
            await this.startMatch(room);
        }
    }

    async startMatch(room) {
        if (room.matchStarted) {
            return;
        }

        room.matchStarted = true;
        this.cancelLobbyReadyTimeout(room.id);

        const engine = room.engine;

        engine.startLevel();

        await this.stateStore.saveRoom(
            room,
            room.ownerPodId === this.stateStore.getPodId()
        );

        const roster = await this.buildRoomRoster(room);

        for (const player of room.players) {
            if (player.isBot) {
                continue;
            }

            this.sendPlayer(player, {
                type: "match_started",
                playerId: player.id,
                roomId: room.id,
                level: engine.room.level,
                targetHeight: engine.room.targetHeight,
                impactScoreStatus: engine.getImpactScoreStatus(),
                activeInventorySlots: engine.getBlocksPerPlayer(),
                maxActiveBlocks: GameConfig.maxActiveBlocks,
                blocks: player.blocks,
                drawPileCount: (engine.room.drawPile || []).length,
                nextDrawBlock: engine.getNextDrawBlock(),
                roster: roster
            });
        }

        engine.broadcastGameState();
    }

    async leaveLobby(player) {
        const room = player.room;

        if (!room || room.matchStarted) {
            return;
        }

        await this.evictLobbyPlayer(room, player, "player_left_lobby");
    }

    async evictLobbyPlayer(room, player, reason, notifyLeaver = false) {
        room.engine.removePlayerFromRoom(player.id);
        room.readyPlayerIds.delete(player.id);
        this.resetParticipantState(player);

        if (!player.isBot && notifyLeaver) {
            this.sendPlayer(player, { type: "room_closed", reason: reason });
        }

        const hasRealPlayer = room.players.some(roomPlayer => !roomPlayer.isBot);

        if (room.players.length === 0 || !hasRealPlayer) {
            await this.closeRoom(room, reason);
            return;
        }

        room.readyPlayerIds = new Set(
            room.players.filter(roomPlayer => roomPlayer.isBot).map(roomPlayer => roomPlayer.id)
        );
        this.cancelLobbyReadyTimeout(room.id);
        room.lobbyDeadlineAt = 0;

        await this.stateStore.markRoomOpen(room.id);
        await this.stateStore.saveRoom(room, this.isRoomOwner(room));
        await this.broadcastLobbyUpdate(room);
    }

    scheduleLobbyReadyTimeout(room) {
        if (!room || this.roomLobbyTimers.has(room.id)) {
            return;
        }

        const remainingMs = room.lobbyDeadlineAt
            ? Math.max(0, room.lobbyDeadlineAt - Date.now())
            : GameConfig.lobbyReadyTimeoutMs;

        const timer = setTimeout(() => {
            this.handleLobbyReadyTimeout(room.id).catch(error => {
                console.error("Lobby ready timeout handling failed:", error.message);
            });
        }, remainingMs);

        if (timer.unref) {
            timer.unref();
        }

        this.roomLobbyTimers.set(room.id, timer);
    }

    cancelLobbyReadyTimeout(roomId) {
        const timer = this.roomLobbyTimers.get(roomId);

        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.roomLobbyTimers.delete(roomId);
    }

    async handleLobbyReadyTimeout(roomId) {
        this.roomLobbyTimers.delete(roomId);

        const room =
            this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room || room.matchStarted) {
            return;
        }

        const notReadyPlayers = room.players.filter(
            roomPlayer => !room.readyPlayerIds.has(roomPlayer.id)
        );

        for (const notReadyPlayer of notReadyPlayers) {
            await this.evictLobbyPlayer(room, notReadyPlayer, "lobby_timeout", true);
        }
    }

    async buildRoomRoster(room) {
        return Promise.all(room.players.map(async (player, seatIndex) => {
            const profile = await this.profileStore.getProfile(
                player.profileId, seatIndex, player.displayName
            );
            return {
                id: player.id,
                isBot: Boolean(player.isBot),
                displayName: profile.displayName,
                avatarId: profile.avatarId
            };
        }));
    }

    createEngine() {
        return new GameEngine({
            onRoomChanged: async engineRoom => {
                const room =
                    this.rooms.find(activeRoom => activeRoom.id === engineRoom.id);

                if (room) {
                    await this.stateStore.saveRoom(
                        room,
                        room.ownerPodId === this.stateStore.getPodId()
                    );
                }
            },
            onRoomMessage: async (roomId, message) => {
                await this.stateStore.publishRoom(roomId, message);
            },
            onLevelOutcome: async outcome => {
                await this.stateStore.recordDemoOutcome(outcome);
            }
        });
    }

    async hydrateRoom(roomId) {
        const snapshot = await this.stateStore.getRoom(roomId);

        if (!snapshot) {
            return null;
        }

        const runtimePlayers = snapshot.players.map(player => {
            const connected = this.connectedPlayers.get(player.id);
            return {
                ...stripRuntimePlayer(player),
                ws: connected?.ws || null,
                room: null
            };
        });

        const leaseOwner = await this.stateStore.getRoomLeaseOwner(roomId);
        const canOwnTimers =
            !leaseOwner ||
            leaseOwner === this.stateStore.getPodId() ||
            await this.stateStore.claimRoomLease(roomId);

        const engine = this.createEngine();
        const room = {
            id: snapshot.id,
            ownerPodId: canOwnTimers
                ? this.stateStore.getPodId()
                : snapshot.ownerPodId,
            players: runtimePlayers,
            engine: engine,
            matchStarted: Boolean(snapshot.matchStarted),
            readyPlayerIds: new Set(snapshot.readyPlayerIds || []),
            lobbyDeadlineAt: snapshot.lobbyDeadlineAt || 0
        };

        runtimePlayers.forEach(player => {
            player.room = room;
        });

        if (!room.matchStarted && canOwnTimers) {
            this.scheduleLobbyReadyTimeout(room);
        }

        if (canOwnTimers) {
            engine.hydrateRoom(snapshot, runtimePlayers);
        } else {
            engine.room = {
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
                teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
                towerBlocks: snapshot.state.towerBlocks || [],
                state: snapshot.state.state,
                startsAt: snapshot.state.startsAt,
                endsAt: snapshot.state.endsAt,
                lastLevelSummary: snapshot.state.lastLevelSummary,
                pendingScoreEvents: [],
                scoreEventSeq: 0
            };
        }

        this.rooms.push(room);
        await this.subscribeRoom(room.id);
        return room;
    }

    async subscribeRoom(roomId) {
        await this.stateStore.subscribeToRoom(roomId, message => {
            if (message.sourcePodId === this.stateStore.getPodId()) {
                return;
            }

            const room =
                this.rooms.find(activeRoom => activeRoom.id === roomId);

            if (!room) {
                return;
            }

            room.players.forEach(player => {
                if (!player.isBot) {
                    this.sendPlayer(player, message);
                }
            });
        });

        await this.stateStore.subscribeToRoomActions(roomId, message => {
            if (message.sourcePodId === this.stateStore.getPodId()) {
                return;
            }

            const room =
                this.rooms.find(activeRoom => activeRoom.id === roomId);

            if (!room || !this.isRoomOwner(room)) {
                return;
            }

            this.runRoomAction(room, message.playerId, message.action);
        });
    }

    isRoomOwner(room) {
        return room.ownerPodId === this.stateStore.getPodId();
    }

    async dispatchRoomAction(player, action) {
        const room = player.room;

        if (!room) {
            return;
        }

        if (this.isRoomOwner(room)) {
            this.runRoomAction(room, player.id, action);
            return;
        }

        await this.stateStore.publishRoomAction(room.id, {
            playerId: player.id,
            action
        });
    }

    runRoomAction(room, playerId, action) {
        switch (action.type) {
            case "place_block":
                room.engine.placeBlock(
                    playerId, action.blockIndex, action.column, action.originY
                );
                return;

            case "activate_power":
                room.engine.activatePower(playerId, action.slot);
                return;

            case "send_quick_chat": {
                const player =
                    room.players.find(candidate => candidate.id === playerId);

                if (player) {
                    room.engine.queueQuickChat(player, action.slot);
                }

                return;
            }
        }
    }
}

module.exports = LobbyManager;
