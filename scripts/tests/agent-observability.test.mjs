import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { executeBestEffort, executeCommand } from '../agent-observability.mjs';
import { handleHook } from '../codex-observability-hook.mjs';
import { buildAnalytics, boundedAnalyticsAggregate, compareWindows, overheadCircuitBreaker } from '../lib/agent-observability/analytics.mjs';
import { createFormalFlag, detectCandidates, flagEligibility } from '../lib/agent-observability/flagging.mjs';
import { renderPublicReport, exportPublicReport } from '../lib/agent-observability/public-export.mjs';
import { buildWeeklyReportParts, displayStageGroups, renderWeeklyReport } from '../lib/agent-observability/report.mjs';
import { modelFamily, resolveRuntimeIdentity } from '../lib/agent-observability/runtime.mjs';
import { sanitizeClose, sanitizeMeta, sanitizeTelemetry } from '../lib/agent-observability/schema.mjs';
import { bindActiveTask, readHookHealth, readTaskBundle, recordEvent, requestActiveTaskFinalization, resolveStateDir, startTask } from '../lib/agent-observability/state.mjs';
import { aggregateUsage, assessRuntimeCapabilities, normalizeUsageEvent } from '../lib/agent-observability/usage.mjs';

const ROOT = resolve('.');
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/agent-observability/provider-events.json'), 'utf8'));

function temporaryState() {
  return mkdtempSync(join(tmpdir(), 'corp-observability-'));
}

function eventProcess(state, input) {
  return new Promise(resolveProcess => {
    const child = spawn(process.execPath, [
      'scripts/agent-observability.mjs',
      'event',
      '--state-dir', state,
      '--json', JSON.stringify(input),
    ], { cwd: ROOT });
    let output = '';
    let error = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { error += chunk; });
    child.on('close', code => resolveProcess({ code, output, error }));
  });
}

function closeInput(taskId = FIXTURE.task.task_id) {
  return {
    task_id: taskId,
    outcome: 'completed',
    verification: 'passed',
    telemetry: {
      tools: { calls: 6, failures: 0, retries: 1 },
      retrieval: { attempts: 1, expansions: 0, fallbacks: 0, first_try: true },
      skills: ['infra-engineer', 'qa-engineer'],
      worker_count: 1,
      files: { inspected: 8, modified: 4, domains: { tooling: 4 } },
      iterations: { implementation: 1, rework: 0 },
      checks: { run: 3, failures: 0, retests: 0 },
      documentation: { files: 1, updates: 1 },
      task_close: { status: 'passed', receipt_hash: 'abc123' },
    },
    closed_at: '2026-08-26T00:05:30.000Z',
  };
}

function normalizedFixtureEvents() {
  return FIXTURE.events.map(event => normalizeUsageEvent(event));
}

function bundle(index, { total = 10_000, taskType = 'bug_fix', complexity = 'C3', verification = 'passed' } = {}) {
  const taskId = `public-task-${index}`;
  return {
    meta: {
      schema_version: 2,
      task_id: taskId,
      root_task_id: taskId,
      parent_task_id: null,
      started_at: '2026-08-26T00:00:00.000Z',
      label: `Private task label ${index}`,
      task_type: taskType,
      complexity,
      complexity_reason: null,
      domains: ['tooling'],
      status: 'open',
    },
    events: [{
      usage_event_id: `public-event-${index}`,
      provider: 'private-provider',
      model: 'private-model',
      model_family: 'sol',
      effort: 'high',
      terminal: true,
      occurred_at: '2026-08-26T00:10:00.000Z',
    }],
    flags: [],
    final: {
      schema_version: 2,
      task_id: taskId,
      status: 'exact',
      outcome: 'completed',
      verification,
      finalized_at: '2026-08-26T00:10:00.000Z',
      telemetry: sanitizeTelemetry({ retrieval: { attempts: 1, first_try: true } }),
      final_inclusive_provider_tokens: total,
      known_provider_tokens: total,
      observability_provider_tokens: 100,
      observability_kind: 'exact',
      stage_totals: {
        intake: 0,
        retrieval_context: 2000,
        planning: 1000,
        implementation: 5000,
        verification: 1000,
        documentation: 500,
        closeout: 500,
        flagging: 0,
        analytics: 0,
        other: 0,
      },
      reasons: [],
    },
  };
}

