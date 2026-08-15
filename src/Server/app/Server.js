const http = require("http");
const WebSocket = require("ws");

const LobbyManager = require("./Lobby_Manager");

const lobbyManager = new LobbyManager();

const port = Number(process.env.PORT) || 3000;

function safeJson(message) {
    try {
        return JSON.parse(message.toString());
    } catch (error) {
        console.log("Invalid message JSON:", error.message);
        return null;
    }
}

async function handleStatsRequest(req, res) {
    const stats = await lobbyManager.stateStore.getDemoStats();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
}

function requestListener(req, res) {
    if (req.method === "GET" && req.url === "/api/stats/demo") {
        handleStatsRequest(req, res).catch(error => {
            console.error("Stats request failed:", error.message);
            res.writeHead(500);
            res.end();
        });
        return;
    }

    res.writeHead(404);
    res.end();
}

async function main() {
    await lobbyManager.start();

    const server = http.createServer(requestListener);
    const wss = new WebSocket.Server({ server });

    server.listen(port);

    console.log(`WebSocket server running on port ${port}`);

    wss.on("connection", async function connection(ws) {
        let player = null;

        ws.once("message", async function firstMessage(message) {
            const data = safeJson(message) || {};
            const reconnectRequest =
                data.type === "reconnect" ? data : {};

            player = await lobbyManager.createPlayer(ws, reconnectRequest);

            console.log(`${player.id} connected`);

            if (!reconnectRequest.reconnectToken || !player.room) {
                await lobbyManager.addPlayer(player);
            }

            lobbyManager.broadcastDebugConfig();

            ws.on("message", async function incoming(nextMessage) {
                await handleMessage(player, nextMessage);
            });
        });

        ws.on("close", async function () {
            if (!player) {
                return;
            }

            console.log(`${player.id} disconnected`);
            await lobbyManager.removePlayer(player);
        });
    });
}

async function handleMessage(player, message) {
    const data = safeJson(message);

    if (!data) {
        return;
    }

    console.log(`${player.id} sent:`, data.type);

    if (data.type === "update_config") {
        await lobbyManager.updateDebugConfig(data.key, data.value);
        return;
    }

    if (data.type === "leave_queue") {
        await lobbyManager.leaveQueue(player);
        return;
    }

    if (data.type === "ready") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.markPlayerReady(player);
        return;
    }

    if (data.type === "leave_lobby") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.leaveLobby(player);
        return;
    }

    if (data.type === "place_block") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.dispatchRoomAction(player, {
            type: "place_block",
            blockIndex: data.blockIndex,
            column: data.column,
            originY: data.originY
        });
        return;
    }

    if (data.type === "send_quick_chat") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.dispatchRoomAction(player, {
            type: "send_quick_chat",
            slot: data.slot
        });
        return;
    }

    if (data.type === "activate_power" && player.room) {
        await lobbyManager.dispatchRoomAction(player, {
            type: "activate_power",
            slot: data.slot
        });
    }
}

main().catch(error => {
    console.error("Server failed to start:", error);
    process.exit(1);
});
