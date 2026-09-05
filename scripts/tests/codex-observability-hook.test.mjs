import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { executeCommand } from '../agent-observability.mjs';
import { bindActiveTask, readTaskBundle, requestActiveTaskFinalization } from '../lib/agent-observability/state.mjs';

const ROOT = resolve(process.cwd());
const HOOK_COMMAND = 'node "$(git rev-parse --show-toplevel)/scripts/codex-observability-hook.mjs"';

function temporaryDirectory(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runHook(input, env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(HOOK_COMMAND, { cwd: ROOT, env: { ...process.env, ...env }, shell: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', status => {
      try {
        assert.equal(status, 0, stderr);
        assert.ok(Buffer.byteLength(stdout) <= 512);
        if (!stdout.trim()) throw new Error(`hook emitted no JSON: ${stderr || 'no stderr'}`);
        resolveRun(JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(input);
  });
}

function rollout(home, sessionId) {
  const directory = join(home, 'sessions', '2020', '01', '01');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `rollout-hook-${sessionId}.jsonl`);
  const usage = {
    input_tokens: 30,
    cached_input_tokens: 0,
    cache_write_input_tokens: 0,
    output_tokens: 10,
    reasoning_output_tokens: 4,
    total_tokens: 40,
  };
  writeFileSync(path, [
    JSON.stringify({ timestamp: '2020-01-01T00:00:00.000Z', type: 'session_meta', payload: { id: sessionId } }),
    JSON.stringify({ timestamp: '2020-01-01T00:00:01.000Z', type: 'event_msg', payload: { type: 'task_started' } }),
    JSON.stringify({ timestamp: '2020-01-01T00:00:02.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: usage } } }),
  ].join('\n') + '\n');
  return path;
}

function startPending(state, taskId, sessionId) {
  executeCommand('start', { task_id: taskId, label: 'Hook smoke task', task_type: 'repository_task' }, { stateDir: state });
  executeCommand('close', { task_id: taskId, outcome: 'completed', verification: 'passed', telemetry: {} }, { stateDir: state });
  bindActiveTask(state, sessionId, taskId);
  requestActiveTaskFinalization(state, sessionId, taskId);
}

test('production hook smoke keeps observability fail-open and private', async () => {
  const state = temporaryDirectory('corp-hook-state-');
  const home = temporaryDirectory('corp-hook-home-');
  const emptyHome = temporaryDirectory('corp-empty-home-');
  const sessionId = 'hook-smoke-session';
  try {
    const config = JSON.parse(readFileSync(join(ROOT, '.codex/hooks.json'), 'utf8'));
    assert.deepEqual(Object.keys(config.hooks).sort(), ['PostToolUse', 'SessionEnd', 'SessionStart', 'Stop']);
    for (const entries of Object.values(config.hooks)) {
      const command = entries[0]?.hooks?.[0]?.command || '';
      assert.equal(command, HOOK_COMMAND);
      assert.doesNotMatch(command, /trust|bypass|--no-verify/i);
    }

    const env = { CORP_TOWER_OBSERVABILITY_DIR: state, CODEX_HOME: home };
    assert.deepEqual(await runHook(JSON.stringify({ hook_event_name: 'SessionStart', session_id: sessionId }), env), {});

    const privacyTask = 'hook-privacy-task';
    executeCommand('start', { task_id: privacyTask, label: 'Hook privacy task', task_type: 'repository_task' }, { stateDir: state });
    bindActiveTask(state, sessionId, privacyTask);
    assert.deepEqual(await runHook(JSON.stringify({
      hook_event_name: 'PostToolUse',
      session_id: sessionId,
      tool_use_id: 'private-tool',
      tool_name: 'Bash',
      tool_input: { command: 'node scripts/context.mjs concept-read private.secret' },
      tool_response: { output: 'status: matched secret response' },
    }), env), {});
    const evidence = readTaskBundle(state, privacyTask).evidence;
    assert.equal(evidence[0].stage, 'retrieval_context');
    assert.doesNotMatch(JSON.stringify(evidence), /private\.secret|secret response|concept-read/);

    const exactTask = 'hook-exact-task';
    const transcriptPath = rollout(home, sessionId);
    startPending(state, exactTask, sessionId);
    assert.deepEqual(await runHook(JSON.stringify({
      hook_event_name: 'Stop', session_id: sessionId, turn_id: 'hook-turn', model: 'gpt-6-astra',
      reasoning_effort: 'high', transcript_path: transcriptPath,
    }), env), {});
    assert.equal(readTaskBundle(state, exactTask).final.status, 'exact');

    const partialTask = 'hook-partial-task';
    startPending(state, partialTask, 'hook-partial-session');
    assert.deepEqual(await runHook(JSON.stringify({
      hook_event_name: 'Stop', session_id: 'hook-partial-session', turn_id: 'partial-turn', model: 'gpt-6-astra',
    }), { CORP_TOWER_OBSERVABILITY_DIR: state, CODEX_HOME: emptyHome }), {});
    assert.equal(readTaskBundle(state, partialTask).final.status, 'partial');

    const sessionEndTask = 'hook-session-end-task';
    startPending(state, sessionEndTask, 'hook-end-session');
    assert.deepEqual(await runHook(JSON.stringify({
      hook_event_name: 'SessionEnd', session_id: 'hook-end-session', transcript_path: '/outside/sessions.jsonl',
    }), env), {});
    assert.equal(readTaskBundle(state, sessionEndTask).final.finalized_at, null);

    const degraded = await runHook('{', env);
    assert.match(degraded.systemMessage, /^Corp Tower observability hook failed:/);
  } finally {
    rmSync(state, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    rmSync(emptyHome, { recursive: true, force: true });
  }
});
