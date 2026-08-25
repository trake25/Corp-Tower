import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { atomicWrites, jsonl, readJsonl, rootPath } from './task-report-storage.mjs';
import { isUnrecordedModel, validateMeasurement } from './task-report-schema.mjs';

export const V3_SCHEMA_VERSION = 3;
export const V3_CYCLE_SIZE = 12;
export const V3_SAMPLES_FILE = 'report/v3/data/samples.jsonl';
export const V3_INDEX_FILE = 'report/v3/reports/index.md';
export const V3_REPORT_ROOT = 'report/v3/reports/by-model';
export const COMPLEXITY_RUBRIC = Object.freeze({
  1: 'Routine, known-path change',
  2: 'Bounded single-subsystem work',
  3: 'Multi-component work or meaningful debugging uncertainty',
  4: 'Cross-domain, integration-heavy, or high-risk behavior',
  5: 'Architectural or exceptional multi-domain work with substantial compatibility or verification demands',
});

const MEASUREMENT_FIELDS = [
  'input_tokens',
  'cached_input_tokens',
  'cache_write_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'main_thread_tokens',
  'aggregate_worker_tokens',
  'total_tokens',
];
const COMPLEXITY_REASONS = new Set(['scope-expanded', 'scope-reduced', 'unexpected-debugging', 'integration-discovered', 'verification-expanded']);
const RETRIEVAL_RESULTS = new Set(['first-try', 'second-document', 'repository-fallback', 'doc-source-conflict', 'unavailable']);

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function text(value, label, errors, max = 200) {
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string`);
  else if (value.length > max) errors.push(`${label} is too long`);
}

function integer(value, label, errors, { nullable = false, min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < min || value > max) errors.push(`${label} must be an integer from ${min} to ${max}`);
}

function number(value, label, errors, { nullable = false, min = 0 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) errors.push(`${label} must be a finite number >= ${min}`);
}

export function measurement(value = null, kind = 'unavailable') {
  if (value === null || value === undefined || value === '') return { value: null, kind: 'unavailable' };
  const numeric = typeof value === 'number' ? value : Number(String(value).replaceAll(',', '').replace(/^~/, '').trim());
  if (!Number.isFinite(numeric)) return { value: null, kind: 'unavailable' };
  return { value: numeric, kind };
}

export function hashSession(sessionId) {
  if (!sessionId) return null;
  return createHash('sha256').update(String(sessionId)).digest('hex');
}

export function normalizeSegment(value) {
  return String(value || 'unknown').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown';
}

export function bucketKey(model, effort, estimatedComplexity) {
  return `${model}\u001f${effort}\u001f${estimatedComplexity}`;
}

export function bucketPath(model, effort, estimatedComplexity, root = '.') {
  return rootPath(root, join(V3_REPORT_ROOT, normalizeSegment(model), normalizeSegment(effort), `complexity-${estimatedComplexity}.md`));
}

export function sampleBucket(sample) {
  return bucketKey(sample.model, sample.effort, sample.estimated_complexity);
}

export function bucketParts(samples) {
  const grouped = new Map();
  for (const sample of samples) {
    const key = sampleBucket(sample);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(sample);
  }
  for (const rows of grouped.values()) rows.sort((a, b) => a.cycle - b.cycle || a.row - b.row);
  return grouped;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = (sorted.length - 1) / 2;
  const low = Math.floor(middle);
  const high = Math.ceil(middle);
  return low === high ? sorted[low] : Math.round((sorted[low] + sorted[high]) / 2);
}

function percentile(values, p) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  return low === high ? sorted[low] : Math.round(sorted[low] + (sorted[high] - sorted[low]) * (index - low));
}

function values(samples, field, kind = null) {
  return samples.map(sample => sample.observed?.[field]).filter(value => value && Number.isFinite(value.value) && (!kind || value.kind === kind)).map(value => value.value);
}

function ratio(numerator, denominator) {
  return denominator ? Number((numerator / denominator * 100).toFixed(1)) : null;
}

export function validateV3Sample(sample) {
  const errors = [];
  if (!object(sample)) return ['sample must be an object'];
  if (sample.schema_version !== V3_SCHEMA_VERSION) errors.push(`schema_version must be ${V3_SCHEMA_VERSION}`);
  text(sample.sample_id, 'sample.sample_id', errors, 180);
  text(sample.task_id, 'sample.task_id', errors, 120);
  text(sample.task, 'sample.task', errors, 120);
  text(sample.model, 'sample.model', errors, 200);
  if (isUnrecordedModel(sample.model)) errors.push('sample.model must be the exact implementing model variant');
  text(sample.effort, 'sample.effort', errors, 40);
  integer(sample.estimated_complexity, 'sample.estimated_complexity', errors, { min: 1, max: 5 });
  integer(sample.actual_complexity, 'sample.actual_complexity', errors, { nullable: true, min: 1, max: 5 });
  if (sample.actual_complexity !== null && sample.actual_complexity !== sample.estimated_complexity && !COMPLEXITY_REASONS.has(sample.complexity_reason)) errors.push('sample.complexity_reason is required when actual complexity differs from estimate');
  if (sample.complexity_reason !== null && !COMPLEXITY_REASONS.has(sample.complexity_reason)) errors.push('sample.complexity_reason is invalid');
  integer(sample.cycle, 'sample.cycle', errors, { min: 1 });
  integer(sample.row, 'sample.row', errors, { min: 1, max: V3_CYCLE_SIZE });
  text(sample.bucket_key, 'sample.bucket_key', errors, 500);
  if (sample.bucket_key !== bucketKey(sample.model, sample.effort, sample.estimated_complexity)) errors.push('sample.bucket_key does not match model, effort, and estimated complexity');
  if (typeof sample.fresh_session !== 'boolean') errors.push('sample.fresh_session must be boolean');
  if (sample.session_hash !== null && !/^[a-f0-9]{64}$/.test(sample.session_hash)) errors.push('sample.session_hash must be a sha256 value or null');
  if (!object(sample.estimate)) errors.push('sample.estimate must be an object');
  else {
    integer(sample.estimate.tokens, 'sample.estimate.tokens', errors, { min: 0 });
    if (!['manual', 'bucket-median'].includes(sample.estimate.source)) errors.push('sample.estimate.source must be manual or bucket-median');
    if (sample.estimate.timing !== 'pre-read') errors.push('sample.estimate.timing must be pre-read');
  }
  if (!object(sample.observed)) errors.push('sample.observed must be an object');
  else for (const field of MEASUREMENT_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(sample.observed, field)) errors.push(`sample.observed.${field} is required`);
    else validateMeasurement(sample.observed[field], `sample.observed.${field}`, errors);
  }
  integer(sample.scope?.domains, 'sample.scope.domains', errors, { min: 0 });
  integer(sample.scope?.files, 'sample.scope.files', errors, { min: 0 });
  integer(sample.context_bytes, 'sample.context_bytes', errors, { nullable: true, min: 0 });
  integer(sample.tool_calls, 'sample.tool_calls', errors, { nullable: true, min: 0 });
  if (!object(sample.retrieval) || !RETRIEVAL_RESULTS.has(sample.retrieval.result)) errors.push('sample.retrieval.result is invalid');
  if (!object(sample.outcome)) errors.push('sample.outcome is required');
  else { text(sample.outcome.verdict, 'sample.outcome.verdict', errors, 40); text(sample.outcome.summary, 'sample.outcome.summary', errors, 300); }
  if (!Array.isArray(sample.skills)) errors.push('sample.skills must be an array');
  text(sample.receipt, 'sample.receipt', errors, 300);
  number(sample.active_agent_seconds, 'sample.active_agent_seconds', errors, { nullable: true });
  number(sample.wall_duration_seconds, 'sample.wall_duration_seconds', errors, { nullable: true });
  if (sample.task_started_at !== null && typeof sample.task_started_at !== 'string') errors.push('sample.task_started_at must be an ISO string or null');
  if (sample.finalized_at !== null && typeof sample.finalized_at !== 'string') errors.push('sample.finalized_at must be an ISO string or null');
  integer(sample.worker_count, 'sample.worker_count', errors, { min: 0 });
  return errors;
}

export function nextBucketPosition(samples, model, effort, estimatedComplexity) {
  const rows = samples.filter(sample => sampleBucket(sample) === bucketKey(model, effort, estimatedComplexity)).sort((a, b) => a.cycle - b.cycle || a.row - b.row);
  const count = rows.length;
  return { cycle: Math.floor(count / V3_CYCLE_SIZE) + 1, row: (count % V3_CYCLE_SIZE) + 1, count, open_count: count % V3_CYCLE_SIZE };
}

export function estimateFromBucket(samples, { model, effort, estimatedComplexity, freshSession }) {
  const matching = samples.filter(sample => sample.model === model && sample.effort === effort && sample.estimated_complexity === estimatedComplexity && sample.fresh_session === freshSession && sample.cycle <= Math.floor(samples.filter(item => sampleBucket(item) === sampleBucket(sample)).length / V3_CYCLE_SIZE));
  const estimates = matching.map(sample => sample.observed?.total_tokens).filter(value => value?.kind === 'exact' && Number.isFinite(value.value)).map(value => value.value);
  return median(estimates);
}

export function createV3Sample({ manifest, values: input = {}, samples = [], v2TaskId = null, now = new Date().toISOString() }) {
  const model = String(manifest.runtime?.model || '').trim();
  const effort = String(manifest.runtime?.effort || input.effort || '').trim();
  const estimatedComplexity = Number(manifest.complexity?.estimated ?? input.complexity);
  const position = nextBucketPosition(samples, model, effort, estimatedComplexity);
  const actual = input.actualComplexity === undefined || input.actualComplexity === '' ? estimatedComplexity : Number(input.actualComplexity);
  const reason = input.complexityReason || (actual === estimatedComplexity ? null : null);
  const sessionHash = manifest.session?.hash || hashSession(manifest.session?.id) || hashSession(manifest.runtime?.session_id) || hashSession(`manifest:${manifest.task}:${manifest.estimate?.manifest_hash || ''}`);
  const observed = {};
  const aliases = { input_tokens: 'input', cached_input_tokens: 'cached_input_tokens', cache_write_input_tokens: 'cache_write_input_tokens', output_tokens: 'output_tokens', reasoning_output_tokens: 'reasoning_output_tokens', main_thread_tokens: 'main', aggregate_worker_tokens: 'aggregate_worker_tokens', total_tokens: 'total' };
  for (const field of MEASUREMENT_FIELDS) {
    const source = aliases[field];
    observed[field] = input.usage?.[field] || measurement(input[source], input[source] === undefined ? 'unavailable' : input.provenance || 'exact');
  }
  if (input.total !== undefined && input.usage?.total_tokens === undefined) observed.total_tokens = measurement(input.total, input.totalKind || 'exact');
  if (input.main !== undefined && input.usage?.main_thread_tokens === undefined) observed.main_thread_tokens = measurement(input.main, input.mainKind || 'exact');
  observed.total_tokens = observed.total_tokens?.value === null && Number.isFinite(input.total) ? measurement(input.total, input.totalKind || 'exact') : observed.total_tokens;
  const sample = {
    schema_version: V3_SCHEMA_VERSION,
    sample_id: `${normalizeSegment(model)}-${normalizeSegment(effort)}-c${estimatedComplexity}-c${position.cycle}-r${position.row}`,
    task_id: v2TaskId || manifest.run_id || `${manifest.task}-${now}`,
    task: manifest.task,
    model,
    effort,
    bucket_key: bucketKey(model, effort, estimatedComplexity),
    cycle: position.cycle,
    row: position.row,
    estimated_complexity: estimatedComplexity,
    actual_complexity: Number.isInteger(actual) ? actual : null,
    complexity_reason: reason,
    session_hash: sessionHash,
    fresh_session: Boolean(manifest.session?.fresh),
    estimate: { tokens: Number(manifest.estimate?.tokens), timing: 'pre-read', source: manifest.estimate?.source || 'manual', recorded_at: manifest.estimate?.recorded_at || now },
    observed,
    scope: { domains: Number(input.domains ?? manifest.domains?.length ?? 0), files: Number(input.files ?? manifest.changed_paths?.length ?? 0) },
    context_bytes: input.contextBytes === undefined ? null : Number(input.contextBytes),
    tool_calls: input.toolCalls === undefined ? null : Number(input.toolCalls),
    retrieval: { result: input.hit || 'unavailable', conflict_paths: input.conflictPaths || [] },
    outcome: { verdict: input.verdict || 'ok', summary: input.summary || 'Task completed with a passing task-close verification receipt.' },
    skills: input.skills || [],
  worker_count: Number(input.workerCount ?? input.workers ?? 0),
    active_agent_seconds: input.activeAgentSeconds === undefined ? null : Number(input.activeAgentSeconds),
    wall_duration_seconds: input.wallDurationSeconds === undefined ? null : Number(input.wallDurationSeconds),
    task_started_at: input.taskStartedAt || manifest.task_started_at || null,
    finalized_at: input.finalizedAt || now,
    receipt: input.receipt || manifest.verification?.receipt || 'task/receipt.json',
    v2_task_id: v2TaskId,
  };
  return sample;
}

export function readV3Samples(root = '.') {
  return readJsonl(rootPath(root, V3_SAMPLES_FILE));
}

function format(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
}

function tableValue(value, kind = false) {
  if (!value || !Number.isFinite(value.value)) return '—';
  return `${kind && value.kind === 'estimated' ? '~' : ''}${format(value.value)}`;
}

function cacheRatio(samples) {
  const input = values(samples, 'input_tokens').reduce((sum, value) => sum + value, 0);
  const cached = values(samples, 'cached_input_tokens').reduce((sum, value) => sum + value, 0);
  return ratio(cached, input);
}

export function analyzeV3(samples) {
  const grouped = bucketParts(samples);
  const buckets = [];
  for (const [key, rows] of grouped) {
    const closed = Math.floor(rows.length / V3_CYCLE_SIZE);
    const total = values(rows, 'total_tokens');
    const active = rows.map(row => row.active_agent_seconds).filter(Number.isFinite);
    const wall = rows.map(row => row.wall_duration_seconds).filter(Number.isFinite);
    const errors = rows.map(row => Number.isFinite(row.estimate?.tokens) && Number.isFinite(row.observed?.total_tokens?.value) ? Math.abs(row.observed.total_tokens.value - row.estimate.tokens) : null).filter(Number.isFinite);
    const firstTry = rows.filter(row => row.retrieval?.result === 'first-try').length;
    buckets.push({
      key,
      model: rows[0].model,
      effort: rows[0].effort,
      estimated_complexity: rows[0].estimated_complexity,
      count: rows.length,
      closed_cycles: closed,
      open_count: rows.length % V3_CYCLE_SIZE,
      fresh: { fresh: rows.filter(row => row.fresh_session).length, continued: rows.filter(row => !row.fresh_session).length },
      median_total: median(total),
      median_active_time: median(active),
      median_wall_time: median(wall),
      cache_percent: cacheRatio(rows),
      p90_total: percentile(total, 0.9),
      median_absolute_estimate_error: median(errors),
      first_try: { count: firstTry, total: rows.length, percentage: ratio(firstTry, rows.length) },
      complexity_calibration: { matched: rows.filter(row => row.actual_complexity === row.estimated_complexity).length, total: rows.length },
      worker_counts: [...new Set(rows.map(row => row.worker_count))].sort((a, b) => a - b),
      measurement_kinds: [...new Set(rows.map(row => row.observed?.total_tokens?.kind).filter(Boolean))].sort(),
    });
  }
  buckets.sort((a, b) => a.model.localeCompare(b.model) || a.effort.localeCompare(b.effort) || a.estimated_complexity - b.estimated_complexity);
  return { cycle_size: V3_CYCLE_SIZE, bucket_count: buckets.length, buckets };
}

function dashboardRow(bucket) {
  const freshness = `${bucket.fresh.fresh}/${bucket.fresh.continued}`;
  return `| ${bucket.model} | ${bucket.effort} | ${bucket.estimated_complexity} | ${bucket.closed_cycles} | ${bucket.open_count}/12 | ${freshness} | ${format(bucket.median_total)} | ${format(bucket.median_active_time)} | ${format(bucket.median_wall_time)} | ${bucket.cache_percent === null ? '—' : `${bucket.cache_percent}%`} | ${format(bucket.p90_total)} | ${format(bucket.median_absolute_estimate_error)} | ${bucket.first_try.percentage === null ? '—' : `${bucket.first_try.percentage}%`} |`;
}

function sampleRow(sample) {
  const hit = { 'first-try': '✓', 'second-document': '~', 'repository-fallback': '✗', 'doc-source-conflict': '!', unavailable: '—' }[sample.retrieval?.result] || '—';
  const scope = `${format(sample.scope?.domains)}/${format(sample.scope?.files)}`;
  const input = sample.observed?.input_tokens?.value;
  const cached = sample.observed?.cached_input_tokens?.value;
  const cachePercent = Number.isFinite(input) && input > 0 && Number.isFinite(cached) ? `${ratio(cached, input)}%` : '—';
  const timing = Number.isFinite(sample.active_agent_seconds) || Number.isFinite(sample.wall_duration_seconds) ? `${format(sample.active_agent_seconds)}/${format(sample.wall_duration_seconds)}` : '—';
  return `| ${sample.row} | ${String(sample.task).replaceAll('|', '\\|')} | ${sample.fresh_session ? 'fresh' : 'continued'} | ${format(sample.actual_complexity)} | ${scope} | ${format(sample.estimate?.tokens)} | ${tableValue(sample.observed?.total_tokens, true)} | ${Number.isFinite(sample.estimate?.tokens) && Number.isFinite(sample.observed?.total_tokens?.value) ? format(sample.observed.total_tokens.value - sample.estimate.tokens) : '—'} | ${cachePercent} | ${timing} | ${hit} | ${format(sample.outcome?.verdict)} |`;
}

export function renderV3Index(samples) {
  const analysis = analyzeV3(samples);
  let output = '# Task reporting v3\n\n';
  output += 'Compact dashboard. Each bucket is exact model × effort × estimated complexity; cycles close every 12 verified samples. Pricing is intentionally absent.\n\n';
  output += '| Model | Effort | Est Cx | Closed cycles | Open n/12 | Fresh/continued | Median total | Median active time | Median wall time | Cache % | P90 | Median absolute estimate error | First-try |\n|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|\n';
  output += analysis.buckets.map(dashboardRow).join('\n') || '| — | — | — | 0 | 0/12 | — | — | — | — | — | — | — | — |';
  output += `\n\nDefinitions: active time excludes human or approval waits; wall time includes them. Cache % is cached input ÷ input. First-try is receipt-linked retrieval. Complexity: ${Object.entries(COMPLEXITY_RUBRIC).map(([key, value]) => `${key}=${value}`).join('; ')}.\n`;
  return output;
}

export function renderV3Bucket(rows) {
  const first = rows[0];
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.cycle)) groups.set(row.cycle, []);
    groups.get(row.cycle).push(row);
  }
  let output = `# ${first.model} · ${first.effort} · estimated complexity ${first.estimated_complexity}\n\n`;
  output += 'Rows are assigned by estimated complexity. Actual complexity is calibration only. Closed cycles contain exactly 12 rows.\n\n';
  for (const [cycle, cycleRows] of groups) {
    const closed = cycleRows.length === V3_CYCLE_SIZE;
    output += `## Cycle ${cycle} (${closed ? 'closed' : 'open'})\n\n`;
    output += '| # | Task | Fresh | Actual Cx | Scope D/F | Est total | Actual total | Error | Cache % | Active/Wall | Hit | Result |\n|---:|---|---|---:|---|---:|---:|---:|---:|---:|---|---|\n';
    output += cycleRows.sort((a, b) => a.row - b.row).map(sampleRow).join('\n') + '\n\n';
  }
  return output.trimEnd() + '\n';
}

