import {
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { randomUUID } from 'node:crypto';
import { dirname, posix, relative, resolve, sep } from 'node:path';
import {
  activeOrchestrationWorkerClaims,
  withOrchestrationStateLock,
} from './orchestration-state.mjs';

export const TASK_OWNERSHIP_DIRECTORY = '.agent-state/automation/task-ownership';
const LOCK_PATH = '.agent-state/automation/task-ownership.lock';
const SCHEMA_VERSION = 1;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/;

function identifier(value, label) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value))
    throw new Error(`${label} must be a 1-128 character identifier using letters, digits, dot, underscore, or hyphen`);
  return value;
}

function taskLabel(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 120 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error('task must be 1-120 printable characters');
  return value.trim().replace(/\s+/g, ' ');
}

function amendmentReason(value) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 240 || /[\x00-\x1f\x7f]/.test(value))
    throw new Error('amendment reason must be 1-240 printable characters');
  return value.trim().replace(/\s+/g, ' ');
}

function repositoryRoot(root) {
  return resolve(root || '.');
}

export function repositoryRelativePath(root, input, label = 'path', { inspect = true } = {}) {
  const base = repositoryRoot(root);
  if (typeof input !== 'string' || !input || /[\x00-\x1f\x7f*?]/.test(input))
    throw new Error(`${label} must be an explicit repository-relative path`);
  const portable = input.replaceAll('\\', '/');
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable))
    throw new Error(`${label} must be repository-relative`);
  const normalized = posix.normalize(portable);
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../') || normalized.endsWith('/'))
    throw new Error(`${label} must name an explicit file inside the repository`);
  const absolute = resolve(base, normalized);
  if (!absolute.startsWith(`${base}${sep}`)) throw new Error(`${label} must stay inside the repository`);
  if (!inspect) return normalized;
  const parts = normalized.split('/');
  let current = base;
  for (let index = 0; index < parts.length; index++) {
    current = resolve(current, parts[index]);
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') break;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} must not traverse symbolic links: ${normalized}`);
    if (index < parts.length - 1 && !info.isDirectory())
      throw new Error(`${label} must name an explicit file: ${normalized}`);
    if (index === parts.length - 1 && info.isDirectory())
      throw new Error(`${label} must name an explicit file: ${normalized}`);
  }
  return normalized;
}

function normalizedPaths(root, paths, label = 'ownership path') {
  if (!Array.isArray(paths) || !paths.length) throw new Error('one or more explicit ownership paths are required');
  return [...new Set(paths.map(path => repositoryRelativePath(root, path, label)))].sort();
}

function relativeStatePath(root, path) {
  return relative(repositoryRoot(root), path).replaceAll('\\', '/');
}

export function taskOwnershipPath(runId, root = '.') {
  return `${TASK_OWNERSHIP_DIRECTORY}/${identifier(runId, 'ownership run_id')}.json`;
}

function statePath(root, runId) {
  return resolve(repositoryRoot(root), taskOwnershipPath(runId, root));
}