test('runtime doctor enables exact mode only with all required capabilities', () => {
  assert.equal(assessRuntimeCapabilities(FIXTURE.capabilities).exact_mode, true);
  assert.deepEqual(
    assessRuntimeCapabilities({ ...FIXTURE.capabilities, terminal_callback: false }).missing,
    ['terminal_callback'],
  );
  assert.equal(assessRuntimeCapabilities({ ...FIXTURE.capabilities, child_usage: false }).exact_mode, false);
});

test('runtime identity uses the active hook model and effective configured effort', () => {
  const identity = resolveRuntimeIdentity({ model: 'gpt-5.6-sol' }, {
    env: {},
    configText: 'model = "gpt-5.6-terra"\nmodel_reasoning_effort = "high"\n[features]\nhooks = true\n',
  });

  assert.equal(identity.model, 'gpt-5.6-sol');
  assert.equal(identity.model_source, 'hook');
  assert.equal(identity.model_family, 'sol');
  assert.equal(identity.effort, 'high');
  assert.equal(identity.effort_source, 'config');
  assert.equal(modelFamily('gpt-5.6-terra'), 'terra');
});

test('inclusive usage counts unique events and does not add cache or reasoning subsets', () => {
  const events = normalizedFixtureEvents();
  const result = aggregateUsage([...events, events[0]]);

  assert.equal(result.status, 'exact');
  assert.equal(result.event_count, 8);
  assert.equal(result.final_inclusive_provider_tokens, FIXTURE.expected.final_inclusive_provider_tokens);
  assert.equal(result.observability_provider_tokens, FIXTURE.expected.observability_provider_tokens);
  assert.deepEqual(result.stage_totals, FIXTURE.expected.stage_totals);
  assert.equal(events[2].normalization_method, 'derived_disjoint');
  assert.equal(events[2].normalized_total_tokens, 150);
  assert.throws(
    () => normalizeUsageEvent({
      ...FIXTURE.events[2],
      usage_event_id: 'bad-additive-fields',
      usage: { input_tokens: 100, output_tokens: 50, reasoning_tokens: 25, additive_fields: ['input_tokens', 'output_tokens', 'reasoning_tokens'] },
    }),
    /requires disjoint input_tokens and output_tokens/,
  );
});

test('missing usage or terminal settlement is partial rather than fabricated', () => {
  const unavailable = normalizeUsageEvent({
    ...FIXTURE.events[0],
    usage_event_id: 'event-unavailable',
    usage: {},
    terminal: true,
  });
  const result = aggregateUsage([unavailable]);

  assert.equal(result.status, 'partial');
  assert.equal(result.final_inclusive_provider_tokens, null);
  assert.ok(result.reasons.includes('usage_unavailable:event-unavailable'));
  assert.equal(aggregateUsage(normalizedFixtureEvents().slice(0, -1)).reasons.includes('terminal_event_missing'), true);
});

test('private schemas reject raw or sensitive fields', () => {
  assert.throws(
    () => sanitizeMeta({ ...FIXTURE.task, prompt: 'raw user text' }, { taskId: FIXTURE.task.task_id }),
    /prohibited fields/,
  );
  assert.throws(
    () => sanitizeMeta({ ...FIXTURE.task, label: '/home/person/private task' }, { taskId: FIXTURE.task.task_id }),
    /sensitive text/,
  );
  assert.throws(
    () => sanitizeMeta({ ...FIXTURE.task, label: 'line one\nline two' }, { taskId: FIXTURE.task.task_id }),
    /control characters/,
  );
  assert.throws(
    () => sanitizeTelemetry({ tool_output: 'raw log' }),
    /prohibited fields/,
  );
  assert.throws(
    () => sanitizeMeta({
      ...FIXTURE.task,
      label: 'L'.repeat(120),
      complexity_reason: 'R'.repeat(120),
      domains: Array.from({ length: 8 }, (_, index) => `domain_${index}_${'x'.repeat(38)}`),
    }, { taskId: FIXTURE.task.task_id }),
    /judgment sidecar exceeds 512 bytes/,
  );
});

