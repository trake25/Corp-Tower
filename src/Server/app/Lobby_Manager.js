const GameEngine = require("./Game_Engine");
const crypto = require("crypto");
const GameConfig = require("./Game_Config");
const DebugConfig = require("./Debug_Config");
const { RedisState, stripRuntimePlayer } = require("./Redis_State");
const ProfileStore = require("./Profile_Store");

const MAX_OPEN_ROOM_CLAIM_ATTEMPTS = 5;
const PRIVATE_ROOM_SEAT_COUNT = 3;
const PRIVATE_SERVER_ID_LENGTH = 8;
const PRIVATE_SERVER_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const PRIVATE_SERVER_ID_ATTEMPTS = 64;
const PRIVATE_DISPLAY_NAME_MAX_LENGTH = 24;

class LobbyManager {
    constructor(stateStore = new RedisState()) {
        this.stateStore = stateStore;
        this.profileStore = new ProfileStore();
        this.rooms = [];
        this.connectedPlayers = new Map();
        this.roomReconnectTimers = new Map();
        this.roomLobbyTimers = new Map();
        this.privateLobbyStartTimers = new Map();
        this.privateLobbyGraceTimers = new Map();
        this.privateLobbyExpiryTimers = new Map();
        this.botCounter = 1;
    }

    async start() {
        await this.stateStore.connect();
        await this.profileStore.connect();

        await this.stateStore.subscribeToPlayerAssignments(message => {
            this.handlePlayerAssignment(message).catch(error => {
                console.error("Player assignment handling failed:", error.message);
            });
        });

        console.log(
            `Lobby state: ${this.stateStore.enabled ? "Redis" : "memory"} (${this.stateStore.getPodId()})`
        );
    }

    async handlePlayerAssignment({
        playerId,
        roomId,
        sourcePodId,
        connectionId = null,
        privateJoinReason = null
    }) {
        if (sourcePodId === this.stateStore.getPodId()) {
            return;
        }

        const player = this.connectedPlayers.get(playerId);

        if (!player || (connectionId && player.connectionId !== connectionId)) {
            return;
        }

        if (privateJoinReason) {
            this.sendPrivateJoinRejected(player, privateJoinReason);
            return;
        }

        if (player.room) {
            return;
        }

        await this.resumePlayer(player, roomId);
    }

    resolveIdentityFields(reconnectRequest, identity) {
        if (identity && identity.userId) {
            return {
                profileId: identity.userId,
                displayName: identity.displayName || null
            };
        }

        return {
            profileId: reconnectRequest.profileId || null,
            displayName: null
        };
    }

    privateEntryFor(reconnectRequest = {}) {
        const entryMode = String(reconnectRequest.entryMode || "public");

        if (entryMode !== "private_create" && entryMode !== "private_join") {
            return { entryMode: "public" };
        }

        const rawName = reconnectRequest.privateDisplayName;
        const privateDisplayName = typeof rawName === "string"
            ? Array.from(rawName.trim()).slice(0, PRIVATE_DISPLAY_NAME_MAX_LENGTH).join("")
            : "";

        return {
            entryMode,
            privateDisplayName,
            privateServerId: String(reconnectRequest.privateServerId || "").trim().toUpperCase(),
            privatePassword: reconnectRequest.privatePassword
        };
    }

    normalizePrivatePassword(value) {
        if (value === undefined || value === null || value === "") {
            return "";
        }

        if (typeof value !== "string" || !/^[0-9]{4}$/.test(value)) {
            return null;
        }

        return value;
    }

    isPrivateRoom(room) {
        return Boolean(room && room.roomMode === "private");
    }

    privateTimerKey(roomId, playerId) {
        return `${roomId}:${playerId}`;
    }

    async generatePrivateServerId(roomId) {
        for (let attempt = 0; attempt < PRIVATE_SERVER_ID_ATTEMPTS; attempt++) {
            let serverId = "";

            for (let index = 0; index < PRIVATE_SERVER_ID_LENGTH; index++) {
                serverId += PRIVATE_SERVER_ID_ALPHABET[
                    crypto.randomInt(PRIVATE_SERVER_ID_ALPHABET.length)
                ];
            }

            if (await this.stateStore.claimPrivateInvite(serverId, roomId)) {
                return serverId;
            }
        }

        throw new Error("Unable to allocate a private server ID");
    }

    sendPrivateJoinRejected(player, reason) {
        this.sendPlayer(player, {
            type: "private_join_rejected",
            reason
        });
    }

    retireConnection(player) {
        if (
            !player?.ws ||
            player.ws.readyState !== 1 ||
            typeof player.ws.close !== "function"
        ) {
            return;
        }

        player.ws.close(4000, "superseded_connection");
    }

    async isCurrentPlayerConnection(player) {
        if (!player || this.connectedPlayers.get(player.id) !== player) {
            return false;
        }

        if (!this.stateStore.isCurrentSessionConnection) {
            return true;
        }

        return await this.stateStore.isCurrentSessionConnection(
            player.sessionId, player.connectionId
        );
    }

    async createPlayer(ws, reconnectRequest = {}, identity = null) {
        const identityFields = this.resolveIdentityFields(reconnectRequest, identity);
        const privateEntry = this.privateEntryFor(reconnectRequest);
        const resumeOnly = reconnectRequest.resumeOnly === true;
        const existingSession =
            await this.stateStore.getSession(reconnectRequest.reconnectToken);

        if (
            existingSession &&
            existingSession.playerId === reconnectRequest.playerId
        ) {
            const previousPlayer = this.connectedPlayers.get(existingSession.playerId);
            const canUseFreshEntry = !existingSession.roomId && !existingSession.resumeDestination;
            const player = {
                id: existingSession.playerId,
                sessionId: existingSession.sessionId,
                connectionId: this.stateStore.createReconnectToken(),
                profileId: identityFields.profileId,
                displayName: identityFields.displayName,
                privateDisplayName: canUseFreshEntry
                    ? privateEntry.privateDisplayName || null
                    : null,
                privateEntry: canUseFreshEntry ? privateEntry : undefined,
                ws: ws,
                score: 0,
                lastPlacementTime: 0
            };

            this.connectedPlayers.set(player.id, player);
            await this.stateStore.saveSession({
                ...existingSession,
                connectionId: player.connectionId,
                connected: true
            });

            this.retireConnection(previousPlayer);

            if (existingSession.resumeDestination) {
                await this.reportResumeUnavailable(
                    player,
                    existingSession.resumeReason || "room_unavailable",
                    existingSession.resumeDestination
                );
                return player;
            }

            await this.resumePlayer(player, existingSession.roomId, { resumeOnly });
            return player;
        }

        const sessionId = this.stateStore.createReconnectToken();
        const player = {
            id: await this.stateStore.nextPlayerId(),
            sessionId: sessionId,
            connectionId: this.stateStore.createReconnectToken(),
            profileId: identityFields.profileId,
            displayName: identityFields.displayName,
            privateDisplayName: privateEntry.privateDisplayName || null,
            privateEntry,
            ws: ws,
            score: 0,
            lastPlacementTime: 0
        };

        this.connectedPlayers.set(player.id, player);
        await this.stateStore.saveSession({
            sessionId: sessionId,
            reconnectToken: sessionId,
            playerId: player.id,
            roomId: null,
            connectionId: player.connectionId,
            connected: true
        });

        if (resumeOnly) {
            await this.reportResumeUnavailable(player, "room_unavailable", "home");
        }

        return player;
    }

    async addPlayer(player) {
        this.resetParticipantState(player);
        this.connectedPlayers.set(player.id, player);

        if (player.privateEntry?.entryMode === "private_create") {
            await this.createPrivateRoom(player, player.privateEntry);
            return;
        }

        if (player.privateEntry?.entryMode === "private_join") {
            await this.joinPrivateRoom(player, player.privateEntry);
            return;
        }

        await this.joinOrCreateRoom(player);
    }

    async reportResumeUnavailable(player, reason, destination = null) {
        player.resumeUnavailable = true;

        if (this.stateStore.clearSessionRoom) {
            await this.stateStore.clearSessionRoom(player.sessionId, destination, reason);
        }

        this.sendPlayer(player, {
            type: "resume_unavailable",
            reason,
            ...(destination ? { destination } : {})
        });
    }

