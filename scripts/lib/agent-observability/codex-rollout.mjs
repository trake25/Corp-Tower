import {
  closeSync,
  existsSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { boundedEventId } from './runtime.mjs';

const COUNTERS = [
  'input_tokens',
  'cached_input_tokens',
  'cache_write_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'total_tokens',
];
const SELECTED = /"type":"(?:session_meta|task_started|task_complete|token_count)"/;
const MAX_ROLLOUTS = 2048;

function inside(root, path) {
  return path === root || path.startsWith(root + sep);
}

function safeSessionsRoot(env) {
  const home = resolve(env.CODEX_HOME || join(homedir(), '.codex'));
  const sessions = resolve(home, 'sessions');
  return existsSync(sessions) ? realpathSync(sessions) : sessions;
}

function selectedLines(path, visit) {
  const descriptor = openSync(path, 'r');
  const buffer = Buffer.allocUnsafe(64 * 1024);
  let pending = '';
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (!count) break;
      pending += buffer.toString('utf8', 0, count);
      const lines = pending.split('\n');
      pending = lines.pop() || '';
      for (const line of lines) {
        if (!SELECTED.test(line)) continue;
        try {
          if (visit(JSON.parse(line)) === false) return;
        } catch {
          continue;
        }
      }
    }
    if (pending && SELECTED.test(pending)) {
      try { visit(JSON.parse(pending)); } catch { /* incomplete terminal line */ }
    }
  } finally {
    closeSync(descriptor);
  }
}

function rolloutPaths(root) {
  if (!existsSync(root)) return [];
  const paths = [];
  const pending = [root];
  while (pending.length) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile() && /^rollout-.*\.jsonl$/.test(entry.name)) paths.push(path);
      if (paths.length > MAX_ROLLOUTS) throw new Error('Codex rollout inventory exceeds the bounded scan limit');
    }
  }
  return paths.sort();
}

function sessionMeta(path, sessionsRoot) {
  const real = realpathSync(path);
  if (!inside(sessionsRoot, real) || !statSync(real).isFile()) return null;
  let meta = null;
  selectedLines(real, record => {
    if (record.type !== 'session_meta') return;
    const payload = record.payload || {};
    meta = {
      path: real,
      session_id: payload.id,
      parent_session_id: payload.parent_thread_id || null,
      occurred_at: record.timestamp,
    };
    return false;
  });
  return meta && typeof meta.session_id === 'string' ? meta : null;
}

function validUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const usage = {};
  for (const field of COUNTERS) {
    const counter = value[field];
    if (!Number.isSafeInteger(counter) || counter < 0) return null;
    usage[field] = counter;
  }
  return usage;
}

function sessionTimeline(meta, until) {
  const starts = [];
  const tokens = [];
  selectedLines(meta.path, record => {
    if (typeof record.timestamp !== 'string' || record.timestamp > until) return;
    const payload = record.payload || {};
    if (record.type === 'event_msg' && payload.type === 'task_started') starts.push(record.timestamp);
    if (record.type !== 'event_msg' || payload.type !== 'token_count') return;
    const usage = validUsage(payload.info?.total_token_usage);
    if (usage) tokens.push({ occurred_at: record.timestamp, ordinal: record.ordinal, usage });
  });
  return { starts, tokens };
}

function usageDelta(current, previous) {
  if (!previous) return current;
  const reset = current.total_tokens < previous.total_tokens;
  return Object.fromEntries(COUNTERS.map(field => [
    field,
    !reset && current[field] >= previous[field] ? current[field] - previous[field] : current[field],
  ]));
}

function usageSegments(timeline, startedAt) {
  let previous = timeline.tokens.filter(item => item.occurred_at < startedAt).at(-1)?.usage || null;
  return timeline.tokens.filter(item => item.occurred_at >= startedAt).map(item => {
    const delta = usageDelta(item.usage, previous);
    previous = item.usage;
    return { ...item, delta };
  }).filter(item => item.delta.total_tokens > 0);
}

function providerUsage(counters) {
  return {
    total_tokens: counters.total_tokens,
    input_tokens: counters.input_tokens,
    output_tokens: counters.output_tokens,
    reasoning_tokens: counters.reasoning_output_tokens,
    cache_read_tokens: counters.cached_input_tokens,
    cache_write_tokens: counters.cache_write_input_tokens,
  };
}

function segmentedUsage(meta, tokens, {
  boundAt,
  evidence,
  terminal,
}) {
  const toolEvidence = evidence.filter(item => item.kind === 'tool').sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  return tokens.map((token, index) => {
    const next = tokens[index + 1]?.occurred_at;
    const matching = toolEvidence.find(item => item.stage !== 'other' && item.occurred_at >= token.occurred_at && (!next || item.occurred_at < next));
    const preceding = toolEvidence.filter(item => item.stage !== 'other' && item.occurred_at < token.occurred_at).at(-1);
    const isTerminal = terminal && index === tokens.length - 1;
    const stage = isTerminal ? 'closeout'
      : boundAt && token.occurred_at < boundAt ? 'retrieval_context'
        : matching?.stage || preceding?.stage || 'other';
    return {
      usage_event_id: boundedEventId('rollout', meta.session_id, token.ordinal, token.occurred_at),
      agent_id: meta.session_id,
      parent_agent_id: meta.parent_session_id,
      stage,
      purpose: isTerminal ? 'terminal' : terminal ? 'root' : 'subagent',
      usage: providerUsage(token.delta),
      settled: true,
      terminal: isTerminal,
      occurred_at: token.occurred_at,
    };
  });
}

function rootRollout(paths, sessionsRoot, sessionId, transcriptPath) {
  if (typeof transcriptPath === 'string' && transcriptPath.trim()) {
    const candidate = resolve(transcriptPath);
    if (!inside(sessionsRoot, candidate) || !existsSync(candidate)) throw new Error('Codex transcript path is outside the sessions directory');
    const meta = sessionMeta(candidate, sessionsRoot);
    if (meta?.session_id === sessionId) return meta;
  }
  const suffix = `-${sessionId}.jsonl`;
  for (const path of paths.filter(item => basename(item).endsWith(suffix))) {
    const meta = sessionMeta(path, sessionsRoot);
    if (meta?.session_id === sessionId) return meta;
  }
  return null;
}

function sessionTree(metas, root, startedAt, until) {
  const selected = new Map([[root.session_id, root]]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const meta of metas) {
      if (selected.has(meta.session_id) || !selected.has(meta.parent_session_id)) continue;
      if (meta.occurred_at < startedAt || meta.occurred_at > until) continue;
      selected.set(meta.session_id, meta);
      changed = true;
    }
  }
  return [...selected.values()];
}

export function codexRolloutUsage(sessionId, {
  env = process.env,
  transcriptPath = null,
  until = new Date().toISOString(),
  boundAt = null,
  evidence = [],
} = {}) {
  if (typeof sessionId !== 'string' || !sessionId.trim()) return { status: 'unavailable', reason: 'session_id_unavailable', events: [] };
  try {
    const sessionsRoot = safeSessionsRoot(env);
    const paths = rolloutPaths(sessionsRoot);
    const root = rootRollout(paths, sessionsRoot, sessionId, transcriptPath);
    if (!root) return { status: 'unavailable', reason: 'codex_rollout_not_found', events: [] };
    const rootTimeline = sessionTimeline(root, until);
    const startedAt = rootTimeline.starts.at(-1) || root.occurred_at;
    if (!rootTimeline.tokens.some(item => item.occurred_at >= startedAt))
      return { status: 'unavailable', reason: 'codex_rollout_usage_unavailable', events: [] };
    const metas = paths.map(path => sessionMeta(path, sessionsRoot)).filter(Boolean);
    const tree = sessionTree(metas, root, startedAt, until);
    const events = [];
    for (const meta of tree) {
      const timeline = meta.session_id === root.session_id ? rootTimeline : sessionTimeline(meta, until);
      const terminal = meta.session_id === root.session_id;
      const segments = usageSegments(timeline, terminal ? startedAt : meta.occurred_at);
      if (!segments.length) continue;
      events.push(...segmentedUsage(meta, segments, {
        boundAt: terminal ? boundAt : null,
        evidence,
        terminal,
      }));
    }
    if (!events.some(event => event.terminal)) return { status: 'unavailable', reason: 'codex_rollout_terminal_usage_unavailable', events: [] };
    return { status: 'exact', reason: null, events };
  } catch {
    return { status: 'unavailable', reason: 'codex_rollout_read_failed', events: [] };
  }
}
