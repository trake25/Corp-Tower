import {
  existsSync,
  linkSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { cleanId, sanitizeMeta } from './schema.mjs';

function ordered(value) {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])]));
  return value;
}

export function stableJson(value) {
  return JSON.stringify(ordered(value), null, 2) + '\n';
}

function digest(value) {
  return createHash('sha256').update(stableJson(value)).digest('hex');
}

export function resolveStateDir({ root = '.', stateDir = null, env = process.env } = {}) {
  return resolve(stateDir || env.CORP_TOWER_OBSERVABILITY_DIR || join(root, '.agent-state/telemetry/v2'));
}

export function taskDirectory(stateDir, taskId) {
  return join(resolve(stateDir), 'tasks', cleanId(taskId, 'task_id'));
}

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function writeAtomicText(path, body, { mode = 0o600 } = {}) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, body, { mode });
  renameSync(temporary, path);
}

export function writeAtomicJson(path, value) {
  writeAtomicText(path, stableJson(value));
}

function writeImmutable(path, value, stateDir) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}-${randomUUID()}`;
  writeFileSync(temporary, stableJson(value), { mode: 0o600, flag: 'wx' });
  try {
    linkSync(temporary, path);
    return { status: 'written', path };
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const current = readJson(path);
    if (digest(current) === digest(value)) return { status: 'duplicate', path };
    const quarantine = join(resolve(stateDir), 'quarantine', `${digest(value).slice(0, 16)}.json`);
    writeAtomicJson(quarantine, value);
    throw new Error(`immutable record conflict; quarantined at ${quarantine}`);
  } finally {
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function startTask(stateDir, input, { now = new Date().toISOString(), taskId = null } = {}) {
  const id = taskId || input.task_id || randomUUID();
  const meta = sanitizeMeta(input, { taskId: id, now });
  const path = join(taskDirectory(stateDir, meta.root_task_id), 'meta.json');
  const result = writeImmutable(path, meta, stateDir);
  return { ...result, task_id: meta.task_id, root_task_id: meta.root_task_id, meta };
}

export function recordEvent(stateDir, event) {
  const path = join(taskDirectory(stateDir, event.root_task_id), 'events', `${cleanId(event.usage_event_id, 'usage_event_id')}.json`);
  return writeImmutable(path, event, stateDir);
}

export function recordEvidence(stateDir, evidence) {
  const path = join(taskDirectory(stateDir, evidence.task_id), 'evidence', `${cleanId(evidence.evidence_event_id, 'evidence_event_id')}.json`);
  return writeImmutable(path, evidence, stateDir);
}

export function recordFlag(stateDir, rootTaskId, flag) {
  const path = join(taskDirectory(stateDir, rootTaskId), 'flags', `${cleanId(flag.flag_id, 'flag_id')}.json`);
  return writeImmutable(path, flag, stateDir);
}

function listJson(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => readJson(join(path, entry.name)));
}

export function readTaskBundle(stateDir, taskId) {
  const dir = taskDirectory(stateDir, taskId);
  if (!existsSync(join(dir, 'meta.json'))) throw new Error(`unknown task: ${taskId}`);
  return {
    meta: readJson(join(dir, 'meta.json')),
    events: listJson(join(dir, 'events')),
    evidence: listJson(join(dir, 'evidence')),
    flags: listJson(join(dir, 'flags')),
    final: existsSync(join(dir, 'final.json')) ? readJson(join(dir, 'final.json')) : null,
  };
}

function activePath(stateDir, sessionId) {
  const key = createHash('sha256').update(String(sessionId)).digest('hex').slice(0, 32);
  return join(resolve(stateDir), 'active', `${key}.json`);
}

export function bindActiveTask(stateDir, sessionId, taskId, { now = new Date().toISOString() } = {}) {
  cleanId(taskId, 'task_id');
  if (typeof sessionId !== 'string' || !sessionId.trim()) throw new Error('session_id is required');
  const binding = { schema_version: 2, task_id: taskId, close_requested: false, bound_at: now };
  writeAtomicJson(activePath(stateDir, sessionId), binding);
  return binding;
}

export function readActiveTask(stateDir, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return null;
  const path = activePath(stateDir, sessionId);
  return existsSync(path) ? readJson(path) : null;
}

export function requestActiveTaskFinalization(stateDir, sessionId, taskId, { now = new Date().toISOString() } = {}) {
  const current = readActiveTask(stateDir, sessionId);
  if (!current || current.task_id !== taskId) return null;
  const binding = { ...current, close_requested: true, close_requested_at: now };
  writeAtomicJson(activePath(stateDir, sessionId), binding);
  return binding;
}

export function clearActiveTask(stateDir, sessionId, taskId) {
  const current = readActiveTask(stateDir, sessionId);
  if (!current || current.task_id !== taskId) return false;
  unlinkSync(activePath(stateDir, sessionId));
  return true;
}

export function writeFinal(stateDir, taskId, finalRecord) {
  const path = join(taskDirectory(stateDir, taskId), 'final.json');
  writeAtomicJson(path, finalRecord);
  return { status: 'written', path, final: finalRecord };
}

export function listTaskBundles(stateDir) {
  const root = join(resolve(stateDir), 'tasks');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      try { return readTaskBundle(stateDir, entry.name); } catch { return null; }
    })
    .filter(Boolean)
    .sort((a, b) => a.meta.started_at.localeCompare(b.meta.started_at) || a.meta.task_id.localeCompare(b.meta.task_id));
}

export function reportDirectory(stateDir) {
  return join(resolve(stateDir), 'reports');
}
