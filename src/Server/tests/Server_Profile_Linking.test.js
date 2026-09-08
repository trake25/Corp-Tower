const assert = require("node:assert/strict");
const { test } = require("node:test");
const WebSocket = require("ws");

const { handleProfileMessage } = require("../app/Server");

function profileSocket() {
    const sent = [];
    return {
        readyState: WebSocket.OPEN,
        send: message => sent.push(JSON.parse(message)),
        sent
    };
}

test("profile link preflight verifies Facebook server-side and never echoes its credential or subject", async () => {
    const ws = profileSocket();
    const calls = [];
    const credential = "native-facebook-access-token";
    const subject = "facebook-subject-42";

    await handleProfileMessage(ws, {
        userId: "durable-account-a",
        supabaseUserId: "guest-user-a"
    }, JSON.stringify({
        type: "provider_link_preflight",
        provider: "facebook",
        providerCredential: credential
    }), {
        authVerifier: {
            verifyAccessToken: async (value, provider) => {
                calls.push([value, provider]);
                return {
                    kind: "facebook_native",
                    providerSubject: subject
                };
            }
        },
        accountStore: {
            preflightProviderLink: async (accountId, provider, providerSubject) => {
                assert.equal(accountId, "durable-account-a");
                assert.equal(provider, "facebook");
                assert.equal(providerSubject, subject);
                return { result: "allowed" };
            }
        }
    });

    assert.deepEqual(calls, [[credential, "facebook"]]);
    assert.deepEqual(ws.sent, [{
        type: "provider_link_preflight_result",
        provider: "facebook",
        result: "allowed"
    }]);
    assert.equal(JSON.stringify(ws.sent).includes(credential), false);
    assert.equal(JSON.stringify(ws.sent).includes(subject), false);
});

test("profile link commit binds only the same verified Supabase user and returns bounded state", async () => {
    const ws = profileSocket();
    const credential = "new-linked-session-token";
    let received = null;

    await handleProfileMessage(ws, {
        userId: "durable-account-a",
        supabaseUserId: "guest-user-a"
    }, JSON.stringify({
        type: "provider_link_commit",
        provider: "google",
        accessToken: credential
    }), {
        authVerifier: {
            verifyAccessToken: async value => ({
                kind: "supabase",
                supabaseUserId: "guest-user-a",
                accessToken: value,
                provider: "google"
            })
        },
        accountStore: {
            commitProviderLink: async (...args) => {
                received = args;
                return { result: "accepted" };
            }
        }
    });

    assert.equal(received[0], "durable-account-a");
    assert.equal(received[1], "guest-user-a");
    assert.equal(received[2].accessToken, credential);
    assert.equal(received[3], "google");
    assert.deepEqual(ws.sent, [{
        type: "provider_link_commit_result",
        provider: "google",
        result: "accepted"
    }]);
    assert.equal(JSON.stringify(ws.sent).includes(credential), false);
});

test("native Facebook commit reverifies the credential and claims only its trusted subject", async () => {
    const ws = profileSocket();
    const credential = "native-facebook-commit-token";
    const trustedSubject = "verified-facebook-subject";
    const clientSubject = "client-supplied-subject";
    const verifierCalls = [];
    let received = null;

    await handleProfileMessage(ws, {
        userId: "durable-account-a",
        supabaseUserId: "guest-user-a"
    }, JSON.stringify({
        type: "provider_link_commit",
        provider: "facebook",
        providerCredential: credential,
        providerSubject: clientSubject
    }), {
        authVerifier: {
            verifyAccessToken: async (...args) => {
                verifierCalls.push(args);
                return { kind: "facebook_native", providerSubject: trustedSubject };
            }
        },
        accountStore: {
            commitNativeFacebookProviderLink: async (...args) => {
                received = args;
                return { result: "accepted" };
            }
        }
    });

    assert.deepEqual(verifierCalls, [[credential, "facebook"]]);
    assert.deepEqual(received, [
        "durable-account-a", "guest-user-a", trustedSubject
    ]);
    assert.deepEqual(ws.sent, [{
        type: "provider_link_commit_result",
        provider: "facebook",
        result: "accepted"
    }]);
    const response = JSON.stringify(ws.sent);
    assert.equal(response.includes(credential), false);
    assert.equal(response.includes(trustedSubject), false);
    assert.equal(response.includes(clientSubject), false);
});

test("native Facebook commit rejection never reaches the account store", async () => {
    const ws = profileSocket();
    let storeCalls = 0;

    await handleProfileMessage(ws, {
        userId: "durable-account-a",
        supabaseUserId: "guest-user-a"
    }, JSON.stringify({
        type: "provider_link_commit",
        provider: "facebook",
        providerCredential: "expired-facebook-token"
    }), {
        authVerifier: { verifyAccessToken: async () => null },
        accountStore: {
            commitNativeFacebookProviderLink: async () => {
                storeCalls += 1;
                return { result: "accepted" };
            }
        }
    });

    assert.equal(storeCalls, 0);
    assert.deepEqual(ws.sent, [{
        type: "provider_link_commit_result",
        provider: "facebook",
        result: "rejected"
    }]);
});

test("native Facebook commit propagates only bounded ownership conflicts", async () => {
    for (const result of ["provider_conflict", "identity_conflict", "unexpected"]) {
        const ws = profileSocket();
        await handleProfileMessage(ws, {
            userId: "durable-account-a",
            supabaseUserId: "guest-user-a"
        }, JSON.stringify({
            type: "provider_link_commit",
            provider: "facebook",
            providerCredential: "native-facebook-token"
        }), {
            authVerifier: {
                verifyAccessToken: async () => ({
                    kind: "facebook_native",
                    providerSubject: "verified-facebook-subject"
                })
            },
            accountStore: {
                commitNativeFacebookProviderLink: async () => ({ result })
            }
        });

        assert.equal(
            ws.sent[0].result,
            result === "unexpected" ? "rejected" : result
        );
        assert.deepEqual(Object.keys(ws.sent[0]).sort(), ["provider", "result", "type"]);
    }
});

test("profile link rejects an unavailable verifier without exposing request material", async () => {
    const ws = profileSocket();
    const credential = "unverified-token";

    await handleProfileMessage(ws, {
        userId: "durable-account-a",
        supabaseUserId: "guest-user-a"
    }, JSON.stringify({
        type: "provider_link_commit",
        provider: "google",
        accessToken: credential
    }), {
        authVerifier: { verifyAccessToken: async () => null },
        accountStore: { commitProviderLink: async () => ({ result: "accepted" }) }
    });

    assert.deepEqual(ws.sent, [{
        type: "provider_link_commit_result",
        provider: "google",
        result: "rejected"
    }]);
    assert.equal(JSON.stringify(ws.sent).includes(credential), false);
});
