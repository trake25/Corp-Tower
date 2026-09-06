#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TELEMETRY_EVENTS = Object.freeze(['SessionStart', 'PostToolUse', 'Stop', 'SessionEnd']);

function executionOverrides(planText) {
  const lines = planText.replace(/\r\n/g, '\n').split('\n');
  const headings = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /^##[ \t]+Execution Overrides[ \t]*$/.test(line));
  if (headings.length > 1) throw new Error('plan contains multiple ## Execution Overrides sections');
  if (!headings.length) return [];
  const section = [];
  for (let index = headings[0].index + 1; index < lines.length; index++) {
    if (/^##[ \t]+(?!#)/.test(lines[index])) break;
    section.push(lines[index]);
  }
  return section;
}

export function resolveTelemetryMode(planText) {
  if (typeof planText !== 'string') throw new Error('plan text must be a string');
  const entries = [];
  for (const line of executionOverrides(planText)) {
    if (!/telemetry/i.test(line)) continue;
    const entry = line.trim().replace(/^(?:-|\*)[ \t]+/, '');
    const match = /^telemetry=(ON|OFF)$/.exec(entry);
    if (!match) throw new Error(`malformed telemetry assignment: ${line.trim()}`);
    entries.push(match[1]);
  }
  if (!entries.length) return 'off';
  if (entries.length !== 1) throw new Error('telemetry override must appear exactly once');
  return entries[0] === 'ON' ? 'on' : 'off';
}

function tomlInlineValue(value) {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (Array.isArray(value)) return `[${value.map(tomlInlineValue).join(', ')}]`;
  if (!value || typeof value !== 'object') throw new Error('telemetry hook template contains an unsupported value');
  return `{ ${Object.entries(value).map(([key, entry]) => `${JSON.stringify(key)} = ${tomlInlineValue(entry)}`).join(', ')} }`;
}

function telemetryHooksOverride(root) {
  const templatePath = resolve(root, '.codex/telemetry-hooks.json');
  let template;
  try {
    template = JSON.parse(readFileSync(templatePath, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read telemetry hook template: ${error.message}`);
  }
  const hooks = template?.hooks;
  if (!hooks || typeof hooks !== 'object' || Array.isArray(hooks))
    throw new Error('telemetry hook template must contain a hooks object');
  const keys = Object.keys(hooks).sort();
  if (keys.length !== TELEMETRY_EVENTS.length || keys.some((key, index) => key !== [...TELEMETRY_EVENTS].sort()[index]))
    throw new Error('telemetry hook template must contain only SessionStart, PostToolUse, Stop, and SessionEnd');
  for (const event of TELEMETRY_EVENTS) {
    if (!Array.isArray(hooks[event]) || !hooks[event].length)
      throw new Error(`telemetry hook template event ${event} must contain hook entries`);
  }
  return `hooks=${tomlInlineValue(hooks)}`;
}

function planFile(planPath, root) {
  if (!planPath) throw new Error('usage: node scripts/codex-task-run.mjs <phase-2-plan-path> [-- <additional codex args...>]');
  const path = resolve(root, planPath);
  try {
    if (!statSync(path).isFile()) throw new Error('not a file');
    return { path, text: readFileSync(path, 'utf8') };
  } catch (error) {
    throw new Error(`phase-2 plan must be a readable file: ${error.message}`);
  }
}

function waitForCodex(child) {
  return new Promise((resolveRun, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolveRun({ code: code ?? 1, signal }));
  });
}

export async function launchCodexTask(planPath, additionalArgs = [], {
  root = ROOT,
  env = process.env,
  spawnFn = spawn,
} = {}) {
  if (!Array.isArray(additionalArgs)) throw new Error('additional Codex arguments must be an array');
  const plan = planFile(planPath, root);
  const telemetry = resolveTelemetryMode(plan.text);
  const hooksOverride = telemetry === 'on' ? telemetryHooksOverride(root) : null;
  const codexArgs = telemetry === 'on'
    ? ['--enable', 'hooks', '-c', hooksOverride, ...additionalArgs]
    : [...additionalArgs];
  const child = spawnFn('codex', codexArgs, { cwd: root, env, stdio: 'inherit' });
  const result = await waitForCodex(child);
  return { telemetry, ...result };
}

function cliArguments(argv) {
  const separator = argv.indexOf('--');
  const planArguments = separator === -1 ? argv : argv.slice(0, separator);
  if (planArguments.length !== 1)
    throw new Error('usage: node scripts/codex-task-run.mjs <phase-2-plan-path> [-- <additional codex args...>]');
  return { planPath: planArguments[0], additionalArgs: separator === -1 ? [] : argv.slice(separator + 1) };
}

async function main() {
  const { planPath, additionalArgs } = cliArguments(process.argv.slice(2));
  const result = await launchCodexTask(planPath, additionalArgs);
  process.exitCode = result.code;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  });
}
