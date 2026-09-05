#!/usr/bin/env node
import { readFileSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { executeBestEffort } from './agent-observability.mjs';
import { codexRolloutUsage } from './lib/agent-observability/codex-rollout.mjs';
import { boundedEventId, resolveRuntimeIdentity } from './lib/agent-observability/runtime.mjs';
import {
  clearActiveTask,
  recordHookHealth,
  readActiveTask,
  readTaskBundle,
  resolveStateDir,
} from './lib/agent-observability/state.mjs';

function safeName(value, fallback = 'unknown') {
  const text = String(value || fallback);
  return /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,79}$/.test(text)
    ? text
    : `${fallback}-${boundedEventId('id', text).slice(-20)}`;
}

function toolOutcome(response) {
  if (!response || typeof response !== 'object') return 'unknown';
  if (response.isError === true || response.success === false) return 'failed';
  if (Number.isInteger(response.exit_code) && response.exit_code !== 0) return 'failed';
  if (['failed', 'error'].includes(String(response.status || '').toLowerCase())) return 'failed';
  return 'passed';
}

function toolText(event) {
  const input = event?.tool_input;
  if (typeof input === 'string') return input;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return '';
  return [input.command, input.cmd, input.code].find(value => typeof value === 'string') || '';
}

function responseText(event) {
  const response = event?.tool_response;
  if (typeof response === 'string') return response;
  if (!response || typeof response !== 'object' || Array.isArray(response)) return '';
  return [response.output, response.stdout, response.aggregated_output].find(value => typeof value === 'string') || '';
}

