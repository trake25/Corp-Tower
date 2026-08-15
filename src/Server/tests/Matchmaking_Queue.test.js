const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const LobbyManager = require("../app/Lobby_Manager");
const { stripRuntimeRoom } = require("../app/Redis_State");

const activeLobbies = [];

afterEach(() => {
    activeLobbies.forEach(lobby => {
        lobby.rooms.forEach(room => {
            room.engine.clearTimers();
        });
        lobby.roomLobbyTimers.forEach(timer => clearTimeout(timer));
        lobby.roomLobbyTimers.clear();
        lobby.roomReconnectTimers.forEach(timer => clearTimeout(timer));
        lobby.roomReconnectTimers.clear();
    });
    activeLobbies.length = 0;
});

function createFakeWs() {
    return {
        readyState: 1,
        sentMessages: [],
        send(raw) {
            this.sentMessages.push(JSON.parse(raw));
        }
    };
}

function stripForQueue(player) {
    return {
        id: player.id,
        sessionId: player.sessionId || null,
        profileId: player.profileId || null,
        isBot: Boolean(player.isBot),
        score: player.score || 0,
        levelScore: player.levelScore || 0,
        scoreBreakdown: player.scoreBreakdown || {},
        contributedHeight: player.contributedHeight || 0,
        blocks: player.blocks || [],
        lastPlacementTime: player.lastPlacementTime || 0,
        lastQuickChatTime: player.lastQuickChatTime || 0,
        powerInventory: player.powerInventory || [],
        lastPowerActivationTime: player.lastPowerActivationTime || 0,
        scoreCap: player.scoreCap || null,
        botLoopLevel: player.botLoopLevel || null
    };
}

function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

// Simulates two server pods sharing one Redis-backed matchmaking queue, with
// real async gaps (via tick()) between read/write steps so that concurrent
// joins actually get a chance to interleave, the way real network I/O would.
function createSharedFakeCluster() {
    const shared = {
        queue: [],
        sessions: new Map(),
        rooms: new Map(),
        playerCounter: 1,
        roomCounter: 1,
        lockChain: Promise.resolve(),
        assignmentSubscribers: []
    };

    function makeStore(podId) {
        return {
            enabled: true,
            async connect() {},
            getPodId() {
                return podId;
            },
            getReconnectTtlSeconds() {
                return 60;
            },
            createReconnectToken() {
                return `${podId}-${Math.random().toString(16).slice(2)}`;
            },
            async nextPlayerId() {
                await tick();
                return `P${shared.playerCounter++}`;
            },
            async nextRoomId() {
                await tick();
                return shared.roomCounter++;
            },
            async saveSession(session) {
                await tick();
                shared.sessions.set(session.sessionId, { ...session });
                return session;
            },
            async getSession(sessionId) {
                await tick();
                return sessionId ? (shared.sessions.get(sessionId) || null) : null;
            },
            async markSessionDisconnected() {},
            async enqueuePlayer(player) {
                const payload = stripForQueue(player);
                await tick();
                shared.queue.push(payload);
            },
            async removeQueuedPlayer(playerId) {
                await tick();
                shared.queue = shared.queue.filter(entry => entry.id !== playerId);
            },
            async getQueuedPlayers() {
                await tick();
                return [...shared.queue];
            },
            async dequeueRealPlayers(maxCount) {
                await tick();
                return shared.queue.splice(0, maxCount);
            },
            async requeuePlayers(players) {
                if (players.length === 0) {
                    return;
                }
                await tick();
                shared.queue.unshift(...players.map(stripForQueue));
            },
            async withMatchmakingLock(callback) {
                const run = shared.lockChain.then(() => callback());
                shared.lockChain = run.then(() => {}, () => {});
                return run;
            },
            async saveRoom(room) {
                const payload = JSON.parse(JSON.stringify(stripRuntimeRoom(room)));
                await tick();
                shared.rooms.set(payload.id, payload);
                return payload;
            },
            async claimRoomLease() {
                return true;
            },
            async getRoomLeaseOwner() {
                return null;
            },
            async getRoom(roomId) {
                await tick();
                return shared.rooms.get(roomId) || null;
            },
            async deleteRoom(roomId) {
                shared.rooms.delete(roomId);
            },
            async publishRoom() {},
            async subscribeToRoom() {},
            async publishRoomAction() {},
            async subscribeToRoomActions() {},
            async publishPlayerAssignment(playerId, roomId) {
                await tick();
                shared.assignmentSubscribers.forEach(subscriber => {
                    if (subscriber.podId === podId) {
                        return;
                    }
                    subscriber.handler({ playerId, roomId, sourcePodId: podId });
                });
            },
            async subscribeToPlayerAssignments(handler) {
                shared.assignmentSubscribers.push({ podId, handler });
            }
        };
    }

    return { makeStore };
}

