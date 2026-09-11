#!/usr/bin/env node

import { createHash, createPrivateKey, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const PRODUCTION_PROJECT_REF = 'kweqwprbahlfoznyzlvf';
export const PRODUCTION_PROJECT_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;
export const SEOUL_SOURCE_PROJECT_REF = 'lfvbxkidatmfhjbmcgyq';

export const REQUIRED_PRODUCTION_INPUTS = Object.freeze([
  'TOD_DATA_ENVIRONMENT',
  'SUPABASE_PROJECT_REF',
  'SUPABASE_AUTH_REQUIRED',
  'CORP_TOWER_AUTH_OAUTH',
  'PLAYER_IDENTITY_HMAC_KEY_VERSION',
  'PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION',
  'TOD_FACEBOOK_APP_ID',
  'TOD_FACEBOOK_CLIENT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TOD_FACEBOOK_APP_SECRET',
  'GOOGLE_OAUTH_WEB_CLIENT_ID',
  'PLAYER_IDENTITY_HMAC_SECRET',
  'PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET',
  'AWS_ROLE_ARN',
  'ECR_REPOSITORY',
  'EKS_OPERATOR_PRINCIPAL_ARN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'R2_BUCKET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'ANDROID_RELEASE_KEYSTORE_ALIAS',
  'ANDROID_RELEASE_KEYSTORE_BASE64',
  'ANDROID_RELEASE_KEYSTORE_PASSWORD',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
]);

const SECRET_INPUTS = new Set([
  'TOD_FACEBOOK_CLIENT_TOKEN',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TOD_FACEBOOK_APP_SECRET',
  'GOOGLE_OAUTH_WEB_CLIENT_ID',
  'PLAYER_IDENTITY_HMAC_SECRET',
  'PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET',
  'AWS_ROLE_ARN',
  'ECR_REPOSITORY',
  'EKS_OPERATOR_PRINCIPAL_ARN',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ZONE_ID',
  'R2_BUCKET',
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'ANDROID_RELEASE_KEYSTORE_ALIAS',
  'ANDROID_RELEASE_KEYSTORE_BASE64',
  'ANDROID_RELEASE_KEYSTORE_PASSWORD',
  'GOOGLE_PLAY_SERVICE_ACCOUNT_JSON',
]);

const CONDITIONALLY_EMPTY_INPUTS = new Set(['PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET']);
const AWS_REGION = 'ap-southeast-1';
const EKS_CLUSTER_NAME = 'corp-tower-eks-lab';
const PRODUCTION_DNS_ZONE = 'galaxxigames.com';
const ANDROID_PACKAGE_NAME = 'com.galaxxigames.tod';
const RUNTIME_SECRET_NAMES = new Set([
  ...SECRET_INPUTS,
  'GOOGLE_PLAY_ACCESS_TOKEN',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_SESSION_TOKEN',
  'AWS_SECURITY_TOKEN',
  'CORP_TOWER_KEYSTORE_PASSWORD',
  'CORP_TOWER_DESTINATION_PASSWORD',
]);

function limitedCommandEnvironment(environment, allowedSecrets = {}) {
  const result = { ...environment };
  for (const name of RUNTIME_SECRET_NAMES) delete result[name];
  return { ...result, ...allowedSecrets };
}

function awsCommandEnvironment(environment) {
  const allowed = {};
  for (const name of [
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_SESSION_TOKEN',
    'AWS_SECURITY_TOKEN',
  ]) {
    if (environment[name]) allowed[name] = environment[name];
  }
  return limitedCommandEnvironment(environment, allowed);
}

class PreflightReport {
  constructor(environment) {
    this.failures = new Map(REQUIRED_PRODUCTION_INPUTS.map(name => [name, []]));
    this.touched = new Set();
    this.sensitiveValues = [...RUNTIME_SECRET_NAMES]
      .map(name => environment[name])
      .filter(value => typeof value === 'string' && value.length > 0)
      .sort((left, right) => right.length - left.length);
  }

  touch(name) {
    this.touched.add(name);
  }

  fail(name, message) {
    this.touch(name);
    const messages = this.failures.get(name);
    if (!messages) throw new Error(`unknown production input ${name}`);
    if (!messages.includes(message)) messages.push(message);
  }

  failed(name) {
    return (this.failures.get(name)?.length ?? 0) > 0;
  }

  sanitize(message) {
    let safe = String(message).replace(/[\r\n]+/g, ' ');
    for (const value of this.sensitiveValues) safe = safe.split(value).join('<redacted>');
    return safe;
  }

  finish({ emit = true, stdout = console.log, stderr = console.error } = {}) {
    for (const name of REQUIRED_PRODUCTION_INPUTS) {
      if (!this.touched.has(name)) {
        this.fail(name, 'internal preflight defect: this input was not validated');
      }
    }

    const lines = [];
    for (const name of REQUIRED_PRODUCTION_INPUTS) {
      const failures = this.failures.get(name);
      if (failures.length === 0) {
        lines.push(`PASS ${name}`);
        continue;
      }
      for (const failure of failures) lines.push(`ERROR ${name}: ${this.sanitize(failure)}`);
    }

    const ok = [...this.failures.values()].every(failures => failures.length === 0);
    if (emit) {
      for (const line of lines) {
        if (line.startsWith('ERROR ')) stderr(`::error::${line.slice('ERROR '.length)}`);
        else stdout(line);
      }
      if (ok) {
        stdout(
          `Production environment ready: strict preflight passed all ${REQUIRED_PRODUCTION_INPUTS.length} required GitHub values for Singapore Production ${PRODUCTION_PROJECT_REF}.`,
        );
      } else {
        stderr('Production environment NOT ready: strict preflight failed.');
      }
    }

    return { ok, lines, failures: this.failures };
  }
}

function present(environment, report, name) {
  report.touch(name);
  const value = environment[name];
  if (typeof value !== 'string' || value.length === 0) {
    if (!CONDITIONALLY_EMPTY_INPUTS.has(name)) report.fail(name, 'missing GitHub value');
    return '';
  }
  if (value.trim().length === 0) {
    report.fail(name, 'malformed: value contains only whitespace');
    return '';
  }
  return value;
}

function requireExact(report, name, actual, expected, description) {
  if (actual && actual !== expected) report.fail(name, description);
}

function requirePattern(report, name, value, pattern, description) {
  if (value && !pattern.test(value)) report.fail(name, description);
}

function decodeJwtPart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw new Error('invalid base64url');
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function verifyLegacySupabaseJwt(report, name, value, expectedRole, nowSeconds) {
  if (!value) return null;
  if (value.startsWith('sb_publishable_') || value.startsWith('sb_secret_')) {
    report.fail(name, 'malformed: the current transport requires a legacy JWT-form project key');
    return null;
  }

  const parts = value.split('.');
  if (parts.length !== 3 || parts.some(part => part.length === 0)) {
    report.fail(name, 'malformed: expected a three-part legacy JWT');
    return null;
  }

  let header;
  let payload;
  try {
    header = decodeJwtPart(parts[0]);
    payload = decodeJwtPart(parts[1]);
  } catch {
    report.fail(name, 'malformed: JWT header or payload is not valid base64url JSON');
    return null;
  }

  if (header?.alg !== 'HS256') report.fail(name, 'malformed: legacy project key must declare HS256');
  if (payload?.iss !== 'supabase') report.fail(name, 'wrong issuer: key is not a Supabase legacy project key');
  if (payload?.ref !== PRODUCTION_PROJECT_REF) {
    if (payload?.ref === SEOUL_SOURCE_PROJECT_REF) {
      report.fail(name, 'wrong project: key belongs to the prohibited Seoul migration source');
    } else {
      report.fail(name, `wrong project: key does not belong to Singapore Production ${PRODUCTION_PROJECT_REF}`);
    }
  }
  if (payload?.role !== expectedRole) report.fail(name, `wrong role: key must be the legacy ${expectedRole} key`);
  if (!Number.isFinite(payload?.exp) || payload.exp <= nowSeconds) {
    report.fail(name, 'authentication expiry: JWT is expired or has no valid expiry');
  }
  return payload;
}

function safeValueEqual(left, right) {
  const leftBuffer = Buffer.from(left, 'utf8');
  const rightBuffer = Buffer.from(right, 'utf8');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

async function hashFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(path);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', rejectPromise);
    stream.on('end', resolvePromise);
  });
  return hash.digest('hex');
}

