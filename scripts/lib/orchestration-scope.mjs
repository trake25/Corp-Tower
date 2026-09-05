import {
  closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync,
  renameSync, rmdirSync, unlinkSync, writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import { taskProcessControlsForManifest } from './task-process-controls.mjs';

const STATE_DIRECTORY = '.agent-state/automation/orchestration';
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function repositoryPath(root, input, label, { inspect = true } = {}) {
  if (typeof input !== 'string' || !input || /[\x00-\x1f\x7f*?]/.test(input))
    throw new Error(`${label} must be an explicit repository-relative path`);
  const portable = input.replaceAll('\\', '/');
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable))
    throw new Error(`${label} must be repository-relative`);
  const normalized = posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../'))
    throw new Error(`${label} must stay inside the repository`);
  if (normalized.endsWith('/')) throw new Error(`${label} must name an explicit file`);
  if (!inspect) return normalized;
  const parts = normalized.split('/');
  let current = root;
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]);
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} must not traverse symbolic links: ${normalized}`);
    if (index < parts.length - 1 ? !info.isDirectory() : !info.isFile())
      throw new Error(`${label} must name an explicit file: ${normalized}`);
  }
  return normalized;
}

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    throw new Error(`${label} must be a 1-128 character identifier using letters, digits, dot, underscore, or hyphen`);
  return value;
}

function readJson(path, label) {
  let source;
  try { source = readFileSync(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
  try { return JSON.parse(source); } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function loadParent({ parent, root = process.env.TASK_CLOSE_ROOT || '.' }, claiming = false) {
  const repositoryRoot = realpathSync(resolve(root));
  if (typeof parent !== 'string' || !parent) throw new Error('parent manifest is required');
  const parentPath = resolve(repositoryRoot, parent);
  if (!parentPath.startsWith(repositoryRoot + sep)) throw new Error('parent manifest must stay inside the repository');
  const manifestPath = repositoryPath(repositoryRoot, relative(repositoryRoot, parentPath).replaceAll('\\', '/'), 'parent manifest');
  if (!manifestPath.startsWith('.agent-state/')) throw new Error('parent manifest must stay under .agent-state/');
  const manifest = readJson(parentPath, 'parent manifest');
  if (!manifest || ![2, 3].includes(manifest.schema_version))
    throw new Error('parent must be an existing schema-v2 or schema-v3 task-close manifest');
  taskProcessControlsForManifest(manifest);
  const runId = identifier(manifest.run_id, 'parent run_id');
  // Claims need an open writer lifecycle; release/cleanup also serve closure retries.
  const phases = { open: ['prepared', 'reviewed', 'failed'], verified: ['verified'], blocked: ['closure-blocked'] };
  if (!Object.hasOwn(phases, manifest.lifecycle?.status) || !Object.values(phases).flat().includes(manifest.phase)
    || (claiming && (manifest.lifecycle.status !== 'open' || !phases.open.includes(manifest.phase))))
    throw new Error('parent lifecycle must be open for claims or awaiting closure for cleanup');
  if (!Array.isArray(manifest.owned_paths) || !manifest.owned_paths.length)
    throw new Error('parent manifest must contain explicit owned_paths');
  const ownedPaths = [...new Set(manifest.owned_paths.map(path => repositoryPath(repositoryRoot, path, 'parent owned path', { inspect: false })))].sort();
  const statePath = `${STATE_DIRECTORY}/${runId}.json`;
  repositoryPath(repositoryRoot, statePath, 'orchestration state');
  return { root: repositoryRoot, manifestPath, runId, ownedPaths, statePath: resolve(repositoryRoot, statePath) };
}

function emptyState(parent) {
  return { schema_version: 1, parent_manifest: parent.manifestPath, parent_run_id: parent.runId, workers: [] };
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function readState(parent) {
  const state = readJson(parent.statePath, 'orchestration state');
  if (state === undefined) return null;
  if (!state || state.schema_version !== 1 || state.parent_manifest !== parent.manifestPath
    || state.parent_run_id !== parent.runId || !Array.isArray(state.workers))
    throw new Error('orchestration state does not match the parent manifest');
  const ids = new Set();
  const activePaths = [];
  const workers = state.workers.map(worker => {
    const id = identifier(worker?.worker_id, 'worker');
    if (ids.has(id) || !['active', 'released'].includes(worker.status) || !Array.isArray(worker.paths)
      || (worker.status === 'active' ? !worker.paths.length : worker.paths.length))
      throw new Error(`invalid orchestration state for worker ${id}`);
    ids.add(id);
    const paths = [...new Set(worker.paths.map(path => repositoryPath(parent.root, path, 'worker path', { inspect: false })))].sort();
    if (paths.some(path => !parent.ownedPaths.includes(path)))
      throw new Error(`worker ${id} has paths outside parent owned_paths`);
    for (const path of paths) {
      if (activePaths.some(claim => claim.worker !== id && overlaps(claim.path, path)))
        throw new Error(`overlapping active ownership in orchestration state: ${id}: ${path}`);
      activePaths.push({ worker: id, path });
    }
    return { worker_id: id, status: worker.status, paths };
  }).sort((left, right) => left.worker_id < right.worker_id ? -1 : left.worker_id > right.worker_id ? 1 : 0);
  return { ...emptyState(parent), workers };
}

function status(parent, state) {
  return {
    parent_manifest: parent.manifestPath,
    parent_run_id: parent.runId,
    state_exists: state !== null,
    workers: state?.workers || [],
  };
}

function saveState(parent, state) {
  state.workers.sort((left, right) => left.worker_id < right.worker_id ? -1 : left.worker_id > right.worker_id ? 1 : 0);
  const body = `${JSON.stringify(state, null, 2)}\n`;
  try { if (readFileSync(parent.statePath, 'utf8') === body) return; } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  mkdirSync(dirname(parent.statePath), { recursive: true, mode: 0o700 });
  const temporary = `${parent.statePath}.${randomUUID()}.tmp`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    try {
      writeFileSync(descriptor, body);
      fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
    renameSync(temporary, parent.statePath);
  } finally {
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function withState(options, action, claiming = false) {
  const initial = loadParent(options, claiming);
  // Keep the lock outside the removable state directory and serialize read/modify/replace.
  const lockPath = `.agent-state/automation/orchestration-${initial.runId}.lock`;
  repositoryPath(initial.root, lockPath, 'orchestration lock');
  const lock = resolve(initial.root, lockPath);
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  let descriptor;
  try { descriptor = openSync(lock, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`orchestration scope is busy; retry after ${lockPath} is released`);
    throw error;
  }
  try {
    const parent = loadParent(options, claiming);
    if (parent.runId !== initial.runId) throw new Error('parent run_id changed while acquiring orchestration ownership');
    return action(parent, readState(parent));
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}

export function claimWorkerScope({ worker, paths, ...options }) {
  const workerId = identifier(worker, 'worker');
  if (!Array.isArray(paths) || !paths.length) throw new Error('claim requires one or more explicit paths');
  return withState(options, (parent, existing) => {
    const requested = [...new Set(paths.map(path => repositoryPath(parent.root, path, 'worker path')))].sort();
    const outside = requested.filter(path => !parent.ownedPaths.includes(path));
    if (outside.length) throw new Error(`worker paths outside parent owned_paths: ${outside.join(', ')}`);
    const state = existing || emptyState(parent);
    const conflicts = state.workers.filter(claim => claim.status === 'active' && claim.worker_id !== workerId)
      .map(claim => ({ worker: claim.worker_id, paths: claim.paths.filter(path => requested.some(candidate => overlaps(path, candidate))) }))
      .filter(claim => claim.paths.length);
    if (conflicts.length) throw new Error(`overlapping worker write claims: ${conflicts.map(claim => `${claim.worker}: ${claim.paths.join(', ')}`).join('; ')}`);
    let claim = state.workers.find(item => item.worker_id === workerId);
    if (!claim) {
      claim = { worker_id: workerId, status: 'active', paths: [] };
      state.workers.push(claim);
    }
    claim.status = 'active';
    claim.paths = [...new Set([...claim.paths, ...requested])].sort();
    saveState(parent, state);
    return status(parent, state);
  }, true);
}

export function releaseWorkerScope({ worker, ...options }) {
  const workerId = identifier(worker, 'worker');
  return withState(options, (parent, state) => {
    const claim = state?.workers.find(item => item.worker_id === workerId);
    if (!claim) throw new Error(`unknown worker: ${workerId}`);
    claim.status = 'released';
    claim.paths = [];
    saveState(parent, state);
    return status(parent, state);
  });
}

export function orchestrationScopeStatus(options) {
  return withState(options, (parent, state) => status(parent, state));
}

export function finalizeOrchestrationScope(options) {
  return withState(options, (parent, state) => {
    const active = state?.workers.filter(worker => worker.status === 'active') || [];
    if (active.length) throw new Error(`active worker claims block parent closure: ${active.map(worker => `${worker.worker_id}: ${worker.paths.join(', ')}`).join('; ')}`);
    if (state) unlinkSync(parent.statePath);
    try { rmdirSync(dirname(parent.statePath)); } catch (error) {
      if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes(error.code)) throw error;
    }
    return status(parent, null);
  });
}
