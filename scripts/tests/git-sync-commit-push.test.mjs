import assert from 'node:assert/strict';
import test from 'node:test';
import { manifestScope, requireManifest } from '../git-sync-commit-push.mjs';

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
});

test('schema-v2 Git scope refuses unverified publication', () => {
  assert.throws(() => manifestScope({
    schema_version: 2,
    task: 'Retrieval polish',
    phase: 'reviewed',
    publish_paths: ['scripts/context.mjs'],
    verification: null,
  }), /passing closeout/);
});

test('schema-v1 Git scope retains the explicit changed-path fallback', () => {
  const scope = manifestScope({
    schema_version: 1,
    task: 'Legacy closeout',
    changed_paths: ['scripts/context.mjs', 'scripts/context.mjs'],
  });

  assert.deepEqual(scope.paths, ['scripts/context.mjs']);
});