export function renderV3Files(root, samples) {
  const writes = [{ file: rootPath(root, V3_SAMPLES_FILE), content: jsonl(samples) }, { file: rootPath(root, V3_INDEX_FILE), content: renderV3Index(samples) }];
  for (const rows of bucketParts(samples).values()) writes.push({ file: bucketPath(rows[0].model, rows[0].effort, rows[0].estimated_complexity, root), content: renderV3Bucket(rows) });
  return writes;
}

export function validateV3Store(root = '.', samples = readV3Samples(root)) {
  const errors = [];
  const ids = new Set();
  const buckets = new Map();
  samples.forEach((sample, index) => {
    validateV3Sample(sample).forEach(error => errors.push(`sample ${index + 1}: ${error}`));
    if (ids.has(sample.sample_id)) errors.push(`duplicate sample_id ${sample.sample_id}`);
    ids.add(sample.sample_id);
    const key = sampleBucket(sample);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(sample);
  });
  for (const [key, rows] of buckets) {
    rows.sort((a, b) => a.cycle - b.cycle || a.row - b.row);
    rows.forEach((sample, index) => {
      const expectedCycle = Math.floor(index / V3_CYCLE_SIZE) + 1;
      const expectedRow = index % V3_CYCLE_SIZE + 1;
      if (sample.cycle !== expectedCycle || sample.row !== expectedRow) errors.push(`${key} rows must be contiguous at cycle ${expectedCycle} row ${expectedRow}`);
    });
  }
  const expected = renderV3Files(root, samples);
  for (const write of expected.slice(1)) {
    if (!existsSync(write.file)) errors.push(`generated v3 report not found: ${relative(root, write.file)}`);
    else if (readFileSync(write.file, 'utf8') !== write.content) errors.push(`generated v3 report is stale: ${relative(root, write.file)}`);
  }
  return errors;
}

