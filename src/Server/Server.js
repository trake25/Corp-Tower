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

let playerCounter = 1;

wss.on("connection", function connection(ws) {

    const player = {

        id: "P" + playerCounter,

        ws: ws,

        score: 0
    };

    playerCounter++;

    console.log(
        `${player.id} connected`
    );

    // Add to matchmaking queue
    lobbyManager.addPlayer(player);

    ws.on("close", function () {

        console.log(
            `${player.id} disconnected`
        );

    });

});