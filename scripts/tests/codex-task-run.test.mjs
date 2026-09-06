import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { handleHook } from '../codex-observability-hook.mjs';
import { launchCodexTask, resolveTelemetryMode } from '../codex-task-run.mjs';
import { readTaskBundle } from '../lib/agent-observability/state.mjs';

function hooksTemplate(root) {
  mkdirSync(join(root, '.codex'), { recursive: true });
  const command = 'node "$(git rev-parse --show-toplevel)/scripts/codex-observability-hook.mjs"';
  const hooks = Object.fromEntries(['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd']
    .map(event => [event, [{ hooks: [{ type: 'command', command, timeout: 10 }] }]]));
  writeFileSync(join(root, '.codex/telemetry-hooks.json'), JSON.stringify({ description: 'test', hooks }, null, 2));
}

function fakeSpawn(calls) {
  return (command, args, options) => {
    calls.push({ command, args, options });
    const child = new EventEmitter();
    queueMicrotask(() => child.emit('close', 0, null));
    return child;
  };
}

test('telemetry selection is absent by default and is read only from selected policy sections', () => {
  assert.equal(resolveTelemetryMode('# Plan\n\n## 2. Task-Specific Policy\n\n- task-specific constraint\n'), 'off');
  assert.equal(resolveTelemetryMode('## 2. Task-Specific Policy\n\nTelemetry is selected for this task.\n'), 'off');
  assert.equal(resolveTelemetryMode('## 2. Task-Specific Policy\n\n- telemetry=ON\n'), 'on');
  assert.equal(resolveTelemetryMode('## Execution Overrides\n\n- telemetry=OFF\n'), 'off');
  assert.throws(() => resolveTelemetryMode('## Execution Overrides\n\n- telemetry=on\n'), /malformed telemetry assignment/);
  assert.throws(() => resolveTelemetryMode('## 2. Task-Specific Policy\n\n- telemetry=ON\n\n## Execution Overrides\n\n- telemetry=ON\n'), /exactly once/);
});

test('telemetry-enabled launcher establishes an opt-in binding that settles without task-close', async t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-codex-task-run-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plan'), { recursive: true });
  hooksTemplate(root);
  writeFileSync(join(root, 'plan/task.md'), '## 2. Task-Specific Policy\n\n- telemetry=ON\n');
  const state = join(root, 'private-state');
  const calls = [];
  const env = { CORP_TOWER_OBSERVABILITY_DIR: state, CODEX_SESSION_ID: '' };
  const launched = await launchCodexTask('plan/task.md', [], { root, env, spawnFn: fakeSpawn(calls) });

  assert.equal(launched.telemetry, 'on');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'codex');
  assert.ok(calls[0].args.includes('--enable'));
  const taskId = calls[0].options.env.CORP_TOWER_TELEMETRY_TASK_ID;
  assert.match(taskId, /^telemetry-/);
  assert.equal(handleHook({ hook_event_name: 'SessionStart', session_id: 'telemetry-session' }, {
    root,
    stateDir: state,
    env: calls[0].options.env,
    now: '2026-09-06T00:00:00.000Z',
  }).status, 'recorded');
  assert.equal(handleHook({ hook_event_name: 'Stop', session_id: 'telemetry-session', turn_id: 'stop-turn' }, {
    root,
    stateDir: state,
    env: calls[0].options.env,
    now: '2026-09-06T00:01:00.000Z',
  }).status, 'settled');
  const final = readTaskBundle(state, taskId).final;
  assert.equal(final.verification, 'not_run');
  assert.equal(final.status, 'partial');
});

test('telemetry-off launcher injects no project hooks or telemetry state', async t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-codex-task-off-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'plan'), { recursive: true });
  writeFileSync(join(root, 'plan/task.md'), '# ordinary task\n');
  const calls = [];
  const state = join(root, 'private-state');
  const env = { CORP_TOWER_OBSERVABILITY_DIR: state };
  const launched = await launchCodexTask('plan/task.md', ['--model', 'test'], { root, env, spawnFn: fakeSpawn(calls) });
  assert.equal(launched.telemetry, 'off');
  assert.deepEqual(calls[0].args, ['--model', 'test']);
  assert.equal(calls[0].options.env.CORP_TOWER_TELEMETRY_TASK_ID, undefined);
  assert.throws(() => readTaskBundle(state, 'telemetry-missing'), /unknown task/);
});
