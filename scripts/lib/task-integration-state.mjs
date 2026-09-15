import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, watch } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { runGit } from './git-publication.mjs';

export const INTEGRATION_SCHEMA_VERSION = 1;

// Released/terminal: the request can no longer publish as-is, so the queue moves on.
export const QUEUE_RELEASED_STATES = new Set(['INTEGRATED', 'INTEGRATED_CLEANUP_REQUIRED', 'BLOCKED_CONFLICT', 'STALE_HEAD', 'STALE_MAIN', 'ABORTED']);
// Caller-action-required: the active slot/candidate is intentionally retained for bounded repair/retry.
export const CALLER_ACTION_STATES = new Set(['READY_FOR_FINALIZATION', 'QA_FAILED', 'PUSH_REJECTED', 'RECOVERY_REQUIRED']);
// Transient-active: only reachable mid-transition; a crash must leave these resumable, never stuck.
export const TRANSIENT_ACTIVE_STATES = new Set(['INTEGRATING', 'VERIFYING']);

function commonDir(root) {
  const output = runGit(root, ['rev-parse', '--git-common-dir']);
  return resolve(root, output);
}
function initialState() { return { schema_version: INTEGRATION_SCHEMA_VERSION, targets: {}, starts: {} }; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function readJson(path) {
  if (!existsSync(path)) return initialState();
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`integration state is not valid JSON: ${path}`); }
  if (!value || value.schema_version !== INTEGRATION_SCHEMA_VERSION || typeof value.targets !== 'object' || typeof value.starts !== 'object')
    throw new Error('integration state has an unsupported schema');
  return value;
}
function writeAtomic(path, value) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

export function integrationTargetKey(repository, target) { return `${repository}::${target}`; }
export function isTerminal(state) { return QUEUE_RELEASED_STATES.has(state); }
export function isCallerAction(state) { return CALLER_ACTION_STATES.has(state); }
export function isActiveTransient(state) { return TRANSIENT_ACTIVE_STATES.has(state); }
export function queueDisposition(state) {
  if (QUEUE_RELEASED_STATES.has(state)) return 'released';
  if (CALLER_ACTION_STATES.has(state)) return 'retained';
  if (TRANSIENT_ACTIVE_STATES.has(state)) return 'active';
  return 'queued';
}

/**
 * A live PID answers `kill(pid, 0)` even for a reused/unrelated process, so this can only ever
 * prove death (ESRCH); every other outcome (alive, EPERM, unknown) must fail closed as "busy".
 */
function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

/** A small storage interface: workflow callers only depend on read/mutate/wait/recoverStaleLock. */
export function createFilesystemIntegrationStore({ root = process.cwd() } = {}) {
  const base = resolve(commonDir(root), 'task-integration');
  const statePath = resolve(base, 'state.json');
  const lockPath = resolve(base, 'state.lock');
  function acquireLock() {
    mkdirSync(base, { recursive: true, mode: 0o700 });
    let descriptor;
    try { descriptor = openSync(lockPath, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('task integration state is busy; retry after the active mutation completes, or use the explicit stale-lock recovery path');
      throw error;
    }
    writeFileSync(descriptor, JSON.stringify({ pid: process.pid, owner: randomUUID(), acquired_at: new Date().toISOString(), context: 'task-integration mutate' }));
    return descriptor;
  }
  return {
    kind: 'filesystem-git-common-dir', base, statePath,
    read() { return copy(readJson(statePath)); },
    mutate(action) {
      const descriptor = acquireLock();
      try {
        const state = readJson(statePath);
        const result = action(state);
        writeAtomic(statePath, state);
        return copy(result);
      } finally { closeSync(descriptor); unlinkSync(lockPath); }
    },
    /** Explicit recovery only: removes an abandoned lock proven dead by PID, never by TTL. */
    recoverStaleLock() {
      if (!existsSync(lockPath)) return { recovered: false, detail: 'no lock is present' };
      let meta = null;
      try { meta = JSON.parse(readFileSync(lockPath, 'utf8')); } catch { /* unreadable metadata is treated as unproven below */ }
      if (!meta || !Number.isInteger(meta.pid)) return { recovered: false, detail: 'lock has no recorded owner pid; refusing to steal it' };
      if (isProcessAlive(meta.pid)) return { recovered: false, detail: `lock owner pid ${meta.pid} appears to still be alive; refusing to steal it` };
      unlinkSync(lockPath);
      return { recovered: true, detail: `removed abandoned lock recorded for dead pid ${meta.pid} (owner ${meta.owner || 'unknown'})` };
    },
    waitForChange(timeoutMs = 30_000) {
      return new Promise(resolveWait => {
        mkdirSync(base, { recursive: true, mode: 0o700 });
        let done = false;
        const finish = () => { if (done) return; done = true; clearTimeout(timer); watcher.close(); resolveWait(); };
        const watcher = watch(base, { persistent: false }, finish);
        const timer = setTimeout(finish, timeoutMs);
      });
    },
  };
}

export function targetRecord(state, { repository, target }) {
  const key = integrationTargetKey(repository, target);
  state.targets[key] ||= { repository, target, created_at: new Date().toISOString(), queue: [], active_request_id: null, requests: {} };
  return state.targets[key];
}

export function publicRequest(request) {
  const { finalization_paths = [], risk = null, conflicts = [], cleanup_error = null, verification_checks = [], history: requestHistory = [] } = request;
  return {
    schema_version: request.schema_version, request_id: request.request_id, repository: request.repository, target: request.target,
    task: request.task, task_id: request.task_id || null, task_label: request.task_label || request.task,
    task_branch: request.task_branch, task_worktree: request.task_worktree || null,
    task_baseline: request.task_baseline, expected_task_head: request.expected_task_head, actual_task_head: request.actual_task_head || null,
    verified_candidate_head: request.verified_candidate_head || null,
    state: request.state, queue_disposition: queueDisposition(request.state), queue_order: request.queue_order,
    main_base: request.main_base || null, actual_main: request.actual_main || null,
    candidate: request.candidate ? { branch: request.candidate.branch, worktree: request.candidate.worktree, head: request.candidate.head || null } : null,
    finalization_paths, verification_checks, risk, conflicts,
    main_before: request.main_before || null, main_after: request.main_after || null,
    qa: request.qa || null, error: request.error || null,
    cleanup_error, timestamps: request.timestamps, history: requestHistory,
  };
}
