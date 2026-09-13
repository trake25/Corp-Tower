const http = require("http");
const WebSocket = require("ws");

const LobbyManager = require("./Lobby_Manager");
const AuthVerifier = require("./Auth_Verifier");
const AccountStore = require("./Account_Store");
const { isOpenSocket, safeClose, safeSendJson } = require("./Socket_Transport");

const lobbyManager = new LobbyManager();
const authVerifier = new AuthVerifier();
const accountStore = new AccountStore();

const port = Number(process.env.PORT) || 3000;
const FACEBOOK_EXCHANGE_PATH = "/api/auth/facebook/exchange";
const FACEBOOK_EXCHANGE_BODY_LIMIT = 16 * 1024;
const FACEBOOK_WEB_ORIGIN = normalizedWebOrigin(process.env.FACEBOOK_WEB_ORIGIN);

function safeJson(message) {
    try {
        return JSON.parse(message.toString());
    } catch (error) {
        console.log("Invalid message JSON:", error.message);
        return null;
    }
}

function profileSnapshot(identity, profile) {
    return {
        type: "profile_snapshot",
        accountUid: identity.userId,
        displayName: profile.displayName,
        avatarId: profile.avatarId,
        nameChangeUsed: Boolean(profile.nameChangeUsed),
        nameOnboardingSeen: Boolean(identity.nameOnboardingSeen)
    };
}

function sendJson(ws, data) {
    return safeSendJson(ws, data, "Server JSON send");
}

function normalizedLinkProvider(value) {
    const provider = String(value || "").trim().toLowerCase();
    return provider === "google" || provider === "facebook" ? provider : "";
}

function boundedLinkResult(value) {
    return ["allowed", "accepted", "provider_conflict", "identity_conflict", "rejected"]
        .includes(value)
        ? value
        : "rejected";
}

async function handleProfileMessage(ws, identity, message, dependencies = {}) {
    const data = safeJson(message);

    if (!data) {
        return;
    }

    const store = dependencies.accountStore || accountStore;
    const verifier = dependencies.authVerifier || authVerifier;

    if (data.type === "provider_link_preflight") {
        const provider = normalizedLinkProvider(data.provider);
        let result = "rejected";

        try {
            if (!provider) {
                throw new Error("Unknown provider link request");
            }

            const providerCredential = String(data.providerCredential || "");
            if (providerCredential !== "") {
                if (provider !== "facebook") {
                    throw new Error("Unexpected provider credential");
                }

                const credential = await verifier.verifyAccessToken(providerCredential, "facebook");
                if (!credential || credential.kind !== "facebook_native") {
                    throw new Error("Provider credential rejected");
                }

                result = (await store.preflightProviderLink(
                    identity.userId, provider, credential.providerSubject
                )).result;
            } else {
                result = (await store.preflightProviderLink(identity.userId, provider)).result;
            }
        } catch (error) {
            console.log("Provider link preflight failed:", error.message);
        }

        sendJson(ws, {
            type: "provider_link_preflight_result",
            provider,
            result: boundedLinkResult(result)
        });
        return;
    }

    if (data.type === "provider_link_commit") {
        const provider = normalizedLinkProvider(data.provider);
        let result = "rejected";

        try {
            if (!provider || !identity.supabaseUserId) {
                throw new Error("Provider link commit has no guest Supabase identity");
            }

            const providerCredential = String(data.providerCredential || "");
            if (providerCredential !== "") {
                if (provider !== "facebook") {
                    throw new Error("Unexpected provider credential");
                }

                const credential = await verifier.verifyAccessToken(
                    providerCredential, "facebook"
                );
                if (!credential || credential.kind !== "facebook_native") {
                    throw new Error("Provider credential rejected");
                }
                result = (await store.commitNativeFacebookProviderLink(
                    identity.userId,
                    identity.supabaseUserId,
                    credential.providerSubject
                )).result;
            } else {
                const credential = await verifier.verifyAccessToken(
                    String(data.accessToken || "")
                );
                if (!credential || credential.kind !== "supabase") {
                    throw new Error("Provider link credential rejected");
                }
                result = (await store.commitProviderLink(
                    identity.userId,
                    identity.supabaseUserId,
                    credential,
                    provider
                )).result;
            }
        } catch (error) {
            console.log("Provider link commit failed:", error.message);
        }

        sendJson(ws, {
            type: "provider_link_commit_result",
            provider,
            result: boundedLinkResult(result)
        });
        return;
    }

    if (data.type === "profile_onboarding_seen") {
        try {
            const persisted = await store.markNameOnboardingSeen(identity.userId);
            if (!persisted) {
                throw new Error("Onboarding acknowledgement did not persist");
            }
            identity.nameOnboardingSeen = true;
            sendJson(ws, { type: "profile_onboarding_seen", persisted: true });
        } catch (error) {
            console.log("Profile onboarding acknowledgement failed:", error.message);
            sendJson(ws, { type: "profile_onboarding_seen", persisted: false });
        }
        return;
    }

    if (data.type === "profile_change_name") {
        const profileStore = dependencies.profileStore || lobbyManager.profileStore;
        const result = await profileStore.changeName(identity.userId, data.name);

        if (!result.ok) {
            const rejection = {
                type: "profile_name_rejected",
                reason: result.reason || "server_error"
            };
            if (result.profile) {
                rejection.profile = profileSnapshot(identity, result.profile);
            }
            sendJson(ws, rejection);
            return;
        }

        sendJson(ws, {
            type: "profile_name_changed",
            profile: profileSnapshot(identity, result.profile)
        });
    }
}

