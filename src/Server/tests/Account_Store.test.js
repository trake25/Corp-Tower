const assert = require("node:assert/strict");
const { test } = require("node:test");

const AccountStore = require("../app/Account_Store");

const SUPABASE_URL = "https://project-ref.supabase.co";
const SERVICE_KEY = "service-role-key";

function response(data, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => data
    };
}

function createFakeSupabase() {
    const accounts = new Map();
    const identities = new Map();
    const usersByToken = new Map();
    const calls = [];

    const fetchImpl = async (url, init = {}) => {
        const parsed = new URL(url);
        const method = init.method || "GET";
        const headers = init.headers || {};
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ url, method, headers, body: init.body });

        if (parsed.pathname === "/auth/v1/user") {
            const token = String(headers.Authorization || "").replace(/^Bearer /, "");
            return response(usersByToken.get(token) || null, usersByToken.has(token) ? 200 : 401);
        }

        if (parsed.pathname === "/rest/v1/rpc/claim_player_provider") {
            const account = accounts.get(body.p_account_id);
            const provider = body.p_provider;

            if (!account || provider !== "google") {
                return response("rejected");
            }
            if (account.linked_provider && account.linked_provider !== provider) {
                return response("provider_conflict");
            }
            account.linked_provider = provider;
            return response("accepted");
        }

        if (parsed.pathname === "/rest/v1/rpc/claim_player_facebook_provider") {
            const account = accounts.get(body.p_account_id);
            const activeKey = [
                "facebook",
                body.p_facebook_key_version,
                body.p_facebook_subject_hmac
            ].join(":");
            const activeIdentity = identities.get(activeKey);
            const hasPreviousPair = body.p_previous_key_version != null ||
                body.p_previous_subject_hmac != null;

            if (
                !account ||
                !body.p_facebook_key_version ||
                !body.p_facebook_subject_hmac ||
                (hasPreviousPair && (!body.p_previous_key_version || !body.p_previous_subject_hmac))
            ) {
                return response("rejected");
            }
            if (account.linked_provider && account.linked_provider !== "facebook") {
                return response("provider_conflict");
            }
            if (activeIdentity && activeIdentity.player_account_id !== account.id) {
                return response("identity_conflict");
            }

            let previousIdentity = null;
            if (hasPreviousPair) {
                const previousKey = [
                    "facebook",
                    body.p_previous_key_version,
                    body.p_previous_subject_hmac
                ].join(":");
                previousIdentity = identities.get(previousKey);
                if (previousIdentity && previousIdentity.player_account_id !== account.id) {
                    return response("identity_conflict");
                }
            }

            const hasFacebookIdentity = [...identities.values()].some(identity => {
                return identity.provider === "facebook" && identity.player_account_id === account.id;
            });
            if (hasFacebookIdentity && !activeIdentity && !previousIdentity) {
                return response("identity_conflict");
            }

            if (!activeIdentity) {
                identities.set(activeKey, {
                    provider: "facebook",
                    key_version: body.p_facebook_key_version,
                    subject_hmac: body.p_facebook_subject_hmac,
                    player_account_id: account.id
                });
            }

            if (!account.linked_provider) {
                account.linked_provider = "facebook";
            }
            return response("accepted");
        }

        const table = parsed.pathname.split("/").pop();

        if (table === "player_accounts") {
            if (method === "GET") {
                const id = parsed.searchParams.get("id");
                const supabaseUserId = parsed.searchParams.get("supabase_user_id");
                const rows = [...accounts.values()].filter(account =>
                    (!id || account.id === id.replace("eq.", "")) &&
                    (!supabaseUserId || (
                        supabaseUserId === "is.null"
                            ? account.supabase_user_id == null
                            : account.supabase_user_id === supabaseUserId.replace("eq.", "")
                    ))
                );
                return response(rows);
            }

            if (method === "POST") {
                for (const account of body) {
                    if (![...accounts.values()].some(row =>
                        row.id === account.id || (
                            account.supabase_user_id &&
                            row.supabase_user_id === account.supabase_user_id
                        )
                    )) {
                        accounts.set(account.id, {
                            name_onboarding_seen: false,
                            linked_provider: null,
                            ...account
                        });
                    }
                }
                return response(null, 201);
            }

            if (method === "PATCH") {
                const id = parsed.searchParams.get("id").replace("eq.", "");
                const account = accounts.get(id);
                if (!account) {
                    return response(null, 404);
                }
                const supabaseUserId = parsed.searchParams.get("supabase_user_id");
                if (supabaseUserId === "is.null" && account.supabase_user_id != null) {
                    return response(null, 204);
                }
                Object.assign(account, body);
                return response(null, 204);
            }
        }

        if (table === "player_identities") {
            if (method === "GET") {
                const accountId = parsed.searchParams.get("player_account_id");

                if (accountId) {
                    const rows = [...identities.values()].filter(identity => {
                        return (
                            identity.provider === parsed.searchParams.get("provider").replace("eq.", "") &&
                            identity.player_account_id === accountId.replace("eq.", "")
                        );
                    });
                    return response(rows.slice(0, Number(parsed.searchParams.get("limit")) || rows.length));
                }

                const key = [
                    parsed.searchParams.get("provider").replace("eq.", ""),
                    parsed.searchParams.get("key_version").replace("eq.", ""),
                    parsed.searchParams.get("subject_hmac").replace("eq.", "")
                ].join(":");
                const identity = identities.get(key);
                return response(identity ? [identity] : []);
            }

            if (method === "POST") {
                for (const identity of body) {
                    const key = [identity.provider, identity.key_version, identity.subject_hmac].join(":");
                    if (!identities.has(key)) {
                        identities.set(key, { ...identity });
                    }
                }
                return response(null, 201);
            }
        }

        return response(null, 404);
    };

    return { accounts, calls, fetchImpl, identities, usersByToken };
}

