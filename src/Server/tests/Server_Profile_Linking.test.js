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
