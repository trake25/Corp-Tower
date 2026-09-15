import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync, watch } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { runGit } from './git-publication.mjs';

export const INTEGRATION_SCHEMA_VERSION = 2;
const MAX_RECENT_PER_TARGET = 32;
const MAX_HISTORY_EVENTS = 32;

// Released/terminal: the request can no longer publish as-is, so the queue moves on.
export const QUEUE_RELEASED_STATES = new Set(['INTEGRATED', 'INTEGRATED_CLEANUP_REQUIRED', 'BLOCKED_CONFLICT', 'STALE_HEAD', 'STALE_MAIN', 'ABORTED']);
// Caller-action-required: the active slot/candidate is intentionally retained for bounded repair/retry.
export const CALLER_ACTION_STATES = new Set(['READY_FOR_FINALIZATION', 'QA_FAILED', 'PUSH_REJECTED', 'RECOVERY_REQUIRED']);
// Transient-active: only reachable mid-transition; a crash must leave these resumable, never stuck.
export const TRANSIENT_ACTIVE_STATES = new Set(['INTEGRATING', 'VERIFYING']);
// Compactable-terminal: released AND carrying no further recovery obligation, so the full record may
// shrink to a bounded recent summary. `INTEGRATED_CLEANUP_REQUIRED` is deliberately excluded — it is
// already-published work that still needs its full candidate/task identity for eligible cleanup retry.
export const COMPACTABLE_TERMINAL_STATES = new Set(['INTEGRATED', 'BLOCKED_CONFLICT', 'STALE_HEAD', 'STALE_MAIN', 'ABORTED']);

function commonDir(root) {
  const output = runGit(root, ['rev-parse', '--git-common-dir']);
  return resolve(root, output);
}
function initialState() { return { schema_version: INTEGRATION_SCHEMA_VERSION, targets: {}, starts: {} }; }
function copy(value) { return JSON.parse(JSON.stringify(value)); }
function boundedText(value, limit = 300) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

/**
 * Strips a released, no-longer-recoverable request down to the bounded identity/outcome fields a
 * caller could still need (duplicate-submission detection, an audit line, the exact landed revision).
 * Worktree paths, QA detail, verification descriptors, and full lifecycle history are intentionally
 * dropped here — they have no further use once the request can never resume or republish.
 */
function compactRequest(request, sequence) {
  return {
    schema_version: INTEGRATION_SCHEMA_VERSION, compacted: true, sequence,
    request_id: request.request_id, repository: request.repository, target: request.target,
    task: request.task, task_id: request.task_id || null, task_label: request.task_label || request.task, task_branch: request.task_branch,
    state: request.state, queue_order: request.queue_order,
    expected_task_head: request.expected_task_head, actual_task_head: request.actual_task_head || null,
    verified_candidate_head: request.verified_candidate_head || null,
    main_base: request.main_base || null, main_before: request.main_before || null, main_after: request.main_after || null,
    actual_main: request.actual_main || null,
    candidate: request.candidate ? { branch: request.candidate.branch, head: request.candidate.head || null } : null,
    conflicts: (request.conflicts || []).slice(0, 32),
    error: boundedText(request.error), cleanup_error: boundedText(request.cleanup_error),
    timestamps: request.timestamps,
  };
}
/** Replaces a just-settled compactable-terminal request with its bounded summary and evicts the oldest past the per-target cap. */
export function compactIfTerminal(record, request) {
  if (!COMPACTABLE_TERMINAL_STATES.has(request.state)) return;
  record.next_complete_seq = (record.next_complete_seq || 0) + 1;
  record.requests[request.request_id] = compactRequest(request, record.next_complete_seq);
  record.recent_order = record.recent_order || [];
  record.recent_order.push(request.request_id);
  while (record.recent_order.length > MAX_RECENT_PER_TARGET) delete record.requests[record.recent_order.shift()];
}
/** Caps per-request lifecycle history so a repeatedly-retried request cannot grow `state.json` without bound. */
export function appendHistory(request, event, detail = null) {
  (request.history ||= []).push({ at: new Date().toISOString(), event, ...(detail ? { detail } : {}) });
  if (request.history.length > MAX_HISTORY_EVENTS) request.history.splice(0, request.history.length - MAX_HISTORY_EVENTS);
  request.timestamps.updated_at = new Date().toISOString();
}

