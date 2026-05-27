// Lobby_Manager.js

const GameEngine = require("./Game_Engine");
const GameConfig = require("./Game_Config");

class LobbyManager {
    constructor() {
        this.waitingPlayers = [];
        this.rooms = [];

        this.roomIdCounter = 1;
        this.botCounter = 1;

        this.debugBotsEnabled = false;
    }

    // =========================
    // PLAYER MANAGEMENT
    // =========================

    addPlayer(player) {
        this.resetParticipantState(player);
        this.waitingPlayers.push(player);

        console.log(`${player.id} added to queue`);
        console.log(`Queue Size: ${this.waitingPlayers.length}`);

        this.tryCreateRoom();
    }

    removePlayer(player) {
        this.waitingPlayers = this.waitingPlayers.filter(
            p => p.id !== player.id
        );

        if (
            !player.room &&
            this.waitingPlayers.every(waitingPlayer => waitingPlayer.isBot)
        ) {
            this.removeWaitingBots();
        }

        if (player.room) {
            this.closeRoom(
                player.room,
                `${player.id}_disconnected`,
                player
            );
        }

        player.room = null;
        this.resetBotCounterIfIdle();

        console.log(`${player.id} removed from queue`);
    }

    resetParticipantState(player) {
        player.score = 0;
        player.levelScore = 0;
        player.contributedHeight = 0;
        player.refreshTokens = 0;
        player.refreshUsesThisLevel = 0;
        player.blocks = [];
        player.carryOverBlocks = [];
        player.lastPlacementTime = 0;
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

    closeRoom(room, reason, disconnectedPlayer = null) {
        if (!room) {
            return;
        }

        const existingRoom =
            this.rooms.find(activeRoom => activeRoom.id === room.id);

        if (!existingRoom) {
            return;
        }

        console.log(`Closing room ${room.id}: ${reason}`);

        room.engine.closeRoom(reason);

        this.rooms = this.rooms.filter(
            activeRoom => activeRoom.id !== room.id
        );

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
                roomPlayer.ws.send(JSON.stringify({
                    type: "room_closed",
                    reason: reason
                }));

                playersToRequeue.push(roomPlayer);
            }
        });

        this.removeWaitingBots();

        playersToRequeue.forEach(roomPlayer => {
            this.waitingPlayers.push(roomPlayer);
        });

        if (
            this.rooms.length === 0 &&
            this.waitingPlayers.every(waitingPlayer => !waitingPlayer.isBot)
        ) {
            this.resetBotCounterIfIdle();
        }

        this.tryCreateRoom();
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

        if (
            !hasBots &&
            this.rooms.length === 0 &&
            this.waitingPlayers.length === 0
        ) {
            this.roomIdCounter = 1;
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
        const message = JSON.stringify({
            type: "debug_config",
            config: this.getDebugConfig()
        });

        this.getRealPlayers().forEach(player => {
            player.ws.send(message);
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

    updateDebugConfig(key, value) {
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

        console.log("CONFIG UPDATED:", key, GameConfig[key]);

        if (
            key === "debugBotsEnabled" ||
            key === "debugBotCount"
        ) {
            if (!GameConfig.debugBotsEnabled) {
                this.rooms.forEach(room => {
                    room.engine.stopBots();
                });
            }

            this.refreshMatchmaking();
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

    // =========================
    // MATCHMAKING ENTRY POINT
    // =========================

    refreshMatchmaking() {
        console.log("Refreshing matchmaking...");

        this.fillQueueWithBotsIfNeeded();
        this.tryCreateRoom();
    }

    // =========================
    // ROOM CREATION
    // =========================

    tryCreateRoom() {
        // Ensure we always have enough players BEFORE creating a room
        this.fillQueueWithBotsIfNeeded();

        if (this.waitingPlayers.length < 3) {
            return;
        }

        const roomPlayers = this.waitingPlayers.splice(0, 3);

        const engine = new GameEngine();

        const room = {
            id: this.roomIdCounter++,
            players: roomPlayers,
            engine: engine
        };

        // Attach room reference to players
        roomPlayers.forEach(player => {
            player.room = room;
        });

        // Initialize game engine
        engine.createRoom(roomPlayers);
        engine.startLevel();

        this.rooms.push(room);

        console.log(`Room ${room.id} created with ${roomPlayers.length} players`);

        // Notify only real players
        roomPlayers.forEach(player => {
            if (player.isBot) return;

            player.ws.send(JSON.stringify({
                type: "room_created",
                playerId: player.id,
                roomId: room.id,
                level: engine.room.level,
                targetHeight: engine.room.targetHeight,
                blocks: player.blocks
            }));
        });

        // Sync game state
        engine.broadcastGameState();
    }
}

module.exports = LobbyManager;