// Brings three players on one pod all the way to a formed room, which now means
// a room sitting in the ready-up lobby rather than a live match.
async function createLobbyOfThree() {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const sockets = [createFakeWs(), createFakeWs(), createFakeWs()];
    const players = [];

    for (const ws of sockets) {
        players.push(await lobby.createPlayer(ws, {}));
    }

    for (const player of players) {
        await lobby.addPlayer(player);
    }

    for (let i = 0; i < 10; i++) {
        await tick();
    }

    return { lobby, players, sockets, room: players[0].room };
}

function messagesOfType(ws, type) {
    return ws.sentMessages.filter(message => message.type === type);
}

test("a formed room waits in the lobby instead of starting the match", async () => {
    const { room, sockets } = await createLobbyOfThree();

    assert.ok(room, "three players should have formed a room");
    assert.equal(room.matchStarted, false);
    assert.equal(room.engine.room.state, "waiting");

    sockets.forEach(ws => {
        const created = messagesOfType(ws, "room_created");
        assert.equal(created.length, 1);
        assert.equal(created[0].matchStarted, false);
        assert.deepEqual(created[0].lobby.readyPlayerIds, []);
        assert.ok(
            created[0].lobby.readySecondsRemaining > 0,
            "the lobby should ship a positive ready countdown"
        );
        assert.equal(
            messagesOfType(ws, "match_started").length,
            0,
            "no match should start before anyone is ready"
        );
    });
});

test("the match starts only once the last player readies up", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.markPlayerReady(players[0]);
    await lobby.markPlayerReady(players[1]);

    assert.equal(room.matchStarted, false);
    sockets.forEach(ws => {
        assert.equal(messagesOfType(ws, "match_started").length, 0);
        assert.equal(messagesOfType(ws, "lobby_update").length, 2);
    });

    const lastUpdate = messagesOfType(sockets[0], "lobby_update").pop();
    assert.equal(lastUpdate.readyPlayerIds.length, 2);

    await lobby.markPlayerReady(players[2]);

    assert.equal(room.matchStarted, true);
    assert.notEqual(room.engine.room.state, "waiting");

    sockets.forEach((ws, index) => {
        const started = messagesOfType(ws, "match_started");
        assert.equal(started.length, 1, "each player is told the match started once");
        assert.equal(started[0].playerId, players[index].id);
        assert.equal(started[0].roster.length, 3);
    });

    assert.equal(
        lobby.roomLobbyTimers.has(room.id),
        false,
        "starting the match disarms the ready timeout"
    );
});

test("readying up twice does not start the match early", async () => {
    const { lobby, players, room } = await createLobbyOfThree();

    await lobby.markPlayerReady(players[0]);
    await lobby.markPlayerReady(players[0]);
    await lobby.markPlayerReady(players[0]);

    assert.equal(room.matchStarted, false);
    assert.equal(room.readyPlayerIds.size, 1);
});

test("a lobby timeout sends everyone home instead of requeueing them", async () => {
    const { lobby, sockets, room } = await createLobbyOfThree();

    await lobby.handleLobbyReadyTimeout(room.id);

    sockets.forEach(ws => {
        const closed = messagesOfType(ws, "room_closed");
        assert.equal(closed.length, 1);
        assert.equal(closed[0].reason, "lobby_timeout");
    });

    assert.equal(
        lobby.waitingPlayers.length,
        0,
        "a timed-out lobby must not silently requeue its players"
    );
    assert.equal(lobby.rooms.length, 0);
    assert.equal(lobby.roomLobbyTimers.has(room.id), false);
});

test("leaving the lobby requeues the others and stays silent to the leaver", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.leaveLobby(players[0]);

    assert.equal(
        messagesOfType(sockets[0], "room_closed").length,
        0,
        "the leaver navigates locally and gets no room_closed"
    );

    [sockets[1], sockets[2]].forEach(ws => {
        const closed = messagesOfType(ws, "room_closed");
        assert.equal(closed.length, 1);
        assert.equal(closed[0].reason, "player_left_lobby");
    });

    const requeuedIds = lobby.waitingPlayers.map(player => player.id);
    assert.deepEqual(requeuedIds.sort(), [players[1].id, players[2].id].sort());
    assert.equal(requeuedIds.includes(players[0].id), false);

    assert.equal(lobby.rooms.length, 0);
    assert.equal(
        lobby.roomLobbyTimers.has(room.id),
        false,
        "leaving must not leak the ready timeout"
    );
});