export function writeV3Store(root, samples) {
  mkdirSync(rootPath(root, 'report/v3/data'), { recursive: true });
  return atomicWrites(renderV3Files(root, samples));
}

export function compareV3(samples, { freshness = null, workers = null } = {}) {
  const analysis = analyzeV3(samples).buckets.map(bucket => {
    const closed = samples.filter(sample => sampleBucket(sample) === bucket.key && sample.cycle <= bucket.closed_cycles && (freshness === null || sample.fresh_session === freshness) && (workers === null || sample.worker_count === Number(workers)));
    return { bucket, rows: closed };
  }).filter(({ bucket, rows }) => bucket.closed_cycles > 0 && rows.length >= V3_CYCLE_SIZE);
  const byComplexity = new Map();
  for (const { bucket, rows } of analysis) {
    if (!byComplexity.has(bucket.estimated_complexity)) byComplexity.set(bucket.estimated_complexity, []);
    const totals = values(rows, 'total_tokens');
    const active = rows.map(row => row.active_agent_seconds).filter(Number.isFinite);
    const wall = rows.map(row => row.wall_duration_seconds).filter(Number.isFinite);
    byComplexity.get(bucket.estimated_complexity).push({ ...bucket, median_total: median(totals), median_active_time: median(active), median_wall_time: median(wall), fresh: { fresh: rows.filter(row => row.fresh_session).length, continued: rows.filter(row => !row.fresh_session).length }, worker_counts: [...new Set(rows.map(row => row.worker_count))].sort((a, b) => a - b) });
  }
  const matrix = [...byComplexity.entries()].filter(([, rows]) => rows.length >= 2).map(([complexity, rows]) => ({ estimated_complexity: complexity, evidence: rows.sort((a, b) => (a.median_total ?? Infinity) - (b.median_total ?? Infinity)).map(row => ({ model: row.model, effort: row.effort, closed_cycles: row.closed_cycles, median_total: row.median_total, median_active_time: row.median_active_time, median_wall_time: row.median_wall_time, measurement_kinds: row.measurement_kinds, fresh: row.fresh, worker_counts: row.worker_counts })) }));
  return { status: matrix.length ? 'evidence' : 'insufficient-data', label: 'evidence for the next model/effort choice; not an automatic winner', freshness: freshness === null ? 'separate-by-session-type' : freshness ? 'fresh' : 'continued', workers: workers === null ? 'separate-by-worker-count' : Number(workers), matrix };
}

export function runtimeDiagnose(metadata = {}) {
  return {
    adapter: metadata.adapter || 'unavailable',
    provenance: metadata.provenance || 'none',
    fields: Object.fromEntries(['model', 'effort', 'session_id', 'session_hash', 'fresh_session', 'usage_baseline', 'task_started_at', 'transcript'].map(field => [field, metadata[field] !== undefined && metadata[field] !== null])),
  };
}
