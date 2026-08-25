import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const DEFAULT_RECORDS_FILE = 'report/v2/data/task-records.jsonl';
export const DEFAULT_REVIEWS_FILE = 'report/v2/data/task-cycle-reviews.jsonl';
export const DEFAULT_STATE_FILE = 'report/v2/data/task-cycle-state.json';
export const DEFAULT_REPORT_FILE = 'report/v2/reports/task-token-cost-effectivity.md';
export const LEGACY_RECORDS_FILE = 'report/task-records.jsonl';
export const LEGACY_REVIEWS_FILE = 'report/task-cycle-reviews.jsonl';
export const LEGACY_STATE_FILE = 'report/task-cycle-state.json';
export const LEGACY_REPORT_FILE = 'report/task-token-cost-effectivity.md';

export function rootPath(root, relativePath) {
  return resolve(root, relativePath);
}

export function resolveReportPath(root, requested, canonical, legacy) {
  if (requested) return rootPath(root, requested);
  const modern = rootPath(root, canonical);
  if (existsSync(modern)) return modern;
  const old = rootPath(root, legacy);
  return existsSync(old) ? old : modern;
}

export function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`${file}:${index + 1} is not valid JSON: ${error.message}`); }
  });
}

export function jsonl(records) {
  return records.length ? `${records.map(record => JSON.stringify(record)).join('\n')}\n` : '';
}

export function writeJsonl(file, records) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, jsonl(records));
}

export function readJson(file, fallback = null) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

export function atomicWrites(writes) {
  const staged = [];
  try {
    for (const { file, content } of writes) {
      mkdirSync(dirname(file), { recursive: true });
      const temporary = `${file}.tmp-${process.pid}-${Date.now()}-${staged.length}`;
      writeFileSync(temporary, content);
      staged.push({ temporary, file });
    }
    staged.forEach(({ temporary, file }) => renameSync(temporary, file));
  } catch (error) {
    staged.forEach(({ temporary }) => { try { if (existsSync(temporary)) writeFileSync(temporary, ''); } catch {} });
    throw error;
  }
}

export function stateFromRecords(records) {
  const cycles = new Map();
  records.forEach(record => {
    if (!cycles.has(record.cycle)) cycles.set(record.cycle, []);
    cycles.get(record.cycle).push(record);
  });
  const cycleNumbers = [...cycles.keys()].sort((a, b) => b - a);
  const openCycle = cycleNumbers[0] || 1;
  const rows = cycles.get(openCycle) || [];
  const maxRow = rows.reduce((max, record) => Math.max(max, record.row), 0);
  return {
    schema_version: 1,
    status: 'open',
    open_cycle: openCycle,
    next_row: maxRow + 1,
    closed_cycles: cycleNumbers.filter(cycle => cycle !== openCycle),
  };
}
