const assert = require("node:assert/strict");
const { before, test } = require("node:test");

const AuthVerifier = require("../app/Auth_Verifier");
const LobbyManager = require("../app/Lobby_Manager");

const SUPABASE_URL = "https://project-ref.supabase.co";
const ISSUER = SUPABASE_URL + "/auth/v1";
const FACEBOOK_APP_ID = "123456789";
const FACEBOOK_APP_SECRET = "facebook-app-secret";

const jose = require("jose");

let keyPair = null;

before(async () => {
    keyPair = await jose.generateKeyPair("RS256");
});

// Signs against the same in-memory key the verifier is handed, so the whole
// suite runs without ever reaching for the real JWKS endpoint.
function signToken(claims = {}, options = {}) {
    const now = Math.floor(Date.now() / 1000);

    return new jose.SignJWT({
        is_anonymous: false,
        ...claims
    })
        .setProtectedHeader({ alg: options.alg || "RS256" })
        .setSubject(options.subject !== undefined ? options.subject : "user-uuid")
        .setIssuer(options.issuer || ISSUER)
        .setAudience(options.audience || "authenticated")
        .setIssuedAt(now)
        .setExpirationTime(options.expiresAt || now + 3600)
        .sign(keyPair.privateKey);
}

function createVerifier(overrides = {}) {
    return new AuthVerifier({
        supabaseUrl: SUPABASE_URL,
        required: false,
        keyResolver: keyPair.publicKey,
        ...overrides
    });
}

function createFacebookVerifier(fetchImpl) {
    return new AuthVerifier({
        facebookAppId: FACEBOOK_APP_ID,
        facebookAppSecret: FACEBOOK_APP_SECRET,
        fetchImpl
    });
}

test("a valid token resolves to a verified identity", async () => {
    const verifier = createVerifier();
    const token = await signToken({
        user_metadata: { full_name: "Ada Lovelace" }
    });

    assert.deepEqual(await verifier.verifyAccessToken(token), {
        kind: "supabase",
        supabaseUserId: "user-uuid",
        accessToken: token,
        provider: "",
        isAnonymous: false,
        displayName: "Ada Lovelace"
    });
});

test("an anonymous guest token is flagged and carries no display name", async () => {
    const verifier = createVerifier();
    const token = await signToken({ is_anonymous: true });
    const identity = await verifier.verifyAccessToken(token);

    assert.equal(identity.isAnonymous, true);
    assert.equal(identity.displayName, null);
});

test("a token from another issuer is rejected", async () => {
    const verifier = createVerifier();
    const token = await signToken({}, { issuer: "https://evil.supabase.co/auth/v1" });

    assert.equal(await verifier.verifyAccessToken(token), null);
});

test("a token for another audience is rejected", async () => {
    const verifier = createVerifier();
    const token = await signToken({}, { audience: "anon" });

    assert.equal(await verifier.verifyAccessToken(token), null);
});

test("an expired token is rejected", async () => {
    const verifier = createVerifier();
    const now = Math.floor(Date.now() / 1000);
    const token = await signToken({}, { expiresAt: now - 60 });

    assert.equal(await verifier.verifyAccessToken(token), null);
});

test("a token signed by a different key is rejected", async () => {
    const verifier = createVerifier();
    const otherPair = await jose.generateKeyPair("RS256", { extractable: true });
    const now = Math.floor(Date.now() / 1000);
    const token = await new jose.SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setSubject("user-uuid")
        .setIssuer(ISSUER)
        .setAudience("authenticated")
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .sign(otherPair.privateKey);

    assert.equal(await verifier.verifyAccessToken(token), null);
});

test("an unsigned token is rejected", async () => {
    const verifier = createVerifier();
    const now = Math.floor(Date.now() / 1000);
    const unsigned = new jose.UnsecuredJWT({ sub: "user-uuid" })
        .setIssuer(ISSUER)
        .setAudience("authenticated")
        .setIssuedAt(now)
        .setExpirationTime(now + 3600)
        .encode();

    assert.equal(await verifier.verifyAccessToken(unsigned), null);
});

test("a token without a subject is rejected", async () => {
    const verifier = createVerifier();
    const token = await signToken({}, { subject: "" });

    assert.equal(await verifier.verifyAccessToken(token), null);
});

