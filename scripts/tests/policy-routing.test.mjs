import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';

const ROOT = resolve('.');
const read = path => readFileSync(join(ROOT, path), 'utf8');

function filesBelow(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap(entry => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? filesBelow(child) : [child];
  });
}

function markerSection(source, marker) {
  const start = source.indexOf(`\n${marker}\n`);
  assert.notEqual(start, -1, `missing ${marker}`);
  const bodyStart = start + marker.length + 2;
  const next = source.slice(bodyStart).search(/\n#[A-Z][A-Z-]*#\n/);
  return source.slice(start, next === -1 ? undefined : bodyStart + next);
}

test('universal policy excludes optional process routing', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /approved Phase 2 plan/);
  assert.match(agents, /smallest bounded reads and compact tool outputs/);
  assert.match(agents, /durable repository contract/);
  assert.match(agents, /verification required by the approved plan/);
  assert.match(agents, /SAFETY EXCEPTION/);

  for (const pattern of [
    /task[-_ ]close/i,
    /task[-_ ]ownership/i,
    /telemetry/i,
    /qa[-_ ]receipt/i,
    /orchestrat/i,
    /strict[-_ ]execution/i,
    /process profile/i,
    /Execution Overrides/i,
  ]) assert.doesNotMatch(agents, pattern);
});

