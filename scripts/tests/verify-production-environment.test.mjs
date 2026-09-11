import assert from 'node:assert/strict';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import test from 'node:test';

import {
  PRODUCTION_PROJECT_REF,
  REQUIRED_PRODUCTION_INPUTS,
  verifyProductionEnvironment,
} from '../verify-production-environment.mjs';

const NOW_MS = Date.UTC(2026, 8, 11, 0, 0, 0);
const AWS_ACCOUNT = '123456789012';
const ASSET_BYTES = Buffer.from('verified private asset bundle');
const CURRENT_HMAC = 'current-production-hmac-secret-with-high-entropy-0123456789';
const PREVIOUS_HMAC = 'previous-production-hmac-secret-with-high-entropy-9876543210';
const ASSET_MANIFEST = {
  object: 'art/releases/art-test.tar.gz',
  sha256: createHash('sha256').update(ASSET_BYTES).digest('hex'),
};
const PRODUCTION_WORKFLOWS = [
  '.github/workflows/Android-Deploy-wstodplay.yml',
  '.github/workflows/EKS-Cleanup-Game-Server.yml',
  '.github/workflows/EKS-Cleanup-Web-Server.yml',
  '.github/workflows/EKS-Deploy-Game-Server.yml',
  '.github/workflows/EKS-Deploy-Web-Server.yml',
  '.github/workflows/EKS-Force-Unlock.yml',
  '.github/workflows/EKS-Infra-Apply.yml',
  '.github/workflows/EKS-Infra-Auto-Destroy.yml',
  '.github/workflows/EKS-Infra-Destroy.yml',
  '.github/workflows/EKS-Infra-Diagnose.yml',
  '.github/workflows/EKS-Infra-Plan.yml',
  '.github/workflows/EKS-Shared-Infra-Apply.yml',
];

function jwt(role, ref = PRODUCTION_PROJECT_REF) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return [
    encode({ alg: 'HS256', typ: 'JWT' }),
    encode({ iss: 'supabase', ref, role, iat: 1_700_000_000, exp: 4_000_000_000 }),
    Buffer.from('test-signature').toString('base64url'),
  ].join('.');
}

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const serviceAccount = JSON.stringify({
  type: 'service_account',
  project_id: 'corp-tower-play',
  private_key_id: 'test-key',
  private_key: privateKey.export({ format: 'pem', type: 'pkcs8' }),
  client_email: 'publisher@corp-tower-play.iam.gserviceaccount.com',
  client_id: '12345678901234567890',
  token_uri: 'https://oauth2.googleapis.com/token',
});

