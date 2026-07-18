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

async function main() {
    await lobbyManager.start();

    const wss = new WebSocket.Server({ port });

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

    if (data.type === "place_block") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        player.room.engine.placeBlock(player.id, data.blockIndex);
        return;
    }

    if (data.type === "send_quick_chat") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        player.room.engine.queueQuickChat(player, data.slot);
        return;
    }

    if (data.type === "activate_power" && player.room) {
        player.room.engine.activatePower(player.id, data.slot, data.targetPlayerId);
    }
}

main().catch(error => {
    console.error("Server failed to start:", error);
    process.exit(1);
});
