import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { explicitPathScope, manifestScope, requireManifest, validatePublicReceiptEvidence } from '../git-sync-commit-push.mjs';
import { GIT_FAILURE_DETAIL_CAP, GIT_FAILURE_LOG_DIRECTORY, boundedGitFailureDetail, runGit } from '../lib/git-publication.mjs';
import { acquireTaskOwnership, releaseTaskOwnership } from '../lib/task-ownership.mjs';

const IDENTITY = Object.freeze({
  keywords: ['Retrieval', 'Polish'],
  keyword_label: 'Retrieval Polish',
  slug: 'retrieval-polish',
  version: '0.03',
  label: 'Retrieval Polish v0.03',
});
const PUBLIC_RECEIPT = 'report/qa-receipts/qa-receipt-retrieval-polish-v0.03.md';

test('Git publication requires an explicit close-out manifest', () => {
	assert.throws(() => requireManifest(), /explicit manifest required/);
	assert.equal(requireManifest('.agent-state/automation/current.json'), '.agent-state/automation/current.json');
});

test('schema-v2 Git scope uses only publish paths from a passing closed manifest', () => {
  const scope = manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    phase: 'closed',
    changed_paths: ['scripts/context.mjs'],
    publish_paths: ['scripts/context.mjs', 'KB/docs/context/automation.md', 'KB/docs/context/map/concept/automation.md', 'scripts/context.mjs'],
    verification: { status: 'passed' },
  });

  assert.equal(scope.task, 'Retrieval polish');
  assert.deepEqual(scope.paths, ['scripts/context.mjs', 'KB/docs/context/automation.md', 'KB/docs/context/map/concept/automation.md']);
  assert.equal(scope.task_identity, null);
  assert.equal(scope.public_receipt, null);
});

test('schema-v2 Git scope refuses unverified publication', () => {
  assert.throws(() => manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    phase: 'reviewed',
    publish_paths: ['scripts/context.mjs'],
    verification: null,
  }), /terminal closeout/);
  assert.throws(() => manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    phase: 'failed',
    publish_paths: ['scripts/context.mjs'],
    verification: { status: 'failed' },
  }), /terminal closeout/);
});

test('new passed and maintenance-blocked manifests require matching public evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-public-receipt-'));
  const terminalManifest = status => ({
    schema_version: 2,
    task: 'Retrieval polish',
    task_identity: IDENTITY,
    phase: 'closed',
    publish_paths: ['scripts/context.mjs', PUBLIC_RECEIPT],
    verification: { status, public_receipt: PUBLIC_RECEIPT },
  });
  try {
    mkdirSync(join(root, 'report/qa-receipts'), { recursive: true });
    writeFileSync(join(root, PUBLIC_RECEIPT), '# receipt\n');
    for (const status of ['passed', 'maintenance-blocked']) {
      const manifest = terminalManifest(status);
      assert.equal(manifestScope(manifest).public_receipt, PUBLIC_RECEIPT);
      assert.deepEqual(validatePublicReceiptEvidence(manifest, root), IDENTITY);
    }
    rmSync(join(root, PUBLIC_RECEIPT));
    assert.throws(() => validatePublicReceiptEvidence(terminalManifest('maintenance-blocked'), root), /does not exist/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('maintenance-blocked publication rejects legacy or incomplete evidence', () => {
  assert.throws(() => manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    phase: 'closed',
    publish_paths: ['scripts/context.mjs'],
    verification: { status: 'maintenance-blocked' },
  }), /persisted task identity/);
  assert.throws(() => manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    task_identity: IDENTITY,
    phase: 'closed',
    publish_paths: ['scripts/context.mjs'],
    verification: { status: 'maintenance-blocked', public_receipt: PUBLIC_RECEIPT },
  }), /public QA receipt in publish_paths/);
});

test('schema-v1 Git scope retains the explicit changed-path fallback', () => {
  const scope = manifestScope({
    schema_version: 1,
    task: 'Legacy closeout',
    changed_paths: ['scripts/context.mjs', 'scripts/context.mjs'],
  });

  assert.deepEqual(scope, {
    task: 'Legacy closeout',
    paths: ['scripts/context.mjs'],
    task_identity: null,
    public_receipt: null,
  });
});

