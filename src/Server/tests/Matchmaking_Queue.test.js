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
