const assert = require("node:assert/strict");
const { afterEach, test } = require("node:test");

const LobbyManager = require("../app/Lobby_Manager");
const { RedisState, stripRuntimeRoom } = require("../app/Redis_State");

const activeLobbies = [];

afterEach(() => {
    activeLobbies.forEach(lobby => {
        lobby.rooms.forEach(room => room.engine.clearTimers());

        [
            lobby.roomReconnectTimers,
            lobby.roomLobbyTimers,
            lobby.privateLobbyStartTimers,
            lobby.privateLobbyGraceTimers,
            lobby.privateLobbyExpiryTimers
        ].forEach(timers => {
            timers.forEach(timer => clearTimeout(timer));
            timers.clear();
        });
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

function messagesOfType(ws, type) {
    return ws.sentMessages.filter(message => message.type === type);
}

function createLobby(store = new RedisState()) {
    const lobby = new LobbyManager(store);
    activeLobbies.push(lobby);
    return lobby;
}

async function createPrivateHost(lobby, options = {}) {
    const ws = options.ws || createFakeWs();
    const player = await lobby.createPlayer(ws, {
        entryMode: "private_create",
        privateDisplayName: options.displayName || "",
        privatePassword: options.password || "",
        profileId: options.profileId || "host-profile"
    });

    await lobby.addPlayer(player);
    return { player, ws, room: player.room };
}

async function joinPrivateRoom(lobby, serverId, options = {}) {
    const ws = options.ws || createFakeWs();
    const player = await lobby.createPlayer(ws, {
        entryMode: "private_join",
        privateDisplayName: options.displayName || "",
        privateServerId: serverId,
        privatePassword: options.password || "",
        profileId: options.profileId || "guest-profile"
    });

    await lobby.addPlayer(player);
    return { player, ws };
}

function tick() {
    return new Promise(resolve => setImmediate(resolve));
}

async function settle(turns = 8) {
    for (let index = 0; index < turns; index++) {
        await tick();
    }
}

function createSharedPrivateCluster() {
    const shared = {
        sessions: new Map(),
        rooms: new Map(),
        leases: new Map(),
        openRooms: new Set(),
        invites: new Map(),
        playerCounter: 1,
        roomCounter: 1,
        assignments: [],
        activePods: new Set(),
        roomSubscribers: new Map(),
        roomActionSubscribers: new Map()
    };

    const subscribersFor = (collection, roomId) => {
        if (!collection.has(roomId)) {
            collection.set(roomId, []);
        }

        return collection.get(roomId);
    };

    const makeStore = podId => ({
        enabled: true,
        async connect() {
            shared.activePods.add(podId);
        },
        getPodId() {
            return podId;
        },
        async isPodActive(candidatePodId) {
            return shared.activePods.has(candidatePodId);
        },
        getReconnectTtlSeconds() {
            return 60;
        },
        createReconnectToken() {
            return `${podId}-${Math.random().toString(16).slice(2)}`;
        },
        async nextPlayerId() {
            return `P${shared.playerCounter++}`;
        },
        async nextRoomId() {
            return shared.roomCounter++;
        },
        async claimPrivateInvite(inviteId, roomId) {
            if (shared.invites.has(inviteId)) {
                return false;
            }

            shared.invites.set(inviteId, roomId);
            return true;
        },
        async getPrivateInviteRoomId(inviteId) {
            return shared.invites.get(inviteId) || null;
        },
        async deletePrivateInvite(inviteId, expectedRoomId = null) {
            if (
                expectedRoomId === null ||
                String(shared.invites.get(inviteId)) === String(expectedRoomId)
            ) {
                shared.invites.delete(inviteId);
            }
        },
        async saveSession(session) {
            shared.sessions.set(session.sessionId, { ...session });
            return session;
        },
        async getSession(sessionId) {
            return sessionId ? shared.sessions.get(sessionId) || null : null;
        },
        async isCurrentSessionConnection(sessionId, connectionId) {
            const session = shared.sessions.get(sessionId);
            return Boolean(session && session.connectionId === connectionId);
        },
        async markSessionDisconnected(player) {
            const session = shared.sessions.get(player.sessionId);

            if (!session || session.connectionId !== player.connectionId) {
                return false;
            }

            shared.sessions.set(player.sessionId, {
                ...session,
                connected: false,
                roomId: player.room?.id || session.roomId || null
            });
            return true;
        },
        async clearSessionRoom(sessionId, resumeDestination = null, resumeReason = null) {
            const session = shared.sessions.get(sessionId);

            if (!session) {
                return;
            }

            shared.sessions.set(sessionId, {
                ...session,
                connected: false,
                roomId: null,
                resumeDestination,
                resumeReason
            });
        },
        async markRoomOpen(roomId) {
            shared.openRooms.add(roomId);
        },
        async removeOpenRoom(roomId) {
            shared.openRooms.delete(roomId);
        },
        async claimOpenRoomId() {
            const next = shared.openRooms.values().next();

            if (next.done) {
                return null;
            }

            shared.openRooms.delete(next.value);
            return next.value;
        },
        async withMatchmakingLock(callback) {
            return await callback();
        },
        async saveRoom(room) {
            const payload = JSON.parse(JSON.stringify(stripRuntimeRoom(room)));
            shared.rooms.set(payload.id, payload);
            shared.leases.set(payload.id, payload.ownerPodId);

            payload.players
                .filter(player => !player.isBot && player.sessionId)
                .forEach(player => {
                    const session = shared.sessions.get(player.sessionId);
                    shared.sessions.set(player.sessionId, {
                        ...session,
                        sessionId: player.sessionId,
                        reconnectToken: player.sessionId,
                        playerId: player.id,
                        roomId: payload.id,
                        connectionId: session?.connectionId || player.connectionId,
                        connected: session?.connected ?? true
                    });
                });

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
            return shared.rooms.get(roomId) || null;
        },
        async deleteRoom(roomId) {
            shared.rooms.delete(roomId);
            shared.leases.delete(roomId);
        },
        async publishRoom(roomId, message) {
            subscribersFor(shared.roomSubscribers, roomId).forEach(subscriber => {
                subscriber.handler({ ...message, sourcePodId: podId });
            });
        },
        async subscribeToRoom(roomId, handler) {
            subscribersFor(shared.roomSubscribers, roomId).push({ podId, handler });
        },
        async unsubscribeFromRoom(roomId) {
            shared.roomSubscribers.set(
                roomId,
                subscribersFor(shared.roomSubscribers, roomId).filter(
                    subscriber => subscriber.podId !== podId
                )
            );
        },
        async publishRoomAction(roomId, payload) {
            subscribersFor(shared.roomActionSubscribers, roomId).forEach(subscriber => {
                if (subscriber.podId !== podId) {
                    subscriber.handler({ ...payload, sourcePodId: podId });
                }
            });
        },
        async subscribeToRoomActions(roomId, handler) {
            subscribersFor(shared.roomActionSubscribers, roomId).push({ podId, handler });
        },
        async unsubscribeFromRoomActions(roomId) {
            shared.roomActionSubscribers.set(
                roomId,
                subscribersFor(shared.roomActionSubscribers, roomId).filter(
                    subscriber => subscriber.podId !== podId
                )
            );
        },
        async publishPlayerAssignment(playerId, roomId, connectionId = null, privateJoinReason = null) {
            shared.assignments.forEach(subscriber => {
                if (subscriber.podId !== podId) {
                    subscriber.handler({
                        playerId,
                        roomId,
                        connectionId,
                        privateJoinReason,
                        sourcePodId: podId
                    });
                }
            });
        },
        async subscribeToPlayerAssignments(handler) {
            shared.assignments.push({ podId, handler });
        }
    });

    return { makeStore, shared };
}

test("private creation is isolated, claims a safe invite, and preserves the temporary name", async () => {
    const stateStore = new RedisState();
    const lobby = createLobby(stateStore);
    const { player, ws, room } = await createPrivateHost(lobby, {
        displayName: "  Tower Host  ",
        password: "1234"
    });

    assert.equal(room.roomMode, "private");
    assert.equal(room.players.length, 1);
    assert.equal(room.hostPlayerId, player.id);
    assert.match(room.privateServerId, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
    assert.equal(room.privatePassword, "1234");
    assert.equal(stateStore.memoryOpenRooms.has(room.id), false);
    assert.equal(stateStore.memoryPrivateInvites.get(room.privateServerId), room.id);

    const created = messagesOfType(ws, "room_created").at(-1);
    assert.equal(created.roomMode, "private");
    assert.equal(created.privateLobby.serverId, room.privateServerId);
    assert.equal(created.roster[0].displayName, "Tower Host");
    assert.equal(created.roster[0].isHost, true);
});

test("a reused roomless session preserves a fresh private-create entry", async () => {
    const lobby = createLobby();
    const initial = await lobby.createPlayer(createFakeWs(), {
        profileId: "roomless-create-profile"
    });
    const reusedWs = createFakeWs();
    const reused = await lobby.createPlayer(reusedWs, {
        playerId: initial.id,
        reconnectToken: initial.sessionId,
        profileId: "roomless-create-profile",
        entryMode: "private_create",
        privateDisplayName: "Reused Host",
        privatePassword: "2468"
    });

    assert.equal(reused.room.roomMode, "private");
    assert.equal(reused.privateDisplayName, "Reused Host");
    assert.equal(reused.room.players[0].privateDisplayName, "Reused Host");
    assert.equal(
        messagesOfType(reusedWs, "room_created").at(-1).roster[0].displayName,
        "Reused Host"
    );
    assert.equal(reused.room.privatePassword, "2468");
    assert.equal(lobby.stateStore.memoryOpenRooms.has(reused.room.id), false);
    assert.equal(lobby.rooms.some(room => room.roomMode === "public"), false);
});

test("a reused roomless session preserves a fresh private-join entry", async () => {
    const lobby = createLobby();
    const { room } = await createPrivateHost(lobby, {
        password: "1357",
        displayName: "Invite Host"
    });
    const initial = await lobby.createPlayer(createFakeWs(), {
        profileId: "roomless-join-profile"
    });
    const reused = await lobby.createPlayer(createFakeWs(), {
        playerId: initial.id,
        reconnectToken: initial.sessionId,
        profileId: "roomless-join-profile",
        entryMode: "private_join",
        privateDisplayName: "Reused Guest",
        privateServerId: room.privateServerId,
        privatePassword: "1357"
    });

    assert.equal(reused.room, room);
    assert.equal(reused.privateDisplayName, "Reused Guest");
    assert.equal(room.players.some(player => player.id === reused.id), true);
    assert.equal(lobby.stateStore.memoryOpenRooms.size, 0);
    assert.equal(lobby.rooms.some(candidate => candidate.roomMode === "public"), false);
});

test("a reused session with a room resumes it before applying a fresh private entry", async () => {
    const lobby = createLobby();
    const { room: requestedRoom } = await createPrivateHost(lobby, {
        password: "1111",
        displayName: "Requested Host",
        profileId: "requested-room-host"
    });
    const {
        player: existingPlayer,
        room: existingRoom
    } = await createPrivateHost(lobby, {
        password: "2222",
        displayName: "Original Name",
        profileId: "existing-room-host"
    });
    const resumedWs = createFakeWs();
    const resumed = await lobby.createPlayer(resumedWs, {
        playerId: existingPlayer.id,
        reconnectToken: existingPlayer.sessionId,
        profileId: "existing-room-host",
        entryMode: "private_join",
        privateDisplayName: "Fresh Name",
        privateServerId: requestedRoom.privateServerId,
        privatePassword: "1111"
    });

    assert.equal(resumed.room, existingRoom);
    assert.equal(resumed.privateDisplayName, "Original Name");
    assert.equal(requestedRoom.players.length, 1);
    assert.equal(existingRoom.players.length, 1);
    assert.equal(messagesOfType(resumedWs, "room_resumed").length, 1);
    assert.equal(messagesOfType(resumedWs, "room_created").length, 0);
});

test("private join validates the password and returns the four stable rejection reasons", async () => {
    const lobby = createLobby();
    const { room } = await createPrivateHost(lobby, { password: "1234" });
    const serverId = room.privateServerId;

    const missing = await joinPrivateRoom(lobby, "ABCDEFGH", { password: "1234" });
    assert.equal(messagesOfType(missing.ws, "private_join_rejected").at(-1).reason, "not_found");
    assert.equal(missing.player.room, null);

    const invalidPassword = await joinPrivateRoom(lobby, serverId, { password: "abc" });
    assert.equal(
        messagesOfType(invalidPassword.ws, "private_join_rejected").at(-1).reason,
        "wrong_password"
    );

    const wrongPassword = await joinPrivateRoom(lobby, serverId, { password: "9999" });
    assert.equal(
        messagesOfType(wrongPassword.ws, "private_join_rejected").at(-1).reason,
        "wrong_password"
    );

    await joinPrivateRoom(lobby, serverId, { password: "1234", profileId: "guest-one" });
    await joinPrivateRoom(lobby, serverId, { password: "1234", profileId: "guest-two" });

    const full = await joinPrivateRoom(lobby, serverId, { password: "1234" });
    assert.equal(messagesOfType(full.ws, "private_join_rejected").at(-1).reason, "full");

    room.matchStarted = true;
    const playing = await joinPrivateRoom(lobby, serverId, { password: "1234" });
    assert.equal(messagesOfType(playing.ws, "private_join_rejected").at(-1).reason, "playing");
});

test("private passwords accept empty or exactly four digits", async () => {
    const lobby = createLobby();
    const empty = await createPrivateHost(lobby, { profileId: "empty-password" });
    assert.equal(empty.room.privatePassword, "");

    for (const password of ["1", "123", "12345", "12a4"]) {
        const player = await lobby.createPlayer(createFakeWs(), {
            entryMode: "private_create",
            privatePassword: password,
            profileId: `invalid-create-${password}`
        });
        await lobby.addPlayer(player);
        assert.equal(player.room, null);
        assert.equal(messagesOfType(player.ws, "private_join_rejected").at(-1).reason, "wrong_password");
    }

    const protectedRoom = await createPrivateHost(lobby, {
        password: "1000",
        profileId: "protected-password"
    });
    const accepted = await joinPrivateRoom(lobby, protectedRoom.room.privateServerId, {
        password: "1000",
        profileId: "valid-password"
    });
    assert.equal(accepted.player.room, protectedRoom.room);

    for (const password of ["1", "123", "12345", "12a4"]) {
        const rejected = await joinPrivateRoom(lobby, protectedRoom.room.privateServerId, {
            password,
            profileId: `invalid-join-${password}`
        });
        assert.equal(
            messagesOfType(rejected.ws, "private_join_rejected").at(-1).reason,
            "wrong_password"
        );
    }
});

test("an empty private display name falls back to the profile name without changing it", async () => {
    const lobby = createLobby();
    const { room } = await createPrivateHost(lobby, {
        displayName: "",
        profileId: "fallback-profile"
    });
    const profile = await lobby.profileStore.getProfile("fallback-profile", 0);
    const roster = await lobby.buildRoomRoster(room);

    assert.equal(roster[0].displayName, profile.displayName);
    assert.equal(room.players[0].privateDisplayName, null);
});

test("private ready uses only the private start deadline and a cancellation disarms it", async () => {
    const lobby = createLobby();
    const { player: host, room } = await createPrivateHost(lobby);
    const firstGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        profileId: "ready-one"
    });
    const secondGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        profileId: "ready-two"
    });

    assert.equal(lobby.roomLobbyTimers.has(room.id), false);
    await lobby.toggleLobbyReady(host);
    await lobby.toggleLobbyReady(firstGuest.player);
    await lobby.toggleLobbyReady(secondGuest.player);

    assert.equal(room.matchStarted, false);
    assert.ok(room.privateStartDeadlineAt > Date.now());
    assert.equal(lobby.privateLobbyStartTimers.has(room.id), true);

    await lobby.toggleLobbyReady(host);
    assert.equal(room.privateStartDeadlineAt, 0);
    assert.equal(lobby.privateLobbyStartTimers.has(room.id), false);

    await lobby.toggleLobbyReady(host);
    room.privateStartDeadlineAt = Date.now() - 1;
    await lobby.handlePrivateStartCountdown(room.id);

    assert.equal(room.matchStarted, true);
    assert.equal(lobby.privateLobbyStartTimers.has(room.id), false);
});

test("a private disconnect reserves its seat, enters grace, and reconnect restores the unready player", async () => {
    const lobby = createLobby();
    const { player: host, room } = await createPrivateHost(lobby, { password: "4200" });
    const firstGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        password: "4200",
        displayName: "Reconnect Guest",
        profileId: "reconnect-one"
    });
    const secondGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        password: "4200",
        profileId: "reconnect-two"
    });

    await lobby.toggleLobbyReady(host);
    await lobby.toggleLobbyReady(firstGuest.player);
    await lobby.toggleLobbyReady(secondGuest.player);
    const disconnectedUpdateCount = messagesOfType(firstGuest.ws, "lobby_update").length;
    await lobby.removePlayer(firstGuest.player);

    const reservedPlayer = room.players.find(player => player.id === firstGuest.player.id);
    assert.equal(room.players.length, 3);
    assert.equal(reservedPlayer.privateLobbyConnectionPhase, "recovering");
    assert.equal(
        messagesOfType(firstGuest.ws, "lobby_update").length,
        disconnectedUpdateCount,
        "the disconnected socket does not receive its own presence update"
    );
    assert.equal(
        messagesOfType(host.ws, "lobby_update").at(-1).roster
            .find(player => player.id === firstGuest.player.id).presence,
        "disconnected"
    );
    assert.equal(room.readyPlayerIds.has(firstGuest.player.id), false);
    assert.equal(room.privateStartDeadlineAt, 0);

    reservedPlayer.privateLobbyGraceAt = Date.now() - 1;
    reservedPlayer.privateLobbyExpiresAt = Date.now() + 10000;
    await lobby.beginPrivateLobbyGrace(room.id, reservedPlayer.id);
    assert.equal(reservedPlayer.privateLobbyConnectionPhase, "grace");

    const reconnectWs = createFakeWs();
    const resumed = await lobby.createPlayer(reconnectWs, {
        playerId: firstGuest.player.id,
        reconnectToken: firstGuest.player.sessionId,
        profileId: "reconnect-one",
        resumeOnly: true
    });

    assert.equal(resumed.room, room);
    assert.equal(reservedPlayer.privateLobbyConnectionPhase, "connected");
    assert.equal(room.readyPlayerIds.has(reservedPlayer.id), false);
    assert.equal(lobby.privateLobbyGraceTimers.has(`${room.id}:${reservedPlayer.id}`), false);
    assert.equal(lobby.privateLobbyExpiryTimers.has(`${room.id}:${reservedPlayer.id}`), false);
    const resumedMessage = messagesOfType(reconnectWs, "room_resumed").at(-1);
    assert.equal(resumedMessage.roomMode, "private");
    assert.equal(
        resumedMessage.roster.find(player => player.id === firstGuest.player.id).presence,
        "connected"
    );
});

