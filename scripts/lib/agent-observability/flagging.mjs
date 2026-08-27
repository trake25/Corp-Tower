import { createHash } from 'node:crypto';
import {
  SCHEMA_VERSION,
  STAGES,
  assertAllowedKeys,
  cleanBoolean,
  cleanId,
  cleanName,
  cleanSlug,
  cleanText,
  cleanTimestamp,
  nonNegativeInteger,
} from './schema.mjs';

const ALLOWED_FAMILIES = new Set(['terra', 'sol', 'opus', 'fable']);
const EFFORT_RANK = { unknown: 0, low: 1, medium: 2, high: 3, xhigh: 4, max: 5, ultra: 6 };
const SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const CONFIDENCES = new Set(['low', 'medium', 'high']);

function fingerprint(stage, issueCode, causeCode) {
  return createHash('sha256')
    .update(`${SCHEMA_VERSION}|${stage}|${issueCode}|${causeCode}`)
    .digest('hex');
}

function reasonCode(reason) {
  return String(reason).split(':')[0].replace(/[^a-z0-9_]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase() || 'unknown';
}

export function createDataQualityFlag(taskId, reason, now = new Date().toISOString()) {
  const id = cleanId(taskId, 'task_id');
  const cause = cleanSlug(reasonCode(reason), 'partial reason');
  const hash = fingerprint('closeout', 'telemetry_partial', cause);
  return {
    schema_version: SCHEMA_VERSION,
    flag_id: `DQ-${hash.slice(0, 12)}`,
    fingerprint: hash,
    task_id: id,
    formal: false,
    current_run: true,
    stage: 'closeout',
    issue_code: 'telemetry_partial',
    cause_code: cause,
    observation: `Telemetry finalized as partial: ${cause}.`,
    severity: 'low',
    confidence: 'high',
    improvement: 'supply the missing current-run host metadata before final settlement',
    evidence_event_ids: [],
    occurred_at: cleanTimestamp(now, 'occurred_at'),
    status: 'data_quality',
  };
}

export function flagEligibility({ model_family, effort, provider_turn_required, candidate }) {
  const family = cleanName(model_family, 'model_family').toLowerCase();
  const normalizedEffort = effort || 'unknown';
  return {
    eligible: Boolean(candidate)
      && ALLOWED_FAMILIES.has(family)
      && (EFFORT_RANK[normalizedEffort] || 0) >= EFFORT_RANK.high
      && provider_turn_required === true,
    family,
    effort: normalizedEffort,
  };
}

export function detectCandidates(telemetry) {
  const candidates = [];
  const add = (stage, issue, cause, severity, observation, improvement) => {
    if (candidates.length < 3) candidates.push({
      stage,
      issue_code: issue,
      cause_code: cause,
      severity,
      observation,
      improvement,
    });
  };
  if (telemetry.retrieval.fallbacks > 0)
    add('retrieval_context', 'broad_fallback', 'route_miss', 'high', 'Current retrieval required a broad fallback.', 'repair the route and add a retrieval fixture');
  if (telemetry.retrieval.attempts > 1 || telemetry.retrieval.expansions > 0)
    add('retrieval_context', 'repeated_retrieval', 'insufficient_first_result', 'medium', 'Current retrieval expanded beyond the first result.', 'tighten the authoritative route or candidate ranking');
  if (telemetry.tools.failures > 0 || telemetry.tools.retries > 0)
    add('other', 'tool_retry', 'tool_failure', 'medium', 'A local tool failed or required retry.', 'repair the tool contract or its compact diagnostic');
  if (telemetry.iterations.rework > 1)
    add('implementation', 'implementation_rework', 'insufficient_context', 'medium', 'Implementation required repeated rework.', 'improve the pre-edit evidence or acceptance check');
  if (telemetry.checks.retests > 1)
    add('verification', 'repeated_verification', 'unclear_failure', 'low', 'Verification required repeated retesting.', 'make the first failure diagnostic more actionable');
  return candidates;
}

export function createCandidateRecords(taskId, candidates, evidenceEventIds = [], now = new Date().toISOString()) {
  const id = cleanId(taskId, 'task_id');
  const evidence = [...new Set(evidenceEventIds.map((eventId, index) => cleanId(eventId, `evidence_event_ids[${index}]`)))].sort();
  return candidates.slice(0, 3).map(candidate => {
    const hash = fingerprint(candidate.stage, candidate.issue_code, candidate.cause_code);
    return {
      schema_version: SCHEMA_VERSION,
      flag_id: `C-${hash.slice(0, 12)}`,
      fingerprint: hash,
      task_id: id,
      formal: false,
      current_run: true,
      stage: candidate.stage,
      issue_code: candidate.issue_code,
      cause_code: candidate.cause_code,
      observation: candidate.observation,
      severity: candidate.severity,
      confidence: 'unknown',
      improvement: candidate.improvement,
      evidence_event_ids: evidence,
      occurred_at: cleanTimestamp(now, 'occurred_at'),
      status: 'observation',
    };
  });
}

export function createFormalFlag(input, now = new Date().toISOString()) {
  assertAllowedKeys(input, [
    'task_id', 'model_family', 'effort', 'provider_turn_required', 'current_run',
    'stage', 'issue_code', 'cause_code', 'observation', 'severity', 'confidence',
    'improvement', 'evidence_event_ids', 'provider_visible_bytes', 'occurred_at',
    'status',
  ], 'formal flag');
  const eligible = flagEligibility({
    model_family: input.model_family,
    effort: input.effort,
    provider_turn_required: cleanBoolean(input.provider_turn_required, 'provider_turn_required', false),
    candidate: cleanBoolean(input.current_run, 'current_run', false),
  });
  if (!eligible.eligible) throw new Error('formal flag is not eligible');
  if (!STAGES.includes(input.stage)) throw new Error('flag stage is invalid');
  const issueCode = cleanSlug(input.issue_code, 'issue_code');
  const causeCode = cleanSlug(input.cause_code, 'cause_code');
  if (!SEVERITIES.has(input.severity)) throw new Error('severity is invalid');
  if (!CONFIDENCES.has(input.confidence)) throw new Error('confidence is invalid');
  if (!Array.isArray(input.evidence_event_ids) || !input.evidence_event_ids.length || input.evidence_event_ids.length > 5)
    throw new Error('evidence_event_ids must contain 1-5 current-run event IDs');
  const providerVisibleBytes = nonNegativeInteger(input.provider_visible_bytes, 'provider_visible_bytes');
  if (providerVisibleBytes > 1536) throw new Error('flagging provider-visible material exceeds 1.5 KiB');
  const hash = fingerprint(input.stage, issueCode, causeCode);
  return {
    schema_version: SCHEMA_VERSION,
    flag_id: `WF-${hash.slice(0, 12)}`,
    fingerprint: hash,
    task_id: cleanId(input.task_id, 'task_id'),
    current_run: true,
    stage: input.stage,
    issue_code: issueCode,
    cause_code: causeCode,
    observation: cleanText(input.observation, 'observation', 240),
    severity: input.severity,
    confidence: input.confidence,
    improvement: cleanText(input.improvement, 'improvement', 240),
    evidence_event_ids: [...new Set(input.evidence_event_ids.map((id, index) => cleanId(id, `evidence_event_ids[${index}]`)))].sort(),
    model_family: eligible.family,
    effort: eligible.effort,
    provider_visible_bytes: providerVisibleBytes,
    occurred_at: cleanTimestamp(input.occurred_at, 'occurred_at', now),
    status: input.status ? cleanSlug(input.status, 'status') : 'observation',
  };
}

export function recurrenceState(count, flags = []) {
  if (flags.some(flag => flag.status === 'validated_change')) return 'validated_change';
  if (count >= 3) return 'recurring';
  if (count >= 2) return 'early_signal';
  return 'observation';
}
