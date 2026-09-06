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

test('standalone archive CLI is idempotent for its original plan path and rejects true collisions', t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-plan-archive-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plan'), { recursive: true });
  writeFileSync(join(root, 'plan/cli.md'), '# Active\n');
  assert.equal(main(['--plan', 'plan/cli.md'], { root }).status, 'archived');
  assert.equal(main(['--plan', 'plan/cli.md'], { root }).status, 'archived');

  writeFileSync(join(root, 'plan/collision.md'), '# Active collision\n');
  writeFileSync(join(root, 'plan/done/collision.md'), '# Existing archive\n');
  assert.throws(() => main(['--plan', 'plan/collision.md'], { root }), /active plan and archive destination both exist/);
  assert.equal(readFileSync(join(root, 'plan/collision.md'), 'utf8'), '# Active collision\n');
  assert.equal(readFileSync(join(root, 'plan/done/collision.md'), 'utf8'), '# Existing archive\n');
  assert.throws(() => main(['--plan', 'plan/missing.md'], { root }), /active plan is absent and no completed archive exists/);
});
