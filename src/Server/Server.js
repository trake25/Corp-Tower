// server.js

const WebSocket = require("ws");

const LobbyManager =
    require("./Lobby_Manager");

const lobbyManager =
    new LobbyManager();

const wss = new WebSocket.Server({
    port: 3000
});

console.log(
    "WebSocket server running on port 3000"
);

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

    ws.on("message", function incoming(message) {

        const data =
            JSON.parse(message.toString());

        console.log(
            `${player.id} sent:`,
            data.type
        );

        // PLACE BLOCK
        if (data.type === "place_block") {

            if (!player.room) {

                console.log(
                    "Player has no room"
                );

                return;
            }

            player.room.engine.placeBlock(
                player.id
            );

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