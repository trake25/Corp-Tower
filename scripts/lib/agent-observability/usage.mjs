import {
  EFFORTS,
  SCHEMA_VERSION,
  STAGES,
  assertAllowedKeys,
  assertObject,
  cleanBoolean,
  cleanId,
  cleanName,
  cleanSlug,
  cleanTimestamp,
  nonNegativeInteger,
} from './schema.mjs';

export const USAGE_FIELDS = [
  'total_tokens',
  'input_tokens',
  'output_tokens',
  'reasoning_tokens',
  'cache_read_tokens',
  'cache_write_tokens',
  'billed_tokens',
];

const PURPOSES = new Set([
  'root',
  'subagent',
  'retry',
  'summary',
  'telemetry',
  'flagging',
  'analytics',
  'terminal',
  'other',
]);

function sanitizeCounters(input) {
  assertAllowedKeys(input, [...USAGE_FIELDS, 'additive_fields'], 'usage');
  const counters = {};
  for (const field of USAGE_FIELDS) {
    const value = input[field];
    counters[field] = value === undefined || value === null ? null : nonNegativeInteger(value, `usage.${field}`);
  }
  const additive = input.additive_fields ?? [];
  if (!Array.isArray(additive) || additive.some(field => !USAGE_FIELDS.includes(field) || field === 'total_tokens'))
    throw new Error('usage.additive_fields contains an unsupported counter');
  const unique = [...new Set(additive)].sort();
  if (unique.length && unique.join(',') !== 'input_tokens,output_tokens')
    throw new Error('generic derived usage requires disjoint input_tokens and output_tokens');
  counters.additive_fields = unique;
  return counters;
}

function normalizedTotal(usage) {
  if (usage.total_tokens !== null) return { value: usage.total_tokens, method: 'provider_reported' };
  if (!usage.additive_fields.length) return { value: null, method: 'unavailable' };
  const missing = usage.additive_fields.filter(field => usage[field] === null);
  if (missing.length) throw new Error(`usage.additive_fields missing counters: ${missing.join(', ')}`);
  return {
    value: usage.additive_fields.reduce((total, field) => total + usage[field], 0),
    method: 'derived_disjoint',
  };
}

export function normalizeUsageEvent(input, now = new Date().toISOString()) {
  assertAllowedKeys(input, [
    'usage_event_id', 'task_id', 'root_task_id', 'agent_id', 'parent_agent_id',
    'provider', 'model_family', 'model', 'effort', 'stage', 'purpose', 'usage',
    'settled', 'terminal', 'occurred_at',
  ], 'usage event');
  assertObject(input.usage, 'usage');
  if (!STAGES.includes(input.stage)) throw new Error('stage is invalid');
  const purpose = cleanSlug(input.purpose || 'other', 'purpose');
  if (!PURPOSES.has(purpose)) throw new Error('purpose is invalid');
  const effort = input.effort || 'unknown';
  if (!EFFORTS.has(effort)) throw new Error('effort is invalid');
  const usage = sanitizeCounters(input.usage);
  const normalized = normalizedTotal(usage);
  return {
    schema_version: SCHEMA_VERSION,
    usage_event_id: cleanId(input.usage_event_id, 'usage_event_id'),
    task_id: cleanId(input.task_id, 'task_id'),
    root_task_id: cleanId(input.root_task_id || input.task_id, 'root_task_id'),
    agent_id: cleanId(input.agent_id || 'root', 'agent_id'),
    parent_agent_id: input.parent_agent_id ? cleanId(input.parent_agent_id, 'parent_agent_id') : null,
    provider: cleanName(input.provider, 'provider'),
    model_family: cleanName(input.model_family, 'model_family'),
    model: cleanName(input.model, 'model'),
    effort,
    stage: input.stage,
    purpose,
    usage,
    normalized_total_tokens: normalized.value,
    normalization_method: normalized.method,
    settled: cleanBoolean(input.settled, 'settled', false),
    terminal: cleanBoolean(input.terminal, 'terminal', false),
    occurred_at: cleanTimestamp(input.occurred_at, 'occurred_at', now),
  };
}

export function aggregateUsage(events) {
  const unique = new Map();
  for (const event of events) {
    if (!unique.has(event.usage_event_id)) unique.set(event.usage_event_id, event);
  }
  const values = [...unique.values()].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.usage_event_id.localeCompare(b.usage_event_id));
  const stageTotals = Object.fromEntries(STAGES.map(stage => [stage, 0]));
  const reasons = [];
  let known = 0;
  for (const event of values) {
    if (!event.settled) reasons.push(`unsettled:${event.usage_event_id}`);
    if (event.normalized_total_tokens === null) reasons.push(`usage_unavailable:${event.usage_event_id}`);
    else {
      known += event.normalized_total_tokens;
      stageTotals[event.stage] += event.normalized_total_tokens;
    }
  }
  if (!values.some(event => event.terminal)) reasons.push('terminal_event_missing');
  const status = reasons.length ? 'partial' : 'exact';
  return {
    status,
    reasons: [...new Set(reasons)].sort(),
    event_count: values.length,
    final_inclusive_provider_tokens: status === 'exact' ? known : null,
    known_provider_tokens: known,
    stage_totals: stageTotals,
  };
}

export function assessRuntimeCapabilities(input) {
  assertAllowedKeys(input, [
    'stable_event_ids', 'parent_attribution', 'settled_usage', 'terminal_callback',
    'disjoint_usage_events', 'child_usage', 'sidecar', 'provider', 'adapter',
  ], 'runtime capabilities');
  const required = [
    'stable_event_ids',
    'parent_attribution',
    'settled_usage',
    'terminal_callback',
    'disjoint_usage_events',
    'child_usage',
  ];
  const missing = required.filter(field => input[field] !== true);
  return {
    schema_version: SCHEMA_VERSION,
    provider: cleanName(input.provider, 'provider'),
    adapter: cleanName(input.adapter, 'adapter'),
    exact_mode: missing.length === 0,
    missing,
    sidecar: input.sidecar === true,
  };
}
