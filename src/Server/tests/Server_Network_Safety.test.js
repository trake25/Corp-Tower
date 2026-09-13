const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const WebSocket = require("ws");

const GameEngine = require("../app/Game_Engine");
const LobbyManager = require("../app/Lobby_Manager");
const { RedisState } = require("../app/Redis_State");
const { handleMessage, listenServer, wireConnection } = require("../app/Server");

class FakeSocket extends EventEmitter {
    constructor() {
        super();
        this.readyState = WebSocket.OPEN;
        this.closeCalls = [];
        this.sent = [];
        this.sendError = null;
    }

    send(payload, callback) {
        if (this.sendError === "throw") {
            throw new Error("send failed");
        }

        this.sent.push(JSON.parse(payload));
        if (this.sendError === "callback") {
            callback(new Error("send callback failed"));
        }
    }

    close(code, reason) {
        this.closeCalls.push({ code, reason });
        this.readyState = WebSocket.CLOSED;
        this.emit("close");
    }
}

function flush() {
    return new Promise(resolve => setImmediate(resolve));
}

async function settle() {
    await flush();
    await flush();
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
}

function createManager(options = {}) {
    const calls = {
        add: 0,
        create: 0,
        remove: 0
    };
    const player = options.player || {
        id: "P-safe",
        connectionId: "connection-safe",
        ws: options.ws || null
    };

    return {
        calls,
        manager: {
            profileStore: {
                getAuthoritativeProfile: async () => ({
                    displayName: "Safe Player",
                    avatarId: "default",
                    nameChangeUsed: false
                })
            },
            createPlayer: async ws => {
                calls.create += 1;
                player.ws = ws;
                if (options.onCreate) {
                    options.onCreate(ws, player);
                }
                return player;
            },
            addPlayer: async (...args) => {
                calls.add += 1;
                if (options.addPlayer) {
                    return await options.addPlayer(...args);
                }
            },
            broadcastDebugConfig: () => {},
            removePlayer: async () => {
                calls.remove += 1;
                if (options.removePlayer) {
                    return await options.removePlayer();
                }
            }
        },
        player
    };
}

function openGameplayConnection(options = {}) {
    const socket = new FakeSocket();
    const { calls, manager, player } = createManager({ ...options, ws: socket });
    const connection = wireConnection(socket, {
        accountStore: { resolve: async () => null },
        authVerifier: {
            isRequired: () => false,
            verifyAccessToken: async () => null
        },
        lobbyManager: manager,
        ...options.dependencies
    });
    return { calls, connection, manager, player, socket };
}

function createMemoryLobby() {
    const stateStore = new RedisState();
    stateStore.enabled = false;
    return { lobby: new LobbyManager(stateStore), stateStore };
}

function openLobbyConnection(lobby, socket, request = {}) {
    const connection = wireConnection(socket, {
        accountStore: { resolve: async () => null },
        authVerifier: {
            isRequired: () => false,
            verifyAccessToken: async () => null
        },
        lobbyManager: lobby
    });
    socket.emit("message", JSON.stringify(request));
    return connection;
}

test("accepted sockets install an immediate error boundary", async () => {
    const { calls, socket } = openGameplayConnection();

    assert.equal(socket.listenerCount("error"), 1);
    socket.emit("error", new Error("transport failed"));
    await settle();

    assert.equal(socket.closeCalls.length, 1);
    assert.equal(calls.remove, 0);
});

test("HTTP listen failures reject through the startup path", async () => {
    const server = new EventEmitter();
    server.listen = () => {
        queueMicrotask(() => server.emit("error", new Error("port unavailable")));
    };

    await assert.rejects(listenServer(server, 3000), /port unavailable/);
});

