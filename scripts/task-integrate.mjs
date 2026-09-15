#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationService } from './lib/task-integration.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function boundedText(value, limit = 200) {
  if (value === null || value === undefined) return null;
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
export function shortSha(sha) { return sha ? String(sha).slice(0, 12) : null; }

function parse(argv) {
  const [command, ...args] = argv; const values = { paths: [], finalizationPaths: [], verificationChecks: [] };
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--json') { values.json = true; continue; }
    const name = {
      '--task': 'task', '--task-branch': 'taskBranch', '--task-id': 'taskId', '--task-label': 'taskLabel',
      '--baseline': 'taskBaseline', '--head': 'expectedTaskHead', '--target': 'target', '--request': 'requestId',
      '--timeout-ms': 'timeoutMs', '--path': 'paths', '--finalization-path': 'finalizationPaths',
      '--verification-check': 'verificationChecks', '--abort': 'abort',
    }[key];
    if (!name) throw new Error(`unknown argument: ${key}`);
    if (name === 'abort') { values.abort = true; continue; }
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    if (name === 'paths' || name === 'finalizationPaths') values[name].push(value);
    else if (name === 'verificationChecks') {
      let parsed; try { parsed = JSON.parse(value); } catch { throw new Error('--verification-check needs a JSON object like {"argv":["node","script.mjs"]}'); }
      values[name].push(parsed);
    } else values[name] = value;
  }
  return { command, values };
}
function required(values, names) { for (const name of names) if (!values[name] || (Array.isArray(values[name]) && !values[name].length)) throw new Error(`--${name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)} is required`); }

/**
 * Default output is a short, state-oriented line carrying only what the caller needs for its next
 * action; `--json` remains the full stable structured contract for scripts/dashboards/debugging.
 * Full histories, timestamps, path arrays, worktree paths, and verification descriptors are never
 * part of the default text — they stay inside `--json` only.
 */
export function requestLine(result) {
  if (!result || typeof result !== 'object' || !result.request_id) return null;
  const parts = [result.request_id, result.state];
  switch (result.state) {
    case 'INTEGRATED': parts.push(`main=${shortSha(result.main_after)}`); break;
    case 'INTEGRATED_CLEANUP_REQUIRED': parts.push(`main=${shortSha(result.main_after)}`, `cleanup_error=${boundedText(result.cleanup_error)}`); break;
    case 'STALE_MAIN': parts.push(`actual_main=${shortSha(result.actual_main)}`); break;
    case 'STALE_HEAD': parts.push(`actual_task_head=${shortSha(result.actual_task_head)}`); break;
    case 'BLOCKED_CONFLICT': parts.push(`conflicts=${(result.conflicts || []).join(',')}`); break;
    case 'QA_FAILED': parts.push(`check=${result.qa?.check || 'unknown'}`, `detail=${boundedText(result.qa?.detail)}`); break;
    case 'PUSH_REJECTED': case 'RECOVERY_REQUIRED': parts.push(`error=${boundedText(result.error)}`); break;
    default: break;
  }
  if (result.recovery) parts.push(`recovery=${boundedText(result.recovery)}`);
  return parts.join(' ');
}
export function compactLine(command, result) {
  if (command === 'start') {
    const line = `${result.task_id} ${result.reused ? 'resumed' : 'started'} on ${result.task_branch} baseline=${shortSha(result.task_baseline)}`;
    return result.state ? `${line} state=${result.state} recovery_detail=${boundedText(result.recovery_detail)}` : line;
  }
  if (command === 'status' && !result.request_id) {
    const counts = (result.requests || []).reduce((tally, request) => { tally[request.state] = (tally[request.state] || 0) + 1; return tally; }, {});
    const countText = Object.entries(counts).map(([state, count]) => `${state}=${count}`).join(' ') || 'empty';
    return `${result.repository} ${result.target} active=${result.active_request_id || 'none'} ${countText}`;
  }
  if (command === 'recover-lock') return `${result.recovered ? 'recovered' : 'not recovered'}: ${result.detail}`;
  if (command === 'gc') return `pruned_temp=${result.pruned_temp_files.length} removed_dirs=${result.removed_directories.length} preserved_orphans=${result.preserved_orphans.length}`;
  const line = requestLine(result);
  return line || JSON.stringify(result);
}

async function main() {
  const { command, values } = parse(process.argv.slice(2)); const service = createIntegrationService({ root: ROOT }); let result;
  if (command === 'start') { required(values, ['task']); result = service.start(values); }
  else if (command === 'submit') { required(values, ['task', 'taskBranch', 'taskBaseline', 'paths']); result = service.submit(values); }
  else if (command === 'register') { required(values, ['task', 'taskBranch', 'taskBaseline', 'expectedTaskHead']); result = service.register(values); result = service.advance(values) || result; }
  else if (command === 'advance') result = service.advance(values) || service.status(values);
  else if (command === 'finish') { required(values, ['requestId']); result = service.finish(values); }
  else if (command === 'status') result = service.status(values);
  else if (command === 'abort') { required(values, ['requestId']); result = service.abort(values); }
  else if (command === 'recover') { required(values, ['requestId']); result = service.recover(values); }
  else if (command === 'recover-lock') result = service.recoverLock();
  else if (command === 'gc') result = service.gc();
  else if (command === 'await') { required(values, ['requestId']); result = await service.await({ ...values, timeoutMs: Number(values.timeoutMs || 30_000) }); }
  else throw new Error('usage: task-integrate <start|submit|register|advance|finish|status|abort|recover|recover-lock|gc|await> [options]');
  if (values.json) console.log(JSON.stringify({ ok: true, result }, null, 2));
  else console.log(compactLine(command, result));
}
export function formatFailure(message, json) { return json ? JSON.stringify({ ok: false, error: message }) : boundedText(message, 300); }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(formatFailure(error.message, process.argv.includes('--json')));
    process.exitCode = 2;
  });
}