test("private guest and host expiry persist their authoritative shell destinations", async () => {
    const guestLobby = createLobby();
    const { player: guestHost, room: guestRoom } = await createPrivateHost(guestLobby);
    const expiringGuest = await joinPrivateRoom(guestLobby, guestRoom.privateServerId, {
        profileId: "expiring-guest"
    });

    await guestLobby.removePlayer(expiringGuest.player);
    const guestRoomPlayer = guestRoom.players.find(player => player.id === expiringGuest.player.id);
    guestRoomPlayer.privateLobbyExpiresAt = Date.now() - 1;
    await guestLobby.expirePrivateLobbyPlayer(guestRoom.id, guestRoomPlayer.id);

    assert.equal(guestRoom.players.length, 1);
    const guestSession = await guestLobby.stateStore.getSession(expiringGuest.player.sessionId);
    assert.equal(guestSession.resumeDestination, "join_server");

    const expiredGuestWs = createFakeWs();
    await guestLobby.createPlayer(expiredGuestWs, {
        playerId: expiringGuest.player.id,
        reconnectToken: expiringGuest.player.sessionId
    });
    assert.equal(messagesOfType(expiredGuestWs, "resume_unavailable").at(-1).destination, "join_server");
    assert.equal(
        (await guestLobby.stateStore.getSession(expiringGuest.player.sessionId)).resumeDestination,
        "join_server"
    );

    const repeatedGuestWs = createFakeWs();
    await guestLobby.createPlayer(repeatedGuestWs, {
        playerId: expiringGuest.player.id,
        reconnectToken: expiringGuest.player.sessionId
    });
    assert.equal(messagesOfType(repeatedGuestWs, "resume_unavailable").at(-1).destination, "join_server");
    assert.equal(guestHost.room, guestRoom);

    const hostLobby = createLobby();
    const { player: host, ws: hostWs, room: hostRoom } = await createPrivateHost(hostLobby);
    const survivor = await joinPrivateRoom(hostLobby, hostRoom.privateServerId, {
        profileId: "host-expiry-survivor"
    });

    await hostLobby.removePlayer(host);
    const hostRoomPlayer = hostRoom.players.find(player => player.id === host.id);
    hostRoomPlayer.privateLobbyExpiresAt = Date.now() - 1;
    await hostLobby.expirePrivateLobbyPlayer(hostRoom.id, host.id);

    assert.equal(hostLobby.rooms.length, 0);
    assert.equal(await hostLobby.stateStore.getPrivateInviteRoomId(hostRoom.privateServerId), null);
    assert.equal(
        (await hostLobby.stateStore.getSession(host.sessionId)).resumeDestination,
        "private_server"
    );
    assert.equal(
        (await hostLobby.stateStore.getSession(survivor.player.sessionId)).resumeDestination,
        "home"
    );
    assert.equal(messagesOfType(hostWs, "room_closed").length, 0);
    const survivorClose = messagesOfType(survivor.ws, "room_closed").at(-1);
    assert.equal(survivorClose.destinationByPlayerId[host.id], "private_server");
    assert.equal(survivorClose.destinationByPlayerId[survivor.player.id], "home");
});