function retrievalFor(event) {
  const command = toolText(event);
  if (!/(?:^|[\\/])context\.mjs\b/.test(command)) return null;
  const match = command.match(/context\.mjs["']?\s+(concept-route|concept-read|concept-bundle)\s+([^\s"']+)/);
  if (!match) return null;
  const [, operation, requested] = match;
  const output = responseText(event);
  const status = output.match(/(?:status:\s*|"status"\s*:\s*")(matched|concept-unmapped|alias-ambiguous|section-missing|section-duplicate|source-anchor-missing|source-target-missing|map-stale|budget-exceeded|access-denied|tool-error)/)?.[1]
    ?.replaceAll('-', '_') || 'unknown';
  return {
    operation: operation.replaceAll('-', '_'),
    status,
    retrieval_key: boundedEventId('concept', requested),
  };
}

function shellStage(command) {
  if (!command.trim()) return 'other';
  if (/(?:^|[;&|]\s*)(?:rg|sed|head|tail|wc|find|ls)\b/.test(command)) return 'retrieval_context';
  if (/(?:^|[;&|]\s*)git\s+(?:status|diff|show|log)\b/.test(command)) return 'retrieval_context';
  return 'other';
}

function stageFor(event, evidence = []) {
  if (event.hook_event_name !== 'PostToolUse') return 'other';
  if (retrievalFor(event)) return 'retrieval_context';
  const tool = String(event.tool_name || '').toLowerCase();
  const command = toolText(event);
  if (/task-close\.mjs["']?\s+prepare\b/.test(command)) return 'intake';
  if (/task-close\.mjs["']?\s+(?:review|decide)\b/.test(command)) return 'documentation';
  if (/task-close\.mjs["']?\s+(?:close|verify)\b/.test(command)) return 'verification';
  if (/scripts\/build-concept-map\.mjs/.test(command)) return 'generated_output';
  if (/(?:node\s+(?:--test\b|scripts\/tests\/)|npm(?:\.cmd)?\s+(?:test|run\s+(?:test|docs:check))|pytest\b|scripts\/(?:qa-gate|validate-[\w-]+|benchmark-rag|build-file-map)\.mjs)/.test(command))
    return 'verification';
  if (tool === 'apply_patch') {
    if (/(?:^|[\s/])KB\/docs\/context\/map\//m.test(command)) return 'generated_output';
    if (/(?:^|[\s/])(?:KB\/)?docs\/context\//m.test(command)) return 'documentation';
    return 'implementation';
  }
  if (tool.includes('plan')) return 'planning';
  if (tool.includes('test') || tool.includes('qa')) return 'verification';
  if (/(?:search|browse|read|view|find)/.test(tool)) return 'retrieval_context';
  if (tool === 'bash' || tool.includes('exec') || tool.includes('spawn')) return shellStage(command);
  return 'other';
}

function evidenceFor(event, binding, identity, now, priorEvidence = []) {
  const kind = event.hook_event_name === 'PostToolUse' ? 'tool' : 'lifecycle';
  const eventIdentity = event.tool_use_id || event.turn_id || `${event.hook_event_name}-${now}`;
  const retrieval = retrievalFor(event);
  return {
    evidence_event_id: boundedEventId('ev', event.session_id, eventIdentity, event.hook_event_name),
    task_id: binding.task_id,
    stage: stageFor(event, priorEvidence),
    kind,
    name: safeName(retrieval ? `concept_${retrieval.operation}_${retrieval.status}` : kind === 'tool' ? event.tool_name : event.hook_event_name, kind),
    outcome: retrieval ? (retrieval.status === 'matched' ? 'passed' : retrieval.status === 'unknown' ? 'unknown' : 'failed') : kind === 'tool' ? toolOutcome(event.tool_response) : 'observed',
    model_family: identity.model_family,
    model: safeName(identity.model, 'model'),
    effort: identity.effort,
    effort_source: identity.effort_source,
    provider_turn_required: Boolean(event.turn_id),
    retrieval_key: retrieval?.retrieval_key || null,
    tool_key: kind === 'tool' && toolText(event).trim() ? boundedEventId('tool', toolText(event)) : null,
    occurred_at: now,
  };
}

function providerUsageFor(event) {
  const source = event?.usage;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const usage = {};
  for (const field of ['total_tokens', 'input_tokens', 'output_tokens', 'billed_tokens'])
    if (Number.isSafeInteger(source[field]) && source[field] >= 0) usage[field] = source[field];
  const reasoning = source.output_tokens_details?.reasoning_tokens ?? source.reasoning_tokens;
  const cached = source.input_tokens_details?.cached_tokens ?? source.cache_read_tokens;
  if (Number.isSafeInteger(reasoning) && reasoning >= 0) usage.reasoning_tokens = reasoning;
  if (Number.isSafeInteger(cached) && cached >= 0) usage.cache_read_tokens = cached;
  if (usage.total_tokens === undefined && usage.input_tokens !== undefined && usage.output_tokens !== undefined)
    usage.additive_fields = ['input_tokens', 'output_tokens'];
  return usage;
}

function telemetryFailed(result) {
  return result?.status === 'skipped';
}

function settleTask(event, binding, identity, root, stateDir, now, env) {
  const bundle = readTaskBundle(stateDir, binding.task_id);
  const providerUsage = providerUsageFor(event);
  let rollout = null;
  if (!bundle.events.some(item => item.terminal)) {
    rollout = codexRolloutUsage(event.session_id, {
      env,
      transcriptPath: event.transcript_path,
      until: now,
      boundAt: binding.bound_at,
      evidence: bundle.evidence,
    });
    if (rollout.status === 'exact') {
      for (const usageEvent of rollout.events) {
        const recorded = executeBestEffort('event', {
          ...usageEvent,
          task_id: binding.task_id,
          provider: 'openai',
          model_family: identity.model_family,
          model: safeName(identity.model, 'model'),
          effort: identity.effort,
        }, { root, stateDir, now });
        if (telemetryFailed(recorded)) return { status: 'degraded', reason: 'rollout_event_write_failed' };
      }
    } else {
      const terminal = executeBestEffort('event', {
        usage_event_id: boundedEventId('turn', event.session_id, event.turn_id, 'terminal'),
        task_id: binding.task_id,
        provider: 'openai',
        model_family: identity.model_family,
        model: safeName(identity.model, 'model'),
        effort: identity.effort,
        stage: 'closeout',
        purpose: 'terminal',
        usage: providerUsage,
        settled: true,
        terminal: true,
        occurred_at: now,
      }, { root, stateDir, now });
      if (telemetryFailed(terminal)) return { status: 'degraded', reason: 'terminal_event_write_failed' };
    }
  }
  const refreshed = readTaskBundle(stateDir, binding.task_id);
  const usageUnavailable = refreshed.events.some(item => item.terminal && item.normalized_total_tokens === null);
  const final = executeBestEffort('finalize', {
    task_id: binding.task_id,
    finalized_at: now,
    partial_reason: usageUnavailable
      ? Object.keys(providerUsage).length ? 'codex_host_usage_incomplete' : rollout.reason || 'codex_rollout_usage_unavailable'
      : undefined,
  }, { root, stateDir, now });
  if (telemetryFailed(final)) return { status: 'degraded', reason: 'task_finalization_failed' };
  clearActiveTask(stateDir, event.session_id, binding.task_id);
  return { status: 'settled', final };
}

function handleHookUnsafe(event, {
  root = resolve('.'),
  stateDir = null,
  now = new Date().toISOString(),
  env = process.env,
  configText = null,
} = {}) {
  const state = resolveStateDir({ root, stateDir, env });
  const finish = result => {
    try {
      recordHookHealth(state, {
        session_id: event?.session_id,
        event: event?.hook_event_name,
        status: result.status === 'degraded' ? 'degraded' : result.status === 'ignored' ? 'idle' : 'healthy',
        reason: result.reason,
        task_id: result.task_id,
        occurred_at: now,
      }, { now });
    } catch {}
    return result;
  };
  if (!event || typeof event !== 'object') return finish({ status: 'ignored', reason: 'invalid_event' });
  const binding = readActiveTask(state, event.session_id);
  if (!binding) return finish({ status: 'ignored', reason: 'no_active_task' });
  const identity = resolveRuntimeIdentity(event, { env, configText });
  const bundle = readTaskBundle(state, binding.task_id);
  const evidence = evidenceFor(event, binding, identity, now, bundle.evidence);
  const recorded = executeBestEffort('evidence', evidence, { root, stateDir: state, now });
  if (telemetryFailed(recorded)) return finish({ status: 'degraded', reason: 'evidence_write_failed', task_id: binding.task_id });
  if (event.hook_event_name === 'Stop' && binding.close_requested) {
    const settled = settleTask(event, binding, identity, root, state, now, env);
    return finish({ ...settled, task_id: binding.task_id });
  }
  return finish({ status: 'recorded', task_id: binding.task_id, evidence_event_id: evidence.evidence_event_id });
}

export function handleHook(event, options = {}) {
  try {
    return handleHookUnsafe(event, options);
  } catch {
    try {
      const now = options.now || new Date().toISOString();
      const state = resolveStateDir({
        root: options.root || resolve('.'),
        stateDir: options.stateDir || null,
        env: options.env || process.env,
      });
      recordHookHealth(state, {
        session_id: event?.session_id,
        event: event?.hook_event_name,
        status: 'degraded',
        reason: 'hook_processing_failed',
        occurred_at: now,
      }, { now });
    } catch {}
    return { status: 'degraded', reason: 'hook_processing_failed' };
  }
}

export function main() {
  let output = {};
  try {
    const body = readFileSync(0, 'utf8').trim();
    const result = handleHook(body ? JSON.parse(body) : {});
    if (result.status === 'degraded')
      output = { systemMessage: `Corp Tower observability degraded: ${result.reason}` };
  } catch {
    output = { systemMessage: 'Corp Tower observability hook failed: bounded health update unavailable' };
  }
  writeSync(1, `${JSON.stringify(output)}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
