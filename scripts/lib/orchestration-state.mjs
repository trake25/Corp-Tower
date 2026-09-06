import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
} from 'node:fs';
import { posix, resolve, sep } from 'node:path';

export const ORCHESTRATION_STATE_DIRECTORY = '.agent-state/automation/orchestration';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    throw new Error(`${label} must be a 1-128 character identifier using letters, digits, dot, underscore, or hyphen`);
  return value;
}

function repositoryRoot(root) {
  return resolve(root || '.');
}

function statePath(root, runId) {
  const base = repositoryRoot(root);
  return resolve(base, ORCHESTRATION_STATE_DIRECTORY, `${identifier(runId, 'parent run_id')}.json`);
}

function normalizedStatePath(value, worker) {
  if (typeof value !== 'string' || !value || /[\x00-\x1f\x7f*?]/.test(value))
    throw new Error(`orchestration state worker ${worker} has an invalid path`);
  const portable = value.replaceAll('\\', '/');
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable))
    throw new Error(`orchestration state worker ${worker} has an invalid path`);
  const normalized = posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.endsWith('/'))
    throw new Error(`orchestration state worker ${worker} has an invalid path`);
  return normalized;
}

function parentManifestPath(value) {
  const normalized = normalizedStatePath(value, 'parent');
  if (!normalized.startsWith('.agent-state/'))
    throw new Error('orchestration state does not match its parent ownership');
  return normalized;
}

function readState(root, runId, ownedPaths = null) {
  const path = statePath(root, runId);
  if (!existsSync(path)) return null;
  const info = lstatSync(path);
  if (!info.isFile()) throw new Error('orchestration state must be a regular file');
  let state;
  try { state = JSON.parse(readFileSync(path, 'utf8')); } catch {
    throw new Error('orchestration state is not valid JSON');
  }
  if (!state || typeof state !== 'object' || Array.isArray(state)
    || state.schema_version !== 1 || state.parent_run_id !== identifier(runId, 'parent run_id')
    || !Array.isArray(state.workers))
    throw new Error('orchestration state does not match its parent ownership');
  parentManifestPath(state.parent_manifest);
  const permittedPaths = ownedPaths === null ? null : new Set(ownedPaths);
  const workers = [];
  const ids = new Set();
  for (const worker of state.workers) {
    const workerId = identifier(worker?.worker_id, 'worker');
    if (ids.has(workerId) || !['active', 'released'].includes(worker.status) || !Array.isArray(worker.paths)
      || (worker.status === 'active' ? !worker.paths.length : worker.paths.length))
      throw new Error(`invalid orchestration state for worker ${workerId}`);
    ids.add(workerId);
    const paths = [...new Set(worker.paths.map(path => normalizedStatePath(path, workerId)))].sort();
    if (permittedPaths && paths.some(path => !permittedPaths.has(path)))
      throw new Error(`orchestration state worker ${workerId} has paths outside parent ownership`);
    workers.push({
      worker_id: workerId,
      status: worker.status,
      paths,
    });
  }
  return workers;
}

export function activeOrchestrationWorkerClaims({ root = '.', runId, ownedPaths = null }) {
  return (readState(root, runId, ownedPaths) || []).filter(worker => worker.status === 'active');
}

export function withOrchestrationStateLock({ root = '.', runId }, action) {
  const base = repositoryRoot(root);
  const id = identifier(runId, 'parent run_id');
  const lock = resolve(base, '.agent-state/automation', `orchestration-${id}.lock`);
  if (!lock.startsWith(`${base}${sep}`)) throw new Error('orchestration lock must stay inside the repository');
  mkdirSync(resolve(base, '.agent-state/automation'), { recursive: true, mode: 0o700 });
  let descriptor;
  try { descriptor = openSync(lock, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`orchestration scope is busy; retry after .agent-state/automation/orchestration-${id}.lock is released`);
    throw error;
  }
  try {
    return action();
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}
