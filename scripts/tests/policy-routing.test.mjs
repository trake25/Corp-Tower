import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve('.');
const policy = name => readFileSync(join(ROOT, 'policy', name), 'utf8');

test('the root universal router resolves ChatGPT and Codex without a duplicate policy router', () => {
  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');

  assert.match(agents, /ChatGPT → `policy\/CHATGPT\.md`/);
  assert.match(agents, /Codex → `policy\/CODEX\.md`/);
  assert.equal(existsSync(join(ROOT, 'policy', 'AGENTS.md')), false);
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

test('active KB Tree policy and site grants use root routing and direct repository evidence', () => {
  const automation = readFileSync(join(ROOT, 'KB/docs/context/automation.md'), 'utf8');
  const site = readFileSync(join(ROOT, 'KB/docs/context/site.md'), 'utf8');

  assert.match(automation, /source: AGENTS\.md#Route/);
  assert.doesNotMatch(automation, /policy\/AGENTS\.md/);
  assert.doesNotMatch(site, /source: site\/docs\//);
});

test('model policies own deterministic retrieval transports and role policies defer to them', () => {
  const codex = policy('CODEX.md');
  const chatgpt = policy('CHATGPT.md');

  assert.match(codex, /## KB retrieval transport/);
  assert.match(codex, /Reuse exact current concept evidence/);
  assert.match(codex, /node scripts\/context\.mjs\s+concept-read/);
  assert.match(codex, /same exact manual KB Tree\s+route/);
  assert.match(codex, /Do not broaden repository search/);
  assert.match(chatgpt, /## KB retrieval transport/);
  assert.match(chatgpt, /Reuse exact current concept evidence/);
  assert.match(chatgpt, /repository\/GitHub connector/);
  assert.match(chatgpt, /another available exact\s+repository transport/);
  assert.match(chatgpt, /third fallback may broaden repository search solely\s+to diagnose and report the retrieval defect/);
  assert.match(chatgpt, /not ordinary task authority/);

  for (const filename of ['QUESTION.md', 'PLANNER.md', 'MAINTENANCE.md']) {
    assert.match(policy(filename), /model-level KB retrieval transport\/fallback contract/);
    assert.doesNotMatch(policy(filename), /context\.mjs|repository\/GitHub connector/);
  }
});