test("handshake, gameplay, profile, and close failures stay within their connection", async () => {
    const handshakeSocket = new FakeSocket();
    wireConnection(handshakeSocket, {
        accountStore: { resolve: async () => null },
        authVerifier: {
            isRequired: () => false,
            verifyAccessToken: async () => {
                throw new Error("auth store unavailable");
            }
        },
        lobbyManager: createManager().manager
    });
    handshakeSocket.emit("message", "{}");
    await settle();
    assert.equal(handshakeSocket.closeCalls.length, 1);

    const gameplay = openGameplayConnection({
        dependencies: {
            handleMessage: async () => {
                throw new Error("gameplay handler failed");
            }
        }
    });
    gameplay.socket.emit("message", "{}");
    await settle();
    gameplay.socket.emit("message", JSON.stringify({ type: "ready" }));
    await settle();
    assert.equal(gameplay.socket.closeCalls.length, 1);
    assert.equal(gameplay.calls.remove, 1);

    const profileSocket = new FakeSocket();
    const profileManager = createManager().manager;
    wireConnection(profileSocket, {
        accountStore: {
            resolve: async () => ({ userId: "profile-safe" })
        },
        authVerifier: {
            isRequired: () => true,
            verifyAccessToken: async () => ({ kind: "guest" })
        },
        handleProfileMessage: async () => {
            throw new Error("profile handler failed");
        },
        lobbyManager: profileManager
    });
    profileSocket.emit("message", JSON.stringify({ type: "profile_connect" }));
    await settle();
    profileSocket.emit("message", JSON.stringify({ type: "profile_change_name" }));
    await settle();
    assert.equal(profileSocket.closeCalls.length, 1);

    const cleanup = openGameplayConnection({
        removePlayer: async () => {
            throw new Error("disconnect persistence failed");
        }
    });
    cleanup.socket.emit("message", "{}");
    await settle();
    cleanup.socket.emit("close");
    cleanup.socket.emit("close");
    await settle();
    assert.equal(cleanup.calls.remove, 1);
});

test("close during a handshake cannot create a ghost player", async () => {
    const verification = deferred();
    const socket = new FakeSocket();
    const { calls, manager } = createManager();

    wireConnection(socket, {
        accountStore: { resolve: async () => null },
        authVerifier: {
            isRequired: () => false,
            verifyAccessToken: async () => await verification.promise
        },
        lobbyManager: manager
    });
    socket.emit("message", "{}");
    await flush();
    socket.emit("close");
    verification.resolve(null);
    await settle();

    assert.equal(calls.create, 0);
    assert.equal(calls.add, 0);
    assert.equal(calls.remove, 0);
});

test("a close after player creation receives exactly one cleanup without matchmaking", async () => {
    const socket = new FakeSocket();
    const { calls, manager } = createManager({
        onCreate: ws => ws.emit("close")
    });

    wireConnection(socket, {
        accountStore: { resolve: async () => null },
        authVerifier: {
            isRequired: () => false,
            verifyAccessToken: async () => null
        },
        lobbyManager: manager
    });
    socket.emit("message", "{}");
    await settle();

    assert.equal(calls.create, 1);
    assert.equal(calls.add, 0);
    assert.equal(calls.remove, 1);
});

test("a close during matchmaking invalidates the room-entry guard before cleanup", async () => {
    const matchmaking = deferred();
    let isActive = null;
    const connection = openGameplayConnection({
        addPlayer: async (_player, options) => {
            isActive = options.isActive;
            await matchmaking.promise;
        }
    });

    connection.socket.emit("message", "{}");
    await settle();
    assert.equal(connection.calls.add, 1);

    connection.socket.emit("close");
    await settle();
    assert.equal(connection.calls.remove, 0);
    assert.equal(isActive(), false);

    matchmaking.resolve();
    await settle();
    assert.equal(connection.calls.remove, 1);
});

test("a retired socket cannot create a public or private room while entry is pending", async () => {
    for (const request of [
        {},
        { entryMode: "private_create", privatePassword: "1234" }
    ]) {
        const { lobby, stateStore } = createMemoryLobby();
        const roomId = deferred();
        stateStore.nextRoomId = async () => await roomId.promise;
        const socket = new FakeSocket();

        openLobbyConnection(lobby, socket, request);
        await settle();
        socket.emit("close");
        roomId.resolve(101);
        await settle();

        assert.equal(lobby.rooms.length, 0);
        assert.equal(lobby.connectedPlayers.size, 0);
        assert.equal(stateStore.memoryOpenRooms.size, 0);
        assert.equal(stateStore.memoryPrivateInvites.size, 0);
        assert.equal(socket.sent.some(message => message.type === "room_created"), false);
    }
});

test("a close after public membership begins rolls back the abandoned room", async () => {
    const { lobby, stateStore } = createMemoryLobby();
    const enteredPersistence = deferred();
    const releasePersistence = deferred();
    const saveRoom = stateStore.saveRoom.bind(stateStore);
    let delayed = false;
    stateStore.saveRoom = async room => {
        if (!delayed) {
            delayed = true;
            enteredPersistence.resolve();
            await releasePersistence.promise;
        }
        return await saveRoom(room);
    };
    const socket = new FakeSocket();

    openLobbyConnection(lobby, socket);
    await enteredPersistence.promise;
    assert.equal(lobby.rooms.length, 1);
    assert.equal(lobby.rooms[0].players.filter(player => !player.isBot).length, 1);

    socket.emit("close");
    releasePersistence.resolve();
    await settle();
    await settle();

    assert.equal(lobby.rooms.length, 0);
    assert.equal(lobby.connectedPlayers.size, 0);
    assert.equal(stateStore.memoryRooms.size, 0);
    assert.equal(stateStore.memoryOpenRooms.size, 0);
    assert.equal(socket.sent.some(message => message.type === "room_created"), false);
});

