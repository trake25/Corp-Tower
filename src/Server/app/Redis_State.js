const crypto = require("crypto");

const RECONNECT_TTL_SECONDS =
    Number(process.env.RECONNECT_TTL_SECONDS) || 60;

const ROOM_LEASE_SECONDS =
    Number(process.env.ROOM_LEASE_SECONDS) || 5;

const POD_ID =
    process.env.POD_ID ||
    process.env.HOSTNAME ||
    `local-${crypto.randomUUID()}`;

const REDIS_CONNECT_RETRIES =
    positiveNumberFromEnv("REDIS_CONNECT_RETRIES", 180);

const REDIS_CONNECT_RETRY_DELAY_MS =
    positiveNumberFromEnv("REDIS_CONNECT_RETRY_DELAY_MS", 2000);

function positiveNumberFromEnv(name, fallback) {
    const value = Number(process.env[name]);

    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stripRuntimePlayer(player) {
    return {
        id: player.id,
        sessionId: player.sessionId || null,
        connectionId: player.connectionId || null,
        profileId: player.profileId || null,
        displayName: player.displayName || null,
        privateDisplayName: player.privateDisplayName || null,
        privateLobbyConnectionPhase: player.privateLobbyConnectionPhase || "connected",
        privateLobbyGraceAt: player.privateLobbyGraceAt || 0,
        privateLobbyExpiresAt: player.privateLobbyExpiresAt || 0,
        isBot: Boolean(player.isBot),
        score: player.score || 0,
        levelScore: player.levelScore || 0,
        levelImpactContribution: player.levelImpactContribution || 0,
        impactContribution: player.impactContribution || 0,
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

const DRAW_PILE_SNAPSHOT_LIMIT = 16;

function stripRuntimeRoom(room) {
    const engineRoom = room.engine?.room || room.state || {};

    return {
        id: room.id,
        ownerPodId: room.ownerPodId || POD_ID,
        players: (room.players || []).map(stripRuntimePlayer),
        matchStarted: Boolean(room.matchStarted),
        roomMode: room.roomMode || "public",
        privateServerId: room.privateServerId || null,
        privatePassword: room.privatePassword || "",
        hostPlayerId: room.hostPlayerId || null,
        privateStartDeadlineAt: room.privateStartDeadlineAt || 0,
        readyPlayerIds: Array.from(room.readyPlayerIds || []),
        lobbyDeadlineAt: room.lobbyDeadlineAt || 0,
        state: {
            level: engineRoom.level || 1,
            stateRevision: engineRoom.stateRevision || 0,
            impactLevel: engineRoom.impactLevel || 1,
            impactScores: engineRoom.impactScores || {},
            impactPowers: engineRoom.impactPowers || {},
            impactContributions: engineRoom.impactContributions || {},
            impactFailureCount: engineRoom.impactFailureCount || 0,
            lastImpactFailureReason: engineRoom.lastImpactFailureReason || null,
            failureTransitionCommitted: Boolean(engineRoom.failureTransitionCommitted),
            terminalCloseAt: engineRoom.terminalCloseAt || 0,
            terminalFailureReason: engineRoom.terminalFailureReason || null,
            terminalCloseRequested: Boolean(engineRoom.terminalCloseRequested),
            targetHeight: engineRoom.targetHeight || 0,
            currentHeight: engineRoom.currentHeight || 0,
            drawPile: (engineRoom.drawPile || []).slice(0, DRAW_PILE_SNAPSHOT_LIMIT),
            drawPileHiddenCount: Math.max(
                0, (engineRoom.drawPile || []).length - DRAW_PILE_SNAPSHOT_LIMIT
            ),
            drawPileStartCount: engineRoom.drawPileStartCount || 0,
            levelDurationMs: engineRoom.levelDurationMs || 0,
            teamCarryOverBlocks: engineRoom.teamCarryOverBlocks || [],
            towerBlocks: engineRoom.towerBlocks || [],
            towerStability: engineRoom.towerStability ?? 100,
            towerStabilityDiagnostics: engineRoom.towerStabilityDiagnostics || {},
            towerStabilityComponents: engineRoom.towerStabilityComponents || [],
            towerStructuralPose: engineRoom.towerStructuralPose || [],
            historicalMaxStandingHeight: engineRoom.historicalMaxStandingHeight || 0,
            rebuildScoreCount: Math.max(0, Math.floor(Number(engineRoom.rebuildScoreCount) || 0)),
            lastChanceRescuePending: Boolean(engineRoom.lastChanceRescuePending),
            lastChanceRescueUsed: Boolean(engineRoom.lastChanceRescueUsed),
            criticalSaveClaimKeys: engineRoom.criticalSaveClaimKeys || {},
            sideQuest: engineRoom.sideQuest || null,
            state: engineRoom.state || "waiting",
            startsAt: engineRoom.startsAt || 0,
            endsAt: engineRoom.endsAt || 0,
            freezeEndsAt: engineRoom.freezeEndsAt || 0,
            lastLevelSummary: engineRoom.lastLevelSummary || null
        }
    };
}

class RedisState {
    constructor() {
        this.enabled = Boolean(process.env.REDIS_URL);
        this.client = null;
        this.publisher = null;
        this.subscriber = null;
        this.roomMessageHandler = null;
        this.memoryCounters = {
            player: 1,
            room: 1
        };
        this.memoryDemoStats = {
            completed: 0,
            failed: 0
        };
        this.memorySessions = new Map();
        this.memoryRooms = new Map();
        this.memoryOpenRooms = new Set();
        this.memoryPrivateInvites = new Map();
    }

    async connect() {
        if (!this.enabled || this.client) {
            return;
        }

        const redis = require("redis");
        const options = {
            url: process.env.REDIS_URL
        };

        if (process.env.REDIS_PASSWORD) {
            options.password = process.env.REDIS_PASSWORD;
        }

        await this.connectRedisClients(redis, options);

        await this.client.set(`pod:${POD_ID}`, String(Date.now()), {
            EX: ROOM_LEASE_SECONDS * 3
        });

        setInterval(() => {
            this.client?.set(`pod:${POD_ID}`, String(Date.now()), {
                EX: ROOM_LEASE_SECONDS * 3
            }).catch(error => {
                console.error("Redis pod heartbeat failed:", error.message);
            });
        }, 2000).unref();
    }

    async connectRedisClients(redis, options) {
        for (let attempt = 1; attempt <= REDIS_CONNECT_RETRIES; attempt++) {
            const client = redis.createClient(options);
            const publisher = client.duplicate();
            const subscriber = client.duplicate();

            client.on("error", error => {
                console.error("Redis client error:", error.message);
            });

            publisher.on("error", error => {
                console.error("Redis publisher error:", error.message);
            });

            subscriber.on("error", error => {
                console.error("Redis subscriber error:", error.message);
            });

            try {
                await client.connect();
                await publisher.connect();
                await subscriber.connect();

                this.client = client;
                this.publisher = publisher;
                this.subscriber = subscriber;

                if (attempt > 1) {
                    console.log(`Redis connected after ${attempt} attempts.`);
                }

                return;
            } catch (error) {
                await Promise.allSettled([
                    this.closeRedisClient(client),
                    this.closeRedisClient(publisher),
                    this.closeRedisClient(subscriber)
                ]);

                console.error(
                    `Redis connect attempt ${attempt}/${REDIS_CONNECT_RETRIES} failed: ${error.message}`
                );

                if (attempt === REDIS_CONNECT_RETRIES) {
                    throw error;
                }

                await sleep(REDIS_CONNECT_RETRY_DELAY_MS);
            }
        }
    }

    async closeRedisClient(client) {
        try {
            if (client.isOpen) {
                await client.quit();
                return;
            }

            client.disconnect();
        } catch (_error) {
            try {
                client.disconnect();
            } catch (_disconnectError) {
            }
        }
    }

    getPodId() {
        return POD_ID;
    }

    async isPodActive(podId) {
        if (!podId) {
            return false;
        }

        if (!this.enabled) {
            return String(podId) === String(POD_ID);
        }

        return Boolean(await this.client.exists(`pod:${podId}`));
    }

    getReconnectTtlSeconds() {
        return RECONNECT_TTL_SECONDS;
    }

    async nextPlayerId() {
        if (!this.enabled) {
            return `P${this.memoryCounters.player++}`;
        }

        const value = await this.client.incr("counter:player");
        return `P${value}`;
    }

    async nextRoomId() {
        if (!this.enabled) {
            return this.memoryCounters.room++;
        }

        return await this.client.incr("counter:room");
    }

    async claimPrivateInvite(inviteId, roomId) {
        if (!inviteId || roomId === null || roomId === undefined) {
            return false;
        }

        if (!this.enabled) {
            if (this.memoryPrivateInvites.has(inviteId)) {
                return false;
            }

            this.memoryPrivateInvites.set(inviteId, roomId);
            return true;
        }

        const claimed = await this.client.set(
            `privateInvite:${inviteId}`,
            String(roomId),
            { NX: true }
        );

        return Boolean(claimed);
    }

    async getPrivateInviteRoomId(inviteId) {
        if (!inviteId) {
            return null;
        }

        if (!this.enabled) {
            return this.memoryPrivateInvites.get(inviteId) || null;
        }

        const roomId = await this.client.get(`privateInvite:${inviteId}`);
        return roomId === null ? null : roomId;
    }

    async deletePrivateInvite(inviteId, expectedRoomId = null) {
        if (!inviteId) {
            return;
        }

        if (!this.enabled) {
            if (
                expectedRoomId === null ||
                String(this.memoryPrivateInvites.get(inviteId)) === String(expectedRoomId)
            ) {
                this.memoryPrivateInvites.delete(inviteId);
            }
            return;
        }

        const key = `privateInvite:${inviteId}`;

        if (expectedRoomId === null) {
            await this.client.del(key);
            return;
        }

        await this.client.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            {
                keys: [key],
                arguments: [String(expectedRoomId)]
            }
        );
    }

    async recordDemoOutcome(outcome) {
        if (outcome !== "completed" && outcome !== "failed") {
            return;
        }

        if (!this.enabled) {
            this.memoryDemoStats[outcome]++;
            return;
        }

        await this.client.incr(`stats:demo:level${outcome === "completed" ? "Completions" : "Failures"}`);
    }

    async getDemoStats() {
        if (!this.enabled) {
            return {
                completed: this.memoryDemoStats.completed,
                attempted: this.memoryDemoStats.completed + this.memoryDemoStats.failed
            };
        }

        const [completed, failed] = await this.client.mGet([
            "stats:demo:levelCompletions",
            "stats:demo:levelFailures"
        ]);

        const completedCount = Number(completed) || 0;
        const failedCount = Number(failed) || 0;

        return {
            completed: completedCount,
            attempted: completedCount + failedCount
        };
    }

    createReconnectToken() {
        return crypto.randomBytes(24).toString("hex");
    }

    async saveSession(session) {
        const record = {
            ...session,
            podId: POD_ID,
            lastSeenAt: Date.now()
        };

        if (!this.enabled) {
            this.memorySessions.set(record.sessionId, record);
            return record;
        }

        await this.client.set(
            `session:${record.sessionId}`,
            JSON.stringify(record),
            { EX: RECONNECT_TTL_SECONDS }
        );

        if (record.playerId) {
            await this.client.set(
                `playerSession:${record.playerId}`,
                record.sessionId,
                { EX: RECONNECT_TTL_SECONDS }
            );
        }

        return record;
    }

    async getSession(sessionId) {
        if (!sessionId) {
            return null;
        }

        if (!this.enabled) {
            return this.memorySessions.get(sessionId) || null;
        }

        const raw = await this.client.get(`session:${sessionId}`);
        return raw ? JSON.parse(raw) : null;
    }

    async isCurrentSessionConnection(sessionId, connectionId) {
        const session = await this.getSession(sessionId);

        if (!session) {
            return false;
        }

        if (!session.connectionId) {
            return true;
        }

        return session.connectionId === connectionId;
    }

    async markSessionDisconnected(player) {
        if (!player?.sessionId) {
            return;
        }

        const session = await this.getSession(player.sessionId);

        if (!session) {
            return false;
        }

        if (
            session.connectionId &&
            session.connectionId !== player.connectionId
        ) {
            return false;
        }

        await this.saveSession({
            ...session,
            connected: false,
            roomId: player.room?.id || session.roomId || null
        });

        return true;
    }

    async clearSessionRoom(sessionId, resumeDestination = null, resumeReason = null) {
        const session = await this.getSession(sessionId);

        if (!session) {
            return;
        }

        await this.saveSession({
            ...session,
            connected: false,
            roomId: null,
            resumeDestination,
            resumeReason
        });
    }

    async markRoomOpen(roomId) {
        if (!this.enabled) {
            this.memoryOpenRooms.add(roomId);
            return;
        }

        await this.client.sAdd("matchmaking:open_rooms", String(roomId));
    }

    async removeOpenRoom(roomId) {
        if (!this.enabled) {
            this.memoryOpenRooms.delete(roomId);
            return;
        }

        await this.client.sRem("matchmaking:open_rooms", String(roomId));
    }

    async claimOpenRoomId() {
        if (!this.enabled) {
            const next = this.memoryOpenRooms.values().next();

            if (next.done) {
                return null;
            }

            this.memoryOpenRooms.delete(next.value);
            return next.value;
        }

        const roomId = await this.client.sPop("matchmaking:open_rooms");
        return roomId === null ? null : Number(roomId);
    }

    async withMatchmakingLock(callback) {
        if (!this.enabled) {
            return await callback();
        }

        const lockKey = "lock:matchmaking";
        const lockValue = `${POD_ID}:${Date.now()}`;
        const locked = await this.client.set(lockKey, lockValue, {
            NX: true,
            PX: 3000
        });

        if (!locked) {
            return null;
        }

        try {
            return await callback();
        } finally {
            const currentValue = await this.client.get(lockKey);
            if (currentValue === lockValue) {
                await this.client.del(lockKey);
            }
        }
    }

    async saveRoom(room, renewLease = true) {
        const payload = stripRuntimeRoom(room);

        if (!this.enabled) {
            this.memoryRooms.set(String(payload.id), payload);
            return payload;
        }

        await this.client.set(`room:${payload.id}`, JSON.stringify(payload));

        if (renewLease) {
            await this.client.set(`roomLease:${payload.id}`, POD_ID, {
                EX: ROOM_LEASE_SECONDS
            });
        }

        await Promise.all(
            payload.players
                .filter(player => !player.isBot && player.sessionId)
                .map(async player => {
                    const existing = await this.getSession(player.sessionId);

                    return this.saveSession({
                        ...existing,
                        sessionId: player.sessionId,
                        reconnectToken: player.sessionId,
                        playerId: player.id,
                        roomId: payload.id,
                        connectionId: existing?.connectionId || player.connectionId || null,
                        connected: existing?.connected ?? true
                    });
                })
        );

        return payload;
    }

    async claimRoomLease(roomId) {
        if (!this.enabled) {
            return true;
        }

        const claimed = await this.client.set(`roomLease:${roomId}`, POD_ID, {
            NX: true,
            EX: ROOM_LEASE_SECONDS
        });

        return Boolean(claimed);
    }

    async getRoomLeaseOwner(roomId) {
        if (!this.enabled) {
            return POD_ID;
        }

        return await this.client.get(`roomLease:${roomId}`);
    }

    async getRoom(roomId) {
        if (!roomId) {
            return null;
        }

        if (!this.enabled) {
            return this.memoryRooms.get(String(roomId)) || null;
        }

        const raw = await this.client.get(`room:${roomId}`);
        return raw ? JSON.parse(raw) : null;
    }

    async deleteRoom(roomId) {
        if (!roomId) {
            return;
        }

        if (!this.enabled) {
            this.memoryRooms.delete(String(roomId));
            return;
        }

        await this.client.del(`room:${roomId}`);
        await this.client.del(`roomLease:${roomId}`);
    }

    async publishRoom(roomId, message) {
        if (!this.enabled) {
            return;
        }

        await this.publisher.publish(
            `room:${roomId}:events`,
            JSON.stringify({
                ...message,
                sourcePodId: POD_ID
            })
        );
    }

    async subscribeToRoom(roomId, handler) {
        if (!this.enabled || !roomId) {
            return;
        }

        await this.subscriber.subscribe(`room:${roomId}:events`, raw => {
            handler(JSON.parse(raw));
        });
    }

    async unsubscribeFromRoom(roomId) {
        if (!this.enabled || !roomId) {
            return;
        }

        await this.subscriber.unsubscribe(`room:${roomId}:events`);
    }

    async publishRoomAction(roomId, payload) {
        if (!this.enabled) {
            return;
        }

        await this.publisher.publish(
            `room:${roomId}:actions`,
            JSON.stringify({
                ...payload,
                sourcePodId: POD_ID
            })
        );
    }

    async subscribeToRoomActions(roomId, handler) {
        if (!this.enabled || !roomId) {
            return;
        }

        await this.subscriber.subscribe(`room:${roomId}:actions`, raw => {
            handler(JSON.parse(raw));
        });
    }

    async unsubscribeFromRoomActions(roomId) {
        if (!this.enabled || !roomId) {
            return;
        }

        await this.subscriber.unsubscribe(`room:${roomId}:actions`);
    }

    async publishPlayerAssignment(
        playerId,
        roomId,
        connectionId = null,
        privateJoinReason = null
    ) {
        if (!this.enabled) {
            return;
        }

        await this.publisher.publish(
            "player:assignments",
            JSON.stringify({
                playerId,
                roomId,
                connectionId,
                privateJoinReason,
                sourcePodId: POD_ID
            })
        );
    }

    async subscribeToPlayerAssignments(handler) {
        if (!this.enabled) {
            return;
        }

        await this.subscriber.subscribe("player:assignments", raw => {
            handler(JSON.parse(raw));
        });
    }
}

module.exports = {
    RedisState,
    stripRuntimePlayer,
    stripRuntimeRoom
};