test("guest leave, host leave, and host-only kick carry the intended destinations", async () => {
    const lobby = createLobby();
    const { player: host, ws: hostWs, room } = await createPrivateHost(lobby);
    const firstGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        profileId: "leave-one"
    });
    const secondGuest = await joinPrivateRoom(lobby, room.privateServerId, {
        profileId: "leave-two"
    });

    await lobby.kickPrivatePlayer(firstGuest.player, secondGuest.player.id);
    assert.equal(room.players.length, 3);

    await lobby.kickPrivatePlayer(host, firstGuest.player.id);
    assert.equal(room.players.length, 2);
    assert.equal(
        messagesOfType(firstGuest.ws, "room_closed").at(-1).destination,
        "home"
    );

    await lobby.leaveLobby(secondGuest.player);
    assert.equal(
        messagesOfType(secondGuest.ws, "room_closed").at(-1).destination,
        "join_server"
    );
    assert.equal(room.players.length, 1);

    await lobby.leaveLobby(host);
    assert.equal(lobby.rooms.length, 0);
    const hostClose = messagesOfType(hostWs, "room_closed").at(-1);
    assert.equal(hostClose.destinationByPlayerId[host.id], "private_server");
});

test("private metadata and reconnect deadlines survive hydration", async () => {
    const stateStore = new RedisState();
    const owner = createLobby(stateStore);
    const { player, room } = await createPrivateHost(owner, {
        displayName: "Hydrated Host",
        password: "8400"
    });

    const roomPlayer = room.players.find(candidate => candidate.id === player.id);
    roomPlayer.privateLobbyConnectionPhase = "grace";
    roomPlayer.privateLobbyGraceAt = Date.now() - 1;
    roomPlayer.privateLobbyExpiresAt = Date.now() + 10000;
    room.privateStartDeadlineAt = Date.now() + 5000;
    room.readyPlayerIds.add(player.id);
    await stateStore.saveRoom(room, true);

    const hydratedLobby = createLobby(stateStore);
    const hydrated = await hydratedLobby.hydrateRoom(room.id);
    const hydratedPlayer = hydrated.players.find(candidate => candidate.id === player.id);

    assert.equal(hydrated.roomMode, "private");
    assert.equal(hydrated.privateServerId, room.privateServerId);
    assert.equal(hydrated.privatePassword, "8400");
    assert.equal(hydrated.hostPlayerId, player.id);
    assert.equal(hydrated.privateStartDeadlineAt, room.privateStartDeadlineAt);
    assert.equal(hydratedPlayer.privateDisplayName, "Hydrated Host");
    assert.equal(hydratedPlayer.privateLobbyConnectionPhase, "grace");
    assert.equal(hydratedLobby.privateLobbyExpiryTimers.has(`${room.id}:${player.id}`), true);
});