    async resumePlayer(player, roomId, options = {}) {
        const resumeOnly = options.resumeOnly === true;

        if (!roomId) {
            if (resumeOnly) {
                await this.reportResumeUnavailable(player, "room_unavailable", "home");
            } else {
                await this.addPlayer(player);
            }
            return;
        }

        let room = this.rooms.find(activeRoom => String(activeRoom.id) === String(roomId));

        if (!room) {
            room = await this.hydrateRoom(roomId);
        }

        if (
            room &&
            this.isPrivateRoom(room) &&
            !room.matchStarted &&
            !this.isRoomOwner(room)
        ) {
            room = await this.refreshPrivateLobbyReplica(room);
        }

        if (!room) {
            await this.reportResumeUnavailable(
                player,
                "reconnect_ttl_expired",
                resumeOnly ? "home" : null
            );
            return;
        }

        const roomPlayer =
            room.players.find(candidate => candidate.id === player.id);

        if (!roomPlayer) {
            await this.reportResumeUnavailable(
                player,
                "room_unavailable",
                resumeOnly ? "home" : null
            );
            return;
        }

        if (room.matchStarted && roomPlayer.presence === "left") {
            await this.reportResumeUnavailable(player, "player_left_game", "home");
            return;
        }

        if (resumeOnly && !room.matchStarted && !this.isPrivateRoom(room)) {
            if (this.isRoomOwner(room)) {
                await this.evictLobbyPlayer(room, roomPlayer, "player_left_lobby");
            } else {
                roomPlayer.ws = null;
                await this.stateStore.publishRoomAction(room.id, {
                    playerId: player.id,
                    action: {
                        type: "leave_lobby",
                        connectionId: player.connectionId
                    }
                });
            }

            await this.reportResumeUnavailable(player, "room_unavailable", "home");
            return;
        }

        roomPlayer.ws = player.ws;
        roomPlayer.sessionId = player.sessionId;
        roomPlayer.connectionId = player.connectionId;
        roomPlayer.profileId = player.profileId || roomPlayer.profileId;
        roomPlayer.displayName = player.displayName || roomPlayer.displayName || null;
        player.privateDisplayName = roomPlayer.privateDisplayName || player.privateDisplayName || null;
        player.room = room;

        if (this.isPrivateRoom(room) && !room.matchStarted) {
            if (this.isRoomOwner(room)) {
                await this.restorePrivateLobbyPlayer(room, roomPlayer);
            } else {
                await this.stateStore.publishRoomAction(room.id, {
                    playerId: player.id,
                    action: {
                        type: "private_reconnect",
                        connectionId: player.connectionId
                    }
                });
            }
        } else if (room.matchStarted) {
            this.cancelRoomReconnectExpiry(room.id);

            if (this.isRoomOwner(room)) {
                await this.setStartedRoomPresence(
                    room, roomPlayer, "connected", player.connectionId
                );
            } else {
                await this.stateStore.publishRoomAction(room.id, {
                    playerId: player.id,
                    action: {
                        type: "game_reconnect",
                        connectionId: player.connectionId
                    }
                });
                roomPlayer.presence = "connected";
            }
        }

        await this.stateStore.saveSession({
            sessionId: player.sessionId,
            reconnectToken: player.sessionId,
            playerId: player.id,
            roomId: room.id,
            connectionId: player.connectionId,
            connected: true
        });

        const roster = await this.buildRoomRoster(room);

        this.sendPlayer(player, {
            type: "room_resumed",
            playerId: player.id,
            reconnectToken: player.sessionId,
            reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
            roomId: room.id,
            roomMode: room.roomMode || "public",
            level: room.engine.room.level,
            targetHeight: room.engine.room.targetHeight,
            impactScoreStatus: room.engine.getImpactScoreStatus(),
            activeInventorySlots: room.engine.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            blocks: roomPlayer.blocks || [],
            drawPileCount: (room.engine.room.drawPile || []).length,
            nextDrawBlock: room.engine.getNextDrawBlock(),
            roster: roster,
            matchStarted: Boolean(room.matchStarted),
            lobby: room.matchStarted ? null : this.buildLobbyPayload(room),
            privateLobby: room.matchStarted ? null : this.buildPrivateLobbyPayload(room)
        });

        if (room.matchStarted) {
            await this.resyncState(player, "");
        }
    }

    async refreshPrivateLobbyReplica(room) {
        if (!room || this.isRoomOwner(room) || !this.isPrivateRoom(room)) {
            return room;
        }

        const snapshot = await this.stateStore.getRoom(room.id);

        if (!snapshot || !this.isPrivateRoom(snapshot)) {
            return null;
        }

        const refreshedPlayers = snapshot.players.map(snapshotPlayer => {
            const currentPlayer = room.players.find(player => player.id === snapshotPlayer.id);
            const connectedPlayer = this.connectedPlayers.get(snapshotPlayer.id);

            return {
                ...stripRuntimePlayer(snapshotPlayer),
                ws: connectedPlayer?.ws || currentPlayer?.ws || null,
                room
            };
        });

        room.players.splice(0, room.players.length, ...refreshedPlayers);
        room.matchStarted = Boolean(snapshot.matchStarted);
        room.privateServerId = snapshot.privateServerId || null;
        room.privatePassword = snapshot.privatePassword || "";
        room.hostPlayerId = snapshot.hostPlayerId || null;
        room.privateStartDeadlineAt = snapshot.privateStartDeadlineAt || 0;
        room.readyPlayerIds = new Set(snapshot.readyPlayerIds || []);
        room.lobbyDeadlineAt = snapshot.lobbyDeadlineAt || 0;
        return room;
    }

    async removePlayer(player) {
        if (this.connectedPlayers.get(player.id) !== player) {
            return;
        }

        this.connectedPlayers.delete(player.id);

        const disconnected = await this.stateStore.markSessionDisconnected(player);

        if (disconnected === false) {
            return;
        }

        if (player.room && !player.room.matchStarted) {
            if (this.isPrivateRoom(player.room)) {
                await this.handlePrivateLobbyDisconnect(player);
                this.resetBotCounterIfIdle();
                console.log(`${player.id} disconnected from a private lobby`);
                return;
            }

            await this.evictLobbyPlayer(player.room, player, "player_left_lobby");
            this.resetBotCounterIfIdle();
            console.log(`${player.id} left the lobby by disconnecting`);
            return;
        }

        if (player.room) {
            const roomPlayer =
                player.room.players.find(candidate => candidate.id === player.id);

            if (roomPlayer) {
                roomPlayer.ws = null;
            }

            if (this.isRoomOwner(player.room)) {
                await this.setStartedRoomPresence(
                    player.room, roomPlayer, "disconnected", player.connectionId
                );
            } else if (roomPlayer) {
                roomPlayer.presence = "disconnected";
                await this.stateStore.publishRoomAction(player.room.id, {
                    playerId: player.id,
                    action: {
                        type: "game_disconnect",
                        connectionId: player.connectionId
                    }
                });
            }
        }

        this.resetBotCounterIfIdle();
        console.log(`${player.id} disconnected; reconnect TTL active`);
    }

    scheduleRoomReconnectExpiry(room) {
        if (!room || this.roomReconnectTimers.has(room.id)) {
            return;
        }

        const ttlMs = this.stateStore.getReconnectTtlSeconds() * 1000;

        const timer = setTimeout(() => {
            this.handleRoomReconnectExpired(room.id).catch(error => {
                console.error("Reconnect expiry handling failed:", error.message);
            });
        }, ttlMs);

        if (timer.unref) {
            timer.unref();
        }

        this.roomReconnectTimers.set(room.id, timer);
    }

    cancelRoomReconnectExpiry(roomId) {
        const timer = this.roomReconnectTimers.get(roomId);

        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.roomReconnectTimers.delete(roomId);
    }

    async handleRoomReconnectExpired(roomId) {
        this.roomReconnectTimers.delete(roomId);

        const room =
            this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room) {
            return;
        }

        const hasConnectedRealPlayer = room.players.some(roomPlayer => {
            if (room.matchStarted) {
                return !roomPlayer.isBot && roomPlayer.presence === "connected";
            }

            return this.isConnectedRealPlayer(roomPlayer);
        });

        if (hasConnectedRealPlayer) {
            return;
        }