async function defaultRunCommand(command, args, options = {}) {
  return await new Promise(resolvePromise => {
    let settled = false;
    let stdout = '';
    let stderr = '';
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolvePromise(result);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish({ ok: false, code: null, stdout, stderr, timedOut: true });
    }, options.timeoutMs ?? 30_000);
    child.stdout.on('data', chunk => {
      if (stdout.length < 2_000_000) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', chunk => {
      if (stderr.length < 2_000_000) stderr += chunk.toString('utf8');
    });
    child.on('error', () => finish({ ok: false, code: null, stdout, stderr, unavailable: true }));
    child.on('close', code => finish({ ok: code === 0, code, stdout, stderr }));
  });
}

async function requestJson(fetchImpl, url, options = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    return { reachable: false, status: null, data: null };
  }

  let data = null;
  try {
    const text = await response.text();
    data = text.length === 0 ? {} : JSON.parse(text);
  } catch {
    data = null;
  }
  return { reachable: true, status: response.status, ok: response.ok, data };
}

async function requestRedirect(fetchImpl, url, headers) {
  try {
    const response = await fetchImpl(url, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(20_000),
    });
    return {
      reachable: true,
      status: response.status,
      location: response.headers.get('location') ?? '',
    };
  } catch {
    return { reachable: false, status: null, location: '' };
  }
}