test("a private join landing on another pod is owner-mutated and resumes on its socket", async () => {
    const cluster = createSharedPrivateCluster();
    const ownerLobby = createLobby(cluster.makeStore("pod-owner"));
    const joinLobby = createLobby(cluster.makeStore("pod-join"));

    await ownerLobby.start();
    await joinLobby.start();

    const { player: host, ws: hostWs, room } = await createPrivateHost(ownerLobby, {
        password: "7007",
        displayName: "Owner"
    });
    cluster.shared.leases.delete(room.id);
    const joined = await joinPrivateRoom(joinLobby, room.privateServerId, {
        password: "7007",
        displayName: "Remote Guest",
        profileId: "remote-guest"
    });

    await settle();

    assert.equal(ownerLobby.rooms[0].players.length, 2);
    assert.equal(ownerLobby.rooms[0].players[1].privateDisplayName, "Remote Guest");
    assert.equal(joined.player.room.id, room.id);
    assert.equal(joinLobby.isRoomOwner(joined.player.room), false);
    const resumed = messagesOfType(joined.ws, "room_resumed").at(-1);
    assert.equal(resumed.roomMode, "private");
    assert.equal(resumed.roster.length, 2);
    assert.equal(cluster.shared.openRooms.has(room.id), false);

    await joinPrivateRoom(ownerLobby, room.privateServerId, {
        password: "7007",
        displayName: "Owner Pod Guest",
        profileId: "owner-pod-guest"
    });
    await settle();
    assert.equal(ownerLobby.rooms[0].players.length, 3);

    const guestLobbyUpdateCount = messagesOfType(joined.ws, "lobby_update").length;
    await ownerLobby.toggleLobbyReady(host);
    await settle();
    assert.equal(
        messagesOfType(joined.ws, "lobby_update").length,
        guestLobbyUpdateCount + 1
    );
    assert.deepEqual(
        messagesOfType(joined.ws, "lobby_update").at(-1).readyPlayerIds,
        [host.id]
    );

    await joinLobby.toggleLobbyReady(joined.player);
    await settle();
    assert.equal(ownerLobby.rooms[0].readyPlayerIds.has(joined.player.id), true);
    assert.deepEqual(
        messagesOfType(hostWs, "lobby_update").at(-1).readyPlayerIds.sort(),
        [host.id, joined.player.id].sort()
    );

    await joinLobby.removePlayer(joined.player);
    await settle();
    const reconnectWs = createFakeWs();
    const reconnected = await joinLobby.createPlayer(reconnectWs, {
        playerId: joined.player.id,
        reconnectToken: joined.player.sessionId,
        profileId: "remote-guest"
    });
    await settle();
    assert.equal(
        ownerLobby.rooms[0].players.find(player => player.id === reconnected.id).connectionId,
        reconnected.connectionId
    );

    await ownerLobby.kickPrivatePlayer(host, reconnected.id);
    await settle();
    assert.equal(joinLobby.rooms.length, 1);
    assert.equal(reconnected.room, null);
    assert.equal(joinLobby.rooms[0].players.some(player => player.id === reconnected.id), false);
    assert.equal(messagesOfType(reconnectWs, "room_closed").at(-1).destination, "home");
    assert.equal(reconnectWs.sentMessages.at(-1).type, "room_closed");
});

