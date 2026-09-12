const http = require("http");
const WebSocket = require("ws");

const LobbyManager = require("./Lobby_Manager");
const AuthVerifier = require("./Auth_Verifier");
const AccountStore = require("./Account_Store");

const lobbyManager = new LobbyManager();
const authVerifier = new AuthVerifier();
const accountStore = new AccountStore();

const port = Number(process.env.PORT) || 3000;
const FACEBOOK_EXCHANGE_PATH = "/api/auth/facebook/exchange";
const FACEBOOK_EXCHANGE_BODY_LIMIT = 16 * 1024;

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
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
    }
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

function redirectOriginMatchesRequest(req, redirectUri) {
    const requestOrigin = String(req.headers.origin || "").trim();
    if (requestOrigin === "") {
        return { allowed: true, origin: "" };
    }

    try {
        const redirect = new URL(redirectUri);
        return {
            allowed: redirect.origin === requestOrigin,
            origin: redirect.origin === requestOrigin ? requestOrigin : ""
        };
    } catch (_error) {
        return { allowed: false, origin: "" };
    }
}

async function handleFacebookOauthExchange(req, res, verifier = authVerifier) {
    let body;
    try {
        body = await readJsonRequest(req);
    } catch (_error) {
        writeNoStoreJson(res, 400, { error: "invalid_request" });
        return;
    }

    const code = String(body.code || "");
    const redirectUri = String(body.redirectUri || "");
    const originCheck = redirectOriginMatchesRequest(req, redirectUri);

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
        res.writeHead(204, {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600",
            "Cache-Control": "no-store"
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

async function main() {
    await accountStore.connect();
    await lobbyManager.start();

    const server = http.createServer(requestListener);
    const wss = new WebSocket.Server({ server });

    server.listen(port);

    console.log(`WebSocket server running on port ${port}`);

    wss.on("connection", async function connection(ws) {
        let player = null;

        ws.once("message", async function firstMessage(message) {
            const data = safeJson(message) || {};
            const profileRequest = data.type === "profile_connect";
            const reconnectRequest =
                data.type === "reconnect" ? data : {};

            const credential = await authVerifier.verifyAccessToken(
                data.accessToken, data.authProvider
            );
            let identity = null;

            if (credential) {
                try {
                    identity = await accountStore.resolve(credential);
                    if (identity && credential.kind === "supabase") {
                        identity.supabaseUserId = credential.supabaseUserId;
                    }
                } catch (error) {
                    console.log("Account identity rejected:", error.message);
                }
            }

            if (authVerifier.isRequired() && !identity) {
                console.log("Rejected a connection with no verifiable access token");
                ws.close(4401, "unauthorized");
                return;
            }

            if (profileRequest) {
                if (!identity) {
                    console.log("Rejected an unverified profile connection");
                    ws.close(4401, "unauthorized");
                    return;
                }

                try {
                    const profile = await lobbyManager.profileStore.getAuthoritativeProfile(
                        identity.userId
                    );
                    sendJson(ws, profileSnapshot(identity, profile));
                    ws.on("message", async function incomingProfile(nextMessage) {
                        await handleProfileMessage(ws, identity, nextMessage);
                    });
                } catch (error) {
                    console.log("Profile bootstrap failed:", error.message);
                    sendJson(ws, { type: "profile_unavailable" });
                    ws.close(1011, "profile unavailable");
                }
                return;
            }

            player = await lobbyManager.createPlayer(ws, reconnectRequest, identity);

            console.log(`${player.id} connected${identity ? " (verified)" : ""}`);

            if (
                reconnectRequest.resumeOnly !== true &&
                (
                    !reconnectRequest.reconnectToken ||
                    (!player.room && !player.resumeUnavailable)
                )
            ) {
                await lobbyManager.addPlayer(player);
            }

            lobbyManager.broadcastDebugConfig();

            ws.on("message", async function incoming(nextMessage) {
                await handleMessage(player, nextMessage);
            });
        });

        ws.on("close", async function () {
            if (!player) {
                return;
            }

            console.log(`${player.id} disconnected`);
            await lobbyManager.removePlayer(player);
        });
    });
}

async function handleMessage(player, message) {
    const data = safeJson(message);

    if (!data) {
        return;
    }

    console.log(`${player.id} sent:`, data.type);

    if (data.type === "latency_ping") {
        if (typeof data.nonce === "string" && data.nonce !== "") {
            player.ws.send(JSON.stringify({ type: "latency_pong", nonce: data.nonce }));
        }
        return;
    }

    if (!await lobbyManager.isCurrentPlayerConnection(player)) {
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
        await lobbyManager.updateDebugConfig(data.key, data.value);
        return;
    }

    if (data.type === "resync_state") {
        await lobbyManager.resyncState(player, data.requestId);
        return;
    }

    if (data.type === "ready") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.toggleLobbyReady(player);
        return;
    }

    if (data.type === "leave_lobby") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.leaveLobby(player);
        return;
    }

    if (data.type === "leave_game") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.dispatchRoomAction(player, { type: "leave_game" });
        return;
    }

    if (data.type === "kick_private_player") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.kickPrivatePlayer(player, data.targetPlayerId);
        return;
    }

    if (data.type === "place_block") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.dispatchRoomAction(player, {
            type: "place_block",
            blockIndex: data.blockIndex,
            column: data.column,
            originY: data.originY
        });
        return;
    }

    if (data.type === "send_quick_chat") {
        if (!player.room) {
            console.log("Player has no room");
            return;
        }

        await lobbyManager.dispatchRoomAction(player, {
            type: "send_quick_chat",
            slot: data.slot
        });
        return;
    }

    if (data.type === "activate_power" && player.room) {
        await lobbyManager.dispatchRoomAction(player, {
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
    profileSnapshot,
    redirectOriginMatchesRequest,
    requestListener
};
