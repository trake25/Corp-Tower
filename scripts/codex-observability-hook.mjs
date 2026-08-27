#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executeBestEffort } from './agent-observability.mjs';
import { boundedEventId, resolveRuntimeIdentity } from './lib/agent-observability/runtime.mjs';
import {
  clearActiveTask,
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

function stageFor(event) {
  if (event.hook_event_name === 'PostCompact') return 'retrieval_context';
  const tool = String(event.tool_name || '').toLowerCase();
  if (tool === 'apply_patch') return 'implementation';
  if (tool.includes('plan')) return 'planning';
  if (tool.includes('test') || tool.includes('qa')) return 'verification';
  return 'other';
}

function evidenceFor(event, binding, identity, now) {
  const kind = event.hook_event_name === 'PostToolUse' ? 'tool'
    : event.hook_event_name === 'PostCompact' ? 'compaction'
      : 'lifecycle';
  const eventIdentity = event.tool_use_id || event.turn_id || `${event.hook_event_name}-${now}`;
  return {
    evidence_event_id: boundedEventId('ev', event.session_id, eventIdentity, event.hook_event_name),
    task_id: binding.task_id,
    stage: stageFor(event),
    kind,
    name: safeName(kind === 'tool' ? event.tool_name : event.hook_event_name, kind),
    outcome: kind === 'tool' ? toolOutcome(event.tool_response) : 'observed',
    model_family: identity.model_family,
    model: safeName(identity.model, 'model'),
    effort: identity.effort,
    effort_source: identity.effort_source,
    provider_turn_required: Boolean(event.turn_id),
    occurred_at: now,
  };
}

function settleTask(event, binding, identity, root, stateDir, now) {
  const bundle = readTaskBundle(stateDir, binding.task_id);
  if (!bundle.events.some(item => item.terminal)) {
    executeBestEffort('event', {
      usage_event_id: boundedEventId('turn', event.session_id, event.turn_id, 'terminal'),
      task_id: binding.task_id,
      provider: 'openai',
      model_family: identity.model_family,
      model: safeName(identity.model, 'model'),
      effort: identity.effort,
      stage: 'closeout',
      purpose: 'terminal',
      usage: {},
      settled: true,
      terminal: true,
      occurred_at: now,
    }, { root, stateDir, now });
  }
  const final = executeBestEffort('finalize', {
    task_id: binding.task_id,
    finalized_at: now,
    partial_reason: 'codex_hook_usage_unavailable',
  }, { root, stateDir, now });
  clearActiveTask(stateDir, event.session_id, binding.task_id);
  return final;
}

export function handleHook(event, {
  root = resolve('.'),
  stateDir = null,
  now = new Date().toISOString(),
  env = process.env,
  configText = null,
} = {}) {
  if (!event || typeof event !== 'object') return { status: 'ignored', reason: 'invalid_event' };
  const state = resolveStateDir({ root, stateDir, env });
  const binding = readActiveTask(state, event.session_id);
  if (!binding) return { status: 'ignored', reason: 'no_active_task' };
  const identity = resolveRuntimeIdentity(event, { env, configText });
  const evidence = evidenceFor(event, binding, identity, now);
  executeBestEffort('evidence', evidence, { root, stateDir: state, now });
  if (['Stop', 'SessionEnd'].includes(event.hook_event_name) && binding.close_requested)
    return { status: 'settled', task_id: binding.task_id, final: settleTask(event, binding, identity, root, state, now) };
  return { status: 'recorded', task_id: binding.task_id, evidence_event_id: evidence.evidence_event_id };
}

export function main() {
  try {
    const body = readFileSync(0, 'utf8').trim();
    handleHook(body ? JSON.parse(body) : {});
  } catch {
  }
  process.stdout.write('{}\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
