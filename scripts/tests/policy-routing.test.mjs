import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve('.');
const policy = name => readFileSync(join(ROOT, 'policy', name), 'utf8');

function filesBelow(root) {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesBelow(path) : [path];
  });
}

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

test('orchestration policy remains routed and bounded', () => {
  const phaseTwo = policy('PLANNER.md').split('#PLAN-PHASE-2#').at(-1);
  for (const mode of ['SINGLE', 'ORCHESTRATED']) assert.match(phaseTwo, new RegExp(`\\b${mode}\\b`));
  assert.match(phaseTwo, /Allowed effort[^\n]*\bUltra\b/i);
  assert.match(phaseTwo, /plan[^\n]*must[^\n]*:[\s\S]*?recommend[^\n]*model[^\n]*effort/i);
  const codex = policy('CODEX.md');
  assert.match(codex, /#ORCHESTRATION#/);
  for (const role of ['ORCHESTRATOR', 'WORKER']) assert.match(codex, new RegExp(`\\b${role}\\b`));
  assert.match(codex, /parent (?:task-close|closure)[^.\n]*orchestrator/i);
  assert.match(codex, /parallel workers[^\n]*(?:may|must) not[^\n]*overlapping[^\n]*write ownership/i);
  const reviewer = policy('REVIEWER.md');
  assert.match(reviewer, /parent plan[^\n]*implementation contract/i);
  assert.match(reviewer, /Worker[^\n]*supporting proof/i);
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

test('Codex execution owns one bounded provider-visible I/O discipline', () => {
  const codex = policy('CODEX.md');
  const execution = codex.split('\n#EXECUTION#\n').at(-1).split('\n#ORCHESTRATION#\n')[0];

  assert.equal((codex.match(/^## Provider-visible I\/O discipline$/gm) || []).length, 1);
  assert.match(execution, /smallest provider-visible input and output/);
  assert.match(execution, /tool result as provider-context input/);
  assert.match(execution, /one KB Tree concept per information need/);
  assert.match(execution, /final task-owned change scope once/);
  assert.match(execution, /git diff --check/);
  assert.match(execution, /Do not reread changed hunks that remain exact and current/);
  assert.match(execution, /Read task-relevant changed hunks when the patch is no longer exact\/current/);
  assert.match(execution, /Do not request or print a repository-wide full diff by default/);
  assert.match(execution, /Large deletions, generated-file churn[\s\S]*metadata-first/);
  assert.match(execution, /expand evidence progressively/);
  assert.match(execution, /normal completion response compact/);
  assert.match(execution, /Do not impose a rigid line or token cap/);
  assert.match(execution, /compact `qa-gate` path over raw `node --test` output/);
  assert.match(execution, /concept-read.*standalone contextualization decision point/);
  assert.match(execution, /Do not broadly grep.*\.agent-state/);

  for (const filename of ['IMPLEMENT.md', 'FIX.md']) {
    const source = policy(filename);
    assert.doesNotMatch(source, /Provider-visible I\/O discipline/);
    assert.doesNotMatch(source, /repository-wide full diff|metadata-first|provider-context input/);
  }
});

test('one-tree invariant retires the legacy corpus, tooling, and skill routes', () => {
  const retiredCorpus = join(ROOT, 'docs', 'context');
  const retiredTools = [
    'scripts/lib/context-routing.mjs',
    'scripts/validate-docs.mjs',
    'scripts/docs-scope.mjs',
    'scripts/build-file-map.mjs',
  ];
  const activeInstructions = [
    ...filesBelow(join(ROOT, 'policy')),
    ...filesBelow(join(ROOT, '.agents', 'skills')),
    ...filesBelow(join(ROOT, '.claude', 'skills')),
  ];

  assert.equal(existsSync(retiredCorpus), false);
  for (const path of retiredTools) assert.equal(existsSync(join(ROOT, path)), false, path);
  for (const path of activeInstructions) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /(?<!KB\/)docs\/context(?:\/|\b)/, path);
    assert.doesNotMatch(source, /context-routing\.mjs|validate-docs\.mjs|docs-scope\.mjs|build-file-map\.mjs/, path);
  }

  const contextCli = readFileSync(join(ROOT, 'scripts/context.mjs'), 'utf8');
  const taskClose = readFileSync(join(ROOT, 'scripts/task-close.mjs'), 'utf8');
  const benchmark = readFileSync(join(ROOT, 'scripts/benchmark-rag.mjs'), 'utf8');
  assert.doesNotMatch(contextCli, /context-routing|routeContext|searchContext|scopeContext/);
  assert.doesNotMatch(taskClose, /context-routing|validate-docs|build-file-map/);
  assert.doesNotMatch(benchmark, /--check\b|context-retrieval\.json|context-routing/);
});