test("failed close cleanup remains retryable without double completion", async () => {
    let attempts = 0;
    const connection = openGameplayConnection({
        removePlayer: async () => {
            attempts += 1;
            if (attempts === 1) {
                throw new Error("disconnect persistence failed");
            }
        }
    });

    connection.socket.emit("message", "{}");
    await settle();
    connection.socket.emit("close");
    await settle();
    assert.equal(attempts, 1);

    await connection.connection.cleanup();
    assert.equal(attempts, 2);
    await connection.connection.cleanup();
    assert.equal(attempts, 2);
});

test("session cleanup retry preserves a superseding connection", async () => {
    const { lobby, stateStore } = createMemoryLobby();
    const oldPlayer = await lobby.createPlayer(new FakeSocket(), {});
    const markSessionDisconnected = stateStore.markSessionDisconnected.bind(stateStore);
    let attempts = 0;
    stateStore.markSessionDisconnected = async (player, options) => {
        attempts += 1;
        if (attempts === 1) {
            throw new Error("session persistence failed");
        }
        return await markSessionDisconnected(player, options);
    };

    await assert.rejects(lobby.removePlayer(oldPlayer), /session persistence failed/);
    assert.equal(lobby.connectedPlayers.get(oldPlayer.id), oldPlayer);

    const replacement = await lobby.createPlayer(new FakeSocket(), {
        playerId: oldPlayer.id,
        reconnectToken: oldPlayer.sessionId
    });
    await lobby.removePlayer(oldPlayer);

    assert.equal(lobby.connectedPlayers.get(oldPlayer.id), replacement);
    assert.equal((await stateStore.getSession(oldPlayer.sessionId)).connectionId, replacement.connectionId);
    assert.equal((await stateStore.getSession(oldPlayer.sessionId)).connected, true);
    assert.equal(attempts, 1);
});

test("the release syntax gate retains Placement and Socket Transport", () => {
    const packageJson = JSON.parse(fs.readFileSync(
        path.join(__dirname, "..", "package.json"), "utf8"
    ));
    const releaseCheck = packageJson.scripts["check:release"];

    assert.match(releaseCheck, /node --check app\/engine\/Placement\.js/);
    assert.match(releaseCheck, /node --check app\/Socket_Transport\.js/);
});

test("stale latency requests do not send through superseded sockets", async () => {
    const socket = new FakeSocket();
    const player = { id: "P-stale", ws: socket };

    await handleMessage(player, JSON.stringify({
        type: "latency_ping",
        nonce: "old-connection"
    }), {
        lobbyManager: {
            isCurrentPlayerConnection: async () => false
        }
    });

    assert.deepEqual(socket.sent, []);
});

test("game state broadcast survives socket send failures and room publish rejection", async () => {
    const failedSocket = new FakeSocket();
    failedSocket.sendError = "throw";
    const callbackFailureSocket = new FakeSocket();
    callbackFailureSocket.sendError = "callback";
    const healthySocket = new FakeSocket();
    const engine = new GameEngine({
        onRoomMessage: async () => {
            throw new Error("Redis publish failed");
        }
    });

    engine.createRoom([
        { id: "P-failed", ws: failedSocket },
        { id: "P-callback", ws: callbackFailureSocket },
        { id: "P-healthy", ws: healthySocket }
    ]);
    engine.room.id = "network-safety";
    engine.broadcastGameState();
    await settle();

    assert.equal(healthySocket.sent.length, 1);
    assert.equal(healthySocket.sent[0].type, "game_state");
    engine.clearTimers();
});

test("Redis subscribers drop malformed input and contain consumer rejections", async () => {
    const state = new RedisState();
    const handlers = new Map();
    state.enabled = true;
    state.subscriber = {
        subscribe: async (channel, handler) => handlers.set(channel, handler)
    };

    await state.subscribeToRoom("room-safe", () => {
        throw new Error("room handler should not receive malformed input");
    });
    await state.subscribeToRoomActions("room-safe", () => {
        throw new Error("action handler should not receive malformed input");
    });
    await state.subscribeToPlayerAssignments(async () => {
        throw new Error("assignment rejection");
    });

    handlers.get("room:room-safe:events")("{");
    handlers.get("room:room-safe:actions")("{");
    handlers.get("player:assignments")("{");
    handlers.get("player:assignments")(JSON.stringify({ playerId: "P-safe" }));
    await settle();

    assert.equal(handlers.size, 3);
});
