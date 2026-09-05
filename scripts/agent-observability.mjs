#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildAnalytics, boundedAnalyticsAggregate } from './lib/agent-observability/analytics.mjs';
import {
  createDataQualityFlag,
  createCandidateRecords,
  createFormalFlag,
  detectCandidates,
} from './lib/agent-observability/flagging.mjs';
import { exportPublicReport } from './lib/agent-observability/public-export.mjs';
import { isoWeek, renderPrivateReports } from './lib/agent-observability/report.mjs';
import {
  SCHEMA_VERSION,
  STAGES,
  assertAllowedKeys,
  cleanId,
  cleanSlug,
  cleanTimestamp,
  sanitizeClose,
  sanitizeEvidence,
  sanitizeTelemetry,
} from './lib/agent-observability/schema.mjs';
import {
  listTaskBundles,
  readTaskBundle,
  recordEvidence,
  recordEvent,
  recordFlag,
  resolveStateDir,
  startTask,
  writeFinal,
} from './lib/agent-observability/state.mjs';
import {
  aggregateUsage,
  assessRuntimeCapabilities,
  normalizeUsageEvent,
} from './lib/agent-observability/usage.mjs';

function parseArgs(argv) {
  const command = argv[0];
  const options = new Map();
  for (let index = 1; index < argv.length; index++) {
    const arg = argv[index];
    if (!arg.startsWith('--')) throw new Error(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (['approve', 'best-effort', 'help'].includes(key)) {
      options.set(key, true);
      continue;
    }
    const value = argv[++index];
    if (value === undefined || value.startsWith('--')) throw new Error(`--${key} requires a value`);
    options.set(key, value);
  }
  return { command, options };
}

function inputDocument(options, { optional = false } = {}) {
  if (options.has('json')) return JSON.parse(options.get('json'));
  if (options.has('input')) return JSON.parse(readFileSync(resolve(options.get('input')), 'utf8'));
  if (!process.stdin.isTTY) {
    const body = readFileSync(0, 'utf8').trim();
    if (body) return JSON.parse(body);
  }
  if (optional) return {};
  throw new Error('provide JSON with --input, --json, or stdin');
}

function stateFor(options, root) {
  return resolveStateDir({ root, stateDir: options.get('state-dir') || null });
}

function compact(value) {
  return JSON.stringify(value);
}

function pendingFinal(close, usage) {
  return {
    schema_version: SCHEMA_VERSION,
    task_id: close.task_id,
    status: 'pending',
    outcome: close.outcome,
    verification: close.verification,
    telemetry: close.telemetry,
    closed_at: close.closed_at,
    finalized_at: null,
    reasons: ['pending_terminal_settlement'],
    event_count: usage.event_count,
    final_inclusive_provider_tokens: null,
    known_provider_tokens: usage.known_provider_tokens,
    stage_totals: usage.stage_totals,
  };
}

function assertEvidence(bundle, flag) {
  const ids = new Set([
    ...bundle.events.map(event => event.usage_event_id),
    ...(bundle.evidence || []).map(event => event.evidence_event_id),
  ]);
  const missing = flag.evidence_event_ids.filter(id => !ids.has(id));
  if (missing.length) throw new Error(`flag evidence is not in the current task: ${missing.join(', ')}`);
}

export function recordFormalFlagCommand(state, input, now) {
  const flag = createFormalFlag(input, now);
  const bundle = readTaskBundle(state, flag.task_id);
  if (bundle.final?.finalized_at) throw new Error('cannot add flags after finalization');
  assertEvidence(bundle, flag);
  const existing = bundle.flags.find(item => item.flag_id === flag.flag_id);
  if (!existing && bundle.flags.filter(item => item.flag_id?.startsWith('WF-')).length >= 3)
    throw new Error('formal flag limit reached');
  const result = recordFlag(state, flag.task_id, flag);
  return { status: result.status, task_id: flag.task_id, flag_id: flag.flag_id };
}

export function executeCommand(command, input, {
  root = '.',
  stateDir = null,
  approve = false,
  now = new Date().toISOString(),
} = {}) {
  const state = resolveStateDir({ root, stateDir });
  if (command === 'doctor') return assessRuntimeCapabilities(input);
  if (command === 'start') {
    const result = startTask(state, input, { now });
    return { status: result.status, task_id: result.task_id, root_task_id: result.root_task_id };
  }
  if (command === 'event') {
    const event = normalizeUsageEvent(input, now);
    const bundle = readTaskBundle(state, event.root_task_id);
    if (bundle.final?.finalized_at) throw new Error('cannot append usage after finalization');
    const result = recordEvent(state, event);
    return { status: result.status, task_id: event.task_id, usage_event_id: event.usage_event_id, normalized_total_tokens: event.normalized_total_tokens };
  }
  if (command === 'evidence') {
    const evidence = sanitizeEvidence(input, now);
    const bundle = readTaskBundle(state, evidence.task_id);
    if (bundle.final?.finalized_at) throw new Error('cannot append evidence after finalization');
    const result = recordEvidence(state, evidence);
    return { status: result.status, task_id: evidence.task_id, evidence_event_id: evidence.evidence_event_id };
  }
  if (command === 'candidate') {
    assertAllowedKeys(input, ['task_id', 'telemetry', 'evidence_event_ids'], 'candidate input');
    const taskId = cleanId(input.task_id, 'task_id');
    const bundle = readTaskBundle(state, taskId);
    if (bundle.final?.finalized_at) throw new Error('cannot add candidates after finalization');
    const telemetry = sanitizeTelemetry(input.telemetry);
    const records = createCandidateRecords(taskId, detectCandidates(telemetry), input.evidence_event_ids || [], now);
    const existing = new Set(bundle.flags.map(record => record.flag_id));
    let written = 0;
    for (const record of records) {
      if (existing.has(record.flag_id)) continue;
      recordFlag(state, taskId, record);
      written++;
    }
    return { status: written ? 'written' : 'duplicate', task_id: taskId, candidates: records.map(record => record.flag_id) };
  }
  if (command === 'flag') return recordFormalFlagCommand(state, input, now);
  if (command === 'close') {
    const close = sanitizeClose(input, now);
    const bundle = readTaskBundle(state, close.task_id);
    if (bundle.final?.finalized_at) return bundle.final;
    const final = pendingFinal(close, aggregateUsage(bundle.events));
    writeFinal(state, close.task_id, final);
    return final;
  }
  if (command === 'finalize') {
    assertAllowedKeys(input, ['task_id', 'finalized_at', 'partial_reason'], 'finalize input');
    const taskId = cleanId(input.task_id, 'task_id');
    const bundle = readTaskBundle(state, taskId);
    if (!bundle.final) throw new Error('close must run before finalize');
    if (bundle.final.finalized_at) return {
      ...bundle.final,
      reports: renderPrivateReports(state, { week: isoWeek(bundle.final.finalized_at) }),
    };
    const usage = aggregateUsage(bundle.events);
    if (usage.status === 'partial' && !input.partial_reason)
      throw new Error(`usage is not exact: ${usage.reasons.join(', ')}`);
    const reasons = [...usage.reasons];
    if (usage.status === 'partial' && input.partial_reason) reasons.push(cleanSlug(input.partial_reason, 'partial_reason'));
    const finalizedAt = cleanTimestamp(input.finalized_at, 'finalized_at', now);
    const workerCount = new Set(bundle.events.map(event => event.agent_id)).size;
    const final = {
      ...bundle.final,
      ...usage,
      telemetry: {
        ...bundle.final.telemetry,
        worker_count: Math.max(bundle.final.telemetry.worker_count, workerCount),
      },
      status: usage.status === 'exact' ? 'exact' : 'partial',
      reasons: [...new Set(reasons)].sort(),
      finalized_at: finalizedAt,
    };
    if (final.status === 'partial')
      for (const reason of final.reasons) recordFlag(state, taskId, createDataQualityFlag(taskId, reason, finalizedAt));
    writeFinal(state, taskId, final);
    const reports = renderPrivateReports(state, { week: isoWeek(finalizedAt) });
    return { ...final, reports };
  }
  if (command === 'render') {
    assertAllowedKeys(input, ['week'], 'render input');
    return { reports: renderPrivateReports(state, { week: input.week || null }) };
  }
  if (command === 'analyze') {
    assertAllowedKeys(input, ['week', 'minimum_sample'], 'analyze input');
    const minimum = input.minimum_sample === undefined ? 5 : Number(input.minimum_sample);
    if (!Number.isSafeInteger(minimum) || minimum < 1) throw new Error('minimum_sample must be a positive integer');
    return boundedAnalyticsAggregate(buildAnalytics(listTaskBundles(state), { week: input.week || null, minSize: minimum }));
  }
  if (command === 'export-public') {
    assertAllowedKeys(input, ['week', 'improvements'], 'public export input');
    return exportPublicReport({
      root,
      stateDir: state,
      week: input.week,
      approve,
      improvements: input.improvements || [],
    });
  }
  throw new Error('command must be start, event, evidence, candidate, flag, close, finalize, render, analyze, export-public, or doctor');
}

export function executeBestEffort(command, input, options = {}) {
  try {
    return executeCommand(command, input, options);
  } catch {
    return skippedTelemetry();
  }
}

function skippedTelemetry() {
  return {
    schema_version: SCHEMA_VERSION,
    status: 'skipped',
    reason: 'telemetry_failure',
    retry: false,
  };
}

export function main(argv = process.argv.slice(2)) {
  const bestEffort = argv.includes('--best-effort');
  try {
    const { command, options } = parseArgs(argv);
    if (!command || options.has('help')) {
      console.log('usage: node scripts/agent-observability.mjs <start|event|evidence|candidate|flag|close|finalize|render|analyze|export-public|doctor> [--input file|--json value] [--state-dir path] [--best-effort] [--approve]');
      return;
    }
    const root = resolve(options.get('root') || '.');
    const input = inputDocument(options, { optional: ['render', 'analyze'].includes(command) });
    const runner = options.has('best-effort') ? executeBestEffort : executeCommand;
    const result = runner(command, input, {
      root,
      stateDir: stateFor(options, root),
      approve: options.has('approve'),
    });
    console.log(compact(result));
  } catch (error) {
    if (bestEffort) {
      console.log(compact(skippedTelemetry()));
      return;
    }
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
