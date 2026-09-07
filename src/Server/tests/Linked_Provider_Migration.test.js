const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { test } = require("node:test");

const migration = readFileSync(resolve(__dirname, "../migrations/0004_linked_provider.sql"), "utf8");

test("linked-provider migration backfills logical provider state without counting Facebook HMAC rotations twice", () => {
    assert.match(migration, /begin;[\s\S]*commit;/i);
    assert.match(migration, /from public\.player_identities[\s\S]*where provider = 'facebook'/i);
    assert.match(migration, /join auth\.identities identities/i);
    assert.match(migration, /group by account_id[\s\S]*having count\(distinct provider\) > 1/i);
    assert.match(migration, /raise exception 'player account has more than one logical external provider'/i);
    assert.match(migration, /select account_id, min\(provider\) as provider/i);
});

test("linked-provider migration installs an atomic compare-and-set claim boundary", () => {
    assert.match(migration, /add column if not exists linked_provider text/i);
    assert.match(migration, /check \(linked_provider is null or linked_provider in \('google', 'facebook'\)\)/i);
    assert.match(migration, /create or replace function public\.claim_player_provider/i);
    assert.match(migration, /for update;/i);
    assert.match(migration, /on conflict \(provider, key_version, subject_hmac\) do nothing/i);
    assert.match(migration, /return 'provider_conflict'/i);
    assert.match(migration, /return 'identity_conflict'/i);
});
