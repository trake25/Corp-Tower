const assert = require("node:assert/strict");
const test = require("node:test");
const { EventEmitter } = require("node:events");

const AuthVerifier = require("../app/Auth_Verifier");
const {
    handleFacebookOauthExchange,
    redirectOriginMatchesRequest
} = require("../app/Server");

function response(ok, payload, status = 200) {
    return {
        ok,
        status,
        async json() {
            return payload;
        }
    };
}

function exchangeVerifier() {
    const calls = [];
    const fetchImpl = async urlValue => {
        const url = new URL(urlValue);
        calls.push(url);

        if (url.pathname === "/v22.0/oauth/access_token") {
            assert.equal(url.searchParams.get("client_id"), "facebook-app-id");
            assert.equal(url.searchParams.get("client_secret"), "facebook-app-secret");
            assert.equal(url.searchParams.get("redirect_uri"), "https://todplay.galaxxigames.com/");
            assert.equal(url.searchParams.get("code"), "facebook-code");
            return response(true, {
                access_token: "facebook-access-token",
                expires_in: 3600
            });
        }

        if (url.pathname === "/debug_token") {
            assert.equal(url.searchParams.get("input_token"), "facebook-access-token");
            assert.equal(
                url.searchParams.get("access_token"),
                "facebook-app-id|facebook-app-secret"
            );
            return response(true, {
                data: {
                    is_valid: true,
                    app_id: "facebook-app-id",
                    user_id: "facebook-user-42"
                }
            });
        }

        return response(false, {}, 404);
    };

    return {
        calls,
        verifier: new AuthVerifier({
            facebookAppId: "facebook-app-id",
            facebookAppSecret: "facebook-app-secret",
            fetchImpl
        })
    };
}

function requestWithJson(payload, origin = "https://todplay.galaxxigames.com") {
    const req = new EventEmitter();
    req.headers = { origin };
    process.nextTick(() => {
        req.emit("data", Buffer.from(JSON.stringify(payload)));
        req.emit("end");
    });
    return req;
}

function captureResponse() {
    let resolveFinished;
    const finished = new Promise(resolve => {
        resolveFinished = resolve;
    });
    const state = {
        status: 0,
        headers: {},
        body: ""
    };
    return {
        state,
        finished,
        writeHead(status, headers = {}) {
            state.status = status;
            state.headers = headers;
        },
        end(body = "") {
            state.body = String(body || "");
            resolveFinished();
        }
    };
}

test("Facebook Web authorization code exchange stays server-side and verifies the token", async () => {
    const { calls, verifier } = exchangeVerifier();
    const result = await verifier.exchangeFacebookAuthorizationCode(
        "facebook-code",
        "https://todplay.galaxxigames.com/"
    );

    assert.equal(result.accessToken, "facebook-access-token");
    assert.equal(result.expiresIn, 3600);
    assert.equal(result.identity.kind, "facebook_native");
    assert.equal(result.identity.providerSubject, "facebook-user-42");
    assert.equal(calls.length, 2);
});

test("Facebook Web exchange rejects an access token issued for another Meta app", async () => {
    const verifier = new AuthVerifier({
        facebookAppId: "facebook-app-id",
        facebookAppSecret: "facebook-app-secret",
        fetchImpl: async urlValue => {
            const url = new URL(urlValue);
            if (url.pathname === "/v22.0/oauth/access_token") {
                return response(true, {
                    access_token: "wrong-app-token",
                    expires_in: 3600
                });
            }
            return response(true, {
                data: {
                    is_valid: true,
                    app_id: "another-app-id",
                    user_id: "facebook-user-42"
                }
            });
        }
    });

    assert.equal(
        await verifier.exchangeFacebookAuthorizationCode(
            "facebook-code",
            "https://todplay.galaxxigames.com/"
        ),
        null
    );
});

test("Facebook Web exchange response is readable only by the redirect origin", async () => {
    assert.deepEqual(
        redirectOriginMatchesRequest(
            { headers: { origin: "https://todplay.galaxxigames.com" } },
            "https://todplay.galaxxigames.com/"
        ),
        { allowed: true, origin: "https://todplay.galaxxigames.com" }
    );
    assert.deepEqual(
        redirectOriginMatchesRequest(
            { headers: { origin: "https://evil.example" } },
            "https://todplay.galaxxigames.com/"
        ),
        { allowed: false, origin: "" }
    );
});

test("HTTP exchange endpoint returns only the verified access token and expiry", async () => {
    const { verifier } = exchangeVerifier();
    const req = requestWithJson({
        code: "facebook-code",
        redirectUri: "https://todplay.galaxxigames.com/"
    });
    const res = captureResponse();

    await handleFacebookOauthExchange(req, res, verifier);
    await res.finished;

    assert.equal(res.state.status, 200);
    assert.equal(
        res.state.headers["Access-Control-Allow-Origin"],
        "https://todplay.galaxxigames.com"
    );
    assert.equal(res.state.headers["Cache-Control"], "no-store");
    assert.deepEqual(JSON.parse(res.state.body), {
        access_token: "facebook-access-token",
        expires_in: 3600
    });
    assert.ok(!res.state.body.includes("facebook-app-secret"));
    assert.ok(!res.state.body.includes("facebook-user-42"));
});
