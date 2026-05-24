// Lobby_Manager.js

const GameEngine = require("./Game_Engine");

const GameConfig = require("./Game_Config");

const BotManager = require("./Bot_Manager");

class LobbyManager {

    constructor() {

        this.waitingPlayers = [];

        this.rooms = [];

        this.roomIdCounter = 1;

        this.queue = [];

        this.botCounter = 1;

        this.debugBotsEnabled = false;
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

        if (!this.queue) {

            this.queue = [];

        }

        this.queue =
            this.queue.filter(
                p => p.id !== player.id
            );

        this.waitingPlayers =
            this.waitingPlayers.filter(
                p => p.id !== player.id
            );

        console.log(
            `${player.id} removed`
        );

    }

    createDebugBots() {

        let bots = [];

        for (
            let i = 0;
            i <
            GameConfig
                .debugBotCount;
            i++
        ) {

            bots.push({

                id:
                    "BOT"
                    +
                    this.botCounter++,

                score: 0,

                lastPlacementTime: 0,

                isBot: true

            });

        }

        return bots;

    }

    refreshMatchmaking() {

        console.log(
            "Refreshing matchmaking..."
        );

        this.tryCreateRoom();

    }

    tryCreateRoom() {

        let roomPlayers =
            this.waitingPlayers.splice(
                0,
                3
            );

        if (
            GameConfig
                .debugBotsEnabled
        ) {

            const needed =
                3 -
                roomPlayers.length;

            if (
                needed > 0
            ) {

                roomPlayers =
                    roomPlayers.concat(

                        this
                            .createDebugBots()
                            .slice(
                                0,
                                needed
                            )

                    );

            }

        }

        if (
            roomPlayers.length
            < 3
        ) {
            return;
        }

        const engine =
            new GameEngine();

        const room = {

            id:
                this.roomIdCounter,

            players:
                roomPlayers,

            engine:
                engine

        };

        roomPlayers
            .forEach(player => {

                player.room =
                    room;

            });

        this.roomIdCounter++;

        engine
            .createRoom(
                roomPlayers
            );

        engine.startLevel();

        BotManager.startBots(
            engine
        );

        this.rooms.push(
            room
        );

        console.log(
            `Room ${room.id} created`
        );

        roomPlayers
            .forEach(player => {

                if (
                    player.isBot
                ) {
                    return;
                }

                player.ws.send(
                    JSON.stringify({

                        type:
                            "room_created",

                        playerId:
                            player.id,

                        roomId:
                            room.id,

                        level:
                            engine
                                .room
                                .level,

                        targetHeight:

                            engine
                                .room
                                .targetHeight,

                        blocks:
                            player.blocks

                    }));

            });

        engine.broadcastGameState();

    }

}

module.exports = LobbyManager;