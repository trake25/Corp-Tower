const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const LobbyManager = require("../app/Lobby_Manager");
const { RedisState, stripRuntimeRoom } = require("../app/Redis_State");

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
        leases: new Map(),
        playerCounter: 1,
        roomCounter: 1,
        lockChain: Promise.resolve(),
        assignmentSubscribers: [],
        roomSubscribers: new Map(),
        roomActionSubscribers: new Map()
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
                shared.leases.set(payload.id, payload.ownerPodId);
                return payload;
            },
            async claimRoomLease(roomId) {
                const owner = shared.leases.get(roomId);
                if (owner && owner !== podId) {
                    return false;
                }
                shared.leases.set(roomId, podId);
                return true;
            },
            async getRoomLeaseOwner(roomId) {
                return shared.leases.get(roomId) || null;
            },
            async getRoom(roomId) {
                await tick();
                return shared.rooms.get(roomId) || null;
            },
            async deleteRoom(roomId) {
                shared.rooms.delete(roomId);
                shared.leases.delete(roomId);
            },
            async publishRoom(roomId, message) {
                await tick();
                const subscribers = shared.roomSubscribers.get(roomId) || [];
                subscribers.forEach(subscriber => {
                    subscriber.handler({ ...message, sourcePodId: podId });
                });
            },
            async subscribeToRoom(roomId, handler) {
                const subscribers = shared.roomSubscribers.get(roomId) || [];
                subscribers.push({ podId, handler });
                shared.roomSubscribers.set(roomId, subscribers);
            },
            async unsubscribeFromRoom(roomId) {
                const subscribers = shared.roomSubscribers.get(roomId) || [];
                shared.roomSubscribers.set(
                    roomId,
                    subscribers.filter(subscriber => subscriber.podId !== podId)
                );
            },
            async publishRoomAction(roomId, message) {
                await tick();
                const subscribers = shared.roomActionSubscribers.get(roomId) || [];
                subscribers.forEach(subscriber => {
                    subscriber.handler({ ...message, sourcePodId: podId });
                });
            },
            async subscribeToRoomActions(roomId, handler) {
                const subscribers = shared.roomActionSubscribers.get(roomId) || [];
                subscribers.push({ podId, handler });
                shared.roomActionSubscribers.set(roomId, subscribers);
            },
            async unsubscribeFromRoomActions(roomId) {
                const subscribers = shared.roomActionSubscribers.get(roomId) || [];
                shared.roomActionSubscribers.set(
                    roomId,
                    subscribers.filter(subscriber => subscriber.podId !== podId)
                );
            },
            async clearSessionRoom(sessionId, resumeDestination = null, resumeReason = null) {
                const session = shared.sessions.get(sessionId);
                if (session) {
                    shared.sessions.set(sessionId, {
                        ...session,
                        connected: false,
                        roomId: null,
                        resumeDestination,
                        resumeReason
                    });
                }
            },
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

    return { makeStore, shared };
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

    return { cluster, lobby, players, sockets, room: players[0].room };
}

function messagesOfType(ws, type) {
    return ws.sentMessages.filter(message => message.type === type);
}

async function startMatch(lobby, players) {
    for (const player of players) {
        await lobby.toggleLobbyReady(player);
    }
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

test("resume-only with no resumable room reports Home without entering matchmaking", async () => {
    const stateStore = new RedisState();
    const lobby = new LobbyManager(stateStore);
    activeLobbies.push(lobby);
    const initial = await lobby.createPlayer(createFakeWs(), {});
    const resumeWs = createFakeWs();
    const resumed = await lobby.createPlayer(resumeWs, {
        playerId: initial.id,
        reconnectToken: initial.sessionId,
        resumeOnly: true
    });

    assert.equal(resumed.room, undefined);
    assert.equal(lobby.rooms.length, 0);
    assert.deepEqual(messagesOfType(resumeWs, "resume_unavailable"), [{
        type: "resume_unavailable",
        reason: "room_unavailable",
        destination: "home"
    }]);

    const staleWs = createFakeWs();
    const stale = await lobby.createPlayer(staleWs, {
        playerId: "missing-player",
        reconnectToken: "missing-token",
        resumeOnly: true
    });

    assert.equal(stale.room, undefined);
    assert.equal(lobby.rooms.length, 0);
    assert.equal(messagesOfType(staleWs, "resume_unavailable").at(-1).destination, "home");
});

test("resume-only cannot reclaim a public pre-match seat before its old socket closes", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));
    activeLobbies.push(lobby);
    await lobby.start();
    const originalWs = createFakeWs();
    const original = await lobby.createPlayer(originalWs, {});
    await lobby.addPlayer(original);
    const publicRoom = original.room;
    const resumeWs = createFakeWs();
    const attemptedResume = await lobby.createPlayer(resumeWs, {
        playerId: original.id,
        reconnectToken: original.sessionId,
        resumeOnly: true
    });

    assert.equal(attemptedResume.room, undefined);
    assert.equal(publicRoom.players.some(player => player.id === original.id), false);
    assert.equal(messagesOfType(resumeWs, "room_resumed").length, 0);
    assert.equal(messagesOfType(resumeWs, "room_created").length, 0);
    assert.equal(messagesOfType(resumeWs, "resume_unavailable").at(-1).destination, "home");
    assert.equal(lobby.rooms.length, 0);

    await lobby.removePlayer(original);
    assert.equal(lobby.rooms.length, 0, "the superseded close cannot resurrect the evicted seat");
});