function createStore(database, overrides = {}) {
    return new AccountStore({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_KEY,
        hmacSecret: "current-hmac-secret",
        fetchImpl: database.fetchImpl,
        ...overrides
    });
}

test("native Facebook and browser Facebook resolve to the same player account", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    const native = await store.resolve({
        kind: "facebook_native",
        providerSubject: "meta-user-42",
        isAnonymous: false,
        displayName: null
    });
    database.usersByToken.set("browser-facebook-token", {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        identities: [{ provider: "facebook", provider_id: "meta-user-42" }]
    });
    const browser = await store.resolve({
        kind: "supabase",
        supabaseUserId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        provider: "facebook",
        accessToken: "browser-facebook-token",
        isAnonymous: false,
        displayName: "Ada Lovelace"
    });

    assert.equal(browser.userId, native.userId);
    assert.equal(browser.displayName, "Ada Lovelace");
    assert.equal(
        database.accounts.get(native.userId).supabase_user_id,
        "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    assert.ok(
        database.calls.some(call => new URL(call.url).pathname === "/auth/v1/user"),
        "Browser Facebook must derive the provider subject from Supabase, not the client."
    );
    for (const call of database.calls) {
        assert.ok(!call.url.includes("meta-user-42"));
        assert.ok(!String(call.body || "").includes("meta-user-42"));
    }
});

test("browser Facebook accepts the compatible Auth identity id field", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    database.usersByToken.set("browser-facebook-token", {
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        identities: [{ provider: "facebook", id: "meta-user-42" }]
    });
    const browser = await store.resolve({
        kind: "supabase",
        supabaseUserId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        provider: "facebook",
        accessToken: "browser-facebook-token",
        isAnonymous: false,
        displayName: "Ada Lovelace"
    });

    assert.ok(browser.userId);
    assert.equal(database.identities.size, 1);
});

test("a non-Facebook Supabase user receives a durable game account", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    database.usersByToken.set("google-token", {
        id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        identities: [{ provider: "google", provider_id: "google-user-42" }]
    });

    const identity = await store.resolve({
        kind: "supabase",
        supabaseUserId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        provider: "google",
        accessToken: "google-token",
        isAnonymous: false,
        displayName: "Ada"
    });

    assert.ok(identity.userId);
    assert.equal(identity.displayName, "Ada");
    assert.equal(identity.nameOnboardingSeen, false);
    assert.equal(database.accounts.get(identity.userId).supabase_user_id, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff");
    assert.equal(database.identities.size, 0);
    assert.ok(
        database.calls.some(call => new URL(call.url).pathname === "/auth/v1/user"),
        "A verified external provider must be checked through Supabase before it is accepted."
    );
});

test("onboarding acknowledgement is persisted as durable account state", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    database.usersByToken.set("google-token", {
        id: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        identities: [{ provider: "google", provider_id: "google-user-42" }]
    });
    const identity = await store.resolve({
        kind: "supabase",
        supabaseUserId: "bbbbbbbb-cccc-dddd-eeee-ffffffffffff",
        provider: "google",
        accessToken: "google-token",
        isAnonymous: false,
        displayName: "Ada"
    });

    assert.equal(await store.markNameOnboardingSeen(identity.userId), true);
    assert.equal(database.accounts.get(identity.userId).name_onboarding_seen, true);
});

test("an HMAC key rotation recognizes the prior Facebook identity and records the new hash", async () => {
    const database = createFakeSupabase();
    const oldStore = createStore(database, {
        hmacSecret: "old-hmac-secret",
        hmacKeyVersion: 1
    });
    await oldStore.connect();
    const original = await oldStore.resolve({
        kind: "facebook_native",
        providerSubject: "meta-user-42",
        isAnonymous: false,
        displayName: null
    });

    const rotatedStore = createStore(database, {
        hmacSecret: "new-hmac-secret",
        hmacKeyVersion: 2,
        previousHmacSecret: "old-hmac-secret",
        previousHmacKeyVersion: 1
    });
    await rotatedStore.connect();
    const rotated = await rotatedStore.resolve({
        kind: "facebook_native",
        providerSubject: "meta-user-42",
        isAnonymous: false,
        displayName: null
    });

    assert.equal(rotated.userId, original.userId);
    assert.equal(database.identities.size, 2);
    assert.equal(database.accounts.get(original.userId).linked_provider, "facebook");
});

test("a disabled account store never accepts an identity", async () => {
    const store = new AccountStore({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_KEY,
        hmacSecret: ""
    });
    await store.connect();

    assert.equal(await store.resolve({ kind: "facebook_native" }), null);
});

test("a durable account accepts one provider atomically and repeats the same provider idempotently", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    const identity = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-google-provider",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });

    assert.equal(await store.claimProvider(identity.userId, "google"), "accepted");
    assert.equal(await store.claimProvider(identity.userId, "google"), "accepted");
    assert.equal(await store.claimProvider(identity.userId, "facebook", "meta-user-42"), "provider_conflict");
    assert.equal(database.accounts.get(identity.userId).linked_provider, "google");
});

test("native Facebook linking claims the same durable Guest without changing its Supabase binding", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-native-facebook",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });
    const accountCount = database.accounts.size;
    const accountInsertCount = database.calls.filter(call =>
        new URL(call.url).pathname === "/rest/v1/player_accounts" && call.method === "POST"
    ).length;

    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-native-facebook", "meta-native-user"
        ),
        { result: "accepted" }
    );
    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-native-facebook", "meta-native-user"
        ),
        { result: "accepted" }
    );

    assert.equal(database.accounts.size, accountCount);
    assert.equal(database.accounts.get(guest.userId).supabase_user_id, "guest-native-facebook");
    assert.equal(database.accounts.get(guest.userId).linked_provider, "facebook");
    assert.equal(database.identities.size, 1);
    assert.deepEqual(
        await store.preflightProviderLink(guest.userId, "facebook", "meta-native-user"),
        { result: "allowed" },
        "a lost response may retry the same verified Facebook subject"
    );
    assert.ok(database.calls.some(call => {
        return new URL(call.url).pathname === "/rest/v1/rpc/claim_player_facebook_provider";
    }));
    assert.equal(database.calls.filter(call =>
        new URL(call.url).pathname === "/rest/v1/player_accounts" && call.method === "POST"
    ).length, accountInsertCount);
});

test("a durable Facebook account rejects a different unowned Facebook subject", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-facebook-subject-guard",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });

    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-facebook-subject-guard", "meta-original-subject"
        ),
        { result: "accepted" }
    );
    assert.deepEqual(
        await store.preflightProviderLink(guest.userId, "facebook", "meta-different-subject"),
        { result: "identity_conflict" }
    );
    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-facebook-subject-guard", "meta-different-subject"
        ),
        { result: "identity_conflict" }
    );

    assert.equal(database.accounts.get(guest.userId).linked_provider, "facebook");
    assert.equal(database.identities.size, 1, "the rejected subject must not create an identity row");
});

test("native Facebook linking rejects a mismatched expected Guest binding", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-native-facebook",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });

    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "another-guest", "meta-native-user"
        ),
        { result: "rejected" }
    );
    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-native-facebook", ""
        ),
        { result: "rejected" }
    );
    assert.equal(database.accounts.get(guest.userId).linked_provider, null);
    assert.equal(database.accounts.get(guest.userId).supabase_user_id, "guest-native-facebook");
    assert.equal(database.identities.size, 0);
});

test("native Facebook linking preserves an existing Google provider claim", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-google-first",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });
    assert.equal(await store.claimProvider(guest.userId, "google"), "accepted");

    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-google-first", "meta-native-user"
        ),
        { result: "provider_conflict" }
    );
    assert.equal(database.accounts.get(guest.userId).linked_provider, "google");
    assert.equal(database.identities.size, 0);
});

test("native Facebook linking preserves existing Facebook subject ownership", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    const owner = await store.resolve({
        kind: "facebook_native",
        providerSubject: "meta-owned-native-user",
        isAnonymous: false,
        displayName: null
    });
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-facebook-second",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });

    assert.deepEqual(
        await store.commitNativeFacebookProviderLink(
            guest.userId, "guest-facebook-second", "meta-owned-native-user"
        ),
        { result: "identity_conflict" }
    );
    assert.equal(database.accounts.get(owner.userId).supabase_user_id, null);
    assert.equal(database.accounts.get(guest.userId).supabase_user_id, "guest-facebook-second");
    assert.equal(database.accounts.get(guest.userId).linked_provider, null);
});

test("racing different provider claims cannot accept both providers", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    const identity = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-race-provider",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });
    const results = await Promise.all([
        store.claimProvider(identity.userId, "google"),
        store.claimProvider(identity.userId, "facebook", "meta-race-user")
    ]);

    assert.equal(results.filter(result => result === "accepted").length, 1);
    assert.equal(results.filter(result => result === "provider_conflict").length, 1);
    assert.ok(["google", "facebook"].includes(database.accounts.get(identity.userId).linked_provider));
});

test("Facebook subject ownership is rejected before a second durable account can bind it", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

    const owner = await store.resolve({
        kind: "facebook_native",
        providerSubject: "meta-owned-user",
        isAnonymous: false,
        displayName: null
    });
    const guest = await store.resolve({
        kind: "supabase",
        supabaseUserId: "guest-facebook-provider",
        accessToken: "guest-token",
        isAnonymous: true,
        displayName: null
    });

    assert.deepEqual(
        await store.preflightProviderLink(guest.userId, "facebook", "meta-owned-user"),
        { result: "identity_conflict" }
    );
    await assert.rejects(
        store.resolveFacebook("meta-owned-user", "guest-facebook-provider", null, false),
        /already linked to another durable account/
    );
    assert.equal(database.accounts.get(owner.userId).supabase_user_id, null);
    assert.equal(database.accounts.get(guest.userId).supabase_user_id, "guest-facebook-provider");
});

test("an active verified second provider is rejected rather than becoming accepted account state", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();
    database.usersByToken.set("multi-provider-token", {
        id: "multi-provider-user",
        identities: [
            { provider: "google", provider_id: "google-user" },
            { provider: "facebook", provider_id: "facebook-user" }
        ]
    });

    await assert.rejects(
        store.resolve({
            kind: "supabase",
            supabaseUserId: "multi-provider-user",
            accessToken: "multi-provider-token",
            provider: "google",
            isAnonymous: false,
            displayName: null
        }),
        /more than one external provider/
    );
    assert.equal(database.accounts.size, 0);
});
