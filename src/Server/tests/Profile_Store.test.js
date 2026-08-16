const assert = require("node:assert/strict");
const { test } = require("node:test");

const ProfileStore = require("../app/Profile_Store");

const SUPABASE_URL = "https://project-ref.supabase.co";
const SERVICE_KEY = "service-role-key";
const PROFILE_ID = "11111111-2222-3333-4444-555555555555";

// Records every call so the tests can assert on the REST traffic itself, not
// just on the returned profile.
function createFakeSupabase(rowsByCall) {
    const calls = [];
    let getCount = 0;

    const fetchImpl = async (url, init) => {
        calls.push({ url, method: init.method, body: init.body, headers: init.headers });

        if (init.method === "GET") {
            const rows = rowsByCall[Math.min(getCount, rowsByCall.length - 1)];
            getCount += 1;
            return { ok: true, status: 200, json: async () => rows };
        }

        return { ok: true, status: 204, json: async () => null };
    };

    return { calls, fetchImpl };
}

function createStore(overrides = {}) {
    return new ProfileStore({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SERVICE_KEY,
        ...overrides
    });
}

test("without a service role key the store never touches the network", async () => {
    let called = false;
    const store = new ProfileStore({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: "",
        fetchImpl: async () => { called = true; }
    });
    await store.connect();

    assert.equal(store.enabled, false);

    const profile = await store.getProfile(PROFILE_ID, 0);

    assert.equal(called, false, "A disabled store must make no request.");
    assert.ok(profile.displayName, "It must still produce a generated name.");
});

test("without a project url the store stays disabled even with a key", async () => {
    const store = new ProfileStore({ supabaseUrl: "", serviceRoleKey: SERVICE_KEY });
    await store.connect();

    assert.equal(store.enabled, false);
});

test("a stored display name wins over the generated one", async () => {
    const { fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: "Ada Lovelace", status: "active" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0);

    assert.equal(profile.displayName, "Ada Lovelace");
    assert.equal(profile.status, "active");
});

test("a stored name also wins over a freshly verified one, so a rename sticks", async () => {
    const { fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: "ChosenName", status: "active" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0, "Google Name");

    assert.equal(
        profile.displayName, "ChosenName",
        "The row is authoritative once it carries a name."
    );
});

test("a missing row is inserted with the verified name", async () => {
    const { calls, fetchImpl } = createFakeSupabase([[]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0, "Ada Lovelace");

    assert.equal(profile.displayName, "Ada Lovelace");

    const insert = calls.find(call => call.method === "POST");
    assert.ok(insert, "A missing row must be inserted.");

    const body = JSON.parse(insert.body)[0];
    assert.equal(body.id, PROFILE_ID);
    assert.equal(body.display_name, "Ada Lovelace");
    assert.ok(body.last_login_at, "Insert must stamp last_login_at.");
    assert.match(
        insert.headers.Prefer, /ignore-duplicates/,
        "A racing insert must not clobber a row another pod just wrote."
    );
});

test("a row with no name is backfilled rather than left blank", async () => {
    const { calls, fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: null, status: "active" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    await store.getProfile(PROFILE_ID, 0, "Ada Lovelace");

    const patch = calls.find(call => call.method === "PATCH");
    const body = JSON.parse(patch.body);

    assert.equal(body.display_name, "Ada Lovelace");
    assert.ok(body.last_login_at);
});

test("an existing named row is patched for login time only", async () => {
    const { calls, fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: "ChosenName", status: "active" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    await store.getProfile(PROFILE_ID, 0, "Google Name");

    const body = JSON.parse(calls.find(call => call.method === "PATCH").body);

    assert.ok(body.last_login_at);
    assert.equal(
        body.display_name, undefined,
        "An existing name must never be overwritten by a patch."
    );
});

test("a banned status is carried through but not acted on", async () => {
    const { fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: "Ada", status: "banned" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0);

    assert.equal(profile.status, "banned");
    assert.equal(profile.displayName, "Ada", "Enforcement is not wired yet.");
});

test("a Supabase outage degrades to a generated name instead of failing", async () => {
    const store = createStore({
        fetchImpl: async () => { throw new Error("ECONNREFUSED"); }
    });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0);

    assert.ok(profile.displayName, "A room must still get a roster name.");
    assert.equal(profile.profileId, PROFILE_ID);
});

test("an error status degrades the same way", async () => {
    const store = createStore({
        fetchImpl: async () => ({ ok: false, status: 500, json: async () => null })
    });
    await store.connect();

    const profile = await store.getProfile(PROFILE_ID, 0, "Ada");

    assert.equal(profile.displayName, "Ada");
});

test("the service role key is sent as apikey and bearer, never on the query", async () => {
    const { calls, fetchImpl } = createFakeSupabase([[]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    await store.getProfile(PROFILE_ID, 0);

    for (const call of calls) {
        assert.equal(call.headers.apikey, SERVICE_KEY);
        assert.equal(call.headers.Authorization, `Bearer ${SERVICE_KEY}`);
        assert.ok(
            !call.url.includes(SERVICE_KEY),
            "The key must never land in a URL, which gets logged: " + call.url
        );
    }
});

test("a cached profile is served without a second round trip", async () => {
    const { calls, fetchImpl } = createFakeSupabase([[
        { id: PROFILE_ID, display_name: "Ada", status: "active" }
    ]]);
    const store = createStore({ fetchImpl });
    await store.connect();

    await store.getProfile(PROFILE_ID, 0);
    const callsAfterFirst = calls.length;
    await store.getProfile(PROFILE_ID, 1);

    assert.equal(calls.length, callsAfterFirst, "The cache must absorb repeats.");
});

test("a bot seat with no profile id never reaches Supabase", async () => {
    let called = false;
    const store = createStore({ fetchImpl: async () => { called = true; } });
    await store.connect();

    const profile = await store.getProfile(null, 2);

    assert.equal(called, false);
    assert.equal(profile.displayName, "Player 3");
    assert.equal(profile.profileId, null);
});
