import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, watch } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { runGit } from './git-publication.mjs';

export const INTEGRATION_SCHEMA_VERSION = 1;
const TERMINAL = new Set(['INTEGRATED', 'BLOCKED_CONFLICT', 'STALE_HEAD', 'STALE_MAIN', 'QA_FAILED', 'PUSH_REJECTED', 'ABORTED', 'RECOVERY_REQUIRED']);

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
export function isTerminal(state) { return TERMINAL.has(state); }

/** A small storage interface: workflow callers only depend on read/mutate/wait. */
export function createFilesystemIntegrationStore({ root = process.cwd() } = {}) {
  const base = resolve(commonDir(root), 'task-integration');
  const statePath = resolve(base, 'state.json');
  const lockPath = resolve(base, 'state.lock');
  function acquireLock() {
    mkdirSync(base, { recursive: true, mode: 0o700 });
    try { return openSync(lockPath, 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('task integration state is busy; retry after the active mutation completes'); throw error; }
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
  const { finalization_paths = [], risk = null, conflicts = [], cleanup_error = null } = request;
  return {
    schema_version: request.schema_version, request_id: request.request_id, repository: request.repository, target: request.target,
    task: request.task, task_branch: request.task_branch, task_baseline: request.task_baseline, expected_task_head: request.expected_task_head,
    state: request.state, queue_order: request.queue_order, main_base: request.main_base || null,
    candidate: request.candidate ? { branch: request.candidate.branch, worktree: request.candidate.worktree, head: request.candidate.head || null } : null,
    finalization_paths, risk, conflicts, main_before: request.main_before || null, main_after: request.main_after || null,
    cleanup_error, timestamps: request.timestamps,
  };
}
