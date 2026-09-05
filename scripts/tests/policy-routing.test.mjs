import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve('.');
const policy = name => readFileSync(join(ROOT, 'policy', name), 'utf8');

test('the policy router resolves ChatGPT and Codex from the policy directory', () => {
  const agents = policy('AGENTS.md');

  assert.match(agents, /ChatGPT → `policy\/CHATGPT\.md`/);
  assert.match(agents, /Codex → `policy\/CODEX\.md`/);
  assert.match(policy('CODEX.md'), /#IMPLEMENT#/);
  assert.match(policy('CODEX.md'), /#FIX#/);
  assert.match(policy('CODEX.md'), /#EXECUTION#/);
});

test('the six ChatGPT branches resolve to compact entry policies', () => {
  const chatgpt = policy('CHATGPT.md');
  const branches = ['PLANNER', 'REVIEWER', 'QUESTION', 'VISUAL', 'MAINTENANCE', 'RESEARCH'];

  for (const branch of branches) {
    assert.match(chatgpt, new RegExp(`#${branch}#`));
    const filename = `${branch}.md`;
    assert.equal(existsSync(join(ROOT, 'policy', filename)), true, `${filename} must exist`);
    assert.match(policy(filename), /#ENTRY#/);
  }
});

test('planner and reviewer retain sparse KB Tree routes', () => {
  for (const filename of ['PLANNER.md', 'REVIEWER.md']) {
    const source = policy(filename);
    assert.match(source, /#ENTRY#/);
    assert.match(source, /KB\/docs\/context\/index\.md/);
  }
});

test('FIX stops at redesign and Safety Exception preservation lives once in CODEX execution policy', () => {
  const codex = policy('CODEX.md');
  const fix = policy('FIX.md');

  assert.match(fix, /requires a product or workflow design decision/);
  assert.match(fix, /must be planned with ChatGPT/);
  assert.equal((codex.match(/SAFETY EXCEPTION/g) || []).length, 1);
  assert.match(codex, /must not be removed, weakened, or rewritten/);
});

test('the active Codex close-out path uses KB Tree intake without retired role routing', () => {
  const taskClose = readFileSync(join(ROOT, 'scripts/task-close.mjs'), 'utf8');

  assert.match(taskClose, /function taskCloseIntake/);
  assert.doesNotMatch(taskClose, /context-query\.mjs|context-routing\.mjs|scopeContext|routeSourcePath/);
  assert.doesNotMatch(policy('CODEX.md'), /client-engineer|server-engineer|fullstack-coordinator|infra-engineer|qa-engineer|update-docs/);
});