test("junk and absent tokens are rejected without throwing", async () => {
    const verifier = createVerifier();

    assert.equal(await verifier.verifyAccessToken("not-a-jwt"), null);
    assert.equal(await verifier.verifyAccessToken(""), null);
    assert.equal(await verifier.verifyAccessToken(undefined), null);
    assert.equal(await verifier.verifyAccessToken(null), null);
});

test("an unconfigured verifier is disabled and never required", async () => {
    const verifier = new AuthVerifier({ supabaseUrl: "", required: true });

    assert.equal(verifier.isEnabled(), false);
    assert.equal(verifier.isRequired(), false);
    assert.equal(await verifier.verifyAccessToken(await signToken()), null);
});

test("a configured verifier honours the required flag", () => {
    assert.equal(createVerifier({ required: true }).isRequired(), true);
    assert.equal(createVerifier({ required: false }).isRequired(), false);
});

test("a verified Facebook native token exposes its provider subject for account resolution", async () => {
    const verifier = createFacebookVerifier(async url => {
        assert.equal(url.pathname, "/debug_token");
        assert.equal(url.searchParams.get("input_token"), "native-facebook-token");
        assert.equal(
            url.searchParams.get("access_token"),
            FACEBOOK_APP_ID + "|" + FACEBOOK_APP_SECRET
        );
        return {
            ok: true,
            json: async () => ({
                data: {
                    is_valid: true,
                    app_id: FACEBOOK_APP_ID,
                    user_id: "meta-user-42"
                }
            })
        };
    });

    const identity = await verifier.verifyAccessToken(
        "native-facebook-token", "facebook"
    );

    assert.deepEqual(identity, {
        kind: "facebook_native",
        provider: "facebook",
        providerSubject: "meta-user-42",
        isAnonymous: false,
        displayName: null
    });
});

test("Facebook tokens from another app are rejected", async () => {
    const verifier = createFacebookVerifier(async () => ({
        ok: true,
        json: async () => ({
            data: {
                is_valid: true,
                app_id: "other-app",
                user_id: "meta-user-42"
            }
        })
    }));

    assert.equal(await verifier.verifyAccessToken("native-facebook-token", "facebook"), null);
});

test("Facebook verification is required when it is the only configured provider", () => {
    const verifier = new AuthVerifier({
        required: true,
        facebookAppId: FACEBOOK_APP_ID,
        facebookAppSecret: FACEBOOK_APP_SECRET
    });

    assert.equal(verifier.isEnabled(), true);
    assert.equal(verifier.isRequired(), true);
});

test("a trailing slash on the project URL does not break the issuer", () => {
    const verifier = new AuthVerifier({ supabaseUrl: SUPABASE_URL + "///" });

    assert.equal(verifier.getIssuer(), ISSUER);
});

test("a verified identity beats a spoofed profileId on the wire", async () => {
    const lobby = new LobbyManager();
    const identityFields = lobby.resolveIdentityFields(
        { profileId: "someone-elses-profile" },
        { userId: "verified-user-uuid", displayName: "Ada Lovelace" }
    );

    assert.deepEqual(identityFields, {
        profileId: "verified-user-uuid",
        displayName: "Ada Lovelace"
    });
});

test("without an identity the client profileId still applies", async () => {
    const lobby = new LobbyManager();

    assert.deepEqual(
        lobby.resolveIdentityFields({ profileId: "local-uuid" }, null),
        { profileId: "local-uuid", displayName: null }
    );
    assert.deepEqual(
        lobby.resolveIdentityFields({}, null),
        { profileId: null, displayName: null }
    );
});

test("a verified display name reaches the roster and survives a rename", async () => {
    const lobby = new LobbyManager();
    const room = {
        players: [
            { id: "1", profileId: "verified-user-uuid", displayName: "Ada Lovelace" },
            { id: "2", profileId: "guest-uuid", displayName: null }
        ]
    };

    const roster = await lobby.buildRoomRoster(room);

    assert.equal(roster[0].displayName, "Ada Lovelace");
    assert.notEqual(roster[1].displayName, "Ada Lovelace");
    assert.ok(roster[1].displayName, "A guest should still get a generated name.");

    room.players[0].displayName = "Ada L";
    const renamed = await lobby.buildRoomRoster(room);

    assert.equal(renamed[0].displayName, "Ada L");
});