test("dropping the socket during ready-up breaks the room immediately", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    sockets[0].readyState = 3;
    await lobby.removePlayer(players[0]);

    assert.equal(
        lobby.roomReconnectTimers.has(room.id),
        false,
        "the reconnect grace window belongs to started matches, not the lobby"
    );

    [sockets[1], sockets[2]].forEach(ws => {
        const closed = messagesOfType(ws, "room_closed");
        assert.equal(closed.length, 1);
        assert.equal(closed[0].reason, "player_left_lobby");
    });

    assert.equal(lobby.rooms.length, 0);
});

test("queue status reports real waiting players against the room size", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const wsA = createFakeWs();
    const playerA = await lobby.createPlayer(wsA, {});
    await lobby.addPlayer(playerA);

    const first = messagesOfType(wsA, "queue_status").pop();
    assert.equal(first.playersWaiting, 1);
    assert.equal(first.playersNeeded, 3);

    const wsB = createFakeWs();
    const playerB = await lobby.createPlayer(wsB, {});
    await lobby.addPlayer(playerB);

    const second = messagesOfType(wsB, "queue_status").pop();
    assert.equal(second.playersWaiting, 2);

    await lobby.leaveQueue(playerB);

    const afterLeave = messagesOfType(wsA, "queue_status").pop();
    assert.equal(afterLeave.playersWaiting, 1);
});

test("reconnecting mid-lobby resumes the ready state without a stray game_state", async () => {
    const { lobby, players, room } = await createLobbyOfThree();

    await lobby.markPlayerReady(players[1]);

    const rejoinWs = createFakeWs();
    players[0].ws = rejoinWs;

    await lobby.resumePlayer(players[0], room.id);

    const resumed = messagesOfType(rejoinWs, "room_resumed");
    assert.equal(resumed.length, 1);
    assert.equal(resumed[0].matchStarted, false);
    assert.deepEqual(resumed[0].lobby.readyPlayerIds, [players[1].id]);
    assert.equal(
        messagesOfType(rejoinWs, "game_state").length,
        0,
        "a client sitting in the lobby has no game to render yet"
    );
});

test("bots are pre-readied so a debug room only waits on its real player", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    await lobby.updateDebugConfig("debugBotsEnabled", true);
    await lobby.updateDebugConfig("debugBotCount", 2);

    const ws = createFakeWs();
    const player = await lobby.createPlayer(ws, {});
    await lobby.addPlayer(player);

    for (let i = 0; i < 10; i++) {
        await tick();
    }

    const room = player.room;
    assert.ok(room, "one real player plus two bots should form a room");

    const bots = room.players.filter(roomPlayer => roomPlayer.isBot);
    assert.equal(bots.length, 2);
    bots.forEach(bot => {
        assert.ok(
            room.readyPlayerIds.has(bot.id),
            "a bot cannot tap Ready, so it must start ready"
        );
    });

    assert.equal(room.matchStarted, false);

    await lobby.markPlayerReady(player);

    assert.equal(
        room.matchStarted,
        true,
        "the real player's tap is the only one the room is waiting on"
    );

    await lobby.updateDebugConfig("debugBotsEnabled", false);
    await lobby.updateDebugConfig("debugBotCount", 0);
});

test("players who join together from different pods all reach the same room", async () => {
    const cluster = createSharedFakeCluster();
    const lobbyA = new LobbyManager(cluster.makeStore("podA"));
    const lobbyB = new LobbyManager(cluster.makeStore("podB"));

    activeLobbies.push(lobbyA, lobbyB);

    await lobbyA.start();
    await lobbyB.start();

    const wsA = createFakeWs();
    const wsB = createFakeWs();
    const wsC = createFakeWs();

    // A and C happen to connect to podA (e.g. two friends behind the same
    // router hitting the load balancer around the same moment), B connects
    // to podB from a different network.
    const playerA = await lobbyA.createPlayer(wsA, {});
    const playerB = await lobbyB.createPlayer(wsB, {});
    const playerC = await lobbyA.createPlayer(wsC, {});

    await Promise.all([
        lobbyA.addPlayer(playerA),
        lobbyB.addPlayer(playerB),
        lobbyA.addPlayer(playerC)
    ]);

    for (let i = 0; i < 10; i++) {
        await tick();
    }

    assert.ok(playerA.room, "player A should have been assigned a room");
    assert.ok(playerB.room, "player B (joined via a different pod) should have been assigned a room");
    assert.ok(playerC.room, "player C should have been assigned a room");

    assert.equal(playerB.room.id, playerA.room.id);
    assert.equal(playerC.room.id, playerA.room.id);

    [wsA, wsB, wsC].forEach(ws => {
        const gotAssignment = ws.sentMessages.some(
            message => message.type === "room_created" || message.type === "room_resumed"
        );
        assert.ok(gotAssignment, "each player's own socket should receive a room assignment message");
    });
});