function validateStaticInputs(environment, report, nowSeconds) {
  const values = Object.fromEntries(
    REQUIRED_PRODUCTION_INPUTS.map(name => [name, present(environment, report, name)]),
  );

  requireExact(
    report,
    'TOD_DATA_ENVIRONMENT',
    values.TOD_DATA_ENVIRONMENT,
    'production',
    "wrong environment: value must be exactly 'production'",
  );
  requirePattern(
    report,
    'SUPABASE_PROJECT_REF',
    values.SUPABASE_PROJECT_REF,
    /^[a-z]{20}$/,
    'malformed: expected a 20-letter Supabase project ref',
  );
  if (values.SUPABASE_PROJECT_REF === SEOUL_SOURCE_PROJECT_REF) {
    report.fail('SUPABASE_PROJECT_REF', 'wrong project: the Seoul migration source is forbidden at runtime');
  } else {
    requireExact(
      report,
      'SUPABASE_PROJECT_REF',
      values.SUPABASE_PROJECT_REF,
      PRODUCTION_PROJECT_REF,
      `wrong project: value must be Singapore Production ${PRODUCTION_PROJECT_REF}`,
    );
  }
  requireExact(
    report,
    'SUPABASE_AUTH_REQUIRED',
    values.SUPABASE_AUTH_REQUIRED,
    'true',
    "wrong environment policy: value must be exactly 'true'",
  );
  requireExact(
    report,
    'CORP_TOWER_AUTH_OAUTH',
    values.CORP_TOWER_AUTH_OAUTH,
    'true',
    "wrong Production capability: value must be exactly 'true'",
  );

  if (values.SUPABASE_URL) {
    if (values.SUPABASE_URL.trim() !== values.SUPABASE_URL) {
      report.fail('SUPABASE_URL', 'malformed: URL has leading or trailing whitespace');
    }
    let parsed;
    try {
      parsed = new URL(values.SUPABASE_URL);
    } catch {
      report.fail('SUPABASE_URL', 'malformed: not a valid absolute HTTPS URL');
    }
    if (parsed && (
      parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.port
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
    )) {
      report.fail('SUPABASE_URL', 'malformed: expected the canonical HTTPS project origin with no path, port, query, or fragment');
    }
    requireExact(
      report,
      'SUPABASE_URL',
      values.SUPABASE_URL,
      PRODUCTION_PROJECT_URL,
      `wrong project: URL must be the canonical origin for Singapore Production ${PRODUCTION_PROJECT_REF}`,
    );
  }

  const anonPayload = verifyLegacySupabaseJwt(
    report,
    'SUPABASE_ANON_KEY',
    values.SUPABASE_ANON_KEY,
    'anon',
    nowSeconds,
  );
  const servicePayload = verifyLegacySupabaseJwt(
    report,
    'SUPABASE_SERVICE_ROLE_KEY',
    values.SUPABASE_SERVICE_ROLE_KEY,
    'service_role',
    nowSeconds,
  );
  if (
    values.SUPABASE_ANON_KEY
    && values.SUPABASE_SERVICE_ROLE_KEY
    && values.SUPABASE_ANON_KEY === values.SUPABASE_SERVICE_ROLE_KEY
  ) {
    report.fail('SUPABASE_ANON_KEY', 'cross-field mismatch: anon key is identical to the service-role key');
    report.fail('SUPABASE_SERVICE_ROLE_KEY', 'cross-field mismatch: service-role key is identical to the anon key');
  }
  if (anonPayload?.ref && servicePayload?.ref && anonPayload.ref !== servicePayload.ref) {
    report.fail('SUPABASE_ANON_KEY', 'cross-field mismatch: key project does not match the service-role key project');
    report.fail('SUPABASE_SERVICE_ROLE_KEY', 'cross-field mismatch: key project does not match the anon key project');
  }

  requirePattern(
    report,
    'PLAYER_IDENTITY_HMAC_KEY_VERSION',
    values.PLAYER_IDENTITY_HMAC_KEY_VERSION,
    /^[1-9][0-9]*$/,
    'malformed: current HMAC key version must be a positive integer',
  );
  requirePattern(
    report,
    'PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION',
    values.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION,
    /^(0|[1-9][0-9]*)$/,
    'malformed: previous HMAC key version must be zero or a positive integer',
  );
  const previousVersion = values.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION;
  const previousSecret = values.PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET;
  if (previousVersion === '0' && previousSecret) {
    report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'cross-field mismatch: secret must be absent when previous version is zero');
  }
  if (previousVersion && previousVersion !== '0' && !previousSecret) {
    report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'missing GitHub value: required when previous HMAC version is nonzero');
  }
  if (
    previousVersion
    && previousVersion !== '0'
    && previousVersion === values.PLAYER_IDENTITY_HMAC_KEY_VERSION
  ) {
    report.fail('PLAYER_IDENTITY_HMAC_KEY_VERSION', 'cross-field mismatch: current and previous key versions are identical');
    report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION', 'cross-field mismatch: previous and current key versions are identical');
  }
  if (
    previousSecret
    && values.PLAYER_IDENTITY_HMAC_SECRET
    && previousSecret === values.PLAYER_IDENTITY_HMAC_SECRET
  ) {
    report.fail('PLAYER_IDENTITY_HMAC_SECRET', 'cross-field mismatch: current and previous HMAC secrets are identical');
    report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'cross-field mismatch: previous and current HMAC secrets are identical');
  }

  requirePattern(
    report,
    'TOD_FACEBOOK_APP_ID',
    values.TOD_FACEBOOK_APP_ID,
    /^[0-9]{5,32}$/,
    'malformed: expected a numeric Meta application ID',
  );
  requirePattern(
    report,
    'TOD_FACEBOOK_CLIENT_TOKEN',
    values.TOD_FACEBOOK_CLIENT_TOKEN,
    /^\S{10,512}$/,
    'malformed: expected a non-whitespace Meta client token',
  );
  requirePattern(
    report,
    'TOD_FACEBOOK_APP_SECRET',
    values.TOD_FACEBOOK_APP_SECRET,
    /^[A-Fa-f0-9]{32,64}$/,
    'malformed: expected a hexadecimal Meta application secret',
  );
  requirePattern(
    report,
    'GOOGLE_OAUTH_WEB_CLIENT_ID',
    values.GOOGLE_OAUTH_WEB_CLIENT_ID,
    /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/,
    'malformed: expected a Google Web OAuth client ID',
  );

  const awsRoleMatch = values.AWS_ROLE_ARN.match(/^arn:aws:iam::([0-9]{12}):role\/(.+)$/);
  if (values.AWS_ROLE_ARN && !awsRoleMatch) {
    report.fail('AWS_ROLE_ARN', 'malformed: expected an IAM role ARN in the standard AWS partition');
  }
  requirePattern(
    report,
    'ECR_REPOSITORY',
    values.ECR_REPOSITORY,
    /^(?=.{2,256}$)(?:[a-z0-9]+(?:[._-][a-z0-9]+)*\/)*[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    'malformed: expected a valid private ECR repository name',
  );
  const operatorMatch = values.EKS_OPERATOR_PRINCIPAL_ARN.match(
    /^arn:aws:iam::([0-9]{12}):(role|user)\/(.+)$/,
  );
  if (values.EKS_OPERATOR_PRINCIPAL_ARN && !operatorMatch) {
    report.fail('EKS_OPERATOR_PRINCIPAL_ARN', 'malformed: expected an IAM role or user ARN in the standard AWS partition');
  }
  if (awsRoleMatch && operatorMatch && awsRoleMatch[1] !== operatorMatch[1]) {
    report.fail('AWS_ROLE_ARN', 'cross-field mismatch: role account differs from the EKS operator account');
    report.fail('EKS_OPERATOR_PRINCIPAL_ARN', 'cross-field mismatch: operator account differs from the GitHub OIDC role account');
  }

  requirePattern(
    report,
    'CLOUDFLARE_API_TOKEN',
    values.CLOUDFLARE_API_TOKEN,
    /^[A-Za-z0-9_-]{20,200}$/,
    'malformed: expected a Cloudflare API token',
  );
  requirePattern(
    report,
    'CLOUDFLARE_ZONE_ID',
    values.CLOUDFLARE_ZONE_ID,
    /^[A-Fa-f0-9]{32}$/,
    'malformed: expected a 32-character Cloudflare zone ID',
  );
  requirePattern(
    report,
    'R2_ACCOUNT_ID',
    values.R2_ACCOUNT_ID,
    /^[A-Fa-f0-9]{32}$/,
    'malformed: expected a 32-character Cloudflare account ID',
  );
  requirePattern(
    report,
    'R2_BUCKET',
    values.R2_BUCKET,
    /^(?=.{3,63}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])$/,
    'malformed: expected a valid lowercase R2 bucket name',
  );
  requirePattern(
    report,
    'R2_ACCESS_KEY_ID',
    values.R2_ACCESS_KEY_ID,
    /^\S{16,128}$/,
    'malformed: expected a non-whitespace R2 access key ID',
  );
  requirePattern(
    report,
    'R2_SECRET_ACCESS_KEY',
    values.R2_SECRET_ACCESS_KEY,
    /^\S{20,256}$/,
    'malformed: expected a non-whitespace R2 secret access key',
  );

  requirePattern(
    report,
    'ANDROID_RELEASE_KEYSTORE_ALIAS',
    values.ANDROID_RELEASE_KEYSTORE_ALIAS,
    /^[^\0\r\n]{1,128}$/,
    'malformed: keystore alias must be a single nonempty line',
  );
  if (values.ANDROID_RELEASE_KEYSTORE_BASE64) {
    const encoded = values.ANDROID_RELEASE_KEYSTORE_BASE64;
    if (encoded.trim() !== encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
      report.fail('ANDROID_RELEASE_KEYSTORE_BASE64', 'malformed: expected canonical single-line base64');
    }
  }
  if (values.ANDROID_RELEASE_KEYSTORE_PASSWORD && values.ANDROID_RELEASE_KEYSTORE_PASSWORD.length < 6) {
    report.fail('ANDROID_RELEASE_KEYSTORE_PASSWORD', 'malformed: Java keystore passwords must contain at least six characters');
  }

  if (values.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    let credentials;
    try {
      credentials = JSON.parse(values.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
    } catch {
      report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'malformed: value is not valid JSON');
    }
    if (credentials) {
      if (credentials.type !== 'service_account') {
        report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', "malformed: credential type must be 'service_account'");
      }
      if (!/^[^@\s]+@[^@\s]+\.iam\.gserviceaccount\.com$/.test(credentials.client_email ?? '')) {
        report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'malformed: service-account client_email is missing or invalid');
      }
      if (!/^[A-Za-z0-9_-]+$/.test(credentials.project_id ?? '')) {
        report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'malformed: service-account project_id is missing or invalid');
      }
      if (credentials.token_uri !== 'https://oauth2.googleapis.com/token') {
        report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'malformed: token_uri is not the Google OAuth token endpoint');
      }
      try {
        createPrivateKey(credentials.private_key ?? '');
      } catch {
        report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'malformed: private_key is missing or cannot be parsed');
      }
    }
  }

  return values;
}