function completeEnvironment() {
  return {
    TOD_DATA_ENVIRONMENT: 'production',
    SUPABASE_PROJECT_REF: PRODUCTION_PROJECT_REF,
    SUPABASE_AUTH_REQUIRED: 'true',
    CORP_TOWER_AUTH_OAUTH: 'true',
    PLAYER_IDENTITY_HMAC_KEY_VERSION: '7',
    PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION: '6',
    TOD_FACEBOOK_APP_ID: '123456789012345',
    TOD_FACEBOOK_CLIENT_TOKEN: 'facebook-client-token-value',
    SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`,
    SUPABASE_ANON_KEY: jwt('anon'),
    SUPABASE_SERVICE_ROLE_KEY: jwt('service_role'),
    TOD_FACEBOOK_APP_SECRET: '0123456789abcdef0123456789abcdef',
    GOOGLE_OAUTH_WEB_CLIENT_ID: '1234567890-corpTowerOauth.apps.googleusercontent.com',
    PLAYER_IDENTITY_HMAC_SECRET: CURRENT_HMAC,
    PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET: PREVIOUS_HMAC,
    AWS_ROLE_ARN: `arn:aws:iam::${AWS_ACCOUNT}:role/github-corp-tower-production`,
    ECR_REPOSITORY: 'corp-tower/server',
    EKS_OPERATOR_PRINCIPAL_ARN: `arn:aws:iam::${AWS_ACCOUNT}:user/corp-tower-operator`,
    CLOUDFLARE_API_TOKEN: 'CloudflareApiTokenForProduction1234567890',
    CLOUDFLARE_ZONE_ID: '0123456789abcdef0123456789abcdef',
    R2_BUCKET: 'corp-tower-private-art',
    R2_ACCOUNT_ID: 'abcdef0123456789abcdef0123456789',
    R2_ACCESS_KEY_ID: 'R2AccessKeyIdForTesting1234567890',
    R2_SECRET_ACCESS_KEY: 'R2SecretAccessKeyForTesting012345678901234567890123456789',
    ANDROID_RELEASE_KEYSTORE_ALIAS: 'corp-tower-release',
    ANDROID_RELEASE_KEYSTORE_BASE64: Buffer.from('fake-keystore-bytes').toString('base64'),
    ANDROID_RELEASE_KEYSTORE_PASSWORD: 'release-password',
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: serviceAccount,
    AWS_AUTH_OUTCOME: 'success',
    JAVA_SETUP_OUTCOME: 'success',
    KUBECTL_SETUP_OUTCOME: 'success',
    GOOGLE_AUTH_OUTCOME: 'success',
    GOOGLE_PLAY_ACCESS_TOKEN: 'google-play-access-token',
  };
}

function jsonResponse(body, status = 200) {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: status === 204 ? undefined : { 'content-type': 'application/json' },
  });
}

async function successfulFetch(url, options = {}) {
  const target = String(url);
  if (target.endsWith('/auth/v1/settings')) {
    return jsonResponse({ external: { anonymous_users: true, google: true, facebook: true } });
  }
  if (target.endsWith('/auth/v1/authorize?provider=google')) {
    return new Response(null, {
      status: 302,
      headers: {
        location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=1234567890-corpTowerOauth.apps.googleusercontent.com',
      },
    });
  }
  if (target.endsWith('/auth/v1/authorize?provider=facebook')) {
    return new Response(null, {
      status: 302,
      headers: {
        location: 'https://www.facebook.com/dialog/oauth?client_id=123456789012345',
      },
    });
  }
  if (target.includes('/auth/v1/admin/users')) return jsonResponse({ users: [] });
  if (target === 'https://graph.facebook.com/app?fields=id') {
    return jsonResponse({ id: '123456789012345' });
  }
  if (target.endsWith('/user/tokens/verify')) {
    return jsonResponse({ success: true, result: { status: 'active' } });
  }
  if (target.includes('/dns_records/00000000000000000000000000000000')) {
    return jsonResponse({ success: false, errors: [{ code: 81044 }] }, 404);
  }
  if (target.includes('/dns_records?per_page=1')) {
    return jsonResponse({
      success: true,
      result: [{
        zone_id: '0123456789abcdef0123456789abcdef',
        zone_name: 'galaxxigames.com',
      }],
    });
  }
  if (target.endsWith('/edits') && options.method === 'POST') return jsonResponse({ id: 'temporary-edit' });
  if (target.endsWith('/edits/temporary-edit/tracks')) return jsonResponse({ tracks: [] });
  if (target.endsWith('/edits/temporary-edit') && options.method === 'DELETE') return jsonResponse({}, 204);
  throw new Error(`unexpected test URL ${target}`);
}

async function successfulCommand(command, args) {
  if (command === 'keytool') return { ok: true, code: 0, stdout: '', stderr: '' };
  if (command === 'kubectl') {
    if (args.includes('corp-tower-identity')) {
      return {
        ok: true,
        code: 0,
        stdout: JSON.stringify({
          data: {
            'hmac-secret': Buffer.from(CURRENT_HMAC).toString('base64'),
            'previous-hmac-secret': Buffer.from(PREVIOUS_HMAC).toString('base64'),
          },
        }),
        stderr: '',
      };
    }
    if (args.includes('corp-tower-server')) {
      return {
        ok: true,
        code: 0,
        stdout: JSON.stringify({
          spec: {
            template: {
              spec: {
                containers: [{
                  env: [
                    { name: 'PLAYER_IDENTITY_HMAC_KEY_VERSION', value: '7' },
                    { name: 'PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION', value: '6' },
                  ],
                }],
              },
            },
          },
        }),
        stderr: '',
      };
    }
  }
  assert.equal(command, 'aws');
  if (args[0] === 'sts') {
    return {
      ok: true,
      code: 0,
      stdout: JSON.stringify({
        Account: AWS_ACCOUNT,
        Arn: `arn:aws:sts::${AWS_ACCOUNT}:assumed-role/github-corp-tower-production/preflight`,
      }),
      stderr: '',
    };
  }
  if (args[0] === 'ecr' && args[1] === 'describe-repositories') {
    return {
      ok: true,
      code: 0,
      stdout: JSON.stringify({
        repositories: [{
          repositoryName: 'corp-tower/server',
          registryId: AWS_ACCOUNT,
          repositoryUri: `${AWS_ACCOUNT}.dkr.ecr.ap-southeast-1.amazonaws.com/corp-tower/server`,
        }],
      }),
      stderr: '',
    };
  }
  if (args[0] === 'ecr' && args[1] === 'get-authorization-token') {
    return {
      ok: true,
      code: 0,
      stdout: `https://${AWS_ACCOUNT}.dkr.ecr.ap-southeast-1.amazonaws.com\n`,
      stderr: '',
    };
  }
  if (args[0] === 'eks' && args[1] === 'describe-cluster') {
    return { ok: true, code: 0, stdout: JSON.stringify({ cluster: { status: 'ACTIVE' } }), stderr: '' };
  }
  if (args[0] === 'eks' && args[1] === 'describe-access-entry') {
    return {
      ok: true,
      code: 0,
      stdout: JSON.stringify({
        accessEntry: { principalArn: `arn:aws:iam::${AWS_ACCOUNT}:user/corp-tower-operator` },
      }),
      stderr: '',
    };
  }
  if (args[0] === 'eks' && args[1] === 'update-kubeconfig') {
    return { ok: true, code: 0, stdout: '', stderr: '' };
  }
  if (args[0] === 's3api' && args[1] === 'get-object') {
    const outputPath = args[args.indexOf('--no-cli-pager') - 1];
    await writeFile(outputPath, ASSET_BYTES);
    return { ok: true, code: 0, stdout: '{}', stderr: '' };
  }
  throw new Error(`unexpected test command ${command} ${args.join(' ')}`);
}

