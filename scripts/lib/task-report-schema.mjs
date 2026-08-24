export const RECORD_SCHEMA_VERSION = 1;
export const REVIEW_SCHEMA_VERSION = 1;
export const STATE_SCHEMA_VERSION = 1;

const MEASUREMENT_KINDS = new Set(['exact', 'estimated', 'unavailable']);
const ESTIMATE_TIMINGS = new Set(['pre-read', 'late', 'unavailable']);
const RETRIEVAL_RESULTS = new Set(['first-try', 'second-document', 'repository-fallback', 'doc-source-conflict', 'unavailable']);

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function required(errors, object, key, label) {
  if (!Object.prototype.hasOwnProperty.call(object, key)) errors.push(`${label}.${key} is required`);
}

function string(errors, value, label, { nullable = false, max = 10000 } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== 'string' || !value.trim()) errors.push(`${label} must be a non-empty string`);
  else if (value.length > max) errors.push(`${label} is too long`);
}

function integer(errors, value, label, { nullable = false, min = 0 } = {}) {
  if (nullable && value === null) return;
  if (!Number.isInteger(value) || value < min) errors.push(`${label} must be an integer >= ${min}`);
}

export function validateMeasurement(value, label, errors) {
  if (!isObject(value)) {
    errors.push(`${label} must be an object`);
    return;
  }
  required(errors, value, 'value', label);
  required(errors, value, 'kind', label);
  if (!MEASUREMENT_KINDS.has(value.kind)) errors.push(`${label}.kind must be exact, estimated, or unavailable`);
  if (value.kind === 'unavailable') {
    if (value.value !== null) errors.push(`${label}.value must be null when kind is unavailable`);
  } else {
    integer(errors, value.value, `${label}.value`, { min: 0 });
  }
}

function validateRuntime(runtime, errors, { legacy }) {
  if (!isObject(runtime)) {
    errors.push('runtime must be an object');
    return;
  }
  required(errors, runtime, 'model', 'runtime');
  required(errors, runtime, 'effort', 'runtime');
  if (runtime.model !== null) {
    string(errors, runtime.model, 'runtime.model', { max: 200 });
    if (!legacy && isUnrecordedModel(runtime.model)) errors.push('runtime.model must record the exact implementing model variant');
  } else if (!legacy) {
    errors.push('runtime.model must record the exact implementing model variant');
  }
  string(errors, runtime.effort, 'runtime.effort', { nullable: true, max: 40 });
  if (runtime.model_label !== undefined) string(errors, runtime.model_label, 'runtime.model_label', { nullable: true, max: 200 });
}

export function isUnrecordedModel(value) {
  return !value || /(?:variant\s+unrecorded|unrecorded|unknown|unknown\s+variant|^gpt-\d+(?:\.\d+)?$|^gpt\s*\d+(?:\.\d+)?$|^(?:sonnet|opus|haiku)\s+\d+(?:\.\d+)?$|^variant\s+unrecorded$)/i.test(value.trim());
}