test("a cross-pod private guest receives the authoritative match-start transition", async () => {
    const cluster = createSharedPrivateCluster();
    const ownerLobby = createLobby(cluster.makeStore("pod-owner"));
    const joinLobby = createLobby(cluster.makeStore("pod-join"));

    await ownerLobby.start();
    await joinLobby.start();

    const { player: host, room } = await createPrivateHost(ownerLobby, {
        password: "8080"
    });
    const remoteGuest = await joinPrivateRoom(joinLobby, room.privateServerId, {
        password: "8080",
        profileId: "remote-start-guest"
    });
    await settle();
    const localGuest = await joinPrivateRoom(ownerLobby, room.privateServerId, {
        password: "8080",
        profileId: "local-start-guest"
    });

    await ownerLobby.toggleLobbyReady(host);
    await joinLobby.toggleLobbyReady(remoteGuest.player);
    await ownerLobby.toggleLobbyReady(localGuest.player);
    await settle();

    room.privateStartDeadlineAt = Date.now() - 1;
    await ownerLobby.handlePrivateStartCountdown(room.id);
    await settle();

    assert.equal(room.matchStarted, true);
    const matchStarted = messagesOfType(remoteGuest.ws, "match_started").at(-1);
    assert.equal(matchStarted.playerId, remoteGuest.player.id);
    assert.equal(matchStarted.roomMode, "private");
    assert.equal(messagesOfType(remoteGuest.ws, "game_state").length > 0, true);
});
