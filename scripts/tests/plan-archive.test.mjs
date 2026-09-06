import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { archivePlan, planBindingFor } from '../lib/plan-archive.mjs';
import { main } from '../plan-archive.mjs';

test('standalone plan archival is collision-safe and idempotent without task-close', t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-plan-archive-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plan'), { recursive: true });
  writeFileSync(join(root, 'plan/task.md'), '# Active\n');
  const binding = planBindingFor('plan/task.md', root);
  assert.equal(archivePlan(binding, root).status, 'archived');
  assert.equal(existsSync(join(root, 'plan/task.md')), false);
  assert.equal(readFileSync(join(root, 'plan/done/task.md'), 'utf8'), '# Active\n');
  assert.equal(archivePlan(binding, root).status, 'archived');
});

test('standalone archive CLI uses only an active explicit plan', t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-plan-archive-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plan'), { recursive: true });
  writeFileSync(join(root, 'plan/cli.md'), '# Active\n');
  const result = main(['--plan', 'plan/cli.md'], { root });
  assert.equal(result.status, 'archived');
  assert.throws(() => main(['--plan', 'plan/cli.md'], { root }), /destination already exists|active plan/);
});