test('explicit authorized publication paths work without task-close and can be bounded by ownership', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-explicit-scope-'));
  try {
    mkdirSync(join(root, 'scripts'), { recursive: true });
    writeFileSync(join(root, 'scripts/example.mjs'), 'export const example = true;\n');
    const ownership = acquireTaskOwnership({
      root,
      task: 'Explicit publication',
      paths: ['scripts/example.mjs'],
      runId: 'explicit-publication',
    });
    const scope = explicitPathScope({
      root,
      task: 'Explicit publication',
      paths: ['scripts/example.mjs'],
      ownership: ownership.ownership.path,
    });
    assert.deepEqual(scope.paths, ['scripts/example.mjs']);
    assert.equal(scope.ownership.run_id, 'explicit-publication');
    assert.throws(() => explicitPathScope({
      root,
      task: 'Explicit publication',
      paths: ['scripts/missing.mjs'],
      ownership: ownership.ownership.path,
    }), /publication path|ownership/);
    releaseTaskOwnership({ root, ownership: ownership.ownership });
    assert.equal(explicitPathScope({
      root,
      task: 'Explicit publication',
      paths: ['scripts/example.mjs'],
      ownership: ownership.ownership.path,
    }).ownership.status, 'released');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('boundedGitFailureDetail keeps short Git failure output inline and writes no private log', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-failure-detail-'));
  try {
    const { detail, logPath } = boundedGitFailureDetail(root, '  short   error   text  ');
    assert.equal(detail, 'short error text');
    assert.equal(logPath, null);
    assert.equal(existsSync(join(root, GIT_FAILURE_LOG_DIRECTORY)), false);
    assert.deepEqual(boundedGitFailureDetail(root, '   '), { detail: '', logPath: null });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('boundedGitFailureDetail truncates long output to the visible cap and saves the complete text privately', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-failure-detail-'));
  try {
    const long = `${'z'.repeat(GIT_FAILURE_DETAIL_CAP + 500)}`;
    const { detail, logPath } = boundedGitFailureDetail(root, long);
    assert.equal(detail.length, GIT_FAILURE_DETAIL_CAP);
    assert.ok(detail.endsWith('…'));
    assert.equal(detail.slice(0, -1), long.slice(0, GIT_FAILURE_DETAIL_CAP - 1));
    assert.ok(logPath.startsWith(`${GIT_FAILURE_LOG_DIRECTORY}/`));
    assert.equal(readFileSync(resolve(root, logPath), 'utf8'), long);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runGit on a long real Git failure keeps the thrown detail bounded and saves the complete output privately', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-runGit-long-failure-'));
  try {
    writeFileSync(join(root, 'a.txt'), '');
    writeFileSync(join(root, 'b.txt'), Array.from({ length: 200 }, (_, index) => `unique line number ${index} of a large no-index diff`).join('\n') + '\n');

    let caught = null;
    try { runGit(root, ['diff', '--no-index', 'a.txt', 'b.txt']); } catch (error) { caught = error; }
    assert.ok(caught, 'runGit must throw on a real Git failure');
    assert.match(caught.message, /^git diff --no-index a\.txt b\.txt failed: /);
    assert.ok(Buffer.byteLength(caught.message) < GIT_FAILURE_DETAIL_CAP + 150, 'the thrown message must stay near the bounded cap, not the full diff');

    const logMatch = caught.message.match(/\(full output: (.+)\)$/);
    assert.ok(logMatch, caught.message);
    const logPath = resolve(root, logMatch[1]);
    assert.ok(existsSync(logPath));
    const full = readFileSync(logPath, 'utf8');
    assert.ok(full.length > GIT_FAILURE_DETAIL_CAP, 'the private log must retain the complete diff, not the truncated headline');
    assert.match(full, /unique line number 199/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('runGit on a short real Git failure stays inline with no private log', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-runGit-short-failure-'));
  try {
    assert.throws(() => runGit(root, ['show', 'refs/heads/definitely-not-a-real-branch']), error => {
      assert.match(error.message, /^git show refs\/heads\/definitely-not-a-real-branch failed: /);
      assert.doesNotMatch(error.message, /full output:/);
      return true;
    });
    assert.equal(existsSync(join(root, GIT_FAILURE_LOG_DIRECTORY)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
