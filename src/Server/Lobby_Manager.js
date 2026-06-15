// Lobby_Manager.js

const GameEngine = require("./Game_Engine");
const GameConfig = require("./Game_Config");
const { RedisState, stripRuntimePlayer } = require("./Redis_State");

class LobbyManager {
    constructor(stateStore = new RedisState()) {
        this.stateStore = stateStore;
        this.waitingPlayers = [];
        this.rooms = [];
        this.connectedPlayers = new Map();
        this.roomReconnectTimers = new Map();
        this.botCounter = 1;
    }

    async start() {
        await this.stateStore.connect();
        console.log(
            `Lobby state: ${this.stateStore.enabled ? "Redis" : "memory"} (${this.stateStore.getPodId()})`
        );
    }

    // =========================
    // PLAYER MANAGEMENT
    // =========================

    async createPlayer(ws, reconnectRequest = {}) {
        const existingSession =
            await this.stateStore.getSession(reconnectRequest.reconnectToken);

        if (
            existingSession &&
            existingSession.playerId === reconnectRequest.playerId
        ) {
            const player = {
                id: existingSession.playerId,
                sessionId: existingSession.sessionId,
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
        this.waitingPlayers.push(player);
        await this.stateStore.enqueuePlayer(player);

        console.log(`${player.id} added to queue`);
        await this.tryCreateRoom();
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
        player.room = room;
        this.cancelRoomReconnectExpiry(room.id);

        await this.stateStore.saveSession({
            sessionId: player.sessionId,
            reconnectToken: player.sessionId,
            playerId: player.id,
            roomId: room.id,
            connected: true
        });

        this.sendPlayer(player, {
            type: "room_resumed",
            playerId: player.id,
            reconnectToken: player.sessionId,
            reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
            roomId: room.id,
            level: room.engine.room.level,
            targetHeight: room.engine.room.targetHeight,
            blocks: roomPlayer.blocks || []
        });

        room.engine.broadcastGameState();
    }

    async removePlayer(player) {
        await this.stateStore.removeQueuedPlayer(player.id);
        this.waitingPlayers = this.waitingPlayers.filter(
            waitingPlayer => waitingPlayer.id !== player.id
        );
        this.connectedPlayers.delete(player.id);

        await this.stateStore.markSessionDisconnected(player);

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
                console.log("Reconnect expiry handling failed:", error.message);
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
        player.contributedHeight = player.contributedHeight || 0;
        player.refreshTokens = player.refreshTokens || 0;
        player.refreshUsesThisLevel = player.refreshUsesThisLevel || 0;
        player.blocks = player.blocks || [];
        player.carryOverBlocks = player.carryOverBlocks || [];
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

    async closeRoom(room, reason, disconnectedPlayer = null) {
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
        room.engine.closeRoom(reason);

        this.rooms = this.rooms.filter(
            activeRoom => activeRoom.id !== room.id
        );

        await this.stateStore.deleteRoom(room.id);

        const playersToRequeue = [];

        room.players.forEach(roomPlayer => {
            const shouldRequeue =
                this.isConnectedRealPlayer(roomPlayer) &&
                roomPlayer.id !== disconnectedPlayer?.id;

            this.resetParticipantState(roomPlayer);

            if (roomPlayer.isBot) {
                return;
            }

            if (shouldRequeue) {
                this.sendPlayer(roomPlayer, {
                    type: "room_closed",
                    reason: reason
                });

                playersToRequeue.push(roomPlayer);
            }
        });

        this.removeWaitingBots();

        for (const roomPlayer of playersToRequeue) {
            this.waitingPlayers.push(roomPlayer);
            await this.stateStore.enqueuePlayer(roomPlayer);
        }

        this.resetBotCounterIfIdle();
        await this.tryCreateRoom();
    }

    resetBotCounterIfIdle() {
        const hasBots =
            this.waitingPlayers.some(player => player.isBot) ||
            this.rooms.some(room => {
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

        this.waitingPlayers.forEach(addPlayer);
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
            debugBotDelayMin: GameConfig.debugBotDelayMin,
            debugBotDelayMax: GameConfig.debugBotDelayMax,
            placementCooldown: GameConfig.placementCooldown,
            levelTimeLimitMs: GameConfig.levelTimeLimitMs,
            startDelayMs: GameConfig.startDelayMs,
            targetHeightMultiplier: GameConfig.targetHeightMultiplier
        };
    }

    async updateDebugConfig(key, value) {
        const numberValue = Number(value);
        const debugConfigSetters = {
            debugBotsEnabled: () => Boolean(value),
            debugBotCount: () => Math.max(0, Math.min(2, Math.floor(numberValue))),
            debugBotDelayMin: () => Math.max(250, Math.floor(numberValue)),
            debugBotDelayMax: () => Math.max(250, Math.floor(numberValue)),
            placementCooldown: () => Math.max(0, Math.floor(numberValue)),
            levelTimeLimitMs: () => Math.max(5000, Math.floor(numberValue)),
            startDelayMs: () => Math.max(0, Math.floor(numberValue)),
            targetHeightMultiplier: () => Math.max(1, Math.floor(numberValue))
        };

        if (!debugConfigSetters[key]) {
            console.log("Rejected unknown debug config:", key);
            return false;
        }

        GameConfig[key] = debugConfigSetters[key]();

        if (GameConfig.debugBotDelayMax < GameConfig.debugBotDelayMin) {
            GameConfig.debugBotDelayMax = GameConfig.debugBotDelayMin;
        }

        if (key === "debugBotsEnabled" || key === "debugBotCount") {
            if (!GameConfig.debugBotsEnabled) {
                this.rooms.forEach(room => {
                    room.engine.stopBots();
                });
            }

            await this.refreshMatchmaking();
        }

        this.broadcastDebugConfig();
        return true;
    }

    // =========================
    // BOT CREATION
    // =========================

    createBot() {
        return {
            id: "BOT" + this.botCounter++,
            score: 0,
            lastPlacementTime: 0,
            isBot: true
        };
    }

    fillQueueWithBotsIfNeeded() {
        if (!GameConfig.debugBotsEnabled) {
            this.removeWaitingBots();
            return;
        }

        const realWaitingPlayers =
            this.waitingPlayers.filter(player => !player.isBot);

        if (realWaitingPlayers.length === 0) {
            this.removeWaitingBots();
            return;
        }

        const desiredBotCount = Math.min(
            GameConfig.debugBotCount,
            Math.max(0, 3 - realWaitingPlayers.length)
        );

        this.syncWaitingBots(desiredBotCount);
    }

    removeWaitingBots() {
        this.waitingPlayers = this.waitingPlayers.filter(
            player => !player.isBot
        );
    }

    syncWaitingBots(desiredBotCount) {
        let waitingBots =
            this.waitingPlayers.filter(player => player.isBot);

        while (waitingBots.length > desiredBotCount) {
            const bot = waitingBots.pop();

            this.waitingPlayers = this.waitingPlayers.filter(
                player => player.id !== bot.id
            );
        }

        while (waitingBots.length < desiredBotCount) {
            const bot = this.createBot();

            this.waitingPlayers.push(bot);
            waitingBots.push(bot);
        }
    }

    async refreshMatchmaking() {
        this.fillQueueWithBotsIfNeeded();
        await this.tryCreateRoom();
    }

    // =========================
    // ROOM CREATION
    // =========================

    async tryCreateRoom() {
        await this.stateStore.withMatchmakingLock(async () => {
            const sharedQueue = await this.stateStore.getQueuedPlayers();

            this.waitingPlayers = sharedQueue.map(player => {
                const connected = this.connectedPlayers.get(player.id);

                if (connected) {
                    Object.assign(connected, {
                        ...player,
                        ws: connected.ws
                    });
                    return connected;
                }

                return {
                    ...player,
                    ws: null
                };
            });

            this.fillQueueWithBotsIfNeeded();

            if (this.waitingPlayers.length < 3) {
                await this.stateStore.replaceQueue(this.waitingPlayers);
                return;
            }

            const roomPlayers = this.waitingPlayers.splice(0, 3);
            await this.stateStore.replaceQueue(this.waitingPlayers);
            await this.createRoom(roomPlayers);
        });
    }

    async createRoom(roomPlayers) {
        const engine = this.createEngine();
        const room = {
            id: await this.stateStore.nextRoomId(),
            ownerPodId: this.stateStore.getPodId(),
            players: roomPlayers,
            engine: engine
        };

        roomPlayers.forEach(player => {
            player.room = room;
            if (!player.isBot) {
                this.connectedPlayers.set(player.id, player);
            }
        });

        engine.createRoom(roomPlayers);
        engine.room.id = room.id;
        engine.startLevel();

        this.rooms.push(room);
        await this.stateStore.saveRoom(room, true);
        await this.subscribeRoom(room.id);

        console.log(`Room ${room.id} created with ${roomPlayers.length} players`);

        roomPlayers.forEach(player => {
            if (player.isBot) {
                return;
            }

            this.sendPlayer(player, {
                type: "room_created",
                playerId: player.id,
                reconnectToken: player.sessionId,
                reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
                roomId: room.id,
                level: engine.room.level,
                targetHeight: engine.room.targetHeight,
                blocks: player.blocks
            });
        });

        engine.broadcastGameState();
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
            engine: engine
        };

        runtimePlayers.forEach(player => {
            player.room = room;
        });

        if (canOwnTimers) {
            engine.hydrateRoom(snapshot, runtimePlayers);
        } else {
            engine.room = {
                id: snapshot.id,
                players: runtimePlayers,
                level: snapshot.state.level,
                checkpointLevel: snapshot.state.checkpointLevel,
                targetHeight: snapshot.state.targetHeight,
                currentHeight: snapshot.state.currentHeight,
                towerBlocks: snapshot.state.towerBlocks || [],
                state: snapshot.state.state,
                startsAt: snapshot.state.startsAt,
                endsAt: snapshot.state.endsAt,
                lastLevelSummary: snapshot.state.lastLevelSummary
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
    }
}

module.exports = LobbyManager;
