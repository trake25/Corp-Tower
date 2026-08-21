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

function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

// Simulates two server pods sharing one Redis-backed matchmaking state, with
// real async gaps (via tick()) between read/write steps so that concurrent
// joins actually get a chance to interleave, the way real network I/O would.
function createSharedFakeCluster() {
    const shared = {
        openRooms: new Set(),
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
            async markRoomOpen(roomId) {
                await tick();
                shared.openRooms.add(roomId);
            },
            async removeOpenRoom(roomId) {
                await tick();
                shared.openRooms.delete(roomId);
            },
            async claimOpenRoomId() {
                await tick();
                const next = shared.openRooms.values().next();
                if (next.done) {
                    return null;
                }
                shared.openRooms.delete(next.value);
                return next.value;
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

test("a lone player creates a room and waits alone, unfilled", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const ws = createFakeWs();
    const player = await lobby.createPlayer(ws, {});
    await lobby.addPlayer(player);

    const room = player.room;
    assert.ok(room, "the first player should get a room of their own");
    assert.equal(room.players.length, 1);
    assert.equal(room.matchStarted, false);

    const created = messagesOfType(ws, "room_created");
    assert.equal(created.length, 1);
    assert.equal(created[0].lobby.timerActive, false);
    assert.equal(created[0].lobby.readySecondsRemaining, 0);
});

test("a second player fills the first player's still-open room", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const wsA = createFakeWs();
    const playerA = await lobby.createPlayer(wsA, {});
    await lobby.addPlayer(playerA);

    const wsB = createFakeWs();
    const playerB = await lobby.createPlayer(wsB, {});
    await lobby.addPlayer(playerB);

    assert.equal(playerB.room.id, playerA.room.id);
    assert.equal(playerA.room.players.length, 2);
    assert.equal(playerA.room.matchStarted, false);
    assert.equal(playerA.room.lobbyDeadlineAt, 0, "the timer must not start before the room is full");

    const updates = messagesOfType(wsA, "lobby_update");
    assert.equal(updates.length, 1, "the first player should be told a second player joined");
    assert.equal(updates[0].roster.length, 2);
});

test("a formed room waits in the lobby instead of starting the match", async () => {
    const { room, sockets } = await createLobbyOfThree();

    assert.ok(room, "three players should have formed a room");
    assert.equal(room.matchStarted, false);
    assert.equal(room.engine.room.state, "waiting");

    const created = messagesOfType(sockets[2], "room_created");
    assert.equal(created.length, 1);
    assert.equal(created[0].matchStarted, false);
    assert.deepEqual(created[0].lobby.readyPlayerIds, []);
    assert.equal(created[0].lobby.timerActive, true, "the timer starts the moment the room fills");
    assert.ok(
        created[0].lobby.readySecondsRemaining > 0,
        "the lobby should ship a positive ready countdown"
    );

    sockets.forEach(ws => {
        assert.equal(
            messagesOfType(ws, "match_started").length,
            0,
            "no match should start before anyone is ready"
        );
    });
});

test("the match starts only once the last player readies up", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.toggleLobbyReady(players[0]);
    await lobby.toggleLobbyReady(players[1]);

    assert.equal(room.matchStarted, false);
    sockets.forEach(ws => {
        assert.equal(messagesOfType(ws, "match_started").length, 0);
    });

    const lastUpdate = messagesOfType(sockets[0], "lobby_update").pop();
    assert.equal(lastUpdate.readyPlayerIds.length, 2);

    await lobby.toggleLobbyReady(players[2]);

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

test("readying up twice unreadies, and does not start the match early", async () => {
    const { lobby, players, room } = await createLobbyOfThree();

    await lobby.toggleLobbyReady(players[0]);
    assert.equal(room.readyPlayerIds.has(players[0].id), true);

    await lobby.toggleLobbyReady(players[0]);
    assert.equal(room.readyPlayerIds.has(players[0].id), false);

    assert.equal(room.matchStarted, false);
});

test("a lobby timeout only sends the not-ready players home", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.toggleLobbyReady(players[0]);

    await lobby.handleLobbyReadyTimeout(room.id);

    const closed = messagesOfType(sockets[0], "room_closed");
    assert.equal(closed.length, 0, "a ready player is not evicted by the timeout");

    [sockets[1], sockets[2]].forEach(ws => {
        const closedMessages = messagesOfType(ws, "room_closed");
        assert.equal(closedMessages.length, 1);
        assert.equal(closedMessages[0].reason, "lobby_timeout");
    });

    assert.equal(lobby.rooms.length, 1, "the ready player's room must survive");
    assert.equal(room.players.length, 1);
    assert.equal(room.players[0].id, players[0].id);
    assert.equal(
        room.readyPlayerIds.has(players[0].id),
        false,
        "the survivor's ready state resets and must be re-armed once the room refills"
    );
    assert.equal(room.lobbyDeadlineAt, 0);
    assert.equal(lobby.roomLobbyTimers.has(room.id), false);
});

test("a lobby timeout with no one ready closes the room entirely", async () => {
    const { lobby, sockets, room } = await createLobbyOfThree();

    await lobby.handleLobbyReadyTimeout(room.id);

    sockets.forEach(ws => {
        const closed = messagesOfType(ws, "room_closed");
        assert.equal(closed.length, 1);
        assert.equal(closed[0].reason, "lobby_timeout");
    });

    assert.equal(lobby.rooms.length, 0);
    assert.equal(lobby.roomLobbyTimers.has(room.id), false);
});

test("leaving the lobby keeps the room alive for the other two, silently", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.leaveLobby(players[0]);

    assert.equal(
        messagesOfType(sockets[0], "room_closed").length,
        0,
        "the leaver navigates locally and gets no room_closed"
    );

    [sockets[1], sockets[2]].forEach(ws => {
        assert.equal(
            messagesOfType(ws, "room_closed").length,
            0,
            "the remaining players stay in the room, they are not closed out"
        );
    });

    assert.equal(lobby.rooms.length, 1, "the room persists for the remaining players");
    assert.equal(room.players.length, 2);
    assert.equal(room.players.some(roomPlayer => roomPlayer.id === players[0].id), false);
    assert.equal(room.lobbyDeadlineAt, 0, "the timer resets until the room refills");

    const updates = messagesOfType(sockets[1], "lobby_update");
    assert.ok(updates.length >= 1);
    assert.equal(updates.pop().roster.length, 2);

    assert.equal(
        lobby.roomLobbyTimers.has(room.id),
        false,
        "leaving must not leak the ready timeout"
    );
});

