import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { completionTiming, readRuntimeMetadata, usageDelta } from '../lib/task-report-runtime.mjs';
import { bucketKey, createV3Sample, nextBucketPosition, renderV3Bucket, validateV3Sample } from '../lib/task-report-v3.mjs';

function manifest(overrides = {}) {
  return {
    task: 'Fixture v3 task',
    run_id: 'run-1',
    runtime: { model: 'gpt-5.6-sol', effort: 'high' },
    complexity: { estimated: 3 },
    estimate: { tokens: 1000, source: 'manual', recorded_at: '2026-08-25T00:00:00.000Z' },
    session: { hash: 'a'.repeat(64), fresh: true },
    verification: { receipt: 'task/fixture.receipt.json' },
    ...overrides,
  };
}

function sample(index, overrides = {}) {
  return createV3Sample({ manifest: { ...manifest(), run_id: `run-${index}` }, values: { total: String(2000 + index), main: String(1800 + index), domains: 1, files: 2, hit: 'first-try', verdict: 'ok', skills: ['qa-engineer'], ...overrides }, samples: [] });
}

test('v3 position is independent for model, effort, and estimated complexity', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ ...sample(index), cycle: 1, row: index + 1 }));
  assert.deepEqual(nextBucketPosition(rows, 'gpt-5.6-sol', 'high', 3), { cycle: 2, row: 1, count: 12, open_count: 0 });
  assert.deepEqual(nextBucketPosition(rows, 'gpt-5.6-terra', 'high', 3), { cycle: 1, row: 1, count: 0, open_count: 0 });
  assert.notEqual(bucketKey('gpt-5.6-sol', 'high', 3), bucketKey('gpt-5.6-sol', 'high', 4));
});

test('realized complexity cannot relocate a sample and requires a reason', () => {
  const invalid = sample(1, { actualComplexity: 4 });
  assert.match(validateV3Sample(invalid).join('\n'), /complexity_reason is required/);
  const valid = sample(1, { actualComplexity: 4, complexityReason: 'scope-expanded' });
  assert.deepEqual(validateV3Sample(valid), []);
  assert.equal(valid.estimated_complexity, 3);
  assert.equal(valid.actual_complexity, 4);
});

test('closed bucket rendering uses the compact twelve-row table', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({ ...sample(index), cycle: 1, row: index + 1 }));
  const report = renderV3Bucket(rows);
  assert.match(report, /## Cycle 1 \(closed\)/);
  assert.equal((report.match(/^\| \d+ \|/gm) || []).length, 12);
  assert.match(report, /Est total \| Actual total \| Error \| Cache % \| Active\/Wall/);
});

test('runtime adapter gives collaboration settings precedence and hashes the session', async () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-tower-runtime-'));
  try {
    const transcript = join(root, 'rollout.jsonl');
    mkdirSync(root, { recursive: true });
    writeFileSync(transcript, [
      JSON.stringify({ timestamp: '2026-08-25T00:00:00.000Z', type: 'turn_context', payload: { model: 'gpt-5.6-terra', reasoning_effort: 'medium', collaboration_mode: { settings: { model: 'gpt-5.6-sol', reasoning_effort: 'xhigh' } } } }),
      JSON.stringify({ timestamp: '2026-08-25T00:00:01.000Z', type: 'event_msg', payload: { type: 'task_started', started_at: 1787616001 } }),
      JSON.stringify({ timestamp: '2026-08-25T00:00:02.000Z', type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 } } } }),
    ].join('\n'));
    const metadata = await readRuntimeMetadata({ env: { CODEX_THREAD_ID: 'thread-fixture', CODEX_TRANSCRIPT_PATH: transcript }, samples: [] });
    assert.equal(metadata.model, 'gpt-5.6-sol');
    assert.equal(metadata.effort, 'xhigh');
    assert.match(metadata.session_hash, /^[a-f0-9]{64}$/);
    assert.equal(metadata.session_id, 'thread-fixture');
    assert.equal(metadata.usage_baseline.total_tokens, 12);
    assert.equal(JSON.stringify(metadata), JSON.stringify(metadata).replace('thread-fixture', metadata.session_id));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('usage deltas and active timing exclude human or approval waits', () => {
  assert.deepEqual(usageDelta({ input_tokens: 10, cached_input_tokens: 4, output_tokens: 2, reasoning_output_tokens: 1, total_tokens: 12 }, { input_tokens: 20, cached_input_tokens: 9, output_tokens: 5, reasoning_output_tokens: 3, total_tokens: 25 }), { input_tokens: 10, cached_input_tokens: 5, cache_write_input_tokens: 0, output_tokens: 3, reasoning_output_tokens: 2, total_tokens: 13 });
  const timing = completionTiming([
    { type: 'item_started', at: 1000, payload: { item: { id: 'turn', type: 'Reasoning' } } },
    { type: 'item_completed', at: 3000, payload: { item: { id: 'turn', type: 'Reasoning' } } },
    { type: 'item_started', at: 5000, payload: { item: { id: 'approval', type: 'ApprovalWait' } } },
    { type: 'item_completed', at: 15000, payload: { item: { id: 'approval', type: 'ApprovalWait' } } },
    { type: 'item_started', at: 16000, payload: { item: { id: 'tool', type: 'CommandExecution' } } },
    { type: 'item_completed', at: 18000, payload: { item: { id: 'tool', type: 'CommandExecution' } } },
  ], { taskStartedAt: '1970-01-01T00:00:01.000Z', finalizedAt: '1970-01-01T00:00:20.000Z' });
  assert.equal(timing.active_agent_seconds, 4);
  assert.equal(timing.wall_duration_seconds, 19);
});
