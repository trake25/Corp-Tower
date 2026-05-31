// Server.js

const WebSocket = require("ws");

const LobbyManager = require("./Lobby_Manager");

const lobbyManager = new LobbyManager();

const port = Number(process.env.PORT) || 3000;

const wss = new WebSocket.Server({ port });

console.log(`WebSocket server running on port ${port}`);

let availableIds = [

    "P1",
    "P2",
    "P3",

];

wss.on("connection", function connection(ws) {

    const player = {

        id: availableIds.shift(),

        ws: ws,

        score: 0,

        lastPlacementTime: 0

    };

    console.log(
        `${player.id} connected`
    );

    // Add to matchmaking queue
    lobbyManager.addPlayer(player);
    lobbyManager.broadcastDebugConfig();

    ws.on("message", function incoming(message) {

        let data;

        try {
            data = JSON.parse(message.toString());
        } catch (error) {
            console.log("Invalid message JSON:", error.message);
            return;
        }

        console.log(
            `${player.id} sent:`,
            data.type
        );

        // Update GameConfig via Debug Menu
        if (data.type === "update_config") {

            lobbyManager.updateDebugConfig(data.key, data.value);

            return;
        }

        // PLACE BLOCK
        if (data.type === "place_block") {

            if (!player.room) {

                console.log(
                    "Player has no room"
                );

                return;
            }

            player.room.engine.placeBlock(player.id, data.blockIndex);

        }

        // REFRESH BLOCKS
        if (data.type === "refresh_blocks") {

            if (!player.room) {

                console.log(
                    "Player has no room"
                );

                return;
            }

            player.room.engine.refreshBlocks(player.id);

        }

    });

    ws.on("close", function () {

        console.log(
            `${player.id} disconnected`
        );

        lobbyManager.removePlayer(
            player
        );

        if (player.id) {

            availableIds.push(
                player.id
            );

            availableIds.sort();

        }

    });

});