async function run(environment, overrides = {}) {
  return await verifyProductionEnvironment({
    environment,
    fetchImpl: overrides.fetchImpl ?? successfulFetch,
    runCommand: overrides.runCommand ?? successfulCommand,
    assetManifest: ASSET_MANIFEST,
    nowMs: NOW_MS,
    emit: overrides.emit ?? false,
    stdout: overrides.stdout,
    stderr: overrides.stderr,
  });
}

test('preflight inventory exactly covers values consumed by Production workflows', async () => {
  const referenced = new Set();
  for (const workflow of PRODUCTION_WORKFLOWS) {
    const source = await readFile(workflow, 'utf8');
    for (const match of source.matchAll(/(?:vars|secrets)\.([A-Z0-9_]+)/g)) referenced.add(match[1]);
  }
  assert.equal(REQUIRED_PRODUCTION_INPUTS.length, 28);
  assert.deepEqual([...REQUIRED_PRODUCTION_INPUTS].sort(), [...referenced].sort());
});

test('strict Production preflight passes and never prints secret values', async () => {
  const environment = completeEnvironment();
  const stdout = [];
  const stderr = [];
  const result = await run(environment, {
    emit: true,
    stdout: line => stdout.push(line),
    stderr: line => stderr.push(line),
  });
  assert.equal(result.ok, true);
  assert.equal(stderr.length, 0);
  assert.equal(result.lines.filter(line => line.startsWith('PASS ')).length, REQUIRED_PRODUCTION_INPUTS.length);
  assert.match(stdout.at(-1), /Production environment ready/);
  const output = [...stdout, ...stderr].join('\n');
  const sensitiveNames = [
    'TOD_FACEBOOK_CLIENT_TOKEN',
    ...REQUIRED_PRODUCTION_INPUTS.slice(8),
  ];
  for (const name of sensitiveNames) {
    const value = environment[name];
    if (typeof value === 'string' && value) {
      assert.equal(output.includes(value), false, `${name} leaked into output`);
    }
  }
});

