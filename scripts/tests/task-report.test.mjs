import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { analyzeRecords } from '../lib/task-report-analysis.mjs';
import { isUnrecordedModel, validateTaskRecord } from '../lib/task-report-schema.mjs';

const CLI = resolve('scripts/task-report.mjs');

function run(root, args) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd: resolve('.'), env: { ...process.env, TASK_REPORT_ROOT: root }, encoding: 'utf8' });
}

function record({ cycle = 1, row = 1, source, receipt = `task/r${row}.receipt.json` } = {}) {
  return {
    schema_version: 1,
    ...(source ? { source } : {}),
    task_id: `c${cycle}-r${row}`,
    cycle,
    row,
    task: `Fixture task ${row}`,
    complexity: 2,
    mode: 'A',
    scope: { domains: 1, files: 1, manifest: 'task/manifest.json' },
    estimate: { tokens: 1000, timing: 'pre-read', basis: 'fixture route and map' },
    observed: {
      source_read_tokens: { value: 900 + row, kind: 'estimated' },
      total_tokens: { value: 2000 + row, kind: 'estimated' },
      main_thread_tokens: { value: 2000 + row, kind: 'estimated' },
      context_bytes: 100,
      tool_calls: 2,
    },
    retrieval: { result: 'first-try', conflict_paths: [] },
    outcome: { verdict: 'ok', summary: 'Fixture passed.' },
    runtime: { model: 'gpt-5.6-terra', effort: 'medium' },
    skills: ['qa-engineer'],
    receipt,
  };
}

function setupStore(root, records, state = { schema_version: 1, status: 'open', open_cycle: 1, next_row: records.length + 1, closed_cycles: [] }) {
  mkdirSync(join(root, 'report'), { recursive: true });
  mkdirSync(join(root, 'task'), { recursive: true });
  writeFileSync(join(root, 'report/task-records.jsonl'), records.map(value => JSON.stringify(value)).join('\n') + (records.length ? '\n' : ''));
  writeFileSync(join(root, 'report/task-cycle-reviews.jsonl'), '');
  writeFileSync(join(root, 'report/task-cycle-state.json'), `${JSON.stringify(state, null, 2)}\n`);
  for (const current of records) writeFileSync(join(root, current.receipt), JSON.stringify({ status: 'passed', manifest: 'task/manifest.json' }));
  const rendered = run(root, ['render']);
  assert.equal(rendered.status, 0, rendered.stderr);
}

function manifest(root) {
  writeFileSync(join(root, 'task/manifest.json'), JSON.stringify({
    schema_version: 1,
    task: 'Fixture task',
    estimate: { tokens: 1000, timing: 'pre-read', basis: 'fixture route and map' },
    runtime: { model: 'gpt-5.6-terra', recorded_at: '2026-08-25T00:00:00.000Z' },
  }));
}

test('standard records reject an unrecorded model variant', () => {
  assert.equal(isUnrecordedModel('gpt-5.6 (variant unrecorded)'), true);
  assert.equal(isUnrecordedModel('gpt-5.6-terra'), false);
  const errors = validateTaskRecord({ ...record(), runtime: { model: null, effort: 'medium' } });
  assert.match(errors.join('\n'), /exact implementing model variant/);
});