test('state writes are idempotent and quarantine conflicting immutable events', () => {
  const state = temporaryState();
  try {
    startTask(state, FIXTURE.task);
    const event = normalizeUsageEvent(FIXTURE.events[0]);
    assert.equal(recordEvent(state, event).status, 'written');
    assert.equal(recordEvent(state, event).status, 'duplicate');
    assert.throws(
      () => recordEvent(state, { ...event, normalized_total_tokens: event.normalized_total_tokens + 1 }),
      /quarantined/,
    );
    assert.equal(readdirSync(join(state, 'quarantine')).length, 1);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('concurrent immutable event writers cannot silently overwrite each other', async () => {
  const state = temporaryState();
  try {
    startTask(state, FIXTURE.task);
    const first = { ...FIXTURE.events[0], usage_event_id: 'event-race' };
    const second = { ...first, usage: { ...first.usage, total_tokens: first.usage.total_tokens + 1 } };
    const results = await Promise.all([eventProcess(state, first), eventProcess(state, second)]);

    assert.deepEqual(results.map(result => result.code).sort(), [0, 1]);
    assert.equal(readdirSync(join(state, 'quarantine')).length, 1);
    assert.equal(readTaskBundle(state, FIXTURE.task.task_id).events.length, 1);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('best-effort host mode skips telemetry failures without retrying the user task', () => {
  assert.deepEqual(executeBestEffort('start', { prompt: 'prohibited' }), {
    schema_version: 2,
    status: 'skipped',
    reason: 'telemetry_failure',
    retry: false,
  });
});

test('close then post-terminal finalize writes exact record and simple weekly report', () => {
  const state = temporaryState();
  try {
    executeCommand('start', FIXTURE.task, { stateDir: state });
    for (const event of FIXTURE.events) executeCommand('event', event, { stateDir: state });
    const pending = executeCommand('close', closeInput(), { stateDir: state });
    assert.equal(pending.status, 'pending');
    const final = executeCommand('finalize', {
      task_id: FIXTURE.task.task_id,
      finalized_at: '2026-08-26T00:06:30.000Z',
    }, { stateDir: state });

    assert.equal(final.status, 'exact');
    assert.equal(final.final_inclusive_provider_tokens, 2250);
    assert.equal(final.observability_provider_tokens, 240);
    assert.equal(final.reports.length, 1);
    const report = readFileSync(final.reports[0], 'utf8');
    assert.match(report, /^<!-- PRIVATE GENERATED/m);
    assert.match(report, /Fixture observability task/);
    assert.match(report, /\| 2\.3k \| 240 \| 1\.0k \| 400 \| 150 \| 700 \|/);
    const repeated = executeCommand('finalize', { task_id: FIXTURE.task.task_id }, { stateDir: state });
    assert.equal(repeated.final_inclusive_provider_tokens, 2250);
    assert.equal(repeated.reports.length, 1);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('task lifecycle represents clarification, replacement, follow-up, and terminal outcomes', () => {
  const state = temporaryState();
  try {
    assert.equal(executeCommand('start', FIXTURE.task, { stateDir: state }).status, 'written');
    assert.equal(executeCommand('start', FIXTURE.task, { stateDir: state }).status, 'duplicate');
    for (const event of FIXTURE.events) executeCommand('event', event, { stateDir: state });
    const replaced = executeCommand('close', { ...closeInput(), outcome: 'replaced' }, { stateDir: state });
    assert.equal(replaced.outcome, 'replaced');
    assert.equal(executeCommand('finalize', { task_id: FIXTURE.task.task_id }, { stateDir: state }).status, 'exact');

    const followUp = executeCommand('start', {
      ...FIXTURE.task,
      task_id: 'task-follow-up',
      parent_task_id: FIXTURE.task.task_id,
      started_at: '2026-08-26T01:00:00.000Z',
    }, { stateDir: state });
    assert.equal(followUp.task_id, 'task-follow-up');
    assert.equal(readTaskBundle(state, 'task-follow-up').meta.parent_task_id, FIXTURE.task.task_id);
    for (const outcome of ['cancelled', 'blocked', 'failed'])
      assert.equal(sanitizeClose({ ...closeInput('task-follow-up'), outcome }).outcome, outcome);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('explicit partial finalization preserves known usage and reason', () => {
  const state = temporaryState();
  try {
    executeCommand('start', FIXTURE.task, { stateDir: state });
    executeCommand('event', {
      ...FIXTURE.events.at(-1),
      usage_event_id: 'partial-terminal',
      usage: {},
    }, { stateDir: state });
    executeCommand('close', closeInput(), { stateDir: state });
    assert.throws(
      () => executeCommand('finalize', { task_id: FIXTURE.task.task_id }, { stateDir: state }),
      /usage is not exact/,
    );
    const final = executeCommand('finalize', {
      task_id: FIXTURE.task.task_id,
      partial_reason: 'provider_usage_unavailable',
    }, { stateDir: state });
    assert.equal(final.status, 'partial');
    assert.equal(final.final_inclusive_provider_tokens, null);
    assert.ok(final.reasons.includes('provider_usage_unavailable'));
    const bundle = readTaskBundle(state, FIXTURE.task.task_id);
    assert.ok(bundle.flags.some(flag => flag.flag_id.startsWith('DQ-') && flag.cause_code === 'provider_usage_unavailable'));
    assert.match(readFileSync(final.reports[0], 'utf8'), /Flags: [1-9]/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('Codex hooks retain bounded metadata and visibly finalize unexposed usage as partial', () => {
  const state = temporaryState();
  const taskId = 'hook-task';
  try {
    executeCommand('start', {
      task_id: taskId,
      label: 'Hook lifecycle task',
      task_type: 'repository_task',
      complexity: 'C2',
      domains: ['tooling'],
    }, { stateDir: state });
    bindActiveTask(state, 'session-hook', taskId);
    executeCommand('close', closeInput(taskId), { stateDir: state });
    handleHook({
      session_id: 'session-hook',
      turn_id: 'turn-hook',
      hook_event_name: 'PostToolUse',
      model: 'gpt-5.6-sol',
      tool_name: 'apply_patch',
      tool_use_id: 'tool-hook',
      tool_input: { command: 'secret patch content' },
      tool_response: { exit_code: 0, output: 'secret tool output' },
    }, { stateDir: state, env: {}, configText: 'model_reasoning_effort = "high"' });
    requestActiveTaskFinalization(state, 'session-hook', taskId);
    const settled = handleHook({
      session_id: 'session-hook',
      turn_id: 'turn-hook',
      hook_event_name: 'Stop',
      model: 'gpt-5.6-sol',
      last_assistant_message: 'secret assistant response',
    }, { stateDir: state, env: {}, configText: 'model_reasoning_effort = "high"' });
    const bundle = readTaskBundle(state, taskId);
    const retained = JSON.stringify(bundle.evidence);

    assert.equal(settled.status, 'settled');
    assert.equal(bundle.final.status, 'partial');
    assert.ok(bundle.final.reasons.includes('codex_hook_token_usage_not_exposed'));
    assert.ok(bundle.flags.some(flag => flag.flag_id.startsWith('DQ-') && flag.cause_code === 'codex_hook_token_usage_not_exposed'));
    assert.doesNotMatch(retained, /secret|command|tool_input|tool_response|assistant/);
    assert.equal(bundle.evidence.some(item => item.kind === 'tool' && item.stage === 'implementation'), true);
    assert.equal(readHookHealth(state, 'session-hook').status, 'healthy');
    assert.equal(readHookHealth(state, 'session-hook').event, 'Stop');
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('Stop hook records exact terminal usage when a host adapter supplies counters', () => {
  const state = temporaryState();
  const taskId = 'hook-host-usage-task';
  try {
    executeCommand('start', { ...FIXTURE.task, task_id: taskId }, { stateDir: state });
    executeCommand('close', closeInput(taskId), { stateDir: state });
    bindActiveTask(state, 'session-host-usage', taskId);
    requestActiveTaskFinalization(state, 'session-host-usage', taskId);
    const settled = handleHook({
      session_id: 'session-host-usage',
      turn_id: 'turn-host-usage',
      hook_event_name: 'Stop',
      model: 'gpt-5.6-sol',
      usage: {
        input_tokens: 100,
        output_tokens: 20,
        total_tokens: 120,
        input_tokens_details: { cached_tokens: 40 },
        output_tokens_details: { reasoning_tokens: 8 },
      },
    }, { stateDir: state, env: {}, configText: 'model_reasoning_effort = "high"' });
    const bundle = readTaskBundle(state, taskId);

    assert.equal(settled.status, 'settled');
    assert.equal(bundle.final.status, 'exact');
    assert.equal(bundle.final.final_inclusive_provider_tokens, 120);
    assert.equal(bundle.events[0].usage.cache_read_tokens, 40);
    assert.equal(bundle.events[0].usage.reasoning_tokens, 8);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('SessionStart hook writes an idle heartbeat without an active task', () => {
  const state = temporaryState();
  try {
    const result = handleHook({
      session_id: 'session-heartbeat',
      hook_event_name: 'SessionStart',
      model: 'gpt-5.6-sol',
      source: 'startup',
    }, { stateDir: state, env: {} });

    assert.equal(result.status, 'ignored');
    assert.equal(readHookHealth(state, 'session-heartbeat').status, 'idle');
    assert.equal(readHookHealth(state, 'session-heartbeat').reason, 'no_active_task');
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('Stop hook preserves exact host usage when a settled terminal event already exists', () => {
  const state = temporaryState();
  const taskId = 'hook-exact-task';
  try {
    executeCommand('start', { ...FIXTURE.task, task_id: taskId }, { stateDir: state });
    executeCommand('event', {
      ...FIXTURE.events.at(-1),
      task_id: taskId,
      root_task_id: taskId,
      usage_event_id: 'host-terminal',
    }, { stateDir: state });
    executeCommand('close', closeInput(taskId), { stateDir: state });
    bindActiveTask(state, 'session-exact', taskId);
    requestActiveTaskFinalization(state, 'session-exact', taskId);
    handleHook({
      session_id: 'session-exact',
      turn_id: 'turn-exact',
      hook_event_name: 'Stop',
      model: 'gpt-5.6-sol',
    }, { stateDir: state, env: {}, configText: 'model_reasoning_effort = "high"' });

    assert.equal(readTaskBundle(state, taskId).final.status, 'exact');
    assert.equal(readTaskBundle(state, taskId).events.length, 1);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('candidate detector is deterministic and bounded to three observations', () => {
  const candidates = detectCandidates(sanitizeTelemetry({
    tools: { failures: 1, retries: 2 },
    retrieval: { attempts: 3, expansions: 2, fallbacks: 1 },
    iterations: { rework: 3 },
    checks: { retests: 3 },
  }));

  assert.equal(candidates.length, 3);
  assert.deepEqual(candidates.map(item => item.issue_code), ['broad_fallback', 'repeated_retrieval', 'tool_retry']);
});

test('candidate retries are idempotent across close-out reruns', () => {
  const state = temporaryState();
  try {
    executeCommand('start', FIXTURE.task, { stateDir: state });
    const input = {
      task_id: FIXTURE.task.task_id,
      telemetry: sanitizeTelemetry({ tools: { failures: 1 } }),
      evidence_event_ids: [],
    };

    assert.equal(executeCommand('candidate', input, { stateDir: state, now: '2026-08-26T00:01:00.000Z' }).status, 'written');
    assert.equal(executeCommand('candidate', input, { stateDir: state, now: '2026-08-26T00:02:00.000Z' }).status, 'duplicate');
    assert.equal(readTaskBundle(state, FIXTURE.task.task_id).flags.length, 1);
    assert.equal(existsSync(join(state, 'quarantine')), false);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('formal flags require allowlisted high effort, an existing turn, evidence, and bounded material', () => {
  const base = {
    task_id: FIXTURE.task.task_id,
    model_family: 'Sol',
    effort: 'high',
    provider_turn_required: true,
    current_run: true,
    stage: 'retrieval_context',
    issue_code: 'broad_fallback',
    cause_code: 'route_miss',
    observation: 'Current retrieval required a broad fallback.',
    severity: 'medium',
    confidence: 'high',
    improvement: 'repair the route and add a retrieval fixture',
    evidence_event_ids: ['event-root'],
    provider_visible_bytes: 800,
  };

  assert.equal(flagEligibility({ model_family: 'Sol', effort: 'high', provider_turn_required: true, candidate: true }).eligible, true);
  assert.equal(flagEligibility({ model_family: 'Sol', effort: 'medium', provider_turn_required: true, candidate: true }).eligible, false);
  assert.equal(createFormalFlag(base).flag_id.startsWith('WF-'), true);
  assert.throws(() => createFormalFlag({ ...base, provider_turn_required: false }), /not eligible/);
  assert.throws(() => createFormalFlag({ ...base, provider_visible_bytes: 1537 }), /exceeds/);
});

test('formal flag evidence must belong to the current task', () => {
  const state = temporaryState();
  try {
    executeCommand('start', FIXTURE.task, { stateDir: state });
    executeCommand('event', FIXTURE.events[0], { stateDir: state });
    const input = {
      task_id: FIXTURE.task.task_id,
      model_family: 'Sol',
      effort: 'high',
      provider_turn_required: true,
      current_run: true,
      stage: 'retrieval_context',
      issue_code: 'broad_fallback',
      cause_code: 'route_miss',
      observation: 'Current retrieval required a broad fallback.',
      severity: 'medium',
      confidence: 'high',
      improvement: 'repair the route and add a retrieval fixture',
      evidence_event_ids: ['missing-event'],
      provider_visible_bytes: 800,
    };
    assert.throws(() => executeCommand('flag', input, { stateDir: state }), /not in the current task/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('display groups reconcile exactly and observability remains a subset', () => {
  const groups = displayStageGroups(FIXTURE.expected.stage_totals);
  assert.equal(Object.values(groups).reduce((total, value) => total + value, 0), 2250);
  assert.equal(FIXTURE.expected.observability_provider_tokens < 2250, true);
});

test('weekly private report stays flat and human readable', () => {
  const body = renderWeeklyReport([bundle(1)], '2026-W35');

  assert.match(body, /\| Task \| Type\/Cx \| Runtime \| Total \| Obs \| Context \| Build \| Verify \| Other \|/);
  assert.match(body, /Private task label 1/);
  assert.equal(Buffer.byteLength(body) < 64 * 1024, true);
});

test('oversized weekly reports split into bounded task and globally grouped flag parts', () => {
  const bundles = Array.from({ length: 500 }, (_, index) => {
    const value = bundle(index + 1);
    value.meta.label = `Task ${index + 1} ${'x'.repeat(100)}`;
    value.flags = [{
      flag_id: 'WF-shared',
      fingerprint: 'f'.repeat(64),
      severity: 'medium',
      confidence: 'high',
      stage: 'retrieval_context',
      improvement: 'tighten the authoritative route',
      status: 'observation',
    }];
    return value;
  });
  const parts = buildWeeklyReportParts(bundles, '2026-W35');
  const joined = parts.map(part => part.body).join('\n');

  assert.equal(parts.length > 1, true);
  assert.equal(parts.every(part => Buffer.byteLength(part.body) <= 64 * 1024), true);
  assert.equal(parts.some(part => part.kind === 'flags'), true);
  assert.match(joined, /\| 500 \| tighten the authoritative route \| recurring \|/);
});

test('analytics requires five verified comparable tasks and stays within 8 KiB', () => {
  const insufficient = buildAnalytics([bundle(1), bundle(2), bundle(3), bundle(4)]);
  assert.equal(insufficient.cohorts[0].decision_ready, false);
  const ready = buildAnalytics([bundle(1), bundle(2), bundle(3), bundle(4), bundle(5)]);
  assert.equal(ready.cohorts[0].decision_ready, true);
  assert.equal(ready.cohorts[0].hotspot_stage, 'implementation');
  assert.equal(ready.cohorts[0].stage_shares.implementation, 0.5);
  assert.equal(Buffer.byteLength(JSON.stringify(boundedAnalyticsAggregate(ready))) <= 8 * 1024, true);
  assert.equal(compareWindows([bundle(1)], [bundle(2)]).status, 'insufficient_sample');

  const before = Array.from({ length: 5 }, (_, index) => bundle(index + 1));
  const after = Array.from({ length: 5 }, (_, index) => bundle(index + 11, { total: 9000 }));
  assert.equal(compareWindows(before, after).status, 'comparable');
  after[0].meta.complexity = 'C4';
  assert.equal(compareWindows(before, after).status, 'incomparable_cohort');
  after[0].meta.complexity = 'C3';
  for (const value of after) value.events[0].provider = 'other-provider';
  assert.equal(compareWindows(before, after).status, 'directional_only');
});

test('public report suppresses tasks and model names and requires explicit approval', () => {
  const bundles = [bundle(1), bundle(2), bundle(3), bundle(4), bundle(5)];
  const body = renderPublicReport(bundles, '2026-W35', [{
    category: 'retrieval',
    occurrences: 5,
    change: 'tightened route metadata',
    outcome: 'first-try retrieval improved',
    reviewed: true,
  }]);

  assert.doesNotMatch(body, /Private task label|private-model|public-task/);
  assert.match(body, /bug_fix\/C3/);
  const state = temporaryState();
  try {
    assert.throws(
      () => exportPublicReport({ root: state, stateDir: resolveStateDir({ stateDir: state }), week: '2026-W35' }),
      /explicit --approve/,
    );
    assert.equal(existsSync(join(state, 'report/observability/2026-W35.md')), false);
    const exported = exportPublicReport({
      root: state,
      stateDir: resolveStateDir({ stateDir: state }),
      week: '2026-W35',
      approve: true,
    });
    assert.equal(existsSync(exported.path), true);
    assert.doesNotMatch(readFileSync(exported.path, 'utf8'), /Private task label|private-model/);
  } finally {
    rmSync(state, { recursive: true, force: true });
  }
});

test('public improvements reject sensitive text', () => {
  assert.throws(
    () => renderPublicReport([bundle(1), bundle(2), bundle(3), bundle(4), bundle(5)], '2026-W35', [{
      category: 'retrieval',
      occurrences: 5,
      change: 'contact person@example.com',
      outcome: 'improved',
      reviewed: true,
    }]),
    /sensitive text/,
  );
});

test('provider overhead circuit breaker disables optional flagging without changing inclusive totals', () => {
  const singleBreach = bundle(1);
  singleBreach.final.observability_provider_tokens = 1100;
  assert.equal(overheadCircuitBreaker([singleBreach]).enabled, false);
  assert.equal(singleBreach.final.final_inclusive_provider_tokens, 10_000);

  const rolling = Array.from({ length: 20 }, (_, index) => {
    const value = bundle(index + 1);
    value.final.observability_provider_tokens = 600;
    value.final.finalized_at = new Date(Date.UTC(2026, 7, 1, 0, index)).toISOString();
    return value;
  });
  assert.deepEqual(
    { enabled: overheadCircuitBreaker(rolling).enabled, reason: overheadCircuitBreaker(rolling).reason },
    { enabled: false, reason: 'rolling_p95_over_500' },
  );
  const explicitAnalytics = rolling.map((value, index) => ({
    ...value,
    meta: { ...value.meta, task_id: `analytics-${index}`, task_type: 'analytics' },
  }));
  assert.equal(overheadCircuitBreaker(explicitAnalytics).enabled, true);
});