test('every missing required GitHub input gets its own exact failure name', async () => {
  for (const name of REQUIRED_PRODUCTION_INPUTS) {
    const environment = completeEnvironment();
    delete environment[name];
    const result = await run(environment);
    assert.equal(result.ok, false, `${name} unexpectedly passed`);
    assert.equal(
      result.lines.some(line => line.startsWith(`ERROR ${name}:`)),
      true,
      `${name} did not receive an exact failure`,
    );
  }
});

test('Supabase keys fail closed on wrong project, wrong role, and live authentication denial', async () => {
  const wrongRef = completeEnvironment();
  wrongRef.SUPABASE_PROJECT_REF = 'lfvbxkidatmfhjbmcgyq';
  let result = await run(wrongRef);
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line === 'ERROR SUPABASE_PROJECT_REF: wrong project: the Seoul migration source is forbidden at runtime'),
    true,
  );

  const wrongUrl = completeEnvironment();
  wrongUrl.SUPABASE_URL = 'https://lfvbxkidatmfhjbmcgyq.supabase.co';
  result = await run(wrongUrl);
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line.startsWith('ERROR SUPABASE_URL: wrong project:')),
    true,
  );

  const wrongProject = completeEnvironment();
  wrongProject.SUPABASE_ANON_KEY = jwt('anon', 'lfvbxkidatmfhjbmcgyq');
  result = await run(wrongProject);
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line === 'ERROR SUPABASE_ANON_KEY: wrong project: key belongs to the prohibited Seoul migration source'),
    true,
  );

  const wrongRole = completeEnvironment();
  wrongRole.SUPABASE_SERVICE_ROLE_KEY = jwt('anon');
  result = await run(wrongRole);
  assert.equal(result.ok, false);
  assert.equal(result.lines.some(line => line.includes('ERROR SUPABASE_SERVICE_ROLE_KEY: wrong role')), true);

  const denied = completeEnvironment();
  result = await run(denied, {
    fetchImpl: async (url, options) => {
      if (String(url).includes('/auth/v1/admin/users')) return jsonResponse({ message: 'denied' }, 403);
      return await successfulFetch(url, options);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line.includes('ERROR SUPABASE_SERVICE_ROLE_KEY: authentication or admin permission failed')),
    true,
  );

  result = await run(completeEnvironment(), {
    fetchImpl: async (url, options) => {
      if (String(url).endsWith('/auth/v1/settings')) return jsonResponse({ message: 'denied' }, 401);
      return await successfulFetch(url, options);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line.includes('ERROR SUPABASE_ANON_KEY: authentication failed against Singapore Production')),
    true,
  );
});

test('hosted OAuth client IDs must match the Singapore Production provider redirects', async () => {
  const result = await run(completeEnvironment(), {
    fetchImpl: async (url, options) => {
      if (String(url).endsWith('/auth/v1/authorize?provider=google')) {
        return new Response(null, {
          status: 302,
          headers: {
            location: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=9999999999-wrong.apps.googleusercontent.com',
          },
        });
      }
      return await successfulFetch(url, options);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line.includes('ERROR GOOGLE_OAUTH_WEB_CLIENT_ID: wrong project:')),
    true,
  );
});

test('Cloudflare DNS Write and Production HMAC lineage failures name their exact inputs', async () => {
  const environment = completeEnvironment();
  environment.PLAYER_IDENTITY_HMAC_SECRET = 'different-production-hmac-secret-with-high-entropy-000000';
  const result = await run(environment, {
    fetchImpl: async (url, options) => {
      if (String(url).includes('/dns_records/00000000000000000000000000000000')) {
        return jsonResponse({ success: false, errors: [{ code: 10000 }] }, 403);
      }
      return await successfulFetch(url, options);
    },
  });
  assert.equal(result.ok, false);
  assert.equal(
    result.lines.some(line => line.includes('ERROR CLOUDFLARE_API_TOKEN: permission failure: DNS Write was not proven')),
    true,
  );
  assert.equal(
    result.lines.some(line => line.includes('ERROR PLAYER_IDENTITY_HMAC_SECRET: wrong environment')), true,
  );
  const output = result.lines.join('\n');
  assert.equal(output.includes(environment.CLOUDFLARE_API_TOKEN), false);
  assert.equal(output.includes(environment.PLAYER_IDENTITY_HMAC_SECRET), false);
});