async function verifyHmacLineage(runCommand, environment, report, values, options) {
  const names = [
    'PLAYER_IDENTITY_HMAC_SECRET',
    'PLAYER_IDENTITY_HMAC_KEY_VERSION',
    'PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET',
    'PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION',
  ];
  if (environment.AWS_AUTH_OUTCOME !== 'success') {
    for (const name of names) {
      if (!report.failed(name)) {
        report.fail(name, 'wrong environment proof unavailable: GitHub OIDC could not authenticate to the current Production cluster');
      }
    }
    return;
  }
  if (environment.KUBECTL_SETUP_OUTCOME !== 'success') {
    for (const name of names) {
      if (!report.failed(name)) {
        report.fail(name, 'verification tooling failure: kubectl is unavailable on the Production runner');
      }
    }
    return;
  }

  const work = await mkdtemp(join(options.tempRoot, 'corp-tower-hmac-preflight-'));
  const kubeconfig = join(work, 'kubeconfig');
  const clusterEnvironment = awsCommandEnvironment(environment);
  try {
    const configured = await runCommand(
      'aws',
      [
        'eks',
        'update-kubeconfig',
        '--region',
        AWS_REGION,
        '--name',
        EKS_CLUSTER_NAME,
        '--kubeconfig',
        kubeconfig,
        '--alias',
        'corp-tower-production-preflight',
        '--no-cli-pager',
      ],
      { env: clusterEnvironment, timeoutMs: 30_000 },
    );
    if (!configured.ok) {
      for (const name of names) {
        if (!report.failed(name)) {
          report.fail(name, 'permission failure: current Production EKS kubeconfig could not be created');
        }
      }
      return;
    }

    const kubectl = async args => await runCommand(
      'kubectl',
      ['--kubeconfig', kubeconfig, '--namespace', 'corp-tower-prod', ...args],
      { env: clusterEnvironment, timeoutMs: 30_000 },
    );
    const secret = await kubectl(['get', 'secret', 'corp-tower-identity', '--output', 'json']);
    let secretData;
    try {
      secretData = secret.ok ? JSON.parse(secret.stdout)?.data : null;
    } catch {
      secretData = null;
    }
    if (!secret.ok || !secretData || typeof secretData !== 'object') {
      if (!report.failed('PLAYER_IDENTITY_HMAC_SECRET')) {
        report.fail('PLAYER_IDENTITY_HMAC_SECRET', 'permission or ownership failure: current Production Kubernetes HMAC secret cannot be read');
      }
      if (!report.failed('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET')) {
        report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'permission or ownership failure: previous Production Kubernetes HMAC state cannot be read');
      }
    } else {
      let currentSecret = '';
      let previousSecret = '';
      try {
        currentSecret = secretData['hmac-secret']
          ? Buffer.from(secretData['hmac-secret'], 'base64').toString('utf8')
          : '';
        previousSecret = secretData['previous-hmac-secret']
          ? Buffer.from(secretData['previous-hmac-secret'], 'base64').toString('utf8')
          : '';
      } catch {
        currentSecret = '';
        previousSecret = '';
      }
      if (!currentSecret) {
        report.fail('PLAYER_IDENTITY_HMAC_SECRET', 'wrong environment: current Production Kubernetes HMAC secret is absent or malformed');
      } else if (
        values.PLAYER_IDENTITY_HMAC_SECRET
        && !safeValueEqual(values.PLAYER_IDENTITY_HMAC_SECRET, currentSecret)
      ) {
        report.fail('PLAYER_IDENTITY_HMAC_SECRET', 'wrong environment: value does not match the current Production Kubernetes HMAC secret');
      }

      if (values.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION === '0') {
        if (previousSecret) {
          report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'cross-field mismatch: current Production cluster still has a previous HMAC secret');
          report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION', 'cross-field mismatch: version zero conflicts with the current Production cluster');
        }
      } else if (!previousSecret) {
        report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'wrong environment: previous Production Kubernetes HMAC secret is absent');
      } else if (
        values.PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET
        && !safeValueEqual(values.PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET, previousSecret)
      ) {
        report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET', 'wrong environment: value does not match the previous Production Kubernetes HMAC secret');
      }
    }

    const deployment = await kubectl(['get', 'deployment', 'corp-tower-server', '--output', 'json']);
    let deploymentData;
    try {
      deploymentData = deployment.ok ? JSON.parse(deployment.stdout) : null;
    } catch {
      deploymentData = null;
    }
    const containers = deploymentData?.spec?.template?.spec?.containers;
    if (!deployment.ok || !Array.isArray(containers)) {
      if (!report.failed('PLAYER_IDENTITY_HMAC_KEY_VERSION')) {
        report.fail('PLAYER_IDENTITY_HMAC_KEY_VERSION', 'permission or ownership failure: current Production deployment version cannot be read');
      }
      if (!report.failed('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION')) {
        report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION', 'permission or ownership failure: previous Production deployment version cannot be read');
      }
      return;
    }
    const deploymentEnvironment = new Map();
    for (const container of containers) {
      for (const entry of container?.env ?? []) {
        if (typeof entry?.name === 'string' && typeof entry?.value === 'string') {
          deploymentEnvironment.set(entry.name, entry.value);
        }
      }
    }
    if (
      values.PLAYER_IDENTITY_HMAC_KEY_VERSION
      && deploymentEnvironment.get('PLAYER_IDENTITY_HMAC_KEY_VERSION') !== values.PLAYER_IDENTITY_HMAC_KEY_VERSION
    ) {
      report.fail('PLAYER_IDENTITY_HMAC_KEY_VERSION', 'wrong environment: value does not match the current Production deployment');
    }
    if (
      values.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION
      && deploymentEnvironment.get('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION')
        !== values.PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION
    ) {
      report.fail('PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION', 'wrong environment: value does not match the current Production deployment');
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function verifySupabase(fetchImpl, report, values) {
  const failAuthSettings = message => {
    report.fail('SUPABASE_AUTH_REQUIRED', message);
    report.fail('CORP_TOWER_AUTH_OAUTH', message);
    report.fail('GOOGLE_OAUTH_WEB_CLIENT_ID', `cross-field validation failed: ${message}`);
    report.fail('TOD_FACEBOOK_APP_ID', `cross-field validation failed: ${message}`);
    report.fail('TOD_FACEBOOK_APP_SECRET', `cross-field validation failed: ${message}`);
  };

  const projectEndpointUsable = !report.failed('SUPABASE_URL')
    && !report.failed('SUPABASE_PROJECT_REF');
  const anonUsable = projectEndpointUsable && !report.failed('SUPABASE_ANON_KEY');
  if (anonUsable) {
    const settings = await requestJson(fetchImpl, `${PRODUCTION_PROJECT_URL}/auth/v1/settings`, {
      headers: {
        apikey: values.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${values.SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
    });
    if (!settings.reachable) {
      report.fail('SUPABASE_URL', 'authentication endpoint could not be reached over HTTPS');
      report.fail('SUPABASE_ANON_KEY', 'authentication could not be proven because the Production endpoint was unreachable');
      failAuthSettings('Singapore Production Auth settings endpoint was unreachable');
    } else if (settings.status === 401 || settings.status === 403) {
      report.fail('SUPABASE_ANON_KEY', 'authentication failed against Singapore Production');
      failAuthSettings('Singapore Production Auth settings could not be authenticated');
    } else if (!settings.ok || !settings.data?.external) {
      report.fail('SUPABASE_ANON_KEY', `authentication endpoint returned an invalid response (HTTP ${settings.status})`);
      failAuthSettings('Singapore Production Auth settings response was invalid');
    } else {
      if (settings.data.external.anonymous_users !== true) {
        report.fail('SUPABASE_AUTH_REQUIRED', 'wrong Production Auth configuration: anonymous sign-ins are not enabled');
      }
      if (settings.data.external.google !== true) {
        report.fail('CORP_TOWER_AUTH_OAUTH', 'wrong Production Auth configuration: Google provider is not enabled');
        report.fail('GOOGLE_OAUTH_WEB_CLIENT_ID', 'cross-field mismatch: GitHub client ID is set but Singapore Production Google Auth is disabled');
      }
      if (settings.data.external.facebook !== true) {
        report.fail('CORP_TOWER_AUTH_OAUTH', 'wrong Production Auth configuration: Facebook provider is not enabled');
        report.fail('TOD_FACEBOOK_APP_ID', 'cross-field mismatch: GitHub app ID is set but Singapore Production Facebook Auth is disabled');
        report.fail('TOD_FACEBOOK_APP_SECRET', 'cross-field mismatch: GitHub app secret is set but Singapore Production Facebook Auth is disabled');
      }

      const verifyHostedProvider = async (provider, name, expectedClientId) => {
        if (report.failed(name)) return;
        const redirect = await requestRedirect(
          fetchImpl,
          `${PRODUCTION_PROJECT_URL}/auth/v1/authorize?provider=${provider}`,
          {
            apikey: values.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${values.SUPABASE_ANON_KEY}`,
            Accept: 'text/html',
          },
        );
        let configuredClientId = '';
        try {
          configuredClientId = redirect.location
            ? new URL(redirect.location).searchParams.get('client_id') ?? ''
            : '';
        } catch {
          configuredClientId = '';
        }
        if (!redirect.reachable) {
          report.fail(name, `authentication flow could not reach the Singapore Production ${provider} provider`);
          report.fail('CORP_TOWER_AUTH_OAUTH', `Singapore Production ${provider} authorization flow was unreachable`);
        } else if (![302, 303, 307, 308].includes(redirect.status) || configuredClientId !== expectedClientId) {
          report.fail(name, `wrong project: value does not match the ${provider} client configured in Singapore Production Auth`);
          report.fail('CORP_TOWER_AUTH_OAUTH', `Singapore Production ${provider} authorization flow does not match its GitHub client setting`);
        }
      };
      if (settings.data.external.google === true) {
        await verifyHostedProvider('google', 'GOOGLE_OAUTH_WEB_CLIENT_ID', values.GOOGLE_OAUTH_WEB_CLIENT_ID);
      }
      if (settings.data.external.facebook === true) {
        await verifyHostedProvider('facebook', 'TOD_FACEBOOK_APP_ID', values.TOD_FACEBOOK_APP_ID);
      }
    }
  } else {
    if (!report.failed('SUPABASE_ANON_KEY')) {
      report.fail('SUPABASE_ANON_KEY', 'cross-field validation failed: signature could not be authenticated because the configured Production project endpoint is invalid');
    }
    failAuthSettings('Singapore Production Auth settings could not be proven because the project endpoint or anon key is invalid');
  }

  const serviceUsable = projectEndpointUsable && !report.failed('SUPABASE_SERVICE_ROLE_KEY');
  if (!serviceUsable) {
    if (!report.failed('SUPABASE_SERVICE_ROLE_KEY')) {
      report.fail('SUPABASE_SERVICE_ROLE_KEY', 'cross-field validation failed: signature and admin permission could not be proven against the configured Production endpoint');
    }
    return;
  }
  const admin = await requestJson(
    fetchImpl,
    `${PRODUCTION_PROJECT_URL}/auth/v1/admin/users?page=1&per_page=1`,
    {
      headers: {
        apikey: values.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${values.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: 'application/json',
      },
    },
  );
  if (!admin.reachable) {
    report.fail('SUPABASE_SERVICE_ROLE_KEY', 'authentication could not be proven because the Production admin endpoint was unreachable');
  } else if (admin.status === 401 || admin.status === 403) {
    report.fail('SUPABASE_SERVICE_ROLE_KEY', 'authentication or admin permission failed against Singapore Production');
  } else if (!admin.ok || !admin.data || !Array.isArray(admin.data.users)) {
    report.fail('SUPABASE_SERVICE_ROLE_KEY', `Production admin endpoint returned an invalid response (HTTP ${admin.status})`);
  }
}

async function verifyFacebook(fetchImpl, report, values) {
  const appIdValid = !report.failed('TOD_FACEBOOK_APP_ID');
  if (!appIdValid) {
    if (!report.failed('TOD_FACEBOOK_APP_SECRET')) {
      report.fail('TOD_FACEBOOK_APP_SECRET', 'cross-field validation failed: Meta app ownership cannot be proven without a valid app ID');
    }
    if (!report.failed('TOD_FACEBOOK_CLIENT_TOKEN')) {
      report.fail('TOD_FACEBOOK_CLIENT_TOKEN', 'cross-field validation failed: Meta client-token ownership cannot be proven without a valid app ID');
    }
    return;
  }
  if (appIdValid && !report.failed('TOD_FACEBOOK_APP_SECRET')) {
    const response = await requestJson(fetchImpl, 'https://graph.facebook.com/app?fields=id', {
      headers: {
        Authorization: `Bearer ${values.TOD_FACEBOOK_APP_ID}|${values.TOD_FACEBOOK_APP_SECRET}`,
        Accept: 'application/json',
      },
    });
    if (!response.reachable) {
      report.fail('TOD_FACEBOOK_APP_SECRET', 'Meta authentication endpoint was unreachable');
      report.fail('TOD_FACEBOOK_APP_ID', 'application ownership could not be proven because Meta was unreachable');
    } else if (!response.ok || String(response.data?.id ?? '') !== values.TOD_FACEBOOK_APP_ID) {
      report.fail('TOD_FACEBOOK_APP_SECRET', 'authentication failed or secret does not belong to the configured Meta application');
      report.fail('TOD_FACEBOOK_APP_ID', 'application ID could not be proven with the configured Meta app secret');
    }
  }

  if (appIdValid && !report.failed('TOD_FACEBOOK_CLIENT_TOKEN')) {
    const response = await requestJson(fetchImpl, 'https://graph.facebook.com/app?fields=id', {
      headers: {
        Authorization: `Bearer ${values.TOD_FACEBOOK_APP_ID}|${values.TOD_FACEBOOK_CLIENT_TOKEN}`,
        Accept: 'application/json',
      },
    });
    if (!response.reachable) {
      report.fail('TOD_FACEBOOK_CLIENT_TOKEN', 'Meta authentication endpoint was unreachable');
    } else if (!response.ok || String(response.data?.id ?? '') !== values.TOD_FACEBOOK_APP_ID) {
      report.fail('TOD_FACEBOOK_CLIENT_TOKEN', 'authentication failed or token does not belong to the configured Meta application');
    }
  }
}

async function verifyCloudflare(fetchImpl, report, values) {
  if (report.failed('CLOUDFLARE_API_TOKEN')) {
    if (!report.failed('CLOUDFLARE_ZONE_ID')) {
      report.fail('CLOUDFLARE_ZONE_ID', 'ownership and DNS permission could not be proven because the API token is missing or malformed');
    }
    return;
  }
  const headers = {
    Authorization: `Bearer ${values.CLOUDFLARE_API_TOKEN}`,
    Accept: 'application/json',
  };
  const verification = await requestJson(fetchImpl, 'https://api.cloudflare.com/client/v4/user/tokens/verify', { headers });
  if (!verification.reachable) {
    report.fail('CLOUDFLARE_API_TOKEN', 'Cloudflare authentication endpoint was unreachable');
    if (!report.failed('CLOUDFLARE_ZONE_ID')) {
      report.fail('CLOUDFLARE_ZONE_ID', 'zone ownership could not be proven because Cloudflare was unreachable');
    }
    return;
  }
  if (!verification.ok || verification.data?.success !== true || verification.data?.result?.status !== 'active') {
    report.fail('CLOUDFLARE_API_TOKEN', 'authentication failed or token is not active');
    if (!report.failed('CLOUDFLARE_ZONE_ID')) {
      report.fail('CLOUDFLARE_ZONE_ID', 'zone ownership could not be proven because token authentication failed');
    }
    return;
  }
  if (report.failed('CLOUDFLARE_ZONE_ID')) {
    report.fail('CLOUDFLARE_API_TOKEN', 'permission scope could not be proven because the configured zone ID is missing or malformed');
    return;
  }

  const records = await requestJson(
    fetchImpl,
    `https://api.cloudflare.com/client/v4/zones/${values.CLOUDFLARE_ZONE_ID}/dns_records?per_page=1`,
    { headers },
  );
  if (!records.reachable) {
    report.fail('CLOUDFLARE_ZONE_ID', 'DNS zone endpoint was unreachable');
  } else if (!records.ok || records.data?.success !== true || !Array.isArray(records.data?.result)) {
    report.fail('CLOUDFLARE_API_TOKEN', 'token lacks DNS access to the configured zone');
    report.fail('CLOUDFLARE_ZONE_ID', 'zone is missing, belongs to another account, or is outside the token scope');
  } else if (
    records.data.result.length === 0
    || records.data.result[0]?.zone_id !== values.CLOUDFLARE_ZONE_ID
    || records.data.result[0]?.zone_name !== PRODUCTION_DNS_ZONE
  ) {
    report.fail('CLOUDFLARE_ZONE_ID', `wrong environment: zone could not be proven as ${PRODUCTION_DNS_ZONE}`);
  }

  if (report.failed('CLOUDFLARE_API_TOKEN') || report.failed('CLOUDFLARE_ZONE_ID')) return;

  // A PATCH against the impossible all-zero record ID exercises the DNS Write
  // authorization path but cannot update or create a record. Cloudflare should
  // authorize the request and then return "record not found".
  const writeProbe = await requestJson(
    fetchImpl,
    `https://api.cloudflare.com/client/v4/zones/${values.CLOUDFLARE_ZONE_ID}/dns_records/00000000000000000000000000000000`,
    {
      method: 'PATCH',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TXT',
        name: `_corp-tower-preflight.${PRODUCTION_DNS_ZONE}`,
        content: '"permission-check"',
        ttl: 60,
      }),
    },
  );
  const errorCodes = Array.isArray(writeProbe.data?.errors)
    ? writeProbe.data.errors.map(error => Number(error?.code))
    : [];
  const writeAuthorized = writeProbe.reachable
    && !writeProbe.ok
    && (writeProbe.status === 404 || errorCodes.includes(81044))
    && !errorCodes.includes(10000);
  if (!writeAuthorized) {
    report.fail('CLOUDFLARE_API_TOKEN', 'permission failure: DNS Write was not proven for the configured zone');
  }
}

async function verifyAws(runCommand, environment, report, values) {
  if (environment.AWS_AUTH_OUTCOME !== 'success' || report.failed('AWS_ROLE_ARN')) {
    if (!report.failed('AWS_ROLE_ARN')) {
      report.fail('AWS_ROLE_ARN', 'authentication failure: GitHub OIDC could not assume the configured role');
    }
    if (!report.failed('ECR_REPOSITORY')) {
      report.fail('ECR_REPOSITORY', 'ownership and permission could not be proven because AWS role authentication failed');
    }
    if (!report.failed('EKS_OPERATOR_PRINCIPAL_ARN')) {
      report.fail('EKS_OPERATOR_PRINCIPAL_ARN', 'existence and cluster access could not be proven because AWS role authentication failed');
    }
    return;
  }

  const awsEnvironment = awsCommandEnvironment(environment);
  const aws = async args => await runCommand('aws', [...args, '--no-cli-pager'], {
    env: awsEnvironment,
    timeoutMs: 30_000,
  });
  const caller = await aws(['sts', 'get-caller-identity', '--output', 'json']);
  let callerData;
  try {
    callerData = caller.ok ? JSON.parse(caller.stdout) : null;
  } catch {
    callerData = null;
  }
  const expectedRole = values.AWS_ROLE_ARN.match(/^arn:aws:iam::([0-9]{12}):role\/(.+)$/);
  const assumedRole = callerData?.Arn?.match(/^arn:aws:sts::([0-9]{12}):assumed-role\/([^/]+)\/[^/]+$/);
  const expectedRoleName = expectedRole?.[2]?.split('/').at(-1);
  if (
    !caller.ok
    || !expectedRole
    || !assumedRole
    || callerData.Account !== expectedRole[1]
    || assumedRole[1] !== expectedRole[1]
    || assumedRole[2] !== expectedRoleName
  ) {
    report.fail('AWS_ROLE_ARN', 'wrong account or authentication identity: STS caller does not match the configured GitHub OIDC role');
  }

  if (!report.failed('ECR_REPOSITORY')) {
    const repository = await aws([
      'ecr',
      'describe-repositories',
      '--region',
      AWS_REGION,
      '--repository-names',
      values.ECR_REPOSITORY,
      '--output',
      'json',
    ]);
    let repositoryData;
    try {
      repositoryData = repository.ok ? JSON.parse(repository.stdout) : null;
    } catch {
      repositoryData = null;
    }
    const record = repositoryData?.repositories?.[0];
    if (!repository.ok || !record) {
      report.fail('ECR_REPOSITORY', 'missing or permission failure: repository cannot be described in ap-southeast-1');
    } else if (
      record.repositoryName !== values.ECR_REPOSITORY
      || (expectedRole && record.registryId !== expectedRole[1])
      || !String(record.repositoryUri ?? '').endsWith(`/${values.ECR_REPOSITORY}`)
    ) {
      report.fail('ECR_REPOSITORY', 'wrong account or region: repository metadata does not match the authenticated Production registry');
    }

    const registryAuth = await aws([
      'ecr',
      'get-authorization-token',
      '--region',
      AWS_REGION,
      '--query',
      'authorizationData[0].proxyEndpoint',
      '--output',
      'text',
    ]);
    if (!registryAuth.ok || !/^https:\/\/[0-9]{12}\.dkr\.ecr\.ap-southeast-1\.amazonaws\.com\s*$/.test(registryAuth.stdout)) {
      report.fail('ECR_REPOSITORY', 'permission failure: authenticated role cannot obtain a Production ECR login token');
    }
  }

  if (!report.failed('EKS_OPERATOR_PRINCIPAL_ARN')) {
    const cluster = await aws([
      'eks',
      'describe-cluster',
      '--region',
      AWS_REGION,
      '--name',
      EKS_CLUSTER_NAME,
      '--output',
      'json',
    ]);
    let clusterData;
    try {
      clusterData = cluster.ok ? JSON.parse(cluster.stdout) : null;
    } catch {
      clusterData = null;
    }
    if (!cluster.ok || clusterData?.cluster?.status !== 'ACTIVE') {
      report.fail('EKS_OPERATOR_PRINCIPAL_ARN', 'permission failure: active Production EKS cluster cannot be described');
      return;
    }
    const accessEntry = await aws([
      'eks',
      'describe-access-entry',
      '--region',
      AWS_REGION,
      '--cluster-name',
      EKS_CLUSTER_NAME,
      '--principal-arn',
      values.EKS_OPERATOR_PRINCIPAL_ARN,
      '--output',
      'json',
    ]);
    let accessData;
    try {
      accessData = accessEntry.ok ? JSON.parse(accessEntry.stdout) : null;
    } catch {
      accessData = null;
    }
    if (!accessEntry.ok || accessData?.accessEntry?.principalArn !== values.EKS_OPERATOR_PRINCIPAL_ARN) {
      report.fail('EKS_OPERATOR_PRINCIPAL_ARN', 'missing or permission failure: principal is not the configured Production EKS access entry');
    }
  }
}

async function verifyR2(runCommand, environment, report, values, options) {
  const names = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'];
  if (names.some(name => report.failed(name))) {
    for (const name of names) {
      if (!report.failed(name)) {
        report.fail(name, 'cross-field validation failed: the R2 account, bucket, and credential set is incomplete or malformed');
      }
    }
    return;
  }
  let manifest;
  try {
    manifest = options.assetManifest ?? JSON.parse(
      await readFile(
        resolve(options.repositoryRoot, 'src/Client/App/corp-tower/Cor/art-manifest.json'),
        'utf8',
      ),
    );
  } catch {
    for (const name of names) report.fail(name, 'permission proof could not run because the repository asset manifest is invalid');
    return;
  }
  if (
    typeof manifest.object !== 'string'
    || !/^[a-f0-9]{64}$/.test(manifest.sha256 ?? '')
  ) {
    for (const name of names) report.fail(name, 'permission proof could not run because the repository asset manifest is malformed');
    return;
  }

  const work = await mkdtemp(join(options.tempRoot, 'corp-tower-r2-preflight-'));
  const archive = join(work, 'assets.tar.gz');
  try {
    const r2Environment = limitedCommandEnvironment(environment, {
      AWS_ACCESS_KEY_ID: values.R2_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY: values.R2_SECRET_ACCESS_KEY,
      AWS_REGION: 'auto',
      AWS_DEFAULT_REGION: 'auto',
      AWS_REQUEST_CHECKSUM_CALCULATION: 'when_required',
      AWS_RESPONSE_CHECKSUM_VALIDATION: 'when_required',
    });
    const download = await runCommand(
      'aws',
      [
        's3api',
        'get-object',
        '--endpoint-url',
        `https://${values.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        '--bucket',
        values.R2_BUCKET,
        '--key',
        manifest.object,
        archive,
        '--no-cli-pager',
      ],
      { env: r2Environment, timeoutMs: 120_000 },
    );
    if (!download.ok) {
      const detail = `${download.stderr}\n${download.stdout}`;
      if (/InvalidAccessKeyId/i.test(detail)) {
        report.fail('R2_ACCESS_KEY_ID', 'authentication failure: access key ID is not recognized by the configured R2 account');
      } else if (/SignatureDoesNotMatch|InvalidSignature/i.test(detail)) {
        report.fail('R2_SECRET_ACCESS_KEY', 'authentication failure: secret access key does not match the configured access key ID');
      } else if (/NoSuchBucket/i.test(detail)) {
        report.fail('R2_BUCKET', 'wrong account or missing resource: bucket does not exist at the configured R2 endpoint');
      } else if (/Could not connect|Name or service not known|ENOTFOUND/i.test(detail)) {
        report.fail('R2_ACCOUNT_ID', 'wrong account or network failure: configured R2 endpoint could not be reached');
      } else {
        report.fail('R2_ACCESS_KEY_ID', 'authentication or object-read permission could not be proven');
        report.fail('R2_SECRET_ACCESS_KEY', 'authentication or object-read permission could not be proven');
        report.fail('R2_BUCKET', 'pinned-object read permission could not be proven for this bucket');
        report.fail('R2_ACCOUNT_ID', 'configured account endpoint could not prove ownership of the bucket');
      }
      return;
    }
    const actualHash = await hashFile(archive);
    if (actualHash !== manifest.sha256) {
      report.fail('R2_BUCKET', 'wrong environment: pinned asset object content does not match the repository manifest');
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function verifyKeystore(runCommand, environment, report, values, options) {
  const names = [
    'ANDROID_RELEASE_KEYSTORE_ALIAS',
    'ANDROID_RELEASE_KEYSTORE_BASE64',
    'ANDROID_RELEASE_KEYSTORE_PASSWORD',
  ];
  if (environment.JAVA_SETUP_OUTCOME && environment.JAVA_SETUP_OUTCOME !== 'success') {
    for (const name of names) {
      report.fail(name, 'verification tooling failure: Java setup did not provide keytool on the Production runner');
    }
    return;
  }
  if (names.some(name => report.failed(name))) {
    for (const name of names) {
      if (!report.failed(name)) {
        report.fail(name, 'cross-field validation failed: the Android keystore, alias, and password set is incomplete or malformed');
      }
    }
    return;
  }
  const work = await mkdtemp(join(options.tempRoot, 'corp-tower-keystore-preflight-'));
  const keystore = join(work, 'release.keystore');
  const imported = join(work, 'verified.p12');
  const destinationPassword = createHash('sha256').update(`${Date.now()}-${process.pid}`).digest('hex');
  const commandEnvironment = limitedCommandEnvironment(environment, {
    CORP_TOWER_KEYSTORE_PASSWORD: values.ANDROID_RELEASE_KEYSTORE_PASSWORD,
    CORP_TOWER_DESTINATION_PASSWORD: destinationPassword,
  });
  try {
    let decoded;
    try {
      decoded = Buffer.from(values.ANDROID_RELEASE_KEYSTORE_BASE64, 'base64');
    } catch {
      report.fail('ANDROID_RELEASE_KEYSTORE_BASE64', 'malformed: base64 decoding failed');
      return;
    }
    if (decoded.length === 0) {
      report.fail('ANDROID_RELEASE_KEYSTORE_BASE64', 'malformed: decoded keystore is empty');
      return;
    }
    await writeFile(keystore, decoded, { mode: 0o600 });
    const list = await runCommand(
      'keytool',
      [
        '-list',
        '-keystore',
        keystore,
        '-storepass:env',
        'CORP_TOWER_KEYSTORE_PASSWORD',
        '-alias',
        values.ANDROID_RELEASE_KEYSTORE_ALIAS,
      ],
      { env: commandEnvironment, timeoutMs: 30_000 },
    );
    if (!list.ok) {
      const detail = `${list.stderr}\n${list.stdout}`;
      if (/password was incorrect|tampered with/i.test(detail)) {
        report.fail('ANDROID_RELEASE_KEYSTORE_PASSWORD', 'authentication failure: password cannot open the release keystore');
      } else if (/does not exist|alias/i.test(detail)) {
        report.fail('ANDROID_RELEASE_KEYSTORE_ALIAS', 'cross-field mismatch: alias does not exist in the release keystore');
      } else {
        report.fail('ANDROID_RELEASE_KEYSTORE_ALIAS', 'cross-field validation failed: alias could not be checked in the unreadable keystore');
        report.fail('ANDROID_RELEASE_KEYSTORE_BASE64', 'malformed: decoded value is not a readable Java release keystore');
        report.fail('ANDROID_RELEASE_KEYSTORE_PASSWORD', 'authentication could not be proven against the decoded keystore');
      }
      return;
    }

    const importResult = await runCommand(
      'keytool',
      [
        '-importkeystore',
        '-srckeystore',
        keystore,
        '-srcalias',
        values.ANDROID_RELEASE_KEYSTORE_ALIAS,
        '-srcstorepass:env',
        'CORP_TOWER_KEYSTORE_PASSWORD',
        '-srckeypass:env',
        'CORP_TOWER_KEYSTORE_PASSWORD',
        '-destkeystore',
        imported,
        '-deststoretype',
        'PKCS12',
        '-deststorepass:env',
        'CORP_TOWER_DESTINATION_PASSWORD',
        '-noprompt',
      ],
      { env: commandEnvironment, timeoutMs: 30_000 },
    );
    if (!importResult.ok) {
      report.fail('ANDROID_RELEASE_KEYSTORE_PASSWORD', 'authentication failure: password cannot unlock the private signing key');
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

async function verifyGooglePlay(fetchImpl, environment, report) {
  if (report.failed('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON')) return;
  const token = environment.GOOGLE_PLAY_ACCESS_TOKEN ?? '';
  if (environment.GOOGLE_AUTH_OUTCOME !== 'success' || token.length === 0) {
    report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'authentication failure: Google OAuth did not issue an Android Publisher access token');
    return;
  }
  const baseUrl = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${ANDROID_PACKAGE_NAME}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
  const created = await requestJson(fetchImpl, `${baseUrl}/edits`, {
    method: 'POST',
    headers,
    body: '{}',
  });
  if (!created.reachable) {
    report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'Google Play permission endpoint was unreachable');
    return;
  }
  const editId = created.data?.id;
  if (!created.ok || typeof editId !== 'string' || editId.length === 0) {
    report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'permission failure: service account cannot create an edit for the Production Android application');
    return;
  }

  const tracks = await requestJson(fetchImpl, `${baseUrl}/edits/${encodeURIComponent(editId)}/tracks`, {
    headers,
  });
  if (!tracks.ok || !Array.isArray(tracks.data?.tracks)) {
    report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'permission failure: service account cannot read Production application tracks');
  }
  const removed = await requestJson(fetchImpl, `${baseUrl}/edits/${encodeURIComponent(editId)}`, {
    method: 'DELETE',
    headers,
  });
  if (!removed.reachable || ![200, 204].includes(removed.status)) {
    report.fail('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON', 'cleanup failure: temporary permission-check edit could not be deleted');
  }
}

export async function verifyProductionEnvironment(options = {}) {
  const environment = options.environment ?? process.env;
  const report = new PreflightReport(environment);
  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const runtime = {
    repositoryRoot: options.repositoryRoot ?? resolve(fileURLToPath(new URL('..', import.meta.url))),
    tempRoot: options.tempRoot ?? tmpdir(),
    assetManifest: options.assetManifest,
  };
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const runCommand = options.runCommand ?? defaultRunCommand;
  const values = validateStaticInputs(environment, report, nowSeconds);

  const checks = [
    {
      names: [
        'PLAYER_IDENTITY_HMAC_SECRET',
        'PLAYER_IDENTITY_HMAC_KEY_VERSION',
        'PLAYER_IDENTITY_HMAC_PREVIOUS_SECRET',
        'PLAYER_IDENTITY_HMAC_PREVIOUS_KEY_VERSION',
      ],
      run: () => verifyHmacLineage(runCommand, environment, report, values, runtime),
    },
    {
      names: [
        'SUPABASE_PROJECT_REF',
        'SUPABASE_URL',
        'SUPABASE_ANON_KEY',
        'SUPABASE_SERVICE_ROLE_KEY',
        'SUPABASE_AUTH_REQUIRED',
        'CORP_TOWER_AUTH_OAUTH',
        'GOOGLE_OAUTH_WEB_CLIENT_ID',
        'TOD_FACEBOOK_APP_ID',
        'TOD_FACEBOOK_APP_SECRET',
      ],
      run: () => verifySupabase(fetchImpl, report, values),
    },
    {
      names: ['TOD_FACEBOOK_APP_ID', 'TOD_FACEBOOK_APP_SECRET', 'TOD_FACEBOOK_CLIENT_TOKEN'],
      run: () => verifyFacebook(fetchImpl, report, values),
    },
    {
      names: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ZONE_ID'],
      run: () => verifyCloudflare(fetchImpl, report, values),
    },
    {
      names: ['AWS_ROLE_ARN', 'ECR_REPOSITORY', 'EKS_OPERATOR_PRINCIPAL_ARN'],
      run: () => verifyAws(runCommand, environment, report, values),
    },
    {
      names: ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY'],
      run: () => verifyR2(runCommand, environment, report, values, runtime),
    },
    {
      names: [
        'ANDROID_RELEASE_KEYSTORE_ALIAS',
        'ANDROID_RELEASE_KEYSTORE_BASE64',
        'ANDROID_RELEASE_KEYSTORE_PASSWORD',
      ],
      run: () => verifyKeystore(runCommand, environment, report, values, runtime),
    },
    {
      names: ['GOOGLE_PLAY_SERVICE_ACCOUNT_JSON'],
      run: () => verifyGooglePlay(fetchImpl, environment, report),
    },
  ];
  const outcomes = await Promise.allSettled(checks.map(check => check.run()));
  outcomes.forEach((outcome, index) => {
    if (outcome.status === 'fulfilled') return;
    for (const name of checks[index].names) {
      report.fail(name, 'validation terminated unexpectedly, so ownership or permission was not proven');
    }
  });

  return report.finish({
    emit: options.emit ?? true,
    stdout: options.stdout,
    stderr: options.stderr,
  });
}

async function main() {
  const result = await verifyProductionEnvironment();
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    console.error('Production environment NOT ready: preflight terminated unexpectedly without exposing sensitive details.');
    process.exitCode = 1;
  });
}