function readJson(path, label) {
  let source;
  try { source = readFileSync(path, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try { return JSON.parse(source); } catch {
    throw new Error(`${label} is not valid JSON`);
  }
}

function overlaps(left, right) {
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function validTimestamp(value, label) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(value).toISOString();
}

function validateRecord(record, root, path) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new Error('task ownership record must be an object');
  if (record.schema_version !== SCHEMA_VERSION || record.kind !== 'task-ownership')
    throw new Error('task ownership record has an unsupported schema');
  const runId = identifier(record.run_id, 'ownership run_id');
  const task = taskLabel(record.task);
  if (!['active', 'released'].includes(record.status)) throw new Error('task ownership status must be active or released');
  const ownedPaths = normalizedPaths(root, record.owned_paths, 'owned path');
  if (ownedPaths.length !== record.owned_paths.length || ownedPaths.some((pathValue, index) => pathValue !== record.owned_paths[index]))
    throw new Error('task ownership paths must be sorted, unique, and normalized');
  const acquiredAt = validTimestamp(record.acquired_at, 'ownership acquired_at');
  const amendments = record.amendments === undefined ? [] : record.amendments;
  if (!Array.isArray(amendments)) throw new Error('task ownership amendments must be an array');
  const normalizedAmendments = amendments.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error(`ownership amendment ${index} must be an object`);
    const paths = normalizedPaths(root, entry.paths, `ownership amendment ${index} path`);
    if (paths.length !== entry.paths.length || paths.some((pathValue, pathIndex) => pathValue !== entry.paths[pathIndex]))
      throw new Error(`ownership amendment ${index} paths must be sorted, unique, and normalized`);
    return { paths, reason: amendmentReason(entry.reason), amended_at: validTimestamp(entry.amended_at, `ownership amendment ${index} amended_at`) };
  });
  const releasedAt = record.released_at === undefined || record.released_at === null
    ? null
    : validTimestamp(record.released_at, 'ownership released_at');
  if (record.status === 'active' && releasedAt) throw new Error('active task ownership cannot have released_at');
  if (record.status === 'released' && !releasedAt) throw new Error('released task ownership requires released_at');
  return {
    schema_version: SCHEMA_VERSION,
    kind: 'task-ownership',
    run_id: runId,
    task,
    status: record.status,
    owned_paths: ownedPaths,
    acquired_at: acquiredAt,
    amendments: normalizedAmendments,
    released_at: releasedAt,
    path: relativeStatePath(root, path),
  };
}

