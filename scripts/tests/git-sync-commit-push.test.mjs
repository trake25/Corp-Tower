import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { manifestScope, requireManifest, validatePublicReceiptEvidence } from '../git-sync-commit-push.mjs';

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
    publish_paths: ['scripts/context.mjs', 'docs/context/automation.md', 'docs/context/map/infra.md', 'scripts/context.mjs'],
    verification: { status: 'passed' },
  });

  assert.equal(scope.task, 'Retrieval polish');
  assert.deepEqual(scope.paths, ['scripts/context.mjs', 'docs/context/automation.md', 'docs/context/map/infra.md']);
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
