// server.js

const WebSocket = require("ws");

const LobbyManager = require("./Lobby_Manager");

// Create ONE lobby manager
const lobbyManager = new LobbyManager();

// Create websocket server
const wss = new WebSocket.Server({
    port: 3000
});

console.log("WebSocket server running on port 3000");

// When player connects
wss.on("connection", function connection(ws) {

    console.log("Player connected");

    ws.on("message", function incoming(message) {

        console.log("Received:", message.toString());

    });

});