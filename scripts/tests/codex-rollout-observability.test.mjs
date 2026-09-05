import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { executeCommand } from '../agent-observability.mjs';
import { handleHook } from '../codex-observability-hook.mjs';
import { codexRolloutUsage } from '../lib/agent-observability/codex-rollout.mjs';
import { detectCandidates } from '../lib/agent-observability/flagging.mjs';
import { renderWeeklyReport } from '../lib/agent-observability/report.mjs';
import { bindActiveTask, readTaskBundle, requestActiveTaskFinalization } from '../lib/agent-observability/state.mjs';
import { buildTaskTelemetry } from '../lib/agent-observability/task-telemetry.mjs';

function temporaryDirectory(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function usage(input, cached, output, reasoning, total) {
  return {
    input_tokens: input,
    cached_input_tokens: cached,
    cache_write_input_tokens: 0,
    output_tokens: output,
    reasoning_output_tokens: reasoning,
    total_tokens: total,
  };
}

function rolloutRecord(timestamp, type, payload) {
  return JSON.stringify({ timestamp, type, payload });
}

function tokenPayload(totalUsage, lastUsage = totalUsage) {
  return { type: 'token_count', info: { total_token_usage: totalUsage, last_token_usage: lastUsage } };
}

function writeRolloutFixture(codexHome) {
  const directory = join(codexHome, 'sessions', '2026', '08', '28');
  mkdirSync(directory, { recursive: true });
  const rootPath = join(directory, 'rollout-root-session-root.jsonl');
  const childPath = join(directory, 'rollout-child-session-child.jsonl');
  writeFileSync(rootPath, [
    rolloutRecord('2026-08-28T00:00:00.000Z', 'session_meta', { id: 'session-root', parent_thread_id: null }),
    rolloutRecord('2026-08-28T00:01:00.000Z', 'event_msg', { type: 'task_started' }),
    rolloutRecord('2026-08-28T00:02:00.000Z', 'event_msg', tokenPayload(usage(900, 500, 100, 20, 1000))),
    rolloutRecord('2026-08-28T00:03:00.000Z', 'event_msg', { type: 'task_complete' }),
    rolloutRecord('2026-08-28T00:10:00.000Z', 'event_msg', { type: 'task_started' }),
    JSON.stringify({ timestamp: '2026-08-28T00:11:00.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: 'secret prompt content' } }),
    rolloutRecord('2026-08-28T00:10:30.000Z', 'event_msg', tokenPayload(usage(1080, 600, 120, 22, 1200), usage(180, 100, 20, 2, 200))),
    rolloutRecord('2026-08-28T00:12:00.000Z', 'event_msg', tokenPayload(usage(1450, 900, 150, 30, 1600), usage(550, 400, 50, 10, 600))),
    rolloutRecord('2026-08-28T00:12:30.000Z', 'event_msg', tokenPayload(usage(1540, 950, 160, 32, 1700), usage(640, 450, 60, 12, 700))),
  ].join('\n') + '\n');
  writeFileSync(childPath, [
    rolloutRecord('2026-08-28T00:10:30.000Z', 'session_meta', { id: 'session-child', parent_thread_id: 'session-root' }),
    rolloutRecord('2026-08-28T00:10:31.000Z', 'event_msg', { type: 'task_started' }),
    rolloutRecord('2026-08-28T00:11:30.000Z', 'event_msg', tokenPayload(usage(180, 100, 20, 5, 200))),
    rolloutRecord('2026-08-28T00:11:31.000Z', 'event_msg', { type: 'task_complete' }),
  ].join('\n') + '\n');
  return { rootPath, childPath };
}

test('Codex rollout adapter subtracts the prior task and includes child sessions once', () => {
  const codexHome = temporaryDirectory('corp-codex-home-');
  try {
    const { rootPath } = writeRolloutFixture(codexHome);
    const result = codexRolloutUsage('session-root', {
      env: { CODEX_HOME: codexHome },
      transcriptPath: rootPath,
      until: '2026-08-28T00:13:00.000Z',
      boundAt: '2026-08-28T00:11:00.000Z',
      evidence: [{ kind: 'tool', stage: 'implementation', occurred_at: '2026-08-28T00:12:15.000Z' }],
    });

    assert.equal(result.status, 'exact');
    assert.equal(result.events.length, 4);
    assert.equal(result.events.filter(event => event.agent_id === 'session-root').reduce((total, event) => total + event.usage.total_tokens, 0), 700);
    assert.equal(result.events.find(event => event.agent_id === 'session-child').usage.total_tokens, 200);
    assert.equal(result.events.find(event => event.stage === 'retrieval_context').usage.total_tokens, 200);
    assert.equal(result.events.find(event => event.stage === 'implementation').usage.total_tokens, 400);
    assert.equal(result.events.find(event => event.terminal).usage.total_tokens, 100);
    assert.equal(result.events.reduce((total, event) => total + event.usage.total_tokens, 0), 900);
    assert.doesNotMatch(JSON.stringify(result), /secret prompt content/);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
  }
});

test('Stop hook settles exact root and child rollout usage and repairs worker count', () => {
  const codexHome = temporaryDirectory('corp-codex-home-');
  const state = temporaryDirectory('corp-observability-');
  const taskId = 'rollout-hook-task';
  try {
    const { rootPath } = writeRolloutFixture(codexHome);
    executeCommand('start', { task_id: taskId, label: 'Rollout hook task', task_type: 'repository_task' }, { stateDir: state });
    executeCommand('close', { task_id: taskId, outcome: 'completed', verification: 'passed', telemetry: {} }, { stateDir: state });
    bindActiveTask(state, 'session-root', taskId, { now: '2026-08-28T00:11:00.000Z' });
    requestActiveTaskFinalization(state, 'session-root', taskId, { now: '2026-08-28T00:12:45.000Z' });
    const settled = handleHook({
      session_id: 'session-root',
      turn_id: 'turn-root',
      hook_event_name: 'Stop',
      model: 'gpt-5.6-sol',
      transcript_path: rootPath,
    }, {
      stateDir: state,
      env: { CODEX_HOME: codexHome },
      configText: 'model_reasoning_effort = "high"',
      now: '2026-08-28T00:13:00.000Z',
    });
    const bundle = readTaskBundle(state, taskId);

    assert.equal(settled.status, 'settled');
    assert.equal(bundle.final.status, 'exact');
    assert.equal(bundle.final.final_inclusive_provider_tokens, 900);
    assert.equal(bundle.final.telemetry.worker_count, 2);
    assert.equal(bundle.final.stage_totals.retrieval_context, 200);
    assert.equal(bundle.final.stage_totals.closeout, 100);
    assert.equal(bundle.final.stage_totals.other, 600);
    assert.equal(bundle.events.length, 4);
  } finally {
    rmSync(codexHome, { recursive: true, force: true });
    rmSync(state, { recursive: true, force: true });
  }
});

test('hook-derived retrieval telemetry recognizes exact concepts without false multi-concept candidates', () => {
  const state = temporaryDirectory('corp-observability-');
  const taskId = 'retrieval-hook-task';
  try {
    executeCommand('start', { task_id: taskId, label: 'Retrieval hook task', task_type: 'repository_task' }, { stateDir: state });
    bindActiveTask(state, 'retrieval-session', taskId);
    handleHook({
      session_id: 'retrieval-session',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_use_id: 'route-a',
      tool_input: { command: 'node scripts/context.mjs concept-route automation.observability.usage' },
      tool_response: { output: 'status: matched\nsecret output' },
    }, { stateDir: state, env: {} });
    handleHook({
      session_id: 'retrieval-session',
      hook_event_name: 'PostToolUse',
      tool_name: 'Bash',
      tool_use_id: 'read-b',
      tool_input: { command: 'node scripts/context.mjs concept-read automation.observability.flags' },
      tool_response: { output: 'status: matched' },
    }, { stateDir: state, env: {} });
    handleHook({
      session_id: 'retrieval-session', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'missing-c',
      tool_input: { command: 'node scripts/context.mjs concept-route missing.exact.concept' },
      tool_response: { output: 'status: concept-unmapped' },
    }, { stateDir: state, env: {} });
    handleHook({
      session_id: 'retrieval-session', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'recover-c',
      tool_input: { command: 'node scripts/context.mjs concept-read missing.exact.concept' },
      tool_response: { output: 'status: matched' },
    }, { stateDir: state, env: {} });
    handleHook({
      session_id: 'retrieval-session', hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_use_id: 'bundle-d',
      tool_input: { command: 'node scripts/context.mjs concept-bundle automation.observability.binding' },
      tool_response: { output: 'status: matched' },
    }, { stateDir: state, env: {} });
    const evidence = readTaskBundle(state, taskId).evidence;
    const telemetry = buildTaskTelemetry({
      domains: [],
      changed_paths: [],
      documented_paths: [],
      retrieval: { fallbacks: [] },
    }, { status: 'passed', steps: [] }, evidence, { domainFor: () => 'other', receiptHash: 'receipt' });

    assert.deepEqual(evidence.map(item => item.name).sort(), [
      'concept_concept_bundle_matched',
      'concept_concept_read_matched',
      'concept_concept_read_matched',
      'concept_concept_route_concept_unmapped',
      'concept_concept_route_matched',
    ]);
    assert.equal(telemetry.retrieval.concept_operations, 5);
    assert.equal(telemetry.retrieval.same_concept_retries, 1);
    assert.equal(telemetry.retrieval.defects, 1);
    assert.equal(telemetry.retrieval.first_try, false);
    const normal = buildTaskTelemetry({ domains: [], changed_paths: [], documented_paths: [], retrieval: { fallbacks: [] } }, { status: 'passed', steps: [] }, evidence.slice(0, 2), { domainFor: () => 'other', receiptHash: 'receipt' });
    assert.equal(normal.retrieval.first_try, true);
    assert.deepEqual(detectCandidates(normal), []);
    assert.doesNotMatch(JSON.stringify(evidence), /missing\.exact|secret output|concept-read/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('hooks retain human workflow phases without retaining command or patch content', () => {
  const state = temporaryDirectory('corp-observability-');
  const taskId = 'phase-hook-task';
  try {
    executeCommand('start', { task_id: taskId, label: 'Phase hook task', task_type: 'repository_task' }, { stateDir: state });
    bindActiveTask(state, 'phase-session', taskId);
    const events = [
      { tool_use_id: 'read', tool_name: 'Bash', tool_input: { command: 'rg secret-anchor scripts/' } },
      { tool_use_id: 'edit', tool_name: 'apply_patch', tool_input: '*** Update File: scripts/example.mjs\nsecret patch' },
      { tool_use_id: 'inspect', tool_name: 'Bash', tool_input: { command: 'git status --short' } },
      { tool_use_id: 'docs', tool_name: 'apply_patch', tool_input: '*** Update File: KB/docs/context/automation.md\nsecret docs' },
      { tool_use_id: 'test', tool_name: 'Bash', tool_input: { command: 'node --test scripts/tests/example.test.mjs' } },
      { tool_use_id: 'map', tool_name: 'apply_patch', tool_input: '*** Update File: KB/docs/context/map/concept/automation.md\nsecret map' },
      { tool_use_id: 'other', tool_name: 'Bash', tool_input: { command: 'node scripts/unknown-tool.mjs' } },
    ];
    events.forEach((event, index) =>
      handleHook({ session_id: 'phase-session', hook_event_name: 'PostToolUse', tool_response: { success: true }, ...event }, {
        stateDir: state,
        env: {},
        now: `2026-08-28T00:00:0${index}.000Z`,
      }));
    const evidence = readTaskBundle(state, taskId).evidence.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

    assert.deepEqual(evidence.map(item => item.stage), [
      'retrieval_context',
      'implementation',
      'retrieval_context',
      'documentation',
      'verification',
      'generated_output',
      'other',
    ]);
    assert.doesNotMatch(JSON.stringify(evidence), /secret-anchor|secret patch|secret docs|git status|node --test/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

function reportBundle(index, flags) {
  const taskId = `recurrence-task-${index}`;
  return {
    meta: { task_id: taskId, label: `Task ${index}`, task_type: 'repository_task', complexity: 'C2' },
    events: [{ model_family: 'sol', effort: 'high', terminal: true, occurred_at: '2026-08-28T00:00:00.000Z' }],
    flags,
    final: {
      status: 'exact',
      outcome: 'completed',
      verification: 'passed',
      final_inclusive_provider_tokens: 100,
      known_provider_tokens: 100,
      stage_totals: { other: 100 },
      telemetry: { retrieval: { concept_operations: 1, first_try: false, fallbacks: 1 }, implementation: { rework_cycles: 0 } },
    },
  };
}

function recurrenceFlag(taskId, occurredAt, { formal = false, status = 'observation' } = {}) {
  return {
    flag_id: `${formal ? 'WF' : 'C'}-${'f'.repeat(12)}`,
    fingerprint: 'f'.repeat(64),
    task_id: taskId,
    stage: 'retrieval_context',
    severity: 'high',
    confidence: formal ? 'high' : 'unknown',
    improvement: 'repair the retrieval route',
    status,
    occurred_at: occurredAt,
  };
}

test('later candidates reopen a validated retrieval flag and count unique task occurrences', () => {
  const firstId = 'recurrence-task-1';
  const bundles = [
    reportBundle(1, [
      recurrenceFlag(firstId, '2026-08-28T00:01:00.000Z'),
      recurrenceFlag(firstId, '2026-08-28T00:02:00.000Z', { formal: true, status: 'validated_change' }),
    ]),
    reportBundle(2, [recurrenceFlag('recurrence-task-2', '2026-08-28T00:03:00.000Z')]),
    reportBundle(3, [recurrenceFlag('recurrence-task-3', '2026-08-28T00:04:00.000Z')]),
    reportBundle(4, [recurrenceFlag('recurrence-task-4', '2026-08-28T00:05:00.000Z')]),
  ];
  const report = renderWeeklyReport(bundles, '2026-W35');

  assert.match(report, /\| WF-ffffff \| Context and research \| High \/ high \| 4 \| repair the retrieval route \| Recurring \|/);
  assert.doesNotMatch(report, /\| 1 \| repair the retrieval route \| Validated change \|/);
});
