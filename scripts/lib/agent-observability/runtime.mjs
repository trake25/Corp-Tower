import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max', 'ultra']);

function topLevelToml(text) {
  const values = {};
  let section = '';
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const table = line.match(/^\[([^\]]+)\]$/);
    if (table) {
      section = table[1];
      continue;
    }
    if (section) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*["']([^"']+)["']\s*(?:#.*)?$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function modelFamily(model) {
  const value = String(model || '').toLowerCase();
  for (const family of ['terra', 'sol', 'luna', 'opus', 'fable'])
    if (new RegExp(`(?:^|[-_/])${family}(?:$|[-_/])`).test(value)) return family;
  return 'unknown';
}

export function boundedEventId(prefix, ...parts) {
  const hash = createHash('sha256').update(parts.map(value => String(value || '')).join('|')).digest('hex').slice(0, 20);
  return `${prefix}-${hash}`;
}

export function resolveRuntimeIdentity(input = {}, {
  env = process.env,
  configPath = join(homedir(), '.codex', 'config.toml'),
  configText = null,
} = {}) {
  let config = {};
  try {
    const text = configText ?? (existsSync(configPath) ? readFileSync(configPath, 'utf8') : '');
    config = topLevelToml(text);
  } catch {
    config = {};
  }
  const modelSources = [
    ['hook', input.model],
    ['host', input.active_model],
    ['environment', env.CODEX_MODEL],
    ['config', config.model],
  ];
  const effortSources = [
    ['host', input.reasoning_effort || input.effort],
    ['environment', env.CODEX_REASONING_EFFORT],
    ['config', config.model_reasoning_effort],
  ];
  const [modelSource, rawModel] = modelSources.find(([, value]) => typeof value === 'string' && value.trim()) || ['unavailable', 'unknown'];
  const [effortSource, rawEffort] = effortSources.find(([, value]) => typeof value === 'string' && value.trim()) || ['unavailable', 'unknown'];
  const effort = String(rawEffort).toLowerCase();
  return {
    model: String(rawModel),
    model_family: modelFamily(rawModel),
    model_source: modelSource,
    effort: EFFORTS.has(effort) ? effort : 'unknown',
    effort_source: EFFORTS.has(effort) ? effortSource : 'unavailable',
  };
}

export function codexSessionIds(env = process.env) {
  return [...new Set([env.CODEX_SESSION_ID, env.CODEX_THREAD_ID].filter(value => typeof value === 'string' && value.trim()))];
}