test('Planner compiles the seven-section handoff and optional policy instead of Codex routing policy files', () => {
  const planner = read('policy/PLANNER.md');
  assert.match(planner, /## Policy selection/);
  assert.match(planner, /## Defaults and selected policy/);
  assert.match(planner, /## Standard Phase 2 format/);
  for (const heading of [
    '## 1. Intended Behavior',
    '## 2. Task-Specific Policy',
    '## 3. Context',
    '## 4. Expected Write Scope',
    '## 5. Implementation',
    '## 6. Verification',
    '## 7. Done Criteria',
  ]) assert.match(planner, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

  const codex = read('policy/CODEX.md');
  assert.match(codex, /Planner-side policy source/);
  assert.match(codex, /Normal Codex execution does not read this file/);
  assert.doesNotMatch(read('AGENTS.md'), /policy\/(?:CODEX|IMPLEMENT|FIX)\.md/);
});

test('Planner-selected agent processes use exact overrides while orchestration remains a reasoning shape', () => {
  const planner = read('policy/PLANNER.md');
  const codex = read('policy/CODEX.md');
  const router = markerSection(codex, '#PROCESS-ROUTER#');
  const telemetry = markerSection(codex, '#TELEMETRY#');

  assert.match(planner, /Normal single-run execution and default-OFF processes are implicit and omitted/);
  assert.match(planner, /every selected non-default process, encode its effective value exactly once under `## Execution Overrides`/i);
  assert.match(planner, /Do not encode default values/);
  assert.match(planner, /Orchestration is a parent reasoning\/execution shape, not a deterministic scope lifecycle/);
  assert.match(planner, /state `Execution shape: ORCHESTRATED` exactly once/);
  assert.match(planner, /If telemetry is selected ON, the plan must contain exactly one `telemetry=ON` assignment/);
  assert.match(planner, /If explicitly disabled, encode `plan_archival=OFF` exactly once/);

  assert.match(router, /Default values are omitted completely/);
  assert.match(router, /Every agent-supported process whose effective value differs from its repository default must appear exactly once under `## Execution Overrides`/);
  assert.match(router, /`<process_name>=ON` or `<process_name>=OFF`/);
  assert.match(router, /telemetry selected ON → `telemetry=ON`/);
  assert.match(router, /plan archival explicitly disabled → `plan_archival=OFF`/);
  assert.doesNotMatch(router, /task[_-](?:ownership|close)/i);
  assert.doesNotMatch(codex, /^#TASK-(?:OWNERSHIP|CLOSE)#$/m);
  assert.match(telemetry, /exactly one `telemetry=ON` assignment under `## Execution Overrides`/);

  const everythingOn = router.slice(router.indexOf('For "Everything ON"'), router.indexOf('`plan_archival=ON` remains implicit'));
  assert.deepEqual([...everythingOn.matchAll(/^\s*- `([a-z_]+)=ON`$/gm)].map(match => match[1]), [
    'telemetry',
    'workflow_inefficiency_flagging',
    'qa',
    'qa_coverage',
    'qa_receipt',
  ]);
  assert.doesNotMatch(everythingOn, /plan_archival=ON/);
});

test('agent policies retire lifecycle routing while retaining parent-reasoned orchestration', () => {
  const planner = read('policy/PLANNER.md');
  const codex = read('policy/CODEX.md');
  const reviewer = read('policy/REVIEWER.md');

  for (const source of [planner, codex, reviewer]) {
    assert.doesNotMatch(source, /task[-_ ]ownership/i);
    assert.doesNotMatch(source, /task[-_ ]close/i);
    assert.doesNotMatch(source, /orchestration[-_ ]scope/i);
  }
  assert.match(planner, /Orchestration is a parent reasoning\/execution shape/);
  assert.match(codex, /The parent coordinates worker sequencing, handoffs, overlap avoidance, and final integration through its reasoning/);
  assert.match(reviewer, /approved parent plan is the implementation contract/);
});

test('Planner-side policy sources contain no runtime skill route', () => {
  for (const path of ['policy/CODEX.md', 'policy/IMPLEMENT.md', 'policy/FIX.md']) {
    const source = read(path);
    assert.doesNotMatch(source, /(?:\.claude|\.agents)\/skills|SKILL\.md|skill[-_ ]route/i, path);
  }
});

test('contextualization prefers direct source evidence and keeps worker returns compact', () => {
  const chatgpt = read('policy/CHATGPT.md');
  const planner = read('policy/PLANNER.md');
  const codex = read('policy/CODEX.md');
  const automation = read('KB/docs/context/automation.md');
  const workflow = read('KB/workflow/top-or-drop-workflow.md');
  const orchestration = markerSection(codex, '#ORCHESTRATION#');

  assert.match(chatgpt, /Prefer direct local\/workspace repository search and bounded reads/);
  assert.match(chatgpt, /Read a known exact path, symbol, or bounded section directly/);
  assert.match(planner, /Source paths may come from direct repository search\/read and do not require a prior KB grant/);
  assert.match(chatgpt, /Use the repository\/GitHub connector when local repository access is unavailable/);
  assert.doesNotMatch(chatgpt, /prefer the available repository\/GitHub connector/i);
  assert.match(planner, /If no KB semantic context was materially required, state `None required`/);
  assert.match(planner, /If none are needed, state `None required`/);

  for (const source of [orchestration, automation, workflow]) {
    assert.match(source, /compact integration summary/);
    assert.match(source, /completion status, files changed,[\s\S]*verification performed and result,[\s\S]*material interface\/invariant notes, and blockers/);
    assert.match(source, /do not\s+return full transcripts,[\s\S]*duplicated task\/source context, or long logs/i);
  }
});

test('retired active skill trees and active policy, adapter, and workflow surfaces have no skill path route', () => {
  assert.equal(existsSync(join(ROOT, '.claude/skills')), false);
  assert.equal(existsSync(join(ROOT, '.agents/skills')), false);
  for (const path of [
    'CLAUDE.md',
    'KB/workflow/top-or-drop-workflow.md',
    '.codex/telemetry-hooks.json',
    'scripts/codex-task-run.mjs',
    'scripts/codex-observability-hook.mjs',
    ...filesBelow(join(ROOT, 'policy')).map(path => path.slice(ROOT.length + 1)),
  ]) assert.doesNotMatch(read(path), /(?:\.claude|\.agents)\/skills|SKILL\.md/i, path);
});

test('workflow documents the three authority layers and default-OFF invisibility', () => {
  const workflow = read('KB/workflow/top-or-drop-workflow.md');
  assert.match(workflow, /## A\. Three authority layers/);
  assert.match(workflow, /AGENTS\.md → approved Phase 2 plan/);
  assert.match(workflow, /Default-OFF means invisible to Codex/);
  assert.match(workflow, /Plan archival is a default deterministic completion mechanic/);
  assert.doesNotMatch(workflow, /AGENTS\.md → CODEX\.md/);
});

test('telemetry hooks stay opt-in and outside the auto-discovered project path', () => {
  assert.equal(existsSync(join(ROOT, '.codex/hooks.json')), false);
  const template = JSON.parse(read('.codex/telemetry-hooks.json'));
  assert.match(template.description, /telemetry-enabled Codex tasks/);
  assert.deepEqual(Object.keys(template.hooks).sort(), ['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop']);
});