        await this.closeRoom(
            room,
            "reconnect_ttl_expired"
        );
    }

    privateRoomIsFullAndReady(room) {
        return (
            this.isPrivateRoom(room) &&
            room.players.length === PRIVATE_ROOM_SEAT_COUNT &&
            room.players.every(player => {
                return (
                    player.privateLobbyConnectionPhase === "connected" &&
                    room.readyPlayerIds.has(player.id)
                );
            })
        );
    }

    clearPrivateLobbyTimer(map, roomId, playerId) {
        const key = this.privateTimerKey(roomId, playerId);
        const timer = map.get(key);

        if (timer) {
            clearTimeout(timer);
            map.delete(key);
        }
    }

    cancelPrivateLobbyDisconnectTimers(roomId, playerId) {
        this.clearPrivateLobbyTimer(this.privateLobbyGraceTimers, roomId, playerId);
        this.clearPrivateLobbyTimer(this.privateLobbyExpiryTimers, roomId, playerId);
    }

    cancelAllPrivateLobbyDisconnectTimers(roomId) {
        for (const key of this.privateLobbyGraceTimers.keys()) {
            if (key.startsWith(`${roomId}:`)) {
                const timer = this.privateLobbyGraceTimers.get(key);
                clearTimeout(timer);
                this.privateLobbyGraceTimers.delete(key);
            }
        }

        for (const key of this.privateLobbyExpiryTimers.keys()) {
            if (key.startsWith(`${roomId}:`)) {
                const timer = this.privateLobbyExpiryTimers.get(key);
                clearTimeout(timer);
                this.privateLobbyExpiryTimers.delete(key);
            }
        }
    }

    schedulePrivateLobbyTimer(map, roomId, playerId, delayMs, callback) {
        const key = this.privateTimerKey(roomId, playerId);
        this.clearPrivateLobbyTimer(map, roomId, playerId);

        const timer = setTimeout(() => {
            map.delete(key);
            callback().catch(error => {
                console.error("Private lobby timer failed:", error.message);
            });
        }, Math.max(0, delayMs));

        if (timer.unref) {
            timer.unref();
        }

        map.set(key, timer);
    }

    schedulePrivateLobbyDisconnectTimers(room, player) {
        if (!this.isPrivateRoom(room) || !this.isRoomOwner(room) || !player) {
            return;
        }

        this.cancelPrivateLobbyDisconnectTimers(room.id, player.id);

        if (player.privateLobbyConnectionPhase === "connected") {
            return;
        }

        const now = Date.now();
        const expiresAt = Number(player.privateLobbyExpiresAt) || 0;

        if (expiresAt <= now) {
            this.schedulePrivateLobbyTimer(
                this.privateLobbyExpiryTimers,
                room.id,
                player.id,
                0,
                () => this.expirePrivateLobbyPlayer(room.id, player.id)
            );
            return;
        }

        if (player.privateLobbyConnectionPhase === "recovering") {
            const graceAt = Number(player.privateLobbyGraceAt) || now;
            this.schedulePrivateLobbyTimer(
                this.privateLobbyGraceTimers,
                room.id,
                player.id,
                graceAt - now,
                () => this.beginPrivateLobbyGrace(room.id, player.id)
            );
        }

        this.schedulePrivateLobbyTimer(
            this.privateLobbyExpiryTimers,
            room.id,
            player.id,
            expiresAt - now,
            () => this.expirePrivateLobbyPlayer(room.id, player.id)
        );
    }

    schedulePrivateLobbyTimers(room) {
        if (!this.isPrivateRoom(room) || !this.isRoomOwner(room)) {
            return;
        }

        room.players.forEach(player => {
            this.schedulePrivateLobbyDisconnectTimers(room, player);
        });

        this.schedulePrivateStartCountdown(room);
    }

    async beginPrivateLobbyGrace(roomId, playerId) {
        const room = this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room || !this.isPrivateRoom(room) || !this.isRoomOwner(room)) {
            return;
        }

        const player = room.players.find(candidate => candidate.id === playerId);

        if (!player || player.privateLobbyConnectionPhase !== "recovering") {
            return;
        }

        const now = Date.now();

        if ((Number(player.privateLobbyExpiresAt) || 0) <= now) {
            await this.expirePrivateLobbyPlayer(roomId, playerId);
            return;
        }

        if ((Number(player.privateLobbyGraceAt) || 0) > now) {
            this.schedulePrivateLobbyDisconnectTimers(room, player);
            return;
        }

        player.privateLobbyConnectionPhase = "grace";
        await this.stateStore.saveRoom(room, true);
        await this.broadcastLobbyUpdate(room);
        this.schedulePrivateLobbyDisconnectTimers(room, player);
    }

    async expirePrivateLobbyPlayer(roomId, playerId) {
        this.cancelPrivateLobbyDisconnectTimers(roomId, playerId);

        const room = this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room || !this.isPrivateRoom(room) || !this.isRoomOwner(room)) {
            return;
        }

        const player = room.players.find(candidate => candidate.id === playerId);

        if (!player || player.privateLobbyConnectionPhase === "connected") {
            return;
        }

        if ((Number(player.privateLobbyExpiresAt) || 0) > Date.now()) {
            this.schedulePrivateLobbyDisconnectTimers(room, player);
            return;
        }

        if (player.id === room.hostPlayerId) {
            await this.closePrivateRoom(room, "private_host_reconnect_expired");
            return;
        }

        await this.evictPrivateLobbyPlayer(
            room,
            player,
            "private_guest_reconnect_expired",
            "join_server",
            true
        );
    }

    cancelPrivateStartCountdown(room) {
        if (!room) {
            return;
        }

        const timer = this.privateLobbyStartTimers.get(room.id);

        if (timer) {
            clearTimeout(timer);
            this.privateLobbyStartTimers.delete(room.id);
        }

        room.privateStartDeadlineAt = 0;
    }

    schedulePrivateStartCountdown(room) {
        if (
            !this.isPrivateRoom(room) ||
            !this.isRoomOwner(room) ||
            room.matchStarted ||
            !room.privateStartDeadlineAt ||
            this.privateLobbyStartTimers.has(room.id)
        ) {
            return;
        }

        const timer = setTimeout(() => {
            this.privateLobbyStartTimers.delete(room.id);
            this.handlePrivateStartCountdown(room.id).catch(error => {
                console.error("Private lobby start failed:", error.message);
            });
        }, Math.max(0, room.privateStartDeadlineAt - Date.now()));

        if (timer.unref) {
            timer.unref();
        }

        this.privateLobbyStartTimers.set(room.id, timer);
    }

    async reconcilePrivateStartCountdown(room) {
        if (!this.isPrivateRoom(room)) {
            return;
        }

        if (this.privateRoomIsFullAndReady(room)) {
            if (!room.privateStartDeadlineAt) {
                room.privateStartDeadlineAt = Date.now() + GameConfig.privateLobbyStartCountdownMs;
            }
            this.schedulePrivateStartCountdown(room);
            return;
        }

        this.cancelPrivateStartCountdown(room);
    }

    async handlePrivateStartCountdown(roomId) {
        const room = this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room || !this.isPrivateRoom(room) || !this.isRoomOwner(room) || room.matchStarted) {
            return;
        }

        if (room.privateStartDeadlineAt > Date.now()) {
            this.schedulePrivateStartCountdown(room);
            return;
        }

        if (!this.privateRoomIsFullAndReady(room)) {
            this.cancelPrivateStartCountdown(room);
            await this.stateStore.saveRoom(room, true);
            await this.broadcastLobbyUpdate(room);
            return;
        }

        room.privateStartDeadlineAt = 0;
        await this.startMatch(room);
    }

    async handlePrivateLobbyDisconnect(player) {
        const room = player.room;

        if (!room || !this.isPrivateRoom(room) || room.matchStarted) {
            return;
        }

        const roomPlayer = room.players.find(candidate => candidate.id === player.id);

        if (!roomPlayer) {
            return;
        }

        roomPlayer.ws = null;

        if (!this.isRoomOwner(room)) {
            await this.stateStore.publishRoomAction(room.id, {
                playerId: player.id,
                action: {
                    type: "private_disconnect",
                    connectionId: player.connectionId
                }
            });
            return;
        }

        await this.markPrivateLobbyDisconnected(room, roomPlayer);
    }

    async markPrivateLobbyDisconnected(room, player) {
        if (!this.isPrivateRoom(room) || !player || player.privateLobbyConnectionPhase !== "connected") {
            return;
        }

        const now = Date.now();
        player.ws = null;
        player.privateLobbyConnectionPhase = "recovering";
        player.privateLobbyGraceAt = now + GameConfig.privateLobbyReconnectPhaseMs;
        player.privateLobbyExpiresAt = player.privateLobbyGraceAt + GameConfig.privateLobbyGracePhaseMs;
        room.readyPlayerIds.delete(player.id);
        this.cancelPrivateStartCountdown(room);

        await this.stateStore.saveRoom(room, true);
        await this.broadcastLobbyUpdate(room);
        this.schedulePrivateLobbyDisconnectTimers(room, player);
    }

    async restorePrivateLobbyPlayer(room, player) {
        if (!this.isPrivateRoom(room) || !player) {
            return;
        }

        const wasDisconnected = player.privateLobbyConnectionPhase !== "connected";
        this.cancelPrivateLobbyDisconnectTimers(room.id, player.id);
        player.privateLobbyConnectionPhase = "connected";
        player.privateLobbyGraceAt = 0;
        player.privateLobbyExpiresAt = 0;

        if (!wasDisconnected) {
            return;
        }

        room.readyPlayerIds.delete(player.id);
        this.cancelPrivateStartCountdown(room);
        await this.stateStore.saveRoom(room, true);
        await this.broadcastLobbyUpdate(room);
    }

    async setStartedRoomPresence(room, player, presence, connectionId = null) {
        if (
            !room?.matchStarted ||
            !player ||
            player.isBot ||
            !["connected", "disconnected"].includes(presence) ||
            player.presence === "left"
        ) {
            return false;
        }

        if (
            presence === "disconnected" &&
            connectionId &&
            player.connectionId &&
            player.connectionId !== connectionId
        ) {
            return false;
        }

        const changed = player.presence !== presence;

        if (presence === "connected" && connectionId) {
            player.connectionId = connectionId;
        }

        player.presence = presence;

        if (presence === "disconnected") {
            player.ws = null;
        }

        if (changed) {
            room.engine.broadcastGameState({ includeTransientEvents: false });
        }

        await this.stateStore.saveRoom(room, true);

        if (
            !room.players.some(candidate => {
                return !candidate.isBot && candidate.presence === "connected";
            })
        ) {
            this.scheduleRoomReconnectExpiry(room);
        }

        return true;
    }

    resetParticipantState(player) {
        player.score = player.score || 0;
        player.levelScore = player.levelScore || 0;
        player.scoreBreakdown = player.scoreBreakdown || {};
        player.contributedHeight = player.contributedHeight || 0;
        player.blocks = player.blocks || [];
        player.lastPlacementTime = player.lastPlacementTime || 0;
        player.botLoopLevel = null;
        player.room = null;
    }

    isConnectedRealPlayer(player) {
        return (
            !player.isBot &&
            player.ws &&
            player.ws.readyState === 1
        );
    }

    sendPlayer(player, message) {
        if (player?.ws && player.ws.readyState === 1) {
            player.ws.send(JSON.stringify(message));
        }
    }

    async closeRoom(room, reason, destination = null, destinationByPlayerId = null) {
        if (!room) {
            return;
        }

        const existingRoom =
            this.rooms.find(activeRoom => activeRoom.id === room.id);

        if (!existingRoom) {
            return;
        }

        const closeMessage = {
            type: "room_closed",
            reason
        };

        if (destination) {
            closeMessage.destination = destination;
        }

        if (destinationByPlayerId && Object.keys(destinationByPlayerId).length) {
            closeMessage.destinationByPlayerId = destinationByPlayerId;
        }

        console.log(`Closing room ${room.id}: ${reason}`);
        this.cancelRoomReconnectExpiry(room.id);
        this.cancelLobbyReadyTimeout(room.id);
        this.cancelPrivateStartCountdown(room);
        this.cancelAllPrivateLobbyDisconnectTimers(room.id);

        if (this.isRoomOwner(existingRoom)) {
            await this.stateStore.publishRoom(room.id, closeMessage);
        }

        room.engine.closeRoom(reason, false);

        this.rooms = this.rooms.filter(
            activeRoom => activeRoom.id !== room.id
        );

        await this.stateStore.deleteRoom(room.id);
        await this.stateStore.removeOpenRoom(room.id);

        if (this.isPrivateRoom(room)) {
            await this.stateStore.deletePrivateInvite(room.privateServerId, room.id);
        }

        await Promise.all(room.players.map(roomPlayer => {
            return roomPlayer.isBot || !this.stateStore.clearSessionRoom
                ? null
                : this.stateStore.clearSessionRoom(
                    roomPlayer.sessionId,
                    destinationByPlayerId?.[roomPlayer.id] || destination || null,
                    reason
                );
        }));

        room.players.forEach(roomPlayer => {
            const connectedPlayer = this.connectedPlayers.get(roomPlayer.id);
            const notificationPlayer = connectedPlayer || roomPlayer;
            const shouldNotify = this.isConnectedRealPlayer(notificationPlayer);

            this.resetParticipantState(roomPlayer);
            if (connectedPlayer && connectedPlayer !== roomPlayer) {
                this.resetParticipantState(connectedPlayer);
            }

            if (roomPlayer.isBot) {
                return;
            }

            if (shouldNotify) {
                this.sendPlayer(notificationPlayer, closeMessage);
            }
        });

        if (this.stateStore.unsubscribeFromRoom) {
            await this.stateStore.unsubscribeFromRoom(room.id);
        }

        if (this.stateStore.unsubscribeFromRoomActions) {
            await this.stateStore.unsubscribeFromRoomActions(room.id);
        }

        this.resetBotCounterIfIdle();
    }

    async closePrivateRoom(room, reason) {
        const destinationByPlayerId = {};

        room.players.forEach(player => {
            if (!player.isBot) {
                destinationByPlayerId[player.id] = player.id === room.hostPlayerId
                    ? "private_server"
                    : "home";
            }
        });

        await this.closeRoom(room, reason, null, destinationByPlayerId);
    }

    resetBotCounterIfIdle() {
        const hasBots = this.rooms.some(room => {
            return room.players.some(player => player.isBot);
        });

        if (!hasBots) {
            this.botCounter = 1;
        }
    }

    getRealPlayers() {
        const players = [];
        const seen = new Set();

        const addPlayer = player => {
            if (
                player.isBot ||
                !player.ws ||
                player.ws.readyState !== 1 ||
                seen.has(player.id)
            ) {
                return;
            }

            seen.add(player.id);
            players.push(player);
        };

        this.rooms.forEach(room => {
            room.players.forEach(addPlayer);
        });

        return players;
    }

    broadcastDebugConfig() {
        const message = {
            type: "debug_config",
            config: this.getDebugConfig()
        };

        this.getRealPlayers().forEach(player => {
            this.sendPlayer(player, message);
        });
    }

    getDebugConfig() {
        return DebugConfig.snapshot();
    }

    applyDefaultDebugConfig() {
        DebugConfig.applyDefaults();
    }

    invalidateTowerStabilityResults() {
        this.rooms.forEach(room => {
            if (!room.engine?.room || room.engine.room.state === "closed") return;
            room.engine.room.towerStabilityResult = null;
        });
    }

    async resetDebugConfigToDefaults() {
        const previousBotsEnabled = GameConfig.debugBotsEnabled;
        const previousBotCount = GameConfig.debugBotCount;
        const previousStartLevel = GameConfig.debugStartLevel;
        const previousStabilityDifficulty = GameConfig.towerStabilityDifficulty;
        const previousLateralLoadShare = GameConfig.towerLateralLoadShare;

        this.applyDefaultDebugConfig();

        if (
            previousStabilityDifficulty !== GameConfig.towerStabilityDifficulty ||
            previousLateralLoadShare !== GameConfig.towerLateralLoadShare
        ) {
            this.invalidateTowerStabilityResults();
        }

        if (!GameConfig.debugBotsEnabled) {
            this.rooms.forEach(room => {
                room.engine.stopBots();
            });
        }

        if (
            previousBotsEnabled !== GameConfig.debugBotsEnabled ||
            previousBotCount !== GameConfig.debugBotCount
        ) {
            await this.refreshMatchmaking();
        }

        if (previousStartLevel !== GameConfig.debugStartLevel) {
            await this.restartRoomsAtDebugStartLevel();
        }

        this.broadcastDebugConfig();
    }

    async updateDebugConfig(key, value) {
        if (key === "resetDebugConfig") {
            await this.resetDebugConfigToDefaults();
            return true;
        }

        if (key === "restartLevel") {
            await this.restartRoomsAtCurrentLevel();
            return true;
        }

        const previousValue = key === "towerStabilityDifficulty" || key === "towerLateralLoadShare"
            ? GameConfig[key]
            : undefined;

        if (!DebugConfig.applyValue(key, value)) {
            console.log("Rejected unknown debug config:", key);
            return false;
        }

        if (previousValue !== undefined && previousValue !== GameConfig[key]) {
            this.invalidateTowerStabilityResults();
        }

        if (key === "debugBotsEnabled" || key === "debugBotCount") {
            if (!GameConfig.debugBotsEnabled) {
                this.rooms.forEach(room => {
                    room.engine.stopBots();
                });
            }

            await this.refreshMatchmaking();
        }

        if (key === "debugStartLevel") {
            await this.restartRoomsAtDebugStartLevel();
        }

        this.broadcastDebugConfig();
        return true;
    }

    async restartRoomsAtDebugStartLevel() {
        await Promise.all(this.rooms.map(async room => {
            if (!room.engine?.room || room.engine.room.state === "closed") {
                return;
            }

            room.engine.restartAtConfiguredStartLevel();
            await this.stateStore.saveRoom(
                room,
                room.ownerPodId === this.stateStore.getPodId()
            );
        }));
    }

    async restartRoomsAtCurrentLevel() {
        await Promise.all(this.rooms.map(async room => {
            if (!room.engine?.room || room.engine.room.state === "closed") {
                return;
            }

            room.engine.restartAtLevel(room.engine.room.level, {
                resetScores: false
            });
            await this.stateStore.saveRoom(
                room,
                room.ownerPodId === this.stateStore.getPodId()
            );
        }));
    }

    createBot() {
        return {
            id: "BOT" + this.botCounter++,
            score: 0,
            lastPlacementTime: 0,
            isBot: true
        };
    }

    fillRoomWithBotsIfNeeded(room) {
        if (!GameConfig.debugBotsEnabled) {
            return;
        }

        const freeSlots = GameConfig.playersPerRoom - room.players.length;
        const desiredBotCount = Math.min(GameConfig.debugBotCount, Math.max(0, freeSlots));

        for (let i = 0; i < desiredBotCount; i++) {
            const bot = this.createBot();
            room.engine.initializePlayerForRoom(bot);
            room.readyPlayerIds.add(bot.id);
        }
    }

    async syncRoomBots(room) {
        if (this.isPrivateRoom(room)) {
            return;
        }

        const realCount = room.players.filter(player => !player.isBot).length;
        const currentBots = room.players.filter(player => player.isBot);
        const desiredBotCount = GameConfig.debugBotsEnabled
            ? Math.min(GameConfig.debugBotCount, Math.max(0, GameConfig.playersPerRoom - realCount))
            : 0;
        const botRosterChanged = currentBots.length !== desiredBotCount;

        while (currentBots.length > desiredBotCount) {
            const bot = currentBots.pop();
            room.engine.removePlayerFromRoom(bot.id);
            room.readyPlayerIds.delete(bot.id);
        }

        while (currentBots.length < desiredBotCount) {
            const bot = this.createBot();
            room.engine.initializePlayerForRoom(bot);
            room.readyPlayerIds.add(bot.id);
            currentBots.push(bot);
        }

        if (botRosterChanged) {
            room.readyPlayerIds = new Set(
                room.players
                    .filter(player => player.isBot)
                    .map(player => player.id)
            );
        }

        if (room.players.length >= GameConfig.playersPerRoom) {
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
            await this.stateStore.removeOpenRoom(room.id);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, this.isRoomOwner(room));
        await this.broadcastLobbyUpdate(room);
    }

    async refreshMatchmaking() {
        for (const room of this.rooms) {
            if (room.matchStarted || this.isPrivateRoom(room)) {
                continue;
            }

            if (!this.isRoomOwner(room)) {
                continue;
            }

            await this.syncRoomBots(room);
        }
    }

    async joinOrCreateRoom(player) {
        await this.stateStore.withMatchmakingLock(async () => {
            const room = await this.claimOpenRoom();

            if (room) {
                await this.addPlayerToRoom(room, player);
            } else {
                await this.createRoom([player]);
            }
        });
    }

    async createPrivateRoom(player, entry) {
        const privatePassword = this.normalizePrivatePassword(entry.privatePassword);

        if (privatePassword === null) {
            this.sendPrivateJoinRejected(player, "wrong_password");
            return;
        }

        await this.createRoom([player], {
            roomMode: "private",
            privatePassword,
            hostPlayerId: player.id
        });
    }

    async joinPrivateRoom(player, entry) {
        const privatePassword = this.normalizePrivatePassword(entry.privatePassword);
        const privateServerId = String(entry.privateServerId || "").trim().toUpperCase();

        if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(privateServerId)) {
            this.sendPrivateJoinRejected(player, "not_found");
            return;
        }

        if (privatePassword === null) {
            this.sendPrivateJoinRejected(player, "wrong_password");
            return;
        }

        const roomId = await this.stateStore.getPrivateInviteRoomId(privateServerId);

        if (roomId === null || roomId === undefined) {
            this.sendPrivateJoinRejected(player, "not_found");
            return;
        }

        let room = this.rooms.find(activeRoom => String(activeRoom.id) === String(roomId));
        let snapshot = null;

        if (!room) {
            snapshot = await this.stateStore.getRoom(roomId);

            if (
                !snapshot ||
                !this.isPrivateRoom(snapshot) ||
                snapshot.privateServerId !== privateServerId
            ) {
                await this.stateStore.deletePrivateInvite(privateServerId, roomId);
                this.sendPrivateJoinRejected(player, "not_found");
                return;
            }

            const leaseOwner = await this.stateStore.getRoomLeaseOwner(roomId);

            if (leaseOwner && leaseOwner !== this.stateStore.getPodId()) {
                await this.stateStore.publishRoomAction(roomId, {
                    playerId: player.id,
                    action: {
                        type: "private_join",
                        connectionId: player.connectionId,
                        privatePassword,
                        privatePlayer: stripRuntimePlayer(player)
                    }
                });
                return;
            }

            room = await this.hydrateRoom(roomId);
        }

        if (!room || !this.isPrivateRoom(room) || room.privateServerId !== privateServerId) {
            await this.stateStore.deletePrivateInvite(privateServerId, roomId);
            this.sendPrivateJoinRejected(player, "not_found");
            return;
        }

        if (this.isRoomOwner(room)) {
            await this.acceptPrivateJoin(room, player, privatePassword);
            return;
        }

        await this.stateStore.publishRoomAction(room.id, {
            playerId: player.id,
            action: {
                type: "private_join",
                connectionId: player.connectionId,
                privatePassword,
                privatePlayer: stripRuntimePlayer(player)
            }
        });
    }

    privateJoinReason(room, privatePassword) {
        if (!room || !this.isPrivateRoom(room)) {
            return "not_found";
        }

        if (room.matchStarted) {
            return "playing";
        }

        if (room.players.length >= PRIVATE_ROOM_SEAT_COUNT) {
            return "full";
        }

        if (privatePassword !== room.privatePassword) {
            return "wrong_password";
        }

        return "";
    }

    async publishPrivateJoinAssignment(player, roomId, reason = "") {
        if (!this.stateStore.publishPlayerAssignment) {
            return;
        }

        await this.stateStore.publishPlayerAssignment(
            player.id,
            roomId,
            player.connectionId,
            reason || null
        );
    }

    async acceptPrivateJoin(room, entrant, privatePassword, remote = false) {
        const reason = this.privateJoinReason(room, privatePassword);

        if (reason) {
            if (remote) {
                await this.publishPrivateJoinAssignment(entrant, room.id, reason);
            } else {
                this.sendPrivateJoinRejected(entrant, reason);
            }
            return false;
        }

        if (
            entrant?.sessionId &&
            entrant?.connectionId &&
            this.stateStore.isCurrentSessionConnection &&
            !await this.stateStore.isCurrentSessionConnection(
                entrant.sessionId, entrant.connectionId
            )
        ) {
            return false;
        }

        const localPlayer = this.connectedPlayers.get(entrant.id);
        const player = (
            !remote &&
            localPlayer &&
            localPlayer.connectionId === entrant.connectionId
        )
            ? localPlayer
            : {
                ...stripRuntimePlayer(entrant),
                ws: null,
                room: null
            };

        player.privateLobbyConnectionPhase = "connected";
        player.privateLobbyGraceAt = 0;
        player.privateLobbyExpiresAt = 0;
        player.room = room;
        room.engine.initializePlayerForRoom(player);

        await this.stateStore.saveRoom(room, true);

        if (remote) {
            await this.publishPrivateJoinAssignment(player, room.id);
        } else {
            await this.savePlayerRoomSession(player, room);
            await this.sendRoomJoinedMessage(player, room);
        }

        await this.broadcastLobbyUpdate(room);
        return true;
    }

    async claimOpenRoom() {
        const attemptedIds = new Set();

        for (let attempts = 0; attempts < MAX_OPEN_ROOM_CLAIM_ATTEMPTS; attempts++) {
            const roomId = await this.stateStore.claimOpenRoomId();

            if (roomId === null) {
                return null;
            }

            if (attemptedIds.has(roomId)) {
                await this.stateStore.markRoomOpen(roomId);
                return null;
            }

            attemptedIds.add(roomId);

            const localRoom =
                this.rooms.find(activeRoom => String(activeRoom.id) === String(roomId));

            if (localRoom) {
                if (
                    this.isRoomOwner(localRoom) &&
                    !localRoom.matchStarted &&
                    localRoom.players.length < GameConfig.playersPerRoom
                ) {
                    return localRoom;
                }

                continue;
            }

            const snapshot = await this.stateStore.getRoom(roomId);

            if (!snapshot || snapshot.matchStarted || (snapshot.players || []).length >= GameConfig.playersPerRoom) {
                continue;
            }

            if (snapshot.ownerPodId !== this.stateStore.getPodId()) {
                await this.stateStore.markRoomOpen(roomId);
                continue;
            }

            const room = await this.hydrateRoom(roomId);

            if (room && !room.matchStarted && room.players.length < GameConfig.playersPerRoom) {
                return room;
            }
        }

        return null;
    }

    async addPlayerToRoom(room, player) {
        player.room = room;
        room.engine.initializePlayerForRoom(player);
        this.connectedPlayers.set(player.id, player);

        if (room.players.length >= GameConfig.playersPerRoom) {
            await this.stateStore.removeOpenRoom(room.id);
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, this.isRoomOwner(room));
        await this.savePlayerRoomSession(player, room);
        await this.sendRoomJoinedMessage(player, room);

        await this.broadcastLobbyUpdate(room);
    }

    async createRoom(roomPlayers, options = {}) {
        const engine = this.createEngine();
        engine.createRoom([]);

        const roomId = await this.stateStore.nextRoomId();

        const room = {
            id: roomId,
            ownerPodId: this.stateStore.getPodId(),
            players: engine.room.players,
            engine: engine,
            roomMode: options.roomMode || "public",
            privateServerId: null,
            privatePassword: "",
            hostPlayerId: null,
            privateStartDeadlineAt: 0
        };

        if (this.isPrivateRoom(room)) {
            room.privateServerId = await this.generatePrivateServerId(room.id);
            room.privatePassword = options.privatePassword || "";
            room.hostPlayerId = options.hostPlayerId || roomPlayers[0]?.id || null;
        }

        engine.room.id = room.id;

        room.matchStarted = false;
        room.readyPlayerIds = new Set();
        room.lobbyDeadlineAt = 0;

        roomPlayers.forEach(player => {
            player.room = room;

            if (this.isPrivateRoom(room) && !player.isBot) {
                player.privateLobbyConnectionPhase = "connected";
                player.privateLobbyGraceAt = 0;
                player.privateLobbyExpiresAt = 0;
            }

            engine.initializePlayerForRoom(player);

            if (player.isBot) {
                room.readyPlayerIds.add(player.id);
            } else {
                this.connectedPlayers.set(player.id, player);
            }
        });

        this.rooms.push(room);
        await this.subscribeRoom(room.id);

        if (!this.isPrivateRoom(room)) {
            this.fillRoomWithBotsIfNeeded(room);
        }

        if (this.isPrivateRoom(room)) {
            await this.stateStore.removeOpenRoom(room.id);
        } else if (room.players.length >= GameConfig.playersPerRoom) {
            room.lobbyDeadlineAt = Date.now() + GameConfig.lobbyReadyTimeoutMs;
            this.scheduleLobbyReadyTimeout(room);
            await this.stateStore.removeOpenRoom(room.id);
        } else {
            await this.stateStore.markRoomOpen(room.id);
        }

        await this.stateStore.saveRoom(room, true);

        await Promise.all(roomPlayers
            .filter(player => !player.isBot)
            .map(player => this.savePlayerRoomSession(player, room))
        );

        console.log(`Room ${room.id} created with ${room.players.length} players`);

        for (const player of roomPlayers) {
            if (player.isBot) {
                continue;
            }

            await this.sendRoomJoinedMessage(player, room);
        }
    }

    async savePlayerRoomSession(player, room) {
        if (!player?.sessionId || !room) {
            return;
        }

        await this.stateStore.saveSession({
            sessionId: player.sessionId,
            reconnectToken: player.sessionId,
            playerId: player.id,
            roomId: room.id,
            connectionId: player.connectionId,
            connected: this.isConnectedRealPlayer(player)
        });
    }

    async sendRoomJoinedMessage(player, room) {
        const payload = await this.buildRoomJoinedPayload(room);

        this.sendPlayer(player, {
            ...payload,
            playerId: player.id,
            reconnectToken: player.sessionId,
            reconnectTtlSeconds: this.stateStore.getReconnectTtlSeconds(),
            blocks: player.blocks
        });
    }

    async buildRoomJoinedPayload(room) {
        const engine = room.engine;
        const roster = await this.buildRoomRoster(room);

        return {
            type: "room_created",
            roomId: room.id,
            roomMode: room.roomMode || "public",
            level: engine.room.level,
            targetHeight: engine.room.targetHeight,
            impactScoreStatus: engine.getImpactScoreStatus(),
            activeInventorySlots: engine.getBlocksPerPlayer(),
            maxActiveBlocks: GameConfig.maxActiveBlocks,
            drawPileCount: (engine.room.drawPile || []).length,
            nextDrawBlock: engine.getNextDrawBlock(),
            roster: roster,
            matchStarted: false,
            lobby: this.buildLobbyPayload(room),
            privateLobby: this.buildPrivateLobbyPayload(room)
        };
    }

    getLobbySecondsRemaining(room) {
        if (!room || !room.lobbyDeadlineAt) {
            return 0;
        }

        return Math.max(
            0,
            Math.ceil((room.lobbyDeadlineAt - Date.now()) / 1000)
        );
    }

    getPrivateStartSecondsRemaining(room) {
        if (!room?.privateStartDeadlineAt) {
            return 0;
        }

        return Math.max(
            0,
            Math.ceil((room.privateStartDeadlineAt - Date.now()) / 1000)
        );
    }

    buildPrivateLobbyPayload(room) {
        if (!this.isPrivateRoom(room)) {
            return null;
        }

        const connectionPhases = {};

        room.players.forEach(player => {
            connectionPhases[player.id] = player.privateLobbyConnectionPhase || "connected";
        });

        return {
            serverId: room.privateServerId,
            password: room.privatePassword,
            hostPlayerId: room.hostPlayerId,
            startDeadlineAt: room.privateStartDeadlineAt || 0,
            startCountdownActive: Boolean(room.privateStartDeadlineAt),
            startSecondsRemaining: this.getPrivateStartSecondsRemaining(room),
            connectionPhases
        };
    }

    buildLobbyPayload(room) {
        const payload = {
            readyPlayerIds: Array.from(room.readyPlayerIds || []),
            readySecondsRemaining: this.getLobbySecondsRemaining(room),
            timerActive: Boolean(room.lobbyDeadlineAt)
        };

        if (this.isPrivateRoom(room)) {
            const privateLobby = this.buildPrivateLobbyPayload(room);
            payload.startCountdownActive = privateLobby.startCountdownActive;
            payload.startSecondsRemaining = privateLobby.startSecondsRemaining;
            payload.startDeadlineAt = privateLobby.startDeadlineAt;
        }

        return payload;
    }

    async broadcastLobbyUpdate(room) {
        const payload = {
            type: "lobby_update",
            roomId: room.id,
            roomMode: room.roomMode || "public",
            roster: await this.buildRoomRoster(room),
            ...this.buildLobbyPayload(room),
            privateLobby: this.buildPrivateLobbyPayload(room)
        };

        room.players.forEach(roomPlayer => {
            if (this.isConnectedRealPlayer(roomPlayer)) {
                this.sendPlayer(roomPlayer, payload);
            }
        });

        if (this.isRoomOwner(room)) {
            await this.stateStore.publishRoom(room.id, payload);
        }
    }

    async toggleLobbyReady(player) {
        const room = player.room;

        if (!room || room.matchStarted) {
            return;
        }

        if (!this.isRoomOwner(room)) {
            await this.stateStore.publishRoomAction(room.id, {
                playerId: player.id,
                action: {
                    type: "toggle_lobby_ready",
                    connectionId: player.connectionId
                }
            });
            return;
        }

        await this.toggleLobbyReadyForRoom(room, player.id);
    }

    async toggleLobbyReadyForRoom(room, playerId) {
        if (!room || room.matchStarted) {
            return;
        }

        const player = room.players.find(candidate => {
            return !candidate.isBot && String(candidate.id) === String(playerId);
        });

        if (
            !player ||
            (this.isPrivateRoom(room) && player.privateLobbyConnectionPhase !== "connected")
        ) {
            return;
        }

        if (this.isPrivateRoom(room) && room.players.length !== PRIVATE_ROOM_SEAT_COUNT) {
            return;
        }

        if (room.readyPlayerIds.has(player.id)) {
            room.readyPlayerIds.delete(player.id);
        } else {
            room.readyPlayerIds.add(player.id);
        }

        if (this.isPrivateRoom(room)) {
            await this.reconcilePrivateStartCountdown(room);
            await this.stateStore.saveRoom(room, true);
            await this.broadcastLobbyUpdate(room);
            return;
        }

        await this.broadcastLobbyUpdate(room);

        const isFull = room.players.length >= GameConfig.playersPerRoom;
        const allReady = isFull && room.players.every(
            roomPlayer => room.readyPlayerIds.has(roomPlayer.id)
        );

        if (allReady) {
            await this.startMatch(room);
        }
    }

    async startMatch(room) {
        if (room.matchStarted) {
            return;
        }

        room.matchStarted = true;
        this.cancelLobbyReadyTimeout(room.id);
        this.cancelPrivateStartCountdown(room);

        const engine = room.engine;

        engine.startLevel();

        await this.stateStore.saveRoom(
            room,
            room.ownerPodId === this.stateStore.getPodId()
        );

        const roster = await this.buildRoomRoster(room);

        for (const player of room.players) {
            if (player.isBot) {
                continue;
            }

            const matchMessage = {
                type: "match_started",
                playerId: player.id,
                roomId: room.id,
                roomMode: room.roomMode || "public",
                level: engine.room.level,
                targetHeight: engine.room.targetHeight,
                impactScoreStatus: engine.getImpactScoreStatus(),
                activeInventorySlots: engine.getBlocksPerPlayer(),
                maxActiveBlocks: GameConfig.maxActiveBlocks,
                blocks: player.blocks,
                drawPileCount: (engine.room.drawPile || []).length,
                nextDrawBlock: engine.getNextDrawBlock(),
                roster: roster
            };

            this.sendPlayer(player, matchMessage);

            if (this.isRoomOwner(room)) {
                await this.stateStore.publishRoom(room.id, {
                    ...matchMessage,
                    targetPlayerId: player.id,
                    targetConnectionId: player.connectionId
                });
            }
        }

        engine.broadcastGameState();
    }

    async leaveLobby(player) {
        const room = player.room;

        if (!room || room.matchStarted) {
            return;
        }

        if (!this.isRoomOwner(room)) {
            await this.stateStore.publishRoomAction(room.id, {
                playerId: player.id,
                action: {
                    type: "leave_lobby",
                    connectionId: player.connectionId
                }
            });
            return;
        }

        await this.leaveLobbyForRoom(room, player);
    }

    async leaveLobbyForRoom(room, player) {
        if (!room || room.matchStarted || !player) {
            return;
        }

        if (this.isPrivateRoom(room)) {
            if (player.id === room.hostPlayerId) {
                await this.closePrivateRoom(room, "private_host_left_lobby");
                return;
            }

            await this.evictPrivateLobbyPlayer(
                room,
                player,
                "private_guest_left_lobby",
                "join_server",
                true
            );
            return;
        }

        await this.evictLobbyPlayer(room, player, "player_left_lobby");
    }

    async leaveGameForRoom(room, player, connectionId) {
        if (!room || !room.matchStarted || !player || player.isBot) {
            return;
        }

        const targetConnectionId = connectionId || player.connectionId;
        const connectedPlayer = this.connectedPlayers.get(player.id);
        const notificationPlayer = (
            connectedPlayer?.connectionId === targetConnectionId
                ? connectedPlayer
                : player
        );
        const targetSocket = notificationPlayer?.ws || null;
        const message = {
            type: "game_left",
            destination: "home"
        };

        if (
            connectedPlayer &&
            connectedPlayer.connectionId === targetConnectionId
        ) {
            this.connectedPlayers.delete(player.id);
            connectedPlayer.ws = null;
            connectedPlayer.presence = "left";
        }
        player.ws = null;
        player.presence = "left";

        room.engine.broadcastGameState({ includeTransientEvents: false });
        await this.stateStore.saveRoom(room, true);
        await Promise.resolve(
            this.stateStore.clearSessionRoom
                ? this.stateStore.clearSessionRoom(
                    player.sessionId, "home", "player_left_game"
                )
                : null
        );

        if (
            !room.players.some(candidate => {
                return !candidate.isBot && candidate.presence === "connected";
            })
        ) {
            this.scheduleRoomReconnectExpiry(room);
        }

        this.sendPlayer({ ws: targetSocket }, message);
        await this.stateStore.publishRoom(room.id, {
            ...message,
            targetPlayerId: player.id,
            targetConnectionId
        });
    }

    async evictPrivateLobbyPlayer(room, player, reason, destination, notifyPlayer) {
        if (!this.isPrivateRoom(room) || !player) {
            return;
        }

        const targetConnectionId = player.connectionId;
        const connectedPlayer = this.connectedPlayers.get(player.id);
        const closeMessage = {
            type: "room_closed",
            reason,
            destination
        };

        room.engine.removePlayerFromRoom(player.id);
        room.readyPlayerIds.delete(player.id);
        this.cancelPrivateLobbyDisconnectTimers(room.id, player.id);
        this.cancelPrivateStartCountdown(room);

        await Promise.resolve(
            this.stateStore.clearSessionRoom
                ? this.stateStore.clearSessionRoom(player.sessionId, destination, reason)
                : null
        );

        this.resetParticipantState(player);
        if (connectedPlayer && connectedPlayer !== player) {
            this.resetParticipantState(connectedPlayer);
        }
        room.readyPlayerIds = new Set();

        await this.stateStore.saveRoom(room, true);

        if (notifyPlayer) {
            this.sendPlayer(connectedPlayer || player, closeMessage);
            await this.stateStore.publishRoom(room.id, {
                ...closeMessage,
                targetPlayerId: player.id,
                targetConnectionId
            });
        }

        await this.broadcastLobbyUpdate(room);
    }

    async kickPrivatePlayer(player, targetPlayerId) {
        const room = player?.room;

        if (!room || !this.isPrivateRoom(room) || room.matchStarted) {
            return;
        }

        if (!this.isRoomOwner(room)) {
            await this.stateStore.publishRoomAction(room.id, {
                playerId: player.id,
                action: {
                    type: "kick_private_player",
                    connectionId: player.connectionId,
                    targetPlayerId: String(targetPlayerId || "")
                }
            });
            return;
        }

        await this.kickPrivatePlayerForRoom(room, player.id, targetPlayerId);
    }

    async kickPrivatePlayerForRoom(room, playerId, targetPlayerId) {
        if (
            !this.isPrivateRoom(room) ||
            room.matchStarted ||
            playerId !== room.hostPlayerId ||
            !targetPlayerId ||
            String(targetPlayerId) === String(room.hostPlayerId)
        ) {
            return;
        }

        const target = room.players.find(candidate => {
            return !candidate.isBot && String(candidate.id) === String(targetPlayerId);
        });

        if (!target) {
            return;
        }

        await this.evictPrivateLobbyPlayer(
            room,
            target,
            "private_player_kicked",
            "home",
            true
        );
    }

    async evictLobbyPlayer(room, player, reason, notifyLeaver = false) {
        room.engine.removePlayerFromRoom(player.id);
        room.readyPlayerIds.delete(player.id);
        this.resetParticipantState(player);

        if (!player.isBot && notifyLeaver) {
            this.sendPlayer(player, { type: "room_closed", reason: reason });
        }

        const hasRealPlayer = room.players.some(roomPlayer => !roomPlayer.isBot);

        if (room.players.length === 0 || !hasRealPlayer) {
            await this.closeRoom(room, reason);
            return;
        }

        room.readyPlayerIds = new Set(
            room.players.filter(roomPlayer => roomPlayer.isBot).map(roomPlayer => roomPlayer.id)
        );
        this.cancelLobbyReadyTimeout(room.id);
        room.lobbyDeadlineAt = 0;

        await this.stateStore.markRoomOpen(room.id);
        await this.stateStore.saveRoom(room, this.isRoomOwner(room));
        await this.broadcastLobbyUpdate(room);
    }

    scheduleLobbyReadyTimeout(room) {
        if (!room || this.roomLobbyTimers.has(room.id)) {
            return;
        }

        const remainingMs = room.lobbyDeadlineAt
            ? Math.max(0, room.lobbyDeadlineAt - Date.now())
            : GameConfig.lobbyReadyTimeoutMs;

        const timer = setTimeout(() => {
            this.handleLobbyReadyTimeout(room.id).catch(error => {
                console.error("Lobby ready timeout handling failed:", error.message);
            });
        }, remainingMs);

        if (timer.unref) {
            timer.unref();
        }

        this.roomLobbyTimers.set(room.id, timer);
    }

    cancelLobbyReadyTimeout(roomId) {
        const timer = this.roomLobbyTimers.get(roomId);

        if (!timer) {
            return;
        }

        clearTimeout(timer);
        this.roomLobbyTimers.delete(roomId);
    }

    async handleLobbyReadyTimeout(roomId) {
        this.roomLobbyTimers.delete(roomId);

        const room =
            this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room || room.matchStarted) {
            return;
        }

        const notReadyPlayers = room.players.filter(
            roomPlayer => !room.readyPlayerIds.has(roomPlayer.id)
        );

        for (const notReadyPlayer of notReadyPlayers) {
            await this.evictLobbyPlayer(room, notReadyPlayer, "lobby_timeout", true);
        }
    }

    async buildRoomRoster(room) {
        return Promise.all(room.players.map(async (player, seatIndex) => {
            const profile = await this.profileStore.getProfile(
                player.profileId, seatIndex, player.displayName
            );
            return {
                id: player.id,
                isBot: Boolean(player.isBot),
                displayName: this.isPrivateRoom(room) && player.privateDisplayName
                    ? player.privateDisplayName
                    : profile.displayName,
                avatarId: profile.avatarId,
                isHost: this.isPrivateRoom(room) && player.id === room.hostPlayerId,
                presence: this.isPrivateRoom(room) && !room.matchStarted
                    ? (
                        player.privateLobbyConnectionPhase === "connected"
                            ? "connected"
                            : "disconnected"
                    )
                    : (
                        ["connected", "disconnected", "left"].includes(player.presence)
                            ? player.presence
                            : "connected"
                    ),
                connectionPhase: this.isPrivateRoom(room)
                    ? player.privateLobbyConnectionPhase || "connected"
                    : "connected"
            };
        }));
    }

    createEngine() {
        return new GameEngine({
            onRoomChanged: async engineRoom => {
                const room =
                    this.rooms.find(activeRoom => activeRoom.id === engineRoom.id);

                if (room) {
                    await this.stateStore.saveRoom(
                        room,
                        room.ownerPodId === this.stateStore.getPodId()
                    );
                }
            },
            onRoomMessage: async (roomId, message) => {
                await this.stateStore.publishRoom(roomId, message);
            },
            onLevelOutcome: async outcome => {
                await this.stateStore.recordDemoOutcome(outcome);
            },
            onRoomCloseRequested: async (roomId, reason, destination) => {
                const room = this.rooms.find(activeRoom => activeRoom.id === roomId);

                if (!room || !this.isRoomOwner(room)) {
                    return;
                }

                await this.closeRoom(room, reason, destination);
            }
        });
    }

    async resolveHydratedRoomOwner(snapshot) {
        const currentPodId = this.stateStore.getPodId();
        let leaseOwner = await this.stateStore.getRoomLeaseOwner(snapshot.id);

        if (leaseOwner) {
            return {
                canOwn: leaseOwner === currentPodId,
                ownerPodId: leaseOwner
            };
        }

        const snapshotOwnerActive = Boolean(
            snapshot.ownerPodId &&
            this.stateStore.isPodActive &&
            await this.stateStore.isPodActive(snapshot.ownerPodId)
        );

        if (snapshotOwnerActive && snapshot.ownerPodId !== currentPodId) {
            return {
                canOwn: false,
                ownerPodId: snapshot.ownerPodId
            };
        }

        const claimed = await this.stateStore.claimRoomLease(snapshot.id);

        if (claimed) {
            return {
                canOwn: true,
                ownerPodId: currentPodId
            };
        }

        leaseOwner = await this.stateStore.getRoomLeaseOwner(snapshot.id);
        return {
            canOwn: leaseOwner === currentPodId,
            ownerPodId: leaseOwner || snapshot.ownerPodId
        };
    }

    async hydrateRoom(roomId) {
        const snapshot = await this.stateStore.getRoom(roomId);

        if (!snapshot) {
            return null;
        }

        const runtimePlayers = snapshot.players.map(player => {
            const connected = this.connectedPlayers.get(player.id);
            return {
                ...stripRuntimePlayer(player),
                presence: ["connected", "disconnected", "left"].includes(player.presence)
                    ? player.presence
                    : (
                        snapshot.matchStarted && !player.isBot && !connected?.ws
                            ? "disconnected"
                            : "connected"
                    ),
                ws: connected?.ws || null,
                room: null
            };
        });

        const ownership = await this.resolveHydratedRoomOwner(snapshot);
        const canOwnTimers = ownership.canOwn;

        const engine = this.createEngine();
        const room = {
            id: snapshot.id,
            ownerPodId: canOwnTimers
                ? this.stateStore.getPodId()
                : ownership.ownerPodId,
            players: runtimePlayers,
            engine: engine,
            matchStarted: Boolean(snapshot.matchStarted),
            roomMode: snapshot.roomMode || "public",
            privateServerId: snapshot.privateServerId || null,
            privatePassword: snapshot.privatePassword || "",
            hostPlayerId: snapshot.hostPlayerId || null,
            privateStartDeadlineAt: snapshot.privateStartDeadlineAt || 0,
            readyPlayerIds: new Set(snapshot.readyPlayerIds || []),
            lobbyDeadlineAt: snapshot.lobbyDeadlineAt || 0
        };

        runtimePlayers.forEach(player => {
            player.room = room;
        });

        if (!room.matchStarted && canOwnTimers) {
            if (this.isPrivateRoom(room)) {
                this.schedulePrivateLobbyTimers(room);
            } else {
                this.scheduleLobbyReadyTimeout(room);
            }
        }

        if (canOwnTimers) {
            engine.hydrateRoom(snapshot, runtimePlayers);
        } else {
            engine.room = {
                id: snapshot.id,
                players: runtimePlayers,
                level: snapshot.state.level,
                stateRevision: Math.max(0, Number(snapshot.state.stateRevision) || 0),
                impactLevel: snapshot.state.impactLevel,
                impactScores: snapshot.state.impactScores || {},
                impactPowers: snapshot.state.impactPowers || {},
                impactContributions: snapshot.state.impactContributions || {},
                impactFailureCount: snapshot.state.impactFailureCount || 0,
                lastImpactFailureReason: snapshot.state.lastImpactFailureReason || null,
                failureTransitionCommitted: Boolean(snapshot.state.failureTransitionCommitted),
                terminalCloseAt: snapshot.state.terminalCloseAt || 0,
                terminalFailureReason: snapshot.state.terminalFailureReason || null,
                terminalCloseRequested: Boolean(snapshot.state.terminalCloseRequested),
                targetHeight: snapshot.state.targetHeight,
                currentHeight: snapshot.state.currentHeight,
                drawPile: snapshot.state.drawPile || [],
                drawPileStartCount: snapshot.state.drawPileStartCount || 0,
                levelDurationMs: snapshot.state.levelDurationMs || 0,
                teamCarryOverBlocks: snapshot.state.teamCarryOverBlocks || [],
                towerBlocks: snapshot.state.towerBlocks || [],
                towerStability: snapshot.state.towerStability ?? 100,
                towerStabilityDiagnostics: snapshot.state.towerStabilityDiagnostics || {},
                towerStabilityComponents: snapshot.state.towerStabilityComponents || [],
                towerStructuralPose: snapshot.state.towerStructuralPose || [],
                towerStabilityResult: null,
                historicalMaxStandingHeight: Math.max(
                    Number(snapshot.state.historicalMaxStandingHeight || 0),
                    Number(snapshot.state.currentHeight || 0)
                ),
                rebuildScoreCount: Math.max(0, Math.floor(Number(snapshot.state.rebuildScoreCount) || 0)),
                lastChanceRescuePending: Boolean(snapshot.state.lastChanceRescuePending),
                lastChanceRescueUsed: Boolean(snapshot.state.lastChanceRescueUsed),
                state: snapshot.state.state,
                startsAt: snapshot.state.startsAt,
                endsAt: snapshot.state.endsAt,
                freezeEndsAt: snapshot.state.freezeEndsAt || 0,
                lastLevelSummary: snapshot.state.lastLevelSummary,
                pendingScoreEvents: [],
                pendingQuickChatEvents: [],
                pendingPowerEvents: [],
                sideQuest: snapshot.state.sideQuest || null,
                criticalSaveClaimKeys: snapshot.state.criticalSaveClaimKeys || {},
                scoreEventSeq: 0
            };
        }

        this.rooms.push(room);
        await this.subscribeRoom(room.id);
        return room;
    }

    async handleRemoteRoomClosed(roomId, message) {
        const room = this.rooms.find(activeRoom => activeRoom.id === roomId);

        if (!room) {
            return;
        }

        this.cancelRoomReconnectExpiry(roomId);
        this.cancelLobbyReadyTimeout(roomId);
        this.cancelPrivateStartCountdown(room);
        this.cancelAllPrivateLobbyDisconnectTimers(roomId);
        this.rooms = this.rooms.filter(activeRoom => activeRoom.id !== roomId);
        room.engine.closeRoom(message.reason, false);

        await Promise.all(room.players.map(roomPlayer => {
            return roomPlayer.isBot || !this.stateStore.clearSessionRoom
                ? null
                : this.stateStore.clearSessionRoom(
                    roomPlayer.sessionId,
                    message.destinationByPlayerId?.[roomPlayer.id] || message.destination || null,
                    message.reason || null
                );
        }));

        room.players.forEach(roomPlayer => {
            const connectedPlayer = this.connectedPlayers.get(roomPlayer.id);
            const notificationPlayer = connectedPlayer || roomPlayer;
            const shouldNotify = this.isConnectedRealPlayer(notificationPlayer);
            this.resetParticipantState(roomPlayer);
            if (connectedPlayer && connectedPlayer !== roomPlayer) {
                this.resetParticipantState(connectedPlayer);
            }

            if (!roomPlayer.isBot && shouldNotify) {
                this.sendPlayer(notificationPlayer, message);
            }
        });

        if (this.stateStore.unsubscribeFromRoom) {
            await this.stateStore.unsubscribeFromRoom(roomId);
        }

        if (this.stateStore.unsubscribeFromRoomActions) {
            await this.stateStore.unsubscribeFromRoomActions(roomId);
        }

        this.resetBotCounterIfIdle();
    }

    async subscribeRoom(roomId) {
        await this.stateStore.subscribeToRoom(roomId, message => {
            if (message.sourcePodId === this.stateStore.getPodId()) {
                return;
            }

            const room =
                this.rooms.find(activeRoom => activeRoom.id === roomId);

            if (!room) {
                return;
            }

            if (message.targetPlayerId) {
                const target = room.players.find(player => {
                    return (
                        player.id === message.targetPlayerId &&
                        player.connectionId === message.targetConnectionId
                    );
                });

                if (target) {
                    const connected = this.connectedPlayers.get(target.id);
                    const clientMessage = { ...message };
                    delete clientMessage.targetPlayerId;
                    delete clientMessage.targetConnectionId;
                    delete clientMessage.sourcePodId;

                    if (message.type === "room_closed") {
                        room.engine.removePlayerFromRoom(target.id);
                        room.readyPlayerIds.delete(target.id);
                        this.cancelPrivateLobbyDisconnectTimers(room.id, target.id);
                        this.resetParticipantState(target);
                        if (connected && connected.connectionId === target.connectionId) {
                            this.resetParticipantState(connected);
                        }
                    }

                    this.sendPlayer(
                        connected?.connectionId === message.targetConnectionId
                            ? connected
                            : target,
                        clientMessage
                    );

                    if (message.type === "game_left") {
                        target.ws = null;
                        if (
                            connected &&
                            connected.connectionId === message.targetConnectionId
                        ) {
                            connected.ws = null;
                            this.connectedPlayers.delete(target.id);
                        }
                    }
                }
                return;
            }

            if (message.type === "room_closed") {
                this.handleRemoteRoomClosed(roomId, message).catch(error => {
                    console.error("Remote room close failed:", error.message);
                });
                return;
            }

            room.players.forEach(player => {
                if (!player.isBot) {
                    this.sendPlayer(player, message);
                }
            });
        });

        await this.stateStore.subscribeToRoomActions(roomId, message => {
            if (message.sourcePodId === this.stateStore.getPodId()) {
                return;
            }

            const room =
                this.rooms.find(activeRoom => activeRoom.id === roomId);

            if (!room || !this.isRoomOwner(room)) {
                return;
            }

            if (message.action?.type === "private_join") {
                this.acceptPrivateJoin(
                    room,
                    message.action.privatePlayer,
                    message.action.privatePassword,
                    true
                ).catch(error => {
                    console.error("Remote private join failed:", error.message);
                });
                return;
            }

            this.runRoomAction(room, message.playerId, message.action).catch(error => {
                console.error("Remote room action failed:", error.message);
            });
        });
    }

    isRoomOwner(room) {
        return room.ownerPodId === this.stateStore.getPodId();
    }

    async dispatchRoomAction(player, action) {
        if (!await this.isCurrentPlayerConnection(player)) {
            return;
        }

        const room = player.room;

        if (!room) {
            return;
        }

        const roomAction = {
            ...action,
            connectionId: player.connectionId
        };

        if (this.isRoomOwner(room)) {
            await this.runRoomAction(room, player.id, roomAction);
            return;
        }

        await this.stateStore.publishRoomAction(room.id, {
            playerId: player.id,
            action: roomAction
        });
    }

    async resyncState(player, requestId = "") {
        if (!await this.isCurrentPlayerConnection(player)) {
            return;
        }

        if (
            player.room &&
            this.isPrivateRoom(player.room) &&
            !player.room.matchStarted &&
            !this.isRoomOwner(player.room)
        ) {
            player.room = await this.refreshPrivateLobbyReplica(player.room);
        }

        if (!player.room) {
            await this.reportResumeUnavailable(player, "room_unavailable");
            return;
        }

        if (!player.room.matchStarted) {
            this.sendPlayer(player, {
                type: "lobby_update",
                roomId: player.room.id,
                roomMode: player.room.roomMode || "public",
                roster: await this.buildRoomRoster(player.room),
                ...this.buildLobbyPayload(player.room),
                privateLobby: this.buildPrivateLobbyPayload(player.room),
                resyncRequestId: requestId
            });
            return;
        }

        await this.dispatchRoomAction(player, {
            type: "resync_state",
            requestId: typeof requestId === "string" ? requestId : ""
        });
    }

    async sendGameStateSnapshot(room, playerId, connectionId, requestId = "") {
        const snapshot = room?.engine?.buildGameStateSnapshot(requestId);

        if (!snapshot) {
            return;
        }

        const localPlayer = this.connectedPlayers.get(playerId);

        if (localPlayer?.connectionId === connectionId) {
            this.sendPlayer(localPlayer, snapshot);
        }

        await this.stateStore.publishRoom(room.id, {
            ...snapshot,
            targetPlayerId: playerId,
            targetConnectionId: connectionId
        });
    }

    async runRoomAction(room, playerId, action) {
        const player = room.players.find(candidate => candidate.id === playerId);

        if (!player) {
            return;
        }

        if (
            action.connectionId &&
            this.stateStore.isCurrentSessionConnection &&
            !await this.stateStore.isCurrentSessionConnection(
                player.sessionId, action.connectionId
            )
        ) {
            return;
        }

        if (player.presence === "left") {
            return;
        }

        switch (action.type) {
            case "toggle_lobby_ready":
                await this.toggleLobbyReadyForRoom(room, playerId);
                return;

            case "leave_lobby":
                await this.leaveLobbyForRoom(room, player);
                return;

            case "leave_game":
                await this.leaveGameForRoom(room, player, action.connectionId);
                return;

            case "kick_private_player":
                await this.kickPrivatePlayerForRoom(room, playerId, action.targetPlayerId);
                return;

            case "private_disconnect":
                if (this.isPrivateRoom(room) && !room.matchStarted) {
                    player.ws = null;
                    await this.markPrivateLobbyDisconnected(room, player);
                }
                return;

            case "private_reconnect":
                if (this.isPrivateRoom(room) && !room.matchStarted) {
                    player.connectionId = action.connectionId || player.connectionId;
                    await this.restorePrivateLobbyPlayer(room, player);
                }
                return;

            case "game_disconnect":
                await this.setStartedRoomPresence(
                    room, player, "disconnected", action.connectionId
                );
                return;

            case "game_reconnect":
                await this.setStartedRoomPresence(
                    room, player, "connected", action.connectionId
                );
                return;

            case "resync_state":
                await this.sendGameStateSnapshot(
                    room, playerId, action.connectionId, action.requestId
                );
                return;

            case "place_block":
                room.engine.placeBlock(
                    playerId, action.blockIndex, action.column, action.originY
                );
                return;

            case "activate_power":
                room.engine.activatePower(playerId, action.slot);
                return;

            case "send_quick_chat": {
                const player =
                    room.players.find(candidate => candidate.id === playerId);

                if (player) {
                    room.engine.queueQuickChat(player, action.slot);
                }

                return;
            }
        }
    }
}

module.exports = LobbyManager;
