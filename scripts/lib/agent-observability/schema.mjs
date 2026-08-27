export const SCHEMA_VERSION = 2;
export const OUTCOMES = new Set(['completed', 'blocked', 'cancelled', 'failed', 'replaced']);
export const VERIFICATION_STATES = new Set(['passed', 'failed', 'not_run', 'not_applicable', 'unknown']);
export const COMPLEXITIES = new Set(['C1', 'C2', 'C3', 'C4', 'C5', 'unknown']);
export const STAGES = [
  'intake',
  'retrieval_context',
  'planning',
  'implementation',
  'verification',
  'documentation',
  'closeout',
  'flagging',
  'analytics',
  'other',
];
export const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra', 'unknown']);
export const JUDGMENT_MAX_BYTES = 512;
export const EVIDENCE_KINDS = new Set(['tool', 'compaction', 'lifecycle', 'verification']);
export const EVIDENCE_OUTCOMES = new Set(['passed', 'failed', 'observed', 'unknown']);

const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,79}$/;
const SLUG = /^[a-z][a-z0-9_]{0,47}$/;
const SENSITIVE_TEXT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /(?:^|\s)(?:\/home\/|[A-Za-z]:\\Users\\)/,
  /https?:\/\//i,
];

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function assertObject(value, label) {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
}

