import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const GUARD = join(ROOT, 'scripts/verify-supabase-environment.sh');
const PRODUCTION_REF = 'kweqwprbahlfoznyzlvf';
const SEOUL_REF = 'lfvbxkidatmfhjbmcgyq';
const SECRET_SENTINEL = 'legacy.super-secret-do-not-log.key';

const REQUIRED_PATHS = [
  '/profiles',
  '/player_accounts',
  '/player_identities',
  '/player_profiles',
  '/account_settings',
  '/progression_tracks',
  '/trios',
  '/trio_progress',
  '/game_runs',
  '/game_run_players',
  '/currencies',
  '/account_balances',
  '/economy_events',
  '/wallet_ledger',
  '/trio_checkpoint_claims',
  '/account_milestone_claims',
  '/item_catalog',
  '/account_items',
  '/account_loadout_slots',
  '/store_offers',
  '/store_offer_costs',
  '/store_offer_grants',
  '/external_purchase_receipts',
  '/account_stats',
  '/trio_stats',
  '/achievement_catalog',
  '/account_achievements',
  '/account_progression',
  '/challenge_catalog',
  '/account_challenges',
  '/friendships',
  '/account_blocks',
  '/site_catalog',
  '/site_modifier_catalog',
  '/content_rotations',
  '/rpc/claim_player_provider',
  '/rpc/claim_player_facebook_provider',
  '/rpc/apply_wallet_transaction',
  '/rpc/secure_trio_checkpoint',
  '/rpc/claim_account_milestone',
];

function createHarness(t, paths = REQUIRED_PATHS) {
  const directory = mkdtempSync(join(tmpdir(), 'corp-tower-supabase-guard-test-'));
  const binDirectory = join(directory, 'bin');
  const openapiFile = join(directory, 'openapi.json');
  const curlPath = join(binDirectory, 'curl');

  mkdirSync(binDirectory);
  writeFileSync(openapiFile, JSON.stringify({
    openapi: '3.0.0',
    paths: Object.fromEntries(paths.map(path => [path, {}])),
  }));
  writeFileSync(curlPath, `#!/usr/bin/env bash
set -euo pipefail
output_file=""
while [ "$#" -gt 0 ]; do
  if [ "$1" = "--output" ]; then
    output_file="$2"
    shift 2
    continue
  fi
  shift
done
[ -n "$output_file" ]
cp -- "$FAKE_OPENAPI_FILE" "$output_file"
`);
  chmodSync(curlPath, 0o755);

  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return {
    directory,
    env: {
      PATH: `${binDirectory}:${process.env.PATH}`,
      TMPDIR: directory,
      FAKE_OPENAPI_FILE: openapiFile,
    },
  };
}

function productionEnvironment(overrides = {}) {
  return {
    TOD_DATA_ENVIRONMENT: 'production',
    SUPABASE_PROJECT_REF: PRODUCTION_REF,
    SUPABASE_URL: `https://${PRODUCTION_REF}.supabase.co`,
    SUPABASE_SERVICE_ROLE_KEY: SECRET_SENTINEL,
    SUPABASE_ANON_KEY: 'legacy.public-client.key',
    SUPABASE_AUTH_REQUIRED: 'true',
    PLAYER_IDENTITY_HMAC_SECRET: 'test-current-hmac',
    PLAYER_IDENTITY_HMAC_KEY_VERSION: '1',
    PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION: '0',
    ...overrides,
  };
}

function runGuard(harness, args, overrides = {}) {
  return spawnSync(GUARD, args, {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...harness.env,
      ...productionEnvironment(overrides),
    },
  });
}

test('the guard verifies the exact Production environment and all durable API surfaces', t => {
  const harness = createHarness(t);
  const result = runGuard(harness, ['production', '--require-client-key', '--require-hmac']);

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Verified Supabase production environment \\(${PRODUCTION_REF}\\)`));
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /super-secret-do-not-log/);
  assert.deepEqual(
    readdirSync(harness.directory).filter(name => name.startsWith('corp-tower-supabase-')),
    [],
  );
});

test('the guard reports a missing durable API surface without exposing credentials', t => {
  const harness = createHarness(t, REQUIRED_PATHS.slice(0, -1));
  const result = runGuard(harness, ['production']);

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing required Data API surface.*\/rpc\/claim_account_milestone/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /super-secret-do-not-log/);
});

test('the guard rejects cross-environment, source, unprovisioned, and incompatible-key inputs', async t => {
  const cases = [
    {
      name: 'wrong environment marker',
      args: ['production'],
      env: { TOD_DATA_ENVIRONMENT: 'development' },
      message: /expected data environment 'production'/,
    },
    {
      name: 'Seoul migration source',
      args: ['production'],
      env: {
        SUPABASE_PROJECT_REF: SEOUL_REF,
        SUPABASE_URL: `https://${SEOUL_REF}.supabase.co`,
      },
      message: /Seoul migration source cannot be used/,
    },
    {
      name: 'unprovisioned Development',
      args: ['development'],
      env: {
        TOD_DATA_ENVIRONMENT: 'development',
        SUPABASE_PROJECT_REF: 'abcdefghijklmnopqrst',
        SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
      },
      message: /Singapore Development is not provisioned/,
    },
    {
      name: 'opaque server key',
      args: ['production'],
      env: { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_test' },
      message: /requires the legacy service_role JWT key/,
    },
    {
      name: 'opaque client key',
      args: ['production', '--require-client-key'],
      env: { SUPABASE_ANON_KEY: 'sb_publishable_test' },
      message: /requires the legacy anon JWT key/,
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, subtest => {
      const harness = createHarness(subtest);
      const result = runGuard(harness, scenario.args, scenario.env);
      assert.equal(result.status, 1);
      assert.match(result.stderr, scenario.message);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /super-secret-do-not-log/);
    });
  }
});

test('the guard requires a coherent server HMAC lifecycle', t => {
  const harness = createHarness(t);
  const result = runGuard(harness, ['production', '--require-hmac'], {
    PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET: '',
    PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION: '2',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must be 0 when no previous secret is set/);
});