async function handleStatsRequest(req, res) {
    const stats = await lobbyManager.stateStore.getDemoStats();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(stats));
}

function writeNoStoreJson(res, status, payload, origin = "") {
    const headers = {
        "Content-Type": "application/json",
        "Cache-Control": "no-store"
    };
    if (origin !== "") {
        headers["Access-Control-Allow-Origin"] = origin;
        headers.Vary = "Origin";
    }
    res.writeHead(status, headers);
    res.end(JSON.stringify(payload));
}

function readJsonRequest(req, limit = FACEBOOK_EXCHANGE_BODY_LIMIT) {
    return new Promise((resolve, reject) => {
        let size = 0;
        const chunks = [];
        req.on("data", chunk => {
            size += chunk.length;
            if (size > limit) {
                reject(new Error("request body too large"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            try {
                const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
                resolve(parsed && typeof parsed === "object" ? parsed : {});
            } catch (_error) {
                reject(new Error("invalid json"));
            }
        });
        req.on("error", reject);
    });
}

function normalizedWebOrigin(value) {
    try {
        const url = new URL(String(value || "").trim());
        if (url.protocol !== "https:") {
            return "";
        }
        return url.origin;
    } catch (_error) {
        return "";
    }
}

function requestOriginMatchesExpected(req, expectedWebOrigin = FACEBOOK_WEB_ORIGIN) {
    const expectedOrigin = normalizedWebOrigin(expectedWebOrigin);
    const requestOrigin = normalizedWebOrigin(req.headers.origin);
    return {
        allowed: expectedOrigin !== "" && requestOrigin === expectedOrigin,
        origin: expectedOrigin
    };
}

function redirectOriginMatchesRequest(req, redirectUri, expectedWebOrigin = FACEBOOK_WEB_ORIGIN) {
    const requestCheck = requestOriginMatchesExpected(req, expectedWebOrigin);
    const redirectOrigin = normalizedWebOrigin(redirectUri);
    return {
        allowed: requestCheck.allowed && redirectOrigin === requestCheck.origin,
        origin: requestCheck.allowed && redirectOrigin === requestCheck.origin
            ? requestCheck.origin
            : ""
    };
}

async function handleFacebookOauthExchange(
    req,
    res,
    verifier = authVerifier,
    expectedWebOrigin = FACEBOOK_WEB_ORIGIN
) {
    let body;
    try {
        body = await readJsonRequest(req);
    } catch (_error) {
        writeNoStoreJson(res, 400, { error: "invalid_request" });
        return;
    }

    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    const originCheck = redirectOriginMatchesRequest(req, redirectUri, expectedWebOrigin);

    if (!originCheck.allowed) {
        writeNoStoreJson(res, 403, { error: "origin_mismatch" });
        return;
    }

    const exchange = await verifier.exchangeFacebookAuthorizationCode(code, redirectUri);
    if (!exchange) {
        writeNoStoreJson(res, 400, { error: "facebook_exchange_rejected" }, originCheck.origin);
        return;
    }

    writeNoStoreJson(res, 200, {
        access_token: exchange.accessToken,
        expires_in: exchange.expiresIn
    }, originCheck.origin);
}

function requestListener(req, res) {
    const requestUrl = new URL(req.url, "http://localhost");

    if (requestUrl.pathname === FACEBOOK_EXCHANGE_PATH && req.method === "OPTIONS") {
        const originCheck = requestOriginMatchesExpected(req);
        if (!originCheck.allowed) {
            writeNoStoreJson(res, 403, { error: "origin_mismatch" });
            return;
        }
        res.writeHead(204, {
            "Access-Control-Allow-Origin": originCheck.origin,
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600",
            "Cache-Control": "no-store",
            Vary: "Origin"
        });
        res.end();
        return;
    }

    if (requestUrl.pathname === FACEBOOK_EXCHANGE_PATH && req.method === "POST") {
        handleFacebookOauthExchange(req, res).catch(error => {
            console.error("Facebook OAuth exchange failed:", error.message);
            writeNoStoreJson(res, 500, { error: "exchange_unavailable" });
        });
        return;
    }

    if (req.method === "GET" && requestUrl.pathname === "/api/stats/demo") {
        handleStatsRequest(req, res).catch(error => {
            console.error("Stats request failed:", error.message);
            res.writeHead(500);
            res.end();
        });
        return;
    }

    res.writeHead(404);
    res.end();
}

function listenServer(server, listenPort) {
    return new Promise((resolve, reject) => {
        const onListening = () => {
            server.removeListener("error", onStartupError);
            resolve();
        };
        const onStartupError = error => {
            server.removeListener("listening", onListening);
            reject(error);
        };

        server.once("listening", onListening);
        server.once("error", onStartupError);

        try {
            server.listen(listenPort);
        } catch (error) {
            server.removeListener("listening", onListening);
            server.removeListener("error", onStartupError);
            reject(error);
        }
    });
}

function wireConnection(ws, dependencies = {}) {
    const manager = dependencies.lobbyManager || lobbyManager;
    const verifier = dependencies.authVerifier || authVerifier;
    const accounts = dependencies.accountStore || accountStore;
    const profileMessageHandler = dependencies.handleProfileMessage || handleProfileMessage;
    const gameplayMessageHandler = dependencies.handleMessage || handleMessage;
    let player = null;
    let retired = false;
    let handshakeInProgress = false;
    let cleanedPlayer = null;
    let cleanupPromise = null;

    const isLive = () => !retired && isOpenSocket(ws);

    const cleanupPlayer = () => {
        const currentPlayer = player;

        if (handshakeInProgress) {
            return cleanupPromise || Promise.resolve();
        }

        if (!currentPlayer || cleanedPlayer === currentPlayer) {
            return cleanupPromise || Promise.resolve();
        }

        if (cleanupPromise) {
            return cleanupPromise;
        }

        const attempt = Promise.resolve().then(async () => {
            console.log(`${currentPlayer.id} disconnected`);
            await manager.removePlayer(currentPlayer);
            cleanedPlayer = currentPlayer;
        }).catch(error => {
            console.error("WebSocket disconnect cleanup failed:", error.message);
        });

        const cleanup = attempt.finally(() => {
            if (cleanupPromise === cleanup) {
                cleanupPromise = null;
            }
        });
        cleanupPromise = cleanup;

        return cleanup;
    };

    const retireConnection = (label, error = null, code = 1011, reason = "internal error") => {
        if (error) {
            console.error(`${label}:`, error?.message || error);
        }

        retired = true;
        safeClose(ws, code, reason, "WebSocket connection close");
        return cleanupPlayer();
    };

    const runBoundary = (label, work) => {
        return Promise.resolve().then(work).catch(error => {
            return retireConnection(label, error);
        });
    };

    ws.on("error", error => {
        void retireConnection("WebSocket connection error", error);
    });

    ws.once("close", () => {
        retired = true;
        void cleanupPlayer();
    });

    ws.once("message", message => {
        handshakeInProgress = true;
        runBoundary("WebSocket handshake failed", async () => {
            if (!isLive()) {
                return;
            }

            const data = safeJson(message) || {};
            const profileRequest = data.type === "profile_connect";
            const reconnectRequest = data.type === "reconnect" ? data : {};
            const credential = await verifier.verifyAccessToken(
                data.accessToken, data.authProvider
            );

            if (!isLive()) {
                return;
            }

            let identity = null;

            if (credential) {
                try {
                    identity = await accounts.resolve(credential);
                    if (identity && credential.kind === "supabase") {
                        identity.supabaseUserId = credential.supabaseUserId;
                    }
                } catch (error) {
                    console.log("Account identity rejected:", error.message);
                }

                if (!isLive()) {
                    return;
                }
            }

            if (verifier.isRequired() && !identity) {
                console.log("Rejected a connection with no verifiable access token");
                await retireConnection(
                    "Unauthorized WebSocket connection", null, 4401, "unauthorized"
                );
                return;
            }

            if (profileRequest) {
                if (!identity) {
                    console.log("Rejected an unverified profile connection");
                    await retireConnection(
                        "Unauthorized profile WebSocket connection", null, 4401, "unauthorized"
                    );
                    return;
                }

                try {
                    const profile = await manager.profileStore.getAuthoritativeProfile(
                        identity.userId
                    );

                    if (!isLive()) {
                        return;
                    }

                    sendJson(ws, profileSnapshot(identity, profile));
                    if (!isLive()) {
                        return;
                    }
                    ws.on("message", nextMessage => {
                        runBoundary("Profile message handling failed", async () => {
                            if (isLive()) {
                                await profileMessageHandler(ws, identity, nextMessage);
                            }
                        });
                    });
                } catch (error) {
                    console.log("Profile bootstrap failed:", error.message);
                    sendJson(ws, { type: "profile_unavailable" });
                    await retireConnection(
                        "Profile bootstrap connection close", null, 1011, "profile unavailable"
                    );
                }
                return;
            }

            player = await manager.createPlayer(ws, reconnectRequest, identity);

            if (!isLive()) {
                await cleanupPlayer();
                return;
            }

            console.log(`${player.id} connected${identity ? " (verified)" : ""}`);

            if (
                reconnectRequest.resumeOnly !== true &&
                (
                    !reconnectRequest.reconnectToken ||
                    (!player.room && !player.resumeUnavailable)
                )
            ) {
                await manager.addPlayer(player, { isActive: isLive });

                if (!isLive()) {
                    await cleanupPlayer();
                    return;
                }
            }

            manager.broadcastDebugConfig();

            if (!isLive()) {
                await cleanupPlayer();
                return;
            }

            ws.on("message", nextMessage => {
                runBoundary("Gameplay message handling failed", async () => {
                    if (isLive()) {
                        await gameplayMessageHandler(player, nextMessage, { lobbyManager: manager });
                    }
                });
            });
        }).finally(() => {
            handshakeInProgress = false;

            if (retired) {
                return cleanupPlayer();
            }
        });
    });

    return {
        cleanup: cleanupPlayer,
        getPlayer: () => player,
        isRetired: () => retired
    };
}

async function main() {
    await accountStore.connect();
    await lobbyManager.start();

    const server = http.createServer(requestListener);
    server.on("error", error => {
        console.error("HTTP server error:", error.message);
    });

    const wss = new WebSocket.Server({ server });
    wss.on("error", error => {
        console.error("WebSocket server error:", error.message);
    });
    wss.on("connection", ws => {
        wireConnection(ws);
    });

    await listenServer(server, port);
    console.log(`WebSocket server running on port ${port}`);

    return { server, wss };
}

async function handleMessage(player, message, dependencies = {}) {
    const manager = dependencies.lobbyManager || lobbyManager;
    const data = safeJson(message);

    if (!data) {
        return;
    }

    console.log(`${player.id} sent:`, data.type);

    if (data.type === "latency_ping") {
        if (
            typeof data.nonce === "string" &&
            data.nonce !== "" &&
            await manager.isCurrentPlayerConnection(player)
        ) {
            safeSendJson(player.ws, { type: "latency_pong", nonce: data.nonce }, "Latency pong send");
        }
        return;
    }

    if (!await manager.isCurrentPlayerConnection(player)) {
        return;
    }

    if (
        player.isSpectator &&
        data.type !== "resync_state" &&
        data.type !== "leave_game" &&
        data.type !== "update_config"
    ) {
        return;
    }

    if (data.type === "update_config") {
        await manager.updateDebugConfig(data.key, data.value);
        return;
    }

    if (data.type === "resync_state") {
        await manager.resyncState(player, data.requestId);
        return;
    }

    if (data.type === "ready") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.toggleLobbyReady(player);
        return;
    }

    if (data.type === "leave_lobby") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.leaveLobby(player);
        return;
    }

    if (data.type === "leave_game") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.dispatchRoomAction(player, { type: "leave_game" });
        return;
    }

    if (data.type === "kick_private_player") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.kickPrivatePlayer(player, data.targetPlayerId);
        return;
    }

    if (data.type === "place_block") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.dispatchRoomAction(player, {
            type: "place_block",
            blockIndex: data.blockIndex,
            column: data.column,
            originY: data.originY,
            placementRequestId: data.placementRequestId
        });
        return;
    }

    if (data.type === "outcome_ready") {
        if (!player.room || typeof data.outcomeId !== "string") {
            return;
        }

        await manager.dispatchRoomAction(player, {
            type: "outcome_ready",
            outcomeId: data.outcomeId
        });
        return;
    }

    if (data.type === "send_quick_chat") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await manager.dispatchRoomAction(player, {
            type: "send_quick_chat",
            slot: data.slot
        });
        return;
    }

    if (data.type === "activate_power" && player.room) {
        await manager.dispatchRoomAction(player, {
            type: "activate_power",
            slot: data.slot
        });
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error("Server failed to start:", error);
        process.exit(1);
    });
}

module.exports = {
    FACEBOOK_EXCHANGE_PATH,
    handleFacebookOauthExchange,
    handleMessage,
    handleProfileMessage,
    listenServer,
    main,
    profileSnapshot,
    redirectOriginMatchesRequest,
    requestOriginMatchesExpected,
    requestListener,
    sendJson,
    wireConnection
};