function migrateTargetV1ToV2(record) {
  const requests = { ...record.requests };
  const compactable = Object.values(requests)
    .filter(request => COMPACTABLE_TERMINAL_STATES.has(request.state))
    .sort((a, b) => new Date(a.timestamps?.updated_at || 0) - new Date(b.timestamps?.updated_at || 0));
  const recentOrder = [];
  let sequence = 0;
  for (const request of compactable) { requests[request.request_id] = compactRequest(request, ++sequence); recentOrder.push(request.request_id); }
  while (recentOrder.length > MAX_RECENT_PER_TARGET) delete requests[recentOrder.shift()];
  const maxQueueOrder = Object.values(record.requests).reduce((max, request) => Math.max(max, request.queue_order ?? -1), -1);
  return { ...record, requests, recent_order: recentOrder, next_queue_seq: maxQueueOrder + 1, next_complete_seq: sequence };
}
/** v1 -> v2: adds bounded compaction/queue-sequence bookkeeping in place; no queued/active/caller-action/cleanup-required request or task start is dropped. */
function migrateV1ToV2(state) {
  const targets = {};
  for (const [key, record] of Object.entries(state.targets)) targets[key] = migrateTargetV1ToV2(record);
  return { schema_version: 2, targets, starts: state.starts };
}
function migrate(value) {
  if (value.schema_version === 1) return migrateV1ToV2(value);
  return value;
}

function readJson(path) {
  if (!existsSync(path)) return initialState();
  let value;
  try { value = JSON.parse(readFileSync(path, 'utf8')); } catch { throw new Error(`integration state is not valid JSON: ${path}`); }
  if (!value || typeof value.targets !== 'object' || typeof value.starts !== 'object' || ![1, INTEGRATION_SCHEMA_VERSION].includes(value.schema_version))
    throw new Error('integration state has an unsupported schema');
  return migrate(value);
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

/** A small storage interface: workflow callers only depend on read/mutate/wait/recoverStaleLock/pruneOrphanArtifacts. */
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
    /**
     * Orphan atomic-write temp files (a crash between `writeFileSync` and the renaming `renameSync`)
     * are removed only when no live mutation lock is present: a lock's existence means a write may
     * genuinely be in flight, and its temp file must never be raced or stolen.
     */
    pruneOrphanArtifacts() {
      if (!existsSync(base) || existsSync(lockPath)) return { removed: [] };
      const removed = [];
      for (const name of readdirSync(base)) {
        if (!/^state\.json\.\d+\.[^./]+\.tmp$/.test(name)) continue;
        try { unlinkSync(resolve(base, name)); removed.push(name); } catch { /* best-effort */ }
      }
      return { removed };
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
  state.targets[key] ||= { repository, target, created_at: new Date().toISOString(), queue: [], active_request_id: null, requests: {}, recent_order: [], next_queue_seq: 0, next_complete_seq: 0 };
  return state.targets[key];
}
/** The monotonic per-target insertion sequence: stable/unique even after old requests are compacted or evicted. */
export function nextQueueOrder(record) {
  const order = record.next_queue_seq || 0;
  record.next_queue_seq = order + 1;
  return order;
}

export function publicRequest(request) {
  if (request.compacted) return { ...request, queue_disposition: queueDisposition(request.state) };
  const { finalization_paths = [], risk = null, conflicts = [], cleanup_error = null, verification_checks = [], history: requestHistory = [], cleanup_progress = null } = request;
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
    cleanup_error, cleanup_progress, timestamps: request.timestamps, history: requestHistory,
  };
}
