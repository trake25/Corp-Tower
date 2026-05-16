// Lobby_Manager.js

const GameEngine = require("./Game_Engine");

class LobbyManager {

    constructor() {

        this.waitingPlayers = [];

        this.rooms = [];

        this.roomIdCounter = 1;

        this.queue = [];
    }

    addPlayer(player) {

        this.waitingPlayers.push(player);

        console.log(
            `${player.id} added to queue`
        );

        console.log(
            `Queue Size: ${this.waitingPlayers.length}`
        );

        this.tryCreateRoom();
    }

    removePlayer(player) {

        this.queue =
            this.queue.filter(
                p => p !== player
            );

        console.log(
            `${player.id} removed from queue`
        );

        console.log(
            "Queue Size:",
            this.queue.length
        );

    }

    tryCreateRoom() {

        if (this.waitingPlayers.length < 3) {
            return;
        }

        // Take first 3 players
        const roomPlayers =
            this.waitingPlayers.splice(0, 3);

        // Create game engine
        const engine = new GameEngine();

        // Create room
        const room = {

            id: this.roomIdCounter,

            players: roomPlayers,

            engine: engine

        };

        roomPlayers.forEach(player => {

            player.room = room;

        });

        this.roomIdCounter++;

        // Initialize game
        engine.createRoom(roomPlayers);

        engine.startLevel();

        // Save room
        this.rooms.push(room);

        console.log(
            `Room ${room.id} created`
        );

        // Send room info to players
        roomPlayers.forEach(player => {

            player.ws.send(JSON.stringify({

                type: "room_created",

                playerId: player.id,

                roomId: room.id,

                level: engine.room.level,

                targetHeight:
                    engine.room.targetHeight,

                blocks: player.blocks

            }));

        });

    }

}

module.exports = LobbyManager;