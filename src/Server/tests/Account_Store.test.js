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
        calls.push({ url, method, headers, body: init.body });

        if (parsed.pathname === "/auth/v1/user") {
            const token = String(headers.Authorization || "").replace(/^Bearer /, "");
            return response(usersByToken.get(token) || null, usersByToken.has(token) ? 200 : 401);
        }

        const table = parsed.pathname.split("/").pop();
        const body = init.body ? JSON.parse(init.body) : null;

        if (table === "player_accounts") {
            if (method === "GET") {
                const id = parsed.searchParams.get("id");
                const supabaseUserId = parsed.searchParams.get("supabase_user_id");
                const rows = [...accounts.values()].filter(account =>
                    (!id || account.id === id.replace("eq.", "")) &&
                    (!supabaseUserId || account.supabase_user_id === supabaseUserId.replace("eq.", ""))
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
                        accounts.set(account.id, { ...account });
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
                account.supabase_user_id = body.supabase_user_id;
                return response(null, 204);
            }
        }

        if (table === "player_identities") {
            if (method === "GET") {
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

test("a non-Facebook Supabase user receives a durable game account", async () => {
    const database = createFakeSupabase();
    const store = createStore(database);
    await store.connect();

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
    assert.equal(database.accounts.get(identity.userId).supabase_user_id, "bbbbbbbb-cccc-dddd-eeee-ffffffffffff");
    assert.equal(database.identities.size, 0);
    assert.equal(
        database.calls.some(call => new URL(call.url).pathname === "/auth/v1/user"),
        false
    );
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
