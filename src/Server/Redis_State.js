// Redis_State.js

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
        isBot: Boolean(player.isBot),
        score: player.score || 0,
        levelScore: player.levelScore || 0,
        scoreBreakdown: player.scoreBreakdown || {},
        contributedHeight: player.contributedHeight || 0,
        refreshTokens: player.refreshTokens || 0,
        refreshUsesThisLevel: player.refreshUsesThisLevel || 0,
        blocks: player.blocks || [],
        lastPlacementTime: player.lastPlacementTime || 0,
        lastQuickChatTime: player.lastQuickChatTime || 0,
        politicsInventory: player.politicsInventory || [],
        lastPoliticsActivationTime: player.lastPoliticsActivationTime || 0,
        scoreCap: player.scoreCap || null,
        botLoopLevel: player.botLoopLevel || null
    };
}

function stripRuntimeRoom(room) {
    const engineRoom = room.engine?.room || room.state || {};

    return {
        id: room.id,
        ownerPodId: room.ownerPodId || POD_ID,
        players: (room.players || []).map(stripRuntimePlayer),
        state: {
            level: engineRoom.level || 1,
            checkpointLevel: engineRoom.checkpointLevel || 1,
            checkpointScores: engineRoom.checkpointScores || {},
            checkpointPolitics: engineRoom.checkpointPolitics || {},
            targetHeight: engineRoom.targetHeight || 0,
            currentHeight: engineRoom.currentHeight || 0,
            drawPile: engineRoom.drawPile || [],
            teamCarryOverBlocks: engineRoom.teamCarryOverBlocks || [],
            towerBlocks: engineRoom.towerBlocks || [],
            towerStability: engineRoom.towerStability ?? 100,
            towerStabilityDiagnostics: engineRoom.towerStabilityDiagnostics || {},
            sideQuest: engineRoom.sideQuest || null,
            state: engineRoom.state || "waiting",
            startsAt: engineRoom.startsAt || 0,
            endsAt: engineRoom.endsAt || 0,
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
        this.memorySessions = new Map();
        this.memoryRooms = new Map();
        this.memoryQueue = [];
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
                console.log("Redis pod heartbeat failed:", error.message);
            });
        }, 2000).unref();
    }

    async connectRedisClients(redis, options) {
        for (let attempt = 1; attempt <= REDIS_CONNECT_RETRIES; attempt++) {
            const client = redis.createClient(options);
            const publisher = client.duplicate();
            const subscriber = client.duplicate();

            client.on("error", error => {
                console.log("Redis client error:", error.message);
            });

            publisher.on("error", error => {
                console.log("Redis publisher error:", error.message);
            });

            subscriber.on("error", error => {
                console.log("Redis subscriber error:", error.message);
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

                console.log(
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
                // Best effort cleanup after failed startup connection attempts.
            }
        }
    }

    getPodId() {
        return POD_ID;
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

    async markSessionDisconnected(player) {
        if (!player?.sessionId) {
            return;
        }

        const session = await this.getSession(player.sessionId);

        if (!session) {
            return;
        }

        await this.saveSession({
            ...session,
            connected: false,
            roomId: player.room?.id || session.roomId || null
        });
    }

    async enqueuePlayer(player) {
        const payload = stripRuntimePlayer(player);

        if (!this.enabled) {
            if (!this.memoryQueue.some(item => item.id === payload.id)) {
                this.memoryQueue.push(payload);
            }
            return;
        }

        await this.client.lPush("matchmaking:queue", JSON.stringify(payload));
    }

    async removeQueuedPlayer(playerId) {
        if (!this.enabled) {
            this.memoryQueue = this.memoryQueue.filter(player => player.id !== playerId);
            return;
        }

        const queued = await this.client.lRange("matchmaking:queue", 0, -1);
        await Promise.all(
            queued
                .filter(raw => JSON.parse(raw).id === playerId)
                .map(raw => this.client.lRem("matchmaking:queue", 0, raw))
        );
    }

    async getQueuedPlayers() {
        if (!this.enabled) {
            return [...this.memoryQueue];
        }

        const queued = await this.client.lRange("matchmaking:queue", 0, -1);
        return queued.map(raw => JSON.parse(raw)).reverse();
    }

    async replaceQueue(players) {
        const cleanPlayers = players.map(stripRuntimePlayer);

        if (!this.enabled) {
            this.memoryQueue = cleanPlayers;
            return;
        }

        const multi = this.client.multi();
        multi.del("matchmaking:queue");
        cleanPlayers
            .slice()
            .reverse()
            .forEach(player => {
                multi.lPush("matchmaking:queue", JSON.stringify(player));
            });
        await multi.exec();
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
                .map(player => this.saveSession({
                    sessionId: player.sessionId,
                    reconnectToken: player.sessionId,
                    playerId: player.id,
                    roomId: payload.id,
                    connected: true
                }))
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
}

module.exports = {
    RedisState,
    stripRuntimePlayer,
    stripRuntimeRoom
};