test("leaving an otherwise-empty lobby closes the room", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const ws = createFakeWs();
    const player = await lobby.createPlayer(ws, {});
    await lobby.addPlayer(player);

    await lobby.leaveLobby(player);

    assert.equal(lobby.rooms.length, 0);
});

test("dropping the socket during ready-up breaks off just that player", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    sockets[0].readyState = 3;
    await lobby.removePlayer(players[0]);

    assert.equal(
        lobby.roomReconnectTimers.has(room.id),
        false,
        "the reconnect grace window belongs to started matches, not the lobby"
    );

    [sockets[1], sockets[2]].forEach(ws => {
        assert.equal(messagesOfType(ws, "room_closed").length, 0);
    });

    assert.equal(lobby.rooms.length, 1);
    assert.equal(room.players.length, 2);
});

test("reconnecting mid-lobby resumes the ready state without a stray game_state", async () => {
    const { lobby, players, room } = await createLobbyOfThree();

    await lobby.toggleLobbyReady(players[1]);

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

    await lobby.toggleLobbyReady(player);

    assert.equal(
        room.matchStarted,
        true,
        "the real player's tap is the only one the room is waiting on"
    );

    await lobby.updateDebugConfig("debugBotsEnabled", false);
    await lobby.updateDebugConfig("debugBotCount", 0);
});

test("changing the bot roster resets ready players and broadcasts their unready state", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const ws = createFakeWs();
    const player = await lobby.createPlayer(ws, {});
    await lobby.addPlayer(player);

    const room = player.room;
    room.readyPlayerIds.add(player.id);

    await lobby.updateDebugConfig("debugBotsEnabled", true);
    await lobby.updateDebugConfig("debugBotCount", 2);

    assert.equal(room.matchStarted, false, "adding bots must not start a ready player’s match");
    assert.equal(room.readyPlayerIds.has(player.id), false);

    const enabledUpdate = messagesOfType(ws, "lobby_update").pop();
    assert.equal(enabledUpdate.readyPlayerIds.includes(player.id), false);
    assert.equal(enabledUpdate.readyPlayerIds.length, 2);

    room.readyPlayerIds.add(player.id);
    await lobby.updateDebugConfig("debugBotsEnabled", false);

    assert.equal(room.readyPlayerIds.has(player.id), false);

    const disabledUpdate = messagesOfType(ws, "lobby_update").pop();
    assert.deepEqual(disabledUpdate.readyPlayerIds, []);
});

test("players connecting to different pods each land in a room, even without a shared one", async () => {
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
    // to podB from a different network. A non-owning pod never mutates
    // another pod's room directly, so B is not guaranteed to land in A and
    // C's room - it must always land in *a* valid room of its own.
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

    assert.equal(playerA.room.id, playerC.room.id, "same-pod joiners share the same open room");
    assert.equal(playerA.room.ownerPodId, "podA");
    assert.equal(playerB.room.ownerPodId, "podB");

    [wsA, wsB, wsC].forEach(ws => {
        const gotAssignment = ws.sentMessages.some(
            message => message.type === "room_created" || message.type === "room_resumed"
        );
        assert.ok(gotAssignment, "each player's own socket should receive a room assignment message");
    });
});