export function assertAllowedKeys(value, allowed, label) {
  assertObject(value, label);
  const unexpected = Object.keys(value).filter(key => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label} contains prohibited fields: ${unexpected.join(', ')}`);
}

export function assertByteBudget(value, label, maxBytes) {
  const bytes = Buffer.byteLength(JSON.stringify(value));
  if (bytes > maxBytes) throw new Error(`${label} exceeds ${maxBytes} bytes`);
  return bytes;
}

export function cleanId(value, label) {
  if (typeof value !== 'string' || !ID.test(value)) throw new Error(`${label} must be a safe identifier`);
  return value;
}

export function cleanName(value, label, fallback = 'unknown') {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string' || !NAME.test(value)) throw new Error(`${label} must be a bounded runtime name`);
  return value;
}

export function cleanSlug(value, label, fallback = null) {
  if ((value === undefined || value === null || value === '') && fallback !== null) return fallback;
  if (typeof value !== 'string' || !SLUG.test(value)) throw new Error(`${label} must be a lowercase slug`);
  return value;
}

export function cleanText(value, label, maxLength, { required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text`);
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains prohibited control characters`);
  const text = value.trim().replace(/\s+/g, ' ');
  if (!text || text.length > maxLength) throw new Error(`${label} must be 1-${maxLength} characters`);
  if (SENSITIVE_TEXT.some(pattern => pattern.test(text)))
    throw new Error(`${label} contains prohibited or sensitive text`);
  return text;
}

export function nonNegativeInteger(value, label, fallback = null) {
  if ((value === undefined || value === null) && fallback !== null) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function cleanBoolean(value, label, fallback = null) {
  if ((value === undefined || value === null) && fallback !== null) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

export function cleanTimestamp(value, label, fallback = null) {
  const candidate = value ?? fallback;
  if (!candidate || Number.isNaN(Date.parse(candidate))) throw new Error(`${label} must be an ISO timestamp`);
  return new Date(candidate).toISOString();
}

export function cleanStringList(value, label, { maxItems = 12, maxLength = 80, slug = false } = {}) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new Error(`${label} must be an array with at most ${maxItems} items`);
  const cleaned = value.map((item, index) => slug
    ? cleanSlug(item, `${label}[${index}]`)
    : cleanName(item, `${label}[${index}]`));
  if (cleaned.some(item => item.length > maxLength)) throw new Error(`${label} contains an oversized item`);
  return [...new Set(cleaned)].sort();
}

function cleanCountGroup(value, label, fields) {
  const input = value ?? {};
  assertAllowedKeys(input, fields, label);
  return Object.fromEntries(fields.map(field => [field, nonNegativeInteger(input[field], `${label}.${field}`, 0)]));
}

export function sanitizeMeta(input, { taskId, now = new Date().toISOString() } = {}) {
  assertAllowedKeys(input, [
    'task_id', 'root_task_id', 'parent_task_id', 'started_at', 'label', 'task_type',
    'complexity', 'complexity_reason', 'domains',
  ], 'task metadata');
  const id = cleanId(taskId || input.task_id, 'task_id');
  const complexity = input.complexity || 'unknown';
  if (!COMPLEXITIES.has(complexity)) throw new Error('complexity is invalid');
  const meta = {
    schema_version: SCHEMA_VERSION,
    task_id: id,
    root_task_id: cleanId(input.root_task_id || id, 'root_task_id'),
    parent_task_id: input.parent_task_id ? cleanId(input.parent_task_id, 'parent_task_id') : null,
    started_at: cleanTimestamp(input.started_at, 'started_at', now),
    label: cleanText(input.label || 'Repository task', 'label', 120),
    task_type: cleanSlug(input.task_type || 'other', 'task_type'),
    complexity,
    complexity_reason: cleanText(input.complexity_reason, 'complexity_reason', 120, { required: false }),
    domains: cleanStringList(input.domains, 'domains', { maxItems: 8, maxLength: 48, slug: true }),
    status: 'open',
  };
  assertByteBudget({
    label: meta.label,
    task_type: meta.task_type,
    complexity: meta.complexity,
    complexity_reason: meta.complexity_reason,
    domains: meta.domains,
  }, 'judgment sidecar', JUDGMENT_MAX_BYTES);
  return meta;
}

export function sanitizeTelemetry(input = {}) {
  assertAllowedKeys(input, [
    'tools', 'retrieval', 'skills', 'worker_count', 'files', 'iterations',
    'checks', 'documentation', 'task_close',
  ], 'telemetry');
  const retrieval = input.retrieval ?? {};
  assertAllowedKeys(retrieval, ['attempts', 'expansions', 'fallbacks', 'first_try'], 'telemetry.retrieval');
  const files = input.files ?? {};
  assertAllowedKeys(files, ['inspected', 'modified', 'domains'], 'telemetry.files');
  const domains = files.domains ?? {};
  assertObject(domains, 'telemetry.files.domains');
  const domainCounts = {};
  for (const [name, count] of Object.entries(domains)) domainCounts[cleanSlug(name, 'telemetry.files.domains key')] = nonNegativeInteger(count, `telemetry.files.domains.${name}`);
  const taskClose = input.task_close ?? {};
  assertAllowedKeys(taskClose, ['status', 'receipt_hash'], 'telemetry.task_close');
  return {
    tools: cleanCountGroup(input.tools, 'telemetry.tools', ['calls', 'failures', 'retries']),
    retrieval: {
      attempts: nonNegativeInteger(retrieval.attempts, 'telemetry.retrieval.attempts', 0),
      expansions: nonNegativeInteger(retrieval.expansions, 'telemetry.retrieval.expansions', 0),
      fallbacks: nonNegativeInteger(retrieval.fallbacks, 'telemetry.retrieval.fallbacks', 0),
      first_try: cleanBoolean(retrieval.first_try, 'telemetry.retrieval.first_try', false),
    },
    skills: cleanStringList(input.skills, 'telemetry.skills', { maxItems: 16, maxLength: 64 }),
    worker_count: nonNegativeInteger(input.worker_count, 'telemetry.worker_count', 0),
    files: {
      inspected: nonNegativeInteger(files.inspected, 'telemetry.files.inspected', 0),
      modified: nonNegativeInteger(files.modified, 'telemetry.files.modified', 0),
      domains: Object.fromEntries(Object.entries(domainCounts).sort(([a], [b]) => a.localeCompare(b))),
    },
    iterations: cleanCountGroup(input.iterations, 'telemetry.iterations', ['implementation', 'rework']),
    checks: cleanCountGroup(input.checks, 'telemetry.checks', ['run', 'failures', 'retests']),
    documentation: cleanCountGroup(input.documentation, 'telemetry.documentation', ['files', 'updates']),
    task_close: {
      status: cleanSlug(taskClose.status || 'not_applicable', 'telemetry.task_close.status'),
      receipt_hash: taskClose.receipt_hash ? cleanName(taskClose.receipt_hash, 'telemetry.task_close.receipt_hash') : null,
    },
  };
}

export function sanitizeClose(input, now = new Date().toISOString()) {
  assertAllowedKeys(input, ['task_id', 'outcome', 'verification', 'telemetry', 'closed_at'], 'close input');
  if (!OUTCOMES.has(input.outcome)) throw new Error('outcome is invalid');
  if (!VERIFICATION_STATES.has(input.verification)) throw new Error('verification is invalid');
  return {
    task_id: cleanId(input.task_id, 'task_id'),
    outcome: input.outcome,
    verification: input.verification,
    telemetry: sanitizeTelemetry(input.telemetry),
    closed_at: cleanTimestamp(input.closed_at, 'closed_at', now),
  };
}

export function sanitizeEvidence(input, now = new Date().toISOString()) {
  assertAllowedKeys(input, [
    'evidence_event_id', 'task_id', 'stage', 'kind', 'name', 'outcome',
    'model_family', 'model', 'effort', 'effort_source',
    'provider_turn_required', 'occurred_at',
  ], 'evidence event');
  if (!STAGES.includes(input.stage)) throw new Error('evidence stage is invalid');
  if (!EVIDENCE_KINDS.has(input.kind)) throw new Error('evidence kind is invalid');
  if (!EVIDENCE_OUTCOMES.has(input.outcome)) throw new Error('evidence outcome is invalid');
  const effort = input.effort || 'unknown';
  if (!EFFORTS.has(effort)) throw new Error('evidence effort is invalid');
  return {
    schema_version: SCHEMA_VERSION,
    evidence_event_id: cleanId(input.evidence_event_id, 'evidence_event_id'),
    task_id: cleanId(input.task_id, 'task_id'),
    stage: input.stage,
    kind: input.kind,
    name: cleanName(input.name, 'evidence name'),
    outcome: input.outcome,
    model_family: cleanName(input.model_family, 'model_family'),
    model: cleanName(input.model, 'model'),
    effort,
    effort_source: cleanSlug(input.effort_source || 'unavailable', 'effort_source'),
    provider_turn_required: cleanBoolean(input.provider_turn_required, 'provider_turn_required', false),
    occurred_at: cleanTimestamp(input.occurred_at, 'occurred_at', now),
  };
}