function writeRecord(path, record, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${randomUUID()}.tmp`;
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const descriptor = openSync(temporary, 'wx', 0o600);
  try {
    writeFileSync(descriptor, body);
    closeSync(descriptor);
    if (exclusive && existsSync(path)) throw new Error('task ownership run already exists');
    renameSync(temporary, path);
  } finally {
    try { closeSync(descriptor); } catch {}
    try { unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}

function records(root) {
  const directory = resolve(repositoryRoot(root), TASK_OWNERSHIP_DIRECTORY);
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => {
      const path = resolve(directory, entry.name);
      const record = readJson(path, 'task ownership record');
      return validateRecord(record, root, path);
    })
    .sort((left, right) => left.run_id.localeCompare(right.run_id));
}

function assertNoOverlap(root, runId, paths) {
  const conflicts = [];
  for (const record of records(root)) {
    if (record.status !== 'active' || record.run_id === runId) continue;
    const overlapsWith = record.owned_paths.filter(existing => paths.some(candidate => overlaps(existing, candidate)));
    if (overlapsWith.length) conflicts.push(`${record.run_id}: ${overlapsWith.join(', ')}`);
  }
  if (conflicts.length) throw new Error(`overlapping active task ownership: ${conflicts.join('; ')}`);
}

function withLock(root, action) {
  const base = repositoryRoot(root);
  const lock = resolve(base, LOCK_PATH);
  mkdirSync(dirname(lock), { recursive: true, mode: 0o700 });
  let descriptor;
  try { descriptor = openSync(lock, 'wx', 0o600); } catch (error) {
    if (error.code === 'EEXIST') throw new Error('task ownership is busy; retry after the current ownership operation completes');
    throw error;
  }
  try {
    return action(base);
  } finally {
    closeSync(descriptor);
    unlinkSync(lock);
  }
}

function reference(value, root) {
  if (typeof value === 'string') return { path: value, run_id: null };
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('task ownership reference is required');
  return { path: value.path || value.ownership_path, run_id: value.run_id || null };
}

export function resolveTaskOwnership(input, { root = '.', requireActive = false } = {}) {
  const item = reference(input, root);
  const path = repositoryRelativePath(root, item.path, 'task ownership record');
  if (!path.startsWith(`${TASK_OWNERSHIP_DIRECTORY}/`))
    throw new Error(`task ownership record must stay under ${TASK_OWNERSHIP_DIRECTORY}/`);
  const absolute = resolve(repositoryRoot(root), path);
  const record = readJson(absolute, 'task ownership record');
  if (!record) throw new Error(`task ownership record does not exist: ${path}`);
  const normalized = validateRecord(record, root, absolute);
  if (item.run_id && normalized.run_id !== identifier(item.run_id, 'ownership run_id'))
    throw new Error('task ownership run_id does not match its record');
  if (requireActive && normalized.status !== 'active') throw new Error('task ownership must be active');
  return normalized;
}

function result(status, record) {
  return {
    status,
    ownership: {
      path: record.path,
      run_id: record.run_id,
      status: record.status,
      owned_paths: record.owned_paths,
    },
  };
}

export function acquireTaskOwnership({ task, paths, runId = null, root = '.', now = new Date().toISOString() }) {
  const base = repositoryRoot(root);
  const id = identifier(runId || randomUUID(), 'ownership run_id');
  const ownedPaths = normalizedPaths(base, paths);
  const label = taskLabel(task);
  const acquiredAt = validTimestamp(now, 'ownership acquired_at');
  return withLock(base, () => {
    const path = statePath(base, id);
    const existing = readJson(path, 'task ownership record');
    if (existing) {
      const record = validateRecord(existing, base, path);
      if (record.status === 'active' && record.task === label && JSON.stringify(record.owned_paths) === JSON.stringify(ownedPaths))
        return result('duplicate', record);
      throw new Error(`task ownership run already exists with different scope: ${record.path}`);
    }
    assertNoOverlap(base, id, ownedPaths);
    const record = {
      schema_version: SCHEMA_VERSION,
      kind: 'task-ownership',
      run_id: id,
      task: label,
      status: 'active',
      owned_paths: ownedPaths,
      acquired_at: acquiredAt,
      amendments: [],
      released_at: null,
    };
    writeRecord(path, record, { exclusive: true });
    return result('acquired', validateRecord(record, base, path));
  });
}

export function amendTaskOwnership({ ownership, paths, reason, root = '.', now = new Date().toISOString() }) {
  const base = repositoryRoot(root);
  const additions = normalizedPaths(base, paths);
  const directReason = amendmentReason(reason);
  return withLock(base, () => {
    const current = resolveTaskOwnership(ownership, { root: base, requireActive: true });
    const newPaths = additions.filter(path => !current.owned_paths.includes(path));
    if (!newPaths.length) return result('duplicate', current);
    assertNoOverlap(base, current.run_id, newPaths);
    const record = {
      ...current,
      owned_paths: [...new Set([...current.owned_paths, ...newPaths])].sort(),
      amendments: [...current.amendments, {
        paths: newPaths,
        reason: directReason,
        amended_at: validTimestamp(now, 'ownership amended_at'),
      }],
    };
    delete record.path;
    const path = resolve(base, current.path);
    writeRecord(path, record);
    return result('amended', validateRecord(record, base, path));
  });
}

export function releaseTaskOwnership({ ownership, root = '.', now = new Date().toISOString() }) {
  const base = repositoryRoot(root);
  return withLock(base, () => {
    const current = resolveTaskOwnership(ownership, { root: base });
    if (current.status === 'released') return result('duplicate', current);
    const activeWorkers = withOrchestrationStateLock({ root: base, runId: current.run_id }, () =>
      activeOrchestrationWorkerClaims({ root: base, runId: current.run_id, ownedPaths: current.owned_paths }));
    if (activeWorkers.length) {
      const claims = activeWorkers.map(worker => `${worker.worker_id}: ${worker.paths.join(', ')}`).join('; ');
      throw new Error(`active subordinate orchestration worker claims block ownership release: ${claims}`);
    }
    const record = {
      ...current,
      status: 'released',
      released_at: validTimestamp(now, 'ownership released_at'),
    };
    delete record.path;
    const path = resolve(base, current.path);
    writeRecord(path, record);
    return result('released', validateRecord(record, base, path));
  });
}

export function taskOwnershipStatus({ ownership, root = '.' }) {
  const record = resolveTaskOwnership(ownership, { root });
  return result('status', record);
}
