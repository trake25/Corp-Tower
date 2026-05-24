// Lobby_Manager.js

const GameEngine = require("./Game_Engine");
const GameConfig = require("./Game_Config");
const BotManager = require("./Bot_Manager");

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
        this.waitingPlayers.push(player);

        console.log(`${player.id} added to queue`);
        console.log(`Queue Size: ${this.waitingPlayers.length}`);

        this.tryCreateRoom();
    }

    removePlayer(player) {
        this.waitingPlayers = this.waitingPlayers.filter(
            p => p.id !== player.id
        );

        console.log(`${player.id} removed from queue`);
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
            return;
        }

        while (this.waitingPlayers.length < 3) {
            this.waitingPlayers.push(this.createBot());
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

        // Start bot AI (if any bots exist in room)
        BotManager.startBots(engine);

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