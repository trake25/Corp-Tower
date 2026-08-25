import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { hashSession } from './task-report-v3.mjs';

function filesUnder(root, matcher, found = []) {
  if (!root || !existsSync(root)) return found;
  let entries;
  try { entries = readdirSync(root, { withFileTypes: true }); } catch { return found; }
  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) filesUnder(path, matcher, found);
    else if (matcher(path)) found.push(path);
  }
  return found;
}

function timestamp(value) {
  if (typeof value === 'number') return value > 1e12 ? value : value * 1000;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function payloadFor(event) {
  return event?.payload || event;
}

function effectiveContext(payload) {
  const collaboration = payload?.collaboration_mode?.settings || payload?.collaborationMode?.settings || {};
  const thread = payload?.thread_settings || payload?.threadSettings || {};
  return {
    model: collaboration.model ?? payload?.model ?? thread.model ?? null,
    effort: collaboration.reasoning_effort ?? payload?.reasoning_effort ?? payload?.reasoningEffort ?? thread.reasoning_effort ?? thread.reasoningEffort ?? null,
    source: collaboration.model || collaboration.reasoning_effort ? 'turn_context.collaboration_mode.settings' : 'turn_context',
  };
}

export function resolveTranscriptPath({ threadId, env = process.env } = {}) {
  const explicit = env.CODEX_TRANSCRIPT_PATH || env.CODEX_TRANSCRIPT;
  if (explicit && existsSync(explicit)) return resolve(explicit);
  if (!threadId) return null;
  const codexHome = env.CODEX_HOME || homedir() + '/.codex';
  const candidates = filesUnder(join(codexHome, 'sessions'), path => path.endsWith('.jsonl') && path.includes(threadId));
  return candidates.sort((a, b) => {
    try { return statSync(b).mtimeMs - statSync(a).mtimeMs; } catch { return 0; }
  })[0] || null;
}

function metadataFile(env) {
  const path = env.TASK_REPORT_RUNTIME_METADATA || env.CODEX_RUNTIME_METADATA;
  return path && existsSync(path) ? path : null;
}

function parseMetadataFile(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
}

function usageAtOrBefore(events, boundary) {
  const limit = timestamp(boundary);
  const candidates = (events || []).filter(event => event.type === 'token_count' && event.usage && Number.isFinite(event.at) && (limit === null || event.at <= limit)).sort((a, b) => a.at - b.at);
  return candidates.at(-1)?.usage || null;
}

const USAGE_FIELDS = ['input_tokens', 'cached_input_tokens', 'cache_write_input_tokens', 'output_tokens', 'reasoning_output_tokens', 'total_tokens'];

function zeroUsage() {
  return Object.fromEntries(USAGE_FIELDS.map(field => [field, 0]));
}

function usageSum(start, events, { from = null, through = null } = {}) {
  if (!start) return null;
  const lower = timestamp(from);
  const upper = timestamp(through);
  const selected = (events || [])
    .filter(event => event.type === 'token_count' && event.usage && Number.isFinite(event.at))
    .filter(event => (lower === null || event.at > lower) && (upper === null || event.at <= upper))
    .sort((a, b) => a.at - b.at);
  if (!selected.length) return Object.fromEntries(USAGE_FIELDS.map(field => [field, 0]));
  const totals = Object.fromEntries(USAGE_FIELDS.map(field => [field, 0]));
  let previous = start;
  for (const event of selected) {
    for (const field of USAGE_FIELDS) {
      const current = Number(event.usage[field] || 0);
      const prior = Number(previous[field] || 0);
      totals[field] += current >= prior ? current - prior : current;
    }
    previous = event.usage;
  }
  return totals;
}

async function readTranscript(path, taskText = null) {
  if (!path || !existsSync(path)) return { events: [], context: null, usage: null, usageAtTaskStart: null, usageAtTaskComplete: null, taskStartedAt: null, taskCompletedAt: null, taskTurnId: null, finalAt: null };
  const stream = createInterface({ input: (await import('node:fs')).createReadStream(path), crlfDelay: Infinity });
  const events = [];
  let context = null;
  let usage = null;
  let taskStartedAt = null;
  let taskCompletedAt = null;
  let taskTurnId = null;
  let finalAt = null;
  for await (const line of stream) {
    if (!line.includes('turn_context') && !line.includes('thread_settings_applied') && !line.includes('token_count') && !line.includes('task_started') && !line.includes('task_complete') && !line.includes('item_started') && !line.includes('item_completed') && !line.includes('"role":"user"')) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const payload = payloadFor(event);
    const type = payload.type || event.type;
    const at = timestamp(event.timestamp) || timestamp(payload.started_at_ms) || timestamp(payload.completed_at_ms);
    if (type === 'turn_context' || type === 'thread_settings_applied') context = { ...effectiveContext(payload), timestamp: event.timestamp || null };
    if (type === 'token_count' && payload.info?.total_token_usage) usage = { ...payload.info.total_token_usage, timestamp: event.timestamp || null };
    if (type === 'task_started') {
      taskStartedAt = at ? new Date(at).toISOString() : taskStartedAt;
      taskTurnId = payload.turn_id || event.turn_id || taskTurnId;
      taskCompletedAt = null;
    }
    if (type === 'task_complete' && (!taskTurnId || payload.turn_id === taskTurnId)) {
      taskCompletedAt = at ? new Date(at).toISOString() : taskCompletedAt;
    }
    if (payload.type === 'message' && payload.role === 'user') {
      const content = Array.isArray(payload.content) ? payload.content.map(part => part.text || part.input_text || '').join(' ') : String(payload.content || '');
      if (!taskText || content.includes(taskText)) {
        taskStartedAt = at ? new Date(at).toISOString() : taskStartedAt;
        taskTurnId = payload.turn_id || event.turn_id || taskTurnId;
      }
    }
    if (at) finalAt = new Date(at).toISOString();
    if (type === 'task_started' || type === 'task_complete' || type === 'item_started' || type === 'item_completed' || type === 'task_completed' || type === 'token_count') {
      events.push({ type, payload, at, turn_id: payload.turn_id || event.turn_id || null, usage: type === 'token_count' ? usage : null });
    }
  }
  return {
    events,
    context,
    usage,
    usageAtTaskStart: usageAtOrBefore(events, taskStartedAt),
    usageAtTaskComplete: usageAtOrBefore(events, taskCompletedAt),
    taskStartedAt,
    taskCompletedAt,
    taskTurnId,
    finalAt,
  };
}

export async function readRuntimeMetadata({ env = process.env, task = null, samples = [], taskStartedAt = null } = {}) {
  const threadId = env.CODEX_THREAD_ID || env.CODEX_SESSION_ID || null;
  const path = resolveTranscriptPath({ threadId, env });
  const hostPath = metadataFile(env);
  const host = hostPath ? parseMetadataFile(hostPath) : {};
  const transcript = await readTranscript(path, task);
  const context = transcript.context || {};
  const model = host.model || context.model || env.TASK_REPORT_MODEL || null;
  const effort = host.effort || context.effort || env.TASK_REPORT_EFFORT || null;
  const session = host.session_id || threadId || null;
  const sessionHash = host.session_hash || hashSession(session);
  const previous = samples.filter(sample => sample.session_hash && sample.session_hash === sessionHash);
  const usage = host.usage_current || transcript.usage || null;
  const taskUsageBaseline = host.task_usage_baseline || host.usage_baseline || transcript.usageAtTaskStart || (transcript.taskStartedAt ? zeroUsage() : null);
  const taskUsageFinal = host.task_usage_final || transcript.usageAtTaskComplete || null;
  const resolvedTaskStartedAt = taskStartedAt || host.task_started_at || transcript.taskStartedAt || null;
  return {
    adapter: path ? 'codex-transcript' : hostPath ? 'host-json' : model || effort ? 'environment' : 'unavailable',
    provenance: path ? 'transcript-runtime-events' : hostPath ? 'host-json-contract' : model || effort ? 'environment-contract' : 'none',
    transcript: path,
    model,
    effort,
    session_id: session,
    session_hash: sessionHash,
    fresh_session: Boolean(sessionHash && previous.length === 0),
    usage_baseline: taskUsageBaseline,
    usage_current: usage,
    task_usage_baseline: taskUsageBaseline,
    task_usage_final: taskUsageFinal,
    usage_at_task_start: transcript.usageAtTaskStart || null,
    usage_at_task_complete: transcript.usageAtTaskComplete || null,
    task_started_at: resolvedTaskStartedAt,
    task_completed_at: host.task_completed_at || transcript.taskCompletedAt || null,
    task_turn_id: transcript.taskTurnId || null,
    transcript_final_at: transcript.finalAt,
    events: transcript.events,
  };
}

export function usageDelta(start, end) {
  if (!start || !end) return null;
  return Object.fromEntries(USAGE_FIELDS.map(field => [field, Math.max(0, Number(end[field] || 0) - Number(start[field] || 0))]));
}

export { usageSum };

export function completionTiming(events, { taskStartedAt = null, finalizedAt = null } = {}) {
  const startBoundary = timestamp(taskStartedAt);
  const endBoundary = timestamp(finalizedAt);
  const bounded = (events || []).filter(event => Number.isFinite(event.at) && (startBoundary === null || event.at >= startBoundary) && (endBoundary === null || event.at <= endBoundary));
  const starts = new Map();
  const intervals = [];
  for (const event of bounded) {
    if (!Number.isFinite(event.at)) continue;
    if (event.type === 'item_started') starts.set(event.payload?.item?.id || event.payload?.id || event.payload?.turn_id, event.at);
    if (event.type === 'item_completed') {
      const id = event.payload?.item?.id || event.payload?.id || event.payload?.turn_id;
      const start = starts.get(id);
      if (Number.isFinite(start) && event.at >= start) {
        const item = event.payload?.item || event.payload;
        const type = String(item?.type || '').toLowerCase();
        if (type.includes('command') || type.includes('reason') || type.includes('message') || type.includes('agent')) intervals.push([start, event.at]);
      }
    }
  }
  let active = intervals.sort((a, b) => a[0] - b[0]).reduce((sum, [start, end]) => sum + Math.max(0, end - start), 0);
  const start = startBoundary;
  const end = endBoundary || bounded.map(event => event.at).filter(Number.isFinite).at(-1) || null;
  return { active_agent_seconds: active ? Number((active / 1000).toFixed(3)) : null, wall_duration_seconds: start !== null && end !== null ? Number(Math.max(0, end - start) / 1000).toFixed(3) * 1 : null, intervals: intervals.length, provenance: active ? 'runtime-events' : 'unavailable' };
}

export function taskStartFromEvents(events, taskText = null, fallback = null) {
  const match = (events || []).find(event => event.type === 'message' && event.payload?.role === 'user' && (!taskText || JSON.stringify(event.payload.content || '').includes(taskText)));
  return match?.at ? new Date(match.at).toISOString() : fallback;
}