test("leave_game is a no-op until the room has started", async () => {
    const { cluster, lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.dispatchRoomAction(players[0], { type: "leave_game" });

    assert.equal(messagesOfType(sockets[0], "game_left").length, 0);
    assert.equal(room.players.length, 3);
    assert.equal(cluster.shared.sessions.get(players[0].sessionId).roomId, room.id);
});

test("only the current connection can intentionally leave a started game", async () => {
    const { cluster, lobby, players, sockets, room } = await createLobbyOfThree();
    await startMatch(lobby, players);

    await lobby.dispatchRoomAction({
        ...players[0],
        connectionId: "superseded-connection"
    }, { type: "leave_game" });

    assert.equal(messagesOfType(sockets[0], "game_left").length, 0);
    assert.equal(cluster.shared.sessions.get(players[0].sessionId).roomId, room.id);

    await lobby.dispatchRoomAction(players[0], { type: "leave_game" });

    const acknowledgements = messagesOfType(sockets[0], "game_left");
    assert.deepEqual(acknowledgements, [{ type: "game_left", destination: "home" }]);
    assert.equal(room.players.length, 3, "a started-room participant stays in the engine roster");
    assert.equal(room.players[0].ws, null, "the leaver no longer has a runtime socket");
    assert.equal(room.players[0].presence, "left");
    assert.equal(lobby.connectedPlayers.has(players[0].id), false);

    const session = cluster.shared.sessions.get(players[0].sessionId);
    assert.equal(session.roomId, null);
    assert.equal(session.connected, false);
    assert.equal(session.resumeDestination, "home");
    assert.equal(session.resumeReason, "player_left_game");

    [sockets[1], sockets[2]].forEach(ws => {
        assert.equal(messagesOfType(ws, "game_left").length, 0);
        assert.equal(messagesOfType(ws, "room_closed").length, 0);
        assert.equal(
            messagesOfType(ws, "game_state").at(-1).players[0].presence,
            "left"
        );
    });
    assert.equal(lobby.rooms.length, 1);
});

test("started-room disconnect and resume broadcast and persist authoritative presence", async () => {
    const { cluster, lobby, players, sockets, room } = await createLobbyOfThree();
    await startMatch(lobby, players);
    sockets.forEach(socket => {
        socket.sentMessages = [];
    });
    room.engine.room.pendingScoreEvents = [{ id: "unconsumed-presence-score" }];

    sockets[0].readyState = 3;
    await lobby.removePlayer(players[0]);

    assert.equal(room.players[0].presence, "disconnected");
    assert.equal(cluster.shared.rooms.get(room.id).players[0].presence, "disconnected");
    [sockets[1], sockets[2]].forEach(socket => {
        assert.equal(
            messagesOfType(socket, "game_state").at(-1).players[0].presence,
            "disconnected"
        );
    });
    assert.deepEqual(
        room.engine.room.pendingScoreEvents,
        [{ id: "unconsumed-presence-score" }],
        "presence-only broadcasts must not consume gameplay events"
    );

    const resumeWs = createFakeWs();
    const resumed = await lobby.createPlayer(resumeWs, {
        playerId: players[0].id,
        reconnectToken: players[0].sessionId,
        resumeOnly: true
    });

    assert.equal(resumed.room, room);
    assert.equal(room.players[0].presence, "connected");
    assert.equal(cluster.shared.rooms.get(room.id).players[0].presence, "connected");
    assert.equal(
        messagesOfType(resumeWs, "game_state").at(-1).players[0].presence,
        "connected"
    );
});

test("cross-pod started-room resume and disconnect mutate presence on the owner", async () => {
    const { cluster, lobby: ownerLobby, players, sockets, room } = await createLobbyOfThree();
    await startMatch(ownerLobby, players);
    sockets[0].readyState = 3;
    await ownerLobby.removePlayer(players[0]);
    assert.equal(room.players[0].presence, "disconnected");

    const remoteLobby = new LobbyManager(cluster.makeStore("podB"));
    activeLobbies.push(remoteLobby);
    await remoteLobby.start();
    const remoteWs = createFakeWs();
    const resumed = await remoteLobby.createPlayer(remoteWs, {
        playerId: players[0].id,
        reconnectToken: players[0].sessionId,
        resumeOnly: true
    });

    for (let index = 0; index < 8; index++) {
        await tick();
    }

    assert.equal(remoteLobby.isRoomOwner(resumed.room), false);
    assert.equal(room.players[0].presence, "connected");
    assert.equal(cluster.shared.rooms.get(room.id).players[0].presence, "connected");
    assert.equal(
        messagesOfType(remoteWs, "game_state").at(-1).players[0].presence,
        "connected"
    );

    remoteWs.readyState = 3;
    await remoteLobby.removePlayer(resumed);
    for (let index = 0; index < 8; index++) {
        await tick();
    }

    assert.equal(room.players[0].presence, "disconnected");
    assert.equal(cluster.shared.rooms.get(room.id).players[0].presence, "disconnected");
    assert.equal(
        messagesOfType(sockets[1], "game_state").at(-1).players[0].presence,
        "disconnected"
    );
});

test("left presence survives room persistence and cannot regain resume eligibility", async () => {
    const stateStore = new RedisState();
    const lobby = new LobbyManager(stateStore);
    activeLobbies.push(lobby);
    const sockets = [createFakeWs(), createFakeWs(), createFakeWs()];
    const players = [];

    for (const socket of sockets) {
        const player = await lobby.createPlayer(socket, {});
        players.push(player);
        await lobby.addPlayer(player);
    }

    await startMatch(lobby, players);
    await lobby.dispatchRoomAction(players[0], { type: "leave_game" });

    const room = players[1].room;
    const storedRoom = await stateStore.getRoom(room.id);
    const storedPlayer = storedRoom.players.find(player => player.id === players[0].id);
    const storedSession = await stateStore.getSession(players[0].sessionId);
    assert.equal(storedPlayer.presence, "left");
    assert.equal(storedSession.roomId, null);
    assert.equal(storedSession.resumeDestination, "home");

    const hydratedLobby = new LobbyManager(stateStore);
    activeLobbies.push(hydratedLobby);
    const hydratedRoom = await hydratedLobby.hydrateRoom(room.id);
    assert.equal(
        hydratedRoom.players.find(player => player.id === players[0].id).presence,
        "left"
    );

    const resumeWs = createFakeWs();
    const attemptedResume = await lobby.createPlayer(resumeWs, {
        playerId: players[0].id,
        reconnectToken: players[0].sessionId,
        resumeOnly: true
    });
    assert.equal(attemptedResume.room, undefined);
    assert.equal(messagesOfType(resumeWs, "resume_unavailable").at(-1).destination, "home");
});

test("remote-owner leave_game returns only a targeted acknowledgement", async () => {
    const { cluster, lobby: lobbyA, players, room } = await createLobbyOfThree();
    await startMatch(lobbyA, players);

    const lobbyB = new LobbyManager(cluster.makeStore("podB"));
    activeLobbies.push(lobbyB);
    await lobbyB.start();
    const remoteRoom = await lobbyB.hydrateRoom(room.id);
    const remotePlayer = remoteRoom.players.find(player => player.id === players[0].id);
    const remoteWs = createFakeWs();

    lobbyA.connectedPlayers.delete(players[0].id);
    room.players[0].ws = null;
    remotePlayer.ws = remoteWs;
    remotePlayer.room = remoteRoom;
    remotePlayer.connectionId = players[0].connectionId;
    lobbyB.connectedPlayers.set(remotePlayer.id, remotePlayer);

    await lobbyB.dispatchRoomAction(remotePlayer, { type: "leave_game" });
    for (let i = 0; i < 8; i++) {
        await tick();
    }

    assert.deepEqual(
        messagesOfType(remoteWs, "game_left"),
        [{ type: "game_left", destination: "home" }]
    );
    assert.equal(lobbyB.connectedPlayers.has(remotePlayer.id), false);
    assert.equal(remoteRoom.players.length, 3);
    assert.equal(remotePlayer.ws, null);
    assert.equal(cluster.shared.sessions.get(remotePlayer.sessionId).roomId, null);
    assert.equal(lobbyA.rooms.length, 1);
    assert.equal(lobbyB.rooms.length, 1);
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

test("an unavailable resume clears the stale room session for the next match", async () => {
    const cluster = createSharedFakeCluster();
    const lobby = new LobbyManager(cluster.makeStore("podA"));

    activeLobbies.push(lobby);
    await lobby.start();

    const ws = createFakeWs();
    const player = await lobby.createPlayer(ws, {});
    await lobby.stateStore.saveSession({
        sessionId: player.sessionId,
        reconnectToken: player.sessionId,
        playerId: player.id,
        roomId: 999,
        connectionId: player.connectionId,
        connected: true
    });

    await lobby.resumePlayer(player, 999);

    assert.equal(messagesOfType(ws, "resume_unavailable").length, 1);
    assert.equal(
        cluster.shared.sessions.get(player.sessionId).roomId,
        null,
        "the next connection must be free to join a new room"
    );
});

test("a resync after room closure reports an unavailable room instead of leaving recovery pending", async () => {
    const { lobby, players, sockets, room } = await createLobbyOfThree();

    await lobby.closeRoom(room, "failure_limit_reached", "home");
    sockets[0].sentMessages = [];

    await lobby.resyncState(players[0], "collapse-resync");

    const unavailable = messagesOfType(sockets[0], "resume_unavailable");
    assert.equal(unavailable.length, 1);
    assert.equal(unavailable[0].reason, "room_unavailable");
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

test("terminal close publishes Home routing and clears owner and remote replicas once", async () => {
    const cluster = createSharedFakeCluster();
    const lobbyA = new LobbyManager(cluster.makeStore("podA"));
    const lobbyB = new LobbyManager(cluster.makeStore("podB"));

    activeLobbies.push(lobbyA, lobbyB);
    await lobbyA.start();
    await lobbyB.start();

    const sockets = [createFakeWs(), createFakeWs(), createFakeWs()];
    const players = [];

    for (const ws of sockets) {
        const player = await lobbyA.createPlayer(ws, {});
        players.push(player);
        await lobbyA.addPlayer(player);
    }

    for (let i = 0; i < 8; i++) {
        await tick();
    }

    const room = players[0].room;
    const remoteWs = createFakeWs();
    lobbyB.connectedPlayers.set(players[1].id, {
        id: players[1].id,
        ws: remoteWs
    });
    const remoteRoom = await lobbyB.hydrateRoom(room.id);

    assert.ok(remoteRoom);
    assert.equal(lobbyB.isRoomOwner(remoteRoom), false);

    await lobbyA.closeRoom(room, "failure_limit_reached", "home");

    for (let i = 0; i < 8; i++) {
        await tick();
    }

    sockets.forEach(ws => {
        const closed = messagesOfType(ws, "room_closed");
        assert.equal(closed.length, 1);
        assert.equal(closed[0].reason, "failure_limit_reached");
        assert.equal(closed[0].destination, "home");
    });
    const remoteClosed = messagesOfType(remoteWs, "room_closed");
    assert.equal(remoteClosed.length, 1);
    assert.equal(remoteClosed[0].destination, "home");
    assert.equal(lobbyA.rooms.length, 0);
    assert.equal(lobbyB.rooms.length, 0);
    assert.equal(cluster.shared.rooms.has(room.id), false);
    assert.equal(cluster.shared.sessions.get(players[1].sessionId).roomId, null);

    await lobbyA.closeRoom(room, "failure_limit_reached", "home");
    assert.equal(messagesOfType(sockets[0], "room_closed").length, 1);
});

test("a resumed connection keeps its room socket when the superseded socket closes", async () => {
    const { lobby, players, room } = await createLobbyOfThree();

    await lobby.toggleLobbyReady(players[0]);
    await lobby.toggleLobbyReady(players[1]);
    await lobby.toggleLobbyReady(players[2]);

    room.engine.room.pendingScoreEvents = [{ id: "pending-score" }];
    await lobby.stateStore.saveSession({
        sessionId: players[0].sessionId,
        reconnectToken: players[0].sessionId,
        playerId: players[0].id,
        roomId: room.id,
        connectionId: players[0].connectionId,
        connected: true
    });
    const resumedWs = createFakeWs();
    const resumedPlayer = await lobby.createPlayer(resumedWs, {
        playerId: players[0].id,
        reconnectToken: players[0].sessionId
    });

    const roomPlayer = room.players.find(player => player.id === players[0].id);
    assert.equal(roomPlayer.ws, resumedWs);

    await lobby.removePlayer(players[0]);

    assert.equal(lobby.connectedPlayers.get(players[0].id), resumedPlayer);
    assert.equal(roomPlayer.ws, resumedWs);

    const snapshot = messagesOfType(resumedWs, "game_state").find(
        message => message.snapshot
    );
    assert.ok(snapshot);
    assert.deepEqual(snapshot.scoreEvents, []);
    assert.equal(room.engine.room.pendingScoreEvents.length, 1);
});
