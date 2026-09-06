import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  acquireTaskOwnership,
  amendTaskOwnership,
  releaseTaskOwnership,
  resolveTaskOwnership,
} from '../lib/task-ownership.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-ownership-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/one.mjs'), 'export const one = true;\n');
  writeFileSync(join(root, 'src/two.mjs'), 'export const two = true;\n');
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test('lightweight task ownership acquires explicit scope, rejects active overlap, and releases independently', t => {
  const root = fixture(t);
  const first = acquireTaskOwnership({
    root,
    task: 'Ownership fixture',
    paths: ['src/one.mjs'],
    runId: 'ownership-one',
    now: '2026-09-06T00:00:00.000Z',
  });

  assert.equal(first.status, 'acquired');
  assert.deepEqual(first.ownership.owned_paths, ['src/one.mjs']);
  assert.match(first.ownership.path, /^\.agent-state\/automation\/task-ownership\/ownership-one\.json$/);
  assert.throws(() => acquireTaskOwnership({
    root,
    task: 'Conflicting fixture',
    paths: ['src/one.mjs'],
    runId: 'ownership-two',
  }), /overlapping active task ownership/);

  const duplicate = acquireTaskOwnership({
    root,
    task: 'Ownership fixture',
    paths: ['src/one.mjs'],
    runId: 'ownership-one',
    now: '2026-09-06T00:00:00.000Z',
  });
  assert.equal(duplicate.status, 'duplicate');

  const amended = amendTaskOwnership({
    root,
    ownership: first.ownership,
    paths: ['src/two.mjs'],
    reason: 'The second source file is a proven direct dependency.',
    now: '2026-09-06T00:01:00.000Z',
  });
  assert.equal(amended.status, 'amended');
  assert.deepEqual(amended.ownership.owned_paths, ['src/one.mjs', 'src/two.mjs']);
  assert.equal(resolveTaskOwnership(amended.ownership, { root, requireActive: true }).amendments.length, 1);

  const released = releaseTaskOwnership({
    root,
    ownership: amended.ownership,
    now: '2026-09-06T00:02:00.000Z',
  });
  assert.equal(released.status, 'released');
  assert.equal(resolveTaskOwnership(released.ownership, { root }).status, 'released');
  assert.throws(() => resolveTaskOwnership(released.ownership, { root, requireActive: true }), /must be active/);

  const successor = acquireTaskOwnership({
    root,
    task: 'Successor fixture',
    paths: ['src/one.mjs'],
    runId: 'ownership-two',
  });
  assert.equal(successor.status, 'acquired');
  assert.doesNotMatch(readFileSync(join(root, successor.ownership.path), 'utf8'), /dirty|git/i);
});

test('task ownership rejects unsafe paths and missing direct-dependency evidence', t => {
  const root = fixture(t);
  assert.throws(() => acquireTaskOwnership({ root, task: 'Unsafe', paths: ['../outside.mjs'] }), /repository/);
  const ownership = acquireTaskOwnership({ root, task: 'Safe', paths: ['src/one.mjs'], runId: 'safe' });
  assert.throws(() => amendTaskOwnership({ root, ownership: ownership.ownership, paths: ['src/two.mjs'], reason: '' }), /amendment reason/);
});