export function validateTaskRecord(record, { legacy = record?.source === 'legacy-markdown' } = {}) {
  const errors = [];
  if (!isObject(record)) return ['record must be an object'];
  if (record.schema_version !== RECORD_SCHEMA_VERSION) errors.push(`schema_version must be ${RECORD_SCHEMA_VERSION}`);
  for (const key of ['task_id', 'task', 'receipt']) required(errors, record, key, 'record');
  integer(errors, record.cycle, 'cycle', { min: 1 });
  integer(errors, record.row, 'row', { min: 1 });
  string(errors, record.task_id, 'task_id', { max: 100 });
  string(errors, record.task, 'task', { max: legacy ? 10000 : 120 });
  if (!/^c\d+-r\d+$/.test(record.task_id || '')) errors.push('task_id must use c<cycle>-r<row> format');
  if (record.task_id !== `c${record.cycle}-r${record.row}`) errors.push('task_id must match cycle and row');

  if (!isObject(record.scope)) errors.push('scope must be an object');
  else {
    integer(errors, record.scope.domains, 'scope.domains', { min: 0 });
    integer(errors, record.scope.files, 'scope.files', { min: 0 });
    if (!legacy && !record.scope.manifest) errors.push('scope.manifest is required');
    string(errors, record.scope.manifest, 'scope.manifest', { nullable: true, max: 300 });
  }

  if (!isObject(record.estimate)) errors.push('estimate must be an object');
  else {
    required(errors, record.estimate, 'tokens', 'estimate');
    required(errors, record.estimate, 'timing', 'estimate');
    required(errors, record.estimate, 'basis', 'estimate');
    integer(errors, record.estimate.tokens, 'estimate.tokens', { nullable: true, min: 0 });
    if (!ESTIMATE_TIMINGS.has(record.estimate.timing)) errors.push('estimate.timing is invalid');
    string(errors, record.estimate.basis, 'estimate.basis', { nullable: true, max: 500 });
    if (!legacy && (record.estimate.timing !== 'pre-read' || record.estimate.tokens === null)) errors.push('new records require a pre-read estimate');
  }

  if (!isObject(record.observed)) errors.push('observed must be an object');
  else {
    for (const key of ['source_read_tokens', 'total_tokens', 'main_thread_tokens']) {
      required(errors, record.observed, key, 'observed');
      if (record.observed[key] !== undefined) validateMeasurement(record.observed[key], `observed.${key}`, errors);
    }
    integer(errors, record.observed.context_bytes, 'observed.context_bytes', { nullable: true, min: 0 });
    integer(errors, record.observed.tool_calls, 'observed.tool_calls', { nullable: true, min: 0 });
  }

  if (!isObject(record.retrieval)) errors.push('retrieval must be an object');
  else {
    required(errors, record.retrieval, 'result', 'retrieval');
    if (!RETRIEVAL_RESULTS.has(record.retrieval.result)) errors.push('retrieval.result is invalid');
    if (!Array.isArray(record.retrieval.conflict_paths)) errors.push('retrieval.conflict_paths must be an array');
    else record.retrieval.conflict_paths.forEach((path, index) => string(errors, path, `retrieval.conflict_paths[${index}]`, { max: 300 }));
  }

  if (!isObject(record.outcome)) errors.push('outcome must be an object');
  else {
    required(errors, record.outcome, 'verdict', 'outcome');
    required(errors, record.outcome, 'summary', 'outcome');
    string(errors, record.outcome.verdict, 'outcome.verdict', { max: 40 });
    string(errors, record.outcome.summary, 'outcome.summary', { max: 1000 });
  }

  validateRuntime(record.runtime, errors, { legacy });
  if (!Array.isArray(record.skills)) errors.push('skills must be an array');
  else record.skills.forEach((skill, index) => string(errors, skill, `skills[${index}]`, { max: 100 }));
  string(errors, record.receipt, 'receipt', { nullable: legacy, max: 300 });
  if (record.source !== undefined) string(errors, record.source, 'source', { max: 100 });
  if (record.warnings !== undefined && (!Array.isArray(record.warnings) || record.warnings.some(warning => typeof warning !== 'string'))) errors.push('warnings must be an array of strings');
  return errors;
}

export function validateCycleReview(review) {
  const errors = [];
  if (!isObject(review)) return ['review must be an object'];
  if (review.schema_version !== REVIEW_SCHEMA_VERSION) errors.push(`review schema_version must be ${REVIEW_SCHEMA_VERSION}`);
  integer(errors, review.cycle, 'review.cycle', { min: 1 });
  required(errors, review, 'source', 'review');
  string(errors, review.source, 'review.source', { max: 100 });
  if (review.finding !== undefined) string(errors, review.finding, 'review.finding', { nullable: true, max: 2000 });
  if (review.recommendation !== undefined) string(errors, review.recommendation, 'review.recommendation', { nullable: true, max: 2000 });
  if (review.assessment !== undefined) string(errors, review.assessment, 'review.assessment', { nullable: true, max: 10000 });
  if (review.warnings !== undefined && (!Array.isArray(review.warnings) || review.warnings.some(warning => typeof warning !== 'string'))) errors.push('review.warnings must be an array of strings');
  return errors;
}

export function validateCycleState(state) {
  const errors = [];
  if (!isObject(state)) return ['cycle state must be an object'];
  if (state.schema_version !== STATE_SCHEMA_VERSION) errors.push(`cycle state schema_version must be ${STATE_SCHEMA_VERSION}`);
  integer(errors, state.open_cycle, 'open_cycle', { min: 1 });
  integer(errors, state.next_row, 'next_row', { min: 1, });
  if (state.status !== 'open') errors.push('cycle state.status must be open');
  if (!Array.isArray(state.closed_cycles) || state.closed_cycles.some(cycle => !Number.isInteger(cycle) || cycle < 1)) errors.push('closed_cycles must be positive integers');
  return errors;
}

export function parseMeasurement(input) {
  if (input === undefined || input === null || /^(—|–|-|unavailable|null|unknown)$/i.test(String(input).trim())) return { value: null, kind: 'unavailable' };
  const text = String(input).trim();
  const valueMatch = text.match(/(\d[\d,]*)/);
  if (!valueMatch) return { value: null, kind: 'unavailable' };
  return { value: Number(valueMatch[1].replaceAll(',', '')), kind: text.includes('~') ? 'estimated' : 'exact' };
}

export function parseEstimate(input) {
  const measurement = parseMeasurement(input);
  const text = String(input ?? '').trim();
  return {
    tokens: measurement.value,
    timing: measurement.value === null ? 'unavailable' : /late/i.test(text) ? 'late' : 'pre-read',
    basis: measurement.value === null ? 'legacy Markdown; no estimate recorded' : 'legacy Markdown estimate; timing preserved from row label',
  };
}
