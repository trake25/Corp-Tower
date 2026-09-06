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

test('AGENTS is the universal Codex execution kernel and no longer routes by runtime identity', () => {
  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');

  assert.match(agents, /^# Codex universal policy/m);
  assert.match(agents, /approved Phase 2 plan/);
  assert.match(agents, /## 1\. Intended Behavior/);
  assert.match(agents, /## 2\. Task-Specific Policy/);
  assert.match(agents, /### Compacted KB Context/);
  assert.match(agents, /### KB Retrieval Inputs/);
  assert.match(agents, /### Source Context/);
  assert.match(agents, /## 4\. Expected Write Scope/);
  assert.match(agents, /strict_execution=ON/);

  assert.doesNotMatch(agents, /At session start|Runtime\/Product/);
  assert.doesNotMatch(agents, /ChatGPT →|Codex →/);
  assert.doesNotMatch(agents, /policy\/(?:CODEX|IMPLEMENT|FIX)\.md/);
  assert.equal(existsSync(join(ROOT, 'policy', 'AGENTS.md')), false);
});

test('ChatGPT entry retains the six compact role branches', () => {
  const chatgpt = policy('CHATGPT.md');
  const branches = ['PLANNER', 'REVIEWER', 'QUESTION', 'VISUAL', 'MAINTENANCE', 'RESEARCH'];

  assert.match(chatgpt, /#ENTRY#/);
  for (const branch of branches) {
    assert.match(chatgpt, new RegExp(`#${branch}#`));
    const filename = `${branch}.md`;
    assert.equal(existsSync(join(ROOT, 'policy', filename)), true, `${filename} must exist`);
    assert.match(policy(filename), /#ENTRY#/);
  }
});

test('Planner and Reviewer retain sparse KB Tree routes', () => {
  for (const filename of ['PLANNER.md', 'REVIEWER.md']) {
    const source = policy(filename);
    assert.match(source, /#ENTRY#/);
    assert.match(source, /KB\/docs\/context\/index\.md/);
  }
});

test('Phase 2 compiles detached Codex policy sources instead of making Codex read them', () => {
  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  const planner = policy('PLANNER.md');
  const codex = policy('CODEX.md');
  const implement = policy('IMPLEMENT.md');
  const fix = policy('FIX.md');

  assert.match(planner, /Search `policy\/CODEX\.md` for `#ENTRY#`/);
  assert.match(planner, /IMPLEMENT → `policy\/IMPLEMENT\.md#ENTRY#`/);
  assert.match(planner, /FIX → `policy\/FIX\.md#ENTRY#`/);
  assert.match(
    planner,
    /do not require Codex to reread `policy\/CODEX\.md`, `policy\/IMPLEMENT\.md`, or `policy\/FIX\.md`/i
  );

  assert.match(codex, /Planner-side policy source/);
  assert.match(codex, /Normal Codex runtime execution does not read this file/);
  assert.match(implement, /Planner uses this policy for Phase 2/);
  assert.match(fix, /Planner uses this policy for Phase 2/);

  assert.doesNotMatch(agents, /policy\/(?:CODEX|IMPLEMENT|FIX)\.md/);
});

test('Phase 2 uses the standard execution-oriented seven-section format', () => {
  const planner = policy('PLANNER.md').split('#PLAN-PHASE-2#').at(-1);
  const ordered = [
    '### `## 1. Intended Behavior`',
    '### `## 2. Task-Specific Policy`',
    '### `## 3. Context`',
    '### `## 4. Expected Write Scope`',
    '### `## 5. Implementation`',
    '### `## 6. Verification`',
    '### `## 7. Done Criteria`',
  ];

  let previous = -1;
  for (const heading of ordered) {
    const index = planner.indexOf(heading);
    assert.ok(index > previous, `${heading} must appear in order`);
    previous = index;
  }

  assert.match(planner, /### Compacted KB Context/);
  assert.match(planner, /### KB Retrieval Inputs/);
  assert.match(planner, /### Source Context/);
  assert.match(planner, /### Direct Edits/);
  assert.match(planner, /### Generated Outputs/);
  assert.match(planner, /exact current source files Codex should inspect/);
  assert.match(planner, /likely exact files Planner expects the task to modify/);
  assert.match(planner, /not a hard whitelist by default/);
});

test('Phase 2 omits repository defaults and writes only execution overrides', () => {
  const planner = policy('PLANNER.md').split('#PLAN-PHASE-2#').at(-1);
  const codex = policy('CODEX.md');

  assert.match(planner, /Repository defaults are implicit/);
  assert.match(planner, /Do not include BARE process-control values/);
  assert.match(planner, /Do not state SINGLE execution/);
  assert.match(planner, /Do not place Codex runtime identity, current model, or current effort in the plan/);
  assert.match(planner, /`## Execution Overrides` exists only when at least one non-default execution rule applies/);

  assert.match(codex, /#PROCESS-OVERRIDES#/);
  assert.match(codex, /Repository process defaults are implicit/);
  assert.match(codex, /Put only non-default values under `## Execution Overrides`/);
  assert.match(codex, /#STRICT-EXECUTION#/);
  assert.match(codex, /strict_execution=ON/);

  for (const control of [
    'telemetry',
    'workflow_inefficiency_flagging',
    'qa',
    'qa_coverage',
    'qa_receipt',
    'plan_archival',
  ]) {
    assert.match(codex, new RegExp(`\\b${control}\\b`));
  }

  assert.doesNotMatch(policy('IMPLEMENT.md'), /resolved process controls|default process profile is BARE/);
  assert.doesNotMatch(policy('FIX.md'), /resolved process controls|default process profile is BARE/);
});

test('orchestration is a Planner-selected override with bounded parent and worker ownership', () => {
  const planner = policy('PLANNER.md');
  const codex = policy('CODEX.md');
  const reviewer = policy('REVIEWER.md');

  assert.match(planner, /## Execution-shape planning/);
  assert.match(planner, /Select ORCHESTRATED only when/);
  assert.match(planner, /read `policy\/CODEX\.md#ORCHESTRATION#`/);

  assert.match(codex, /#ORCHESTRATION#/);
  assert.match(codex, /## Orchestration planning/);
  assert.match(codex, /Parallel workers may share read dependencies but must not hold overlapping active write claims/);
  assert.match(codex, /parent orchestrator owns task-close/);
  assert.match(codex, /Subordinate workers do not open independent parent closure lifecycles/);

  assert.match(reviewer, /parent plan is the implementation contract/i);
  assert.match(reviewer, /Worker assignments and handoffs are supporting execution evidence/i);
});

test('FIX returns redesign decisions to planning and universal safety preservation lives in AGENTS', () => {
  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  const fix = policy('FIX.md');

  assert.match(fix, /requires a new product or workflow decision rather than restoration/);
  assert.match(fix, /return that decision to ChatGPT planning/);
  assert.equal((agents.match(/SAFETY EXCEPTION/g) || []).length, 1);
  assert.match(agents, /must not be removed, weakened, or rewritten/);
});

test('the active Codex close-out path uses task-close without retired role routing', () => {
  const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
  const taskClose = readFileSync(join(ROOT, 'scripts/task-close.mjs'), 'utf8');

  assert.match(taskClose, /function taskCloseIntake/);
  assert.doesNotMatch(taskClose, /context-query\.mjs|context-routing\.mjs|scopeContext|routeSourcePath/);
  assert.doesNotMatch(
    agents,
    /client-engineer|server-engineer|fullstack-coordinator|infra-engineer|qa-engineer|update-docs/
  );
});

test('active KB Tree policy grants match the Planner-to-plan-to-Codex architecture', () => {
  const automation = readFileSync(join(ROOT, 'KB/docs/context/automation.md'), 'utf8');
  const site = readFileSync(join(ROOT, 'KB/docs/context/site.md'), 'utf8');

  assert.match(automation, /id: automation\.planning\.phase2/);
  assert.match(automation, /source: AGENTS\.md#Codex universal policy/);
  assert.match(automation, /source: policy\/PLANNER\.md#Standard Phase 2 format/);
  assert.match(automation, /source: policy\/CODEX\.md#Orchestration planning/);

  assert.doesNotMatch(automation, /source: AGENTS\.md#Route/);
  assert.doesNotMatch(automation, /policy\/CODEX\.md#KB retrieval transport/);
  assert.doesNotMatch(automation, /policy\/CODEX\.md#Provider-visible I\/O discipline/);
  assert.doesNotMatch(automation, /policy\/CODEX\.md#Orchestration execution/);
  assert.doesNotMatch(automation, /policy\/PLANNER\.md#Execution mode planning/);

  assert.doesNotMatch(automation, /policy\/AGENTS\.md/);
  assert.doesNotMatch(site, /source: site\/docs\//);
});

test('