test('start requires the exact model variant before recording the estimate', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-intake-'));
  try {
    mkdirSync(join(root, 'task'), { recursive: true });
    const args = ['start', '--manifest', 'task/manifest.json', '--r-est', '1000', '--r-est-basis', 'fixture route'];
    const missing = run(root, args);
    assert.notEqual(missing.status, 0);
    const started = run(root, [...args, '--model-variant', 'gpt-5.6-terra']);
    assert.equal(started.status, 0, started.stderr);
    const intake = JSON.parse(readFileSync(join(root, 'task/manifest.json'), 'utf8'));
    assert.equal(intake.runtime.model, 'gpt-5.6-terra');
    assert.equal(intake.estimate.timing, 'pre-read');
    assert.match(intake.estimate.manifest_hash, /^[a-f0-9]{64}$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('append requires a passed receipt, intake estimate, and exact model variant', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-report-'));
  try {
    setupStore(root, []);
    manifest(root);
    writeFileSync(join(root, 'task/manifest.receipt.json'), JSON.stringify({ status: 'passed', manifest: 'task/manifest.json' }));
    const args = ['append', '--manifest', 'task/manifest.json', '--receipt', 'task/manifest.receipt.json', '--complexity', '2', '--mode', 'A', '--domains', '1', '--files', '1', '--r-act', '900', '--total', '2000', '--main', '2000', '--hit', 'first-try', '--verdict', 'ok', '--effort', 'medium', '--skills', 'qa-engineer'];
    const variantOverride = run(root, [...args, '--model', 'gpt-5.6-terra']);
    assert.notEqual(variantOverride.status, 0);
    writeFileSync(join(root, 'task/manifest.json'), JSON.stringify({ schema_version: 1, task: 'Fixture task', estimate: { tokens: 1000, timing: 'pre-read', basis: 'fixture route and map' }, runtime: { model: 'gpt-5.6 (variant unrecorded)' } }));
    const missingVariant = run(root, args);
    assert.notEqual(missingVariant.status, 0);
    assert.equal(readFileSync(join(root, 'report/task-records.jsonl'), 'utf8'), '');
    writeFileSync(join(root, 'task/manifest.receipt.json'), JSON.stringify({ status: 'failed', manifest: 'task/manifest.json' }));
    const failedReceipt = run(root, [...args, '--model', 'gpt-5.6-terra']);
    assert.notEqual(failedReceipt.status, 0);
    assert.equal(readFileSync(join(root, 'report/task-records.jsonl'), 'utf8'), '');
    writeFileSync(join(root, 'task/manifest.receipt.json'), JSON.stringify({ status: 'passed', manifest: 'task/manifest.json' }));
    writeFileSync(join(root, 'task/manifest.json'), JSON.stringify({ schema_version: 1, task: 'Fixture task', estimate: { tokens: 1000, timing: 'pre-read', basis: 'fixture route and map' }, runtime: { model: 'gpt-5.6-terra' } }));
    const appended = run(root, args);
    assert.equal(appended.status, 0, appended.stderr);
    const validated = run(root, ['validate']);
    assert.equal(validated.status, 0, validated.stderr);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('close-cycle rejects an incomplete cycle without mutating state or reviews', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-incomplete-'));
  try {
    setupStore(root, Array.from({ length: 19 }, (_, index) => record({ row: index + 1 })));
    const before = readFileSync(join(root, 'report/task-cycle-state.json'), 'utf8');
    const rejected = run(root, ['close-cycle', '--accept-factual']);
    assert.notEqual(rejected.status, 0);
    assert.equal(readFileSync(join(root, 'report/task-cycle-state.json'), 'utf8'), before);
    assert.equal(readFileSync(join(root, 'report/task-cycle-reviews.jsonl'), 'utf8'), '');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validate rejects a duplicate task id', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-duplicate-'));
  try {
    const first = record({ row: 1 });
    const duplicate = { ...record({ row: 2 }), task_id: first.task_id };
    setupStore(root, [first, duplicate]);
    const rejected = run(root, ['validate', '--quiet']);
    assert.notEqual(rejected.status, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('close-cycle atomically closes twenty receipt-linked standard rows and opens the next cycle', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-cycle-'));
  try {
    const records = Array.from({ length: 20 }, (_, index) => record({ row: index + 1 }));
    setupStore(root, records);
    const closed = run(root, ['close-cycle', '--finding', 'The fixture stayed within the measured range.', '--recommendation', 'Keep receipt linkage mandatory.']);
    assert.equal(closed.status, 0, closed.stderr);
    const state = JSON.parse(readFileSync(join(root, 'report/task-cycle-state.json'), 'utf8'));
    assert.equal(state.open_cycle, 2);
    assert.equal(state.next_row, 1);
    assert.deepEqual(state.closed_cycles, [1]);
    assert.equal(readFileSync(join(root, 'report/task-records.jsonl'), 'utf8').trim().split('\n').length, 20);
    assert.match(readFileSync(join(root, 'report/task-token-cost-effectivity.md'), 'utf8'), /## Cycle 2 \(open\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('analysis separates measurement provenance and reports bounded counts', () => {
  const records = [record({ row: 1 }), { ...record({ row: 2 }), observed: { ...record({ row: 2 }).observed, total_tokens: { value: 3000, kind: 'exact' } } }];
  const result = analyzeRecords(records, { from: 1, to: 1, closedCycles: [1] });
  assert.equal(result.aggregate.task_count, 2);
  assert.equal(result.aggregate.measurements.total_tokens.estimated.count, 1);
  assert.equal(result.aggregate.measurements.total_tokens.exact.count, 1);
  assert.deepEqual(result.aggregate.retrieval['first-try'], { count: 2, total: 2, percentage: 100 });
});
