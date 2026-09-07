#!/usr/bin/env node
import { closeSync, existsSync, mkdtempSync, openSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectGodotBinary } from './qa-gate.mjs';

const ROOT = resolve(process.cwd());
const CLIENT_ROOT = 'src/Client/App/corp-tower';

function inside(root, path) {
  return path === root || path.startsWith(root + sep);
}

function compact(status, reason, extra = {}) {
  return { status, reason, ...extra };
}

export function parsePidWindowRows(output, pid) {
  if (!Number.isInteger(pid) || pid <= 0) return [];
  return String(output || '').split(/\r?\n/).flatMap(line => {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 8 || !/^0x[0-9a-f]+$/i.test(fields[0])) return [];
    const [, desktop, rowPid, x, y, width, height] = fields;
    if (![desktop, rowPid, x, y, width, height].every(value => /^-?\d+$/.test(value))) return [];
    if (Number(rowPid) !== pid) return [];
    return [{ id: fields[0], pid: Number(rowPid), x: Number(x), y: Number(y), width: Number(width), height: Number(height) }];
  });
}

export function exactWindowForPid(output, pid) {
  const matches = parsePidWindowRows(output, pid);
  if (matches.length !== 1) return null;
  const window = matches[0];
  if (window.width <= 0 || window.height <= 0) return null;
  return window;
}

export function windowCaptureArgs({ window, output }) {
  if (!window?.id || window.width <= 0 || window.height <= 0) throw new Error('window bounds are required');
  return ['-window', window.id, output];
}

export function displayContextFor(env) {
  const display = typeof env?.DISPLAY === 'string' ? env.DISPLAY.trim() : '';
  if (!display) return null;
  return { display, inherited_xauthority: typeof env.XAUTHORITY === 'string' && env.XAUTHORITY.length > 0 };
}

const WINDOW_PID_FILTER = [
  'BEGIN {',
  'command = "wmctrl -l -p -G 2>/dev/null";',
  'while ((command | getline row) > 0) {',
  'split(row, fields, /[[:space:]]+/);',
  'if (fields[3] == pid) print row;',
  '}',
  'close(command);',
  '}',
].join(' ');

export function windowQueryCommand(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  return { command: 'awk', args: ['-v', `pid=${pid}`, WINDOW_PID_FILTER] };
}

export function queryWindows(env, pid, run = spawnSync) {
  const query = windowQueryCommand(pid);
  if (!query) return '';
  const result = run(query.command, query.args, { env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return result.status === 0 ? result.stdout : '';
}

function displayReady(env, command = 'xdpyinfo') {
  if (!env.DISPLAY) return false;
  const result = spawnSync(command, [], { env, encoding: 'utf8', stdio: 'ignore' });
  return result.status === 0;
}

async function waitForExactWindow({ pid, env, timeoutMs, query = queryWindows, sleep = delay => new Promise(resolveDelay => setTimeout(resolveDelay, delay)) }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const window = exactWindowForPid(query(env, pid), pid);
    if (window) return window;
    await sleep(100);
  }
  return null;
}

function projectPath(root, project) {
  const clientRoot = resolve(root, CLIENT_ROOT);
  const candidate = resolve(root, project || CLIENT_ROOT);
  if (!inside(root, candidate) || !inside(clientRoot, candidate) || !existsSync(candidate)) return null;
  return candidate;
}

function scenePath(project, scene) {
  if (!scene) return null;
  const candidate = resolve(project, scene);
  if (!inside(project, candidate) || !candidate.endsWith('.tscn') || !existsSync(candidate)) return false;
  return candidate;
}

function terminateOwnedProcess(child) {
  if (child?.pid && typeof child.kill === 'function') child.kill('SIGTERM');
}

export async function runRenderedVerification({
  root = ROOT,
  project = CLIENT_ROOT,
  authorized = false,
  timeoutMs = 10_000,
  settleMs = 0,
  scene = '',
  env = process.env,
  dependencies = {},
} = {}) {
  if (!authorized) return compact('failed', 'rendered verification was not authorized');
  const resolvedRoot = resolve(root);
  const resolvedProject = projectPath(resolvedRoot, project);
  if (!resolvedProject) return compact('failed', 'project is not the repository client application');
  const resolvedScene = scenePath(resolvedProject, scene);
  if (resolvedScene === false) return compact('failed', 'scene is not a repository client .tscn');
  const displayContext = displayContextFor(env);
  if (!displayContext) return compact('failed', 'usable inherited display context is unavailable; host display authorization is required');
  const available = dependencies.displayReady || displayReady;
  if (!available(env, dependencies.xdpyinfo || 'xdpyinfo')) return compact('failed', 'display is unavailable');

  const temporaryDirectory = (dependencies.makeTempDirectory || (() => mkdtempSync(join(tmpdir(), 'corp-tower-rendered-'))))();
  let child = null;
  try {
    const godot = dependencies.godot || selectGodotBinary({ root: resolvedRoot });
    const godotArgs = ['--path', relative(resolvedRoot, resolvedProject)];
    if (resolvedScene) godotArgs.push(relative(resolvedProject, resolvedScene));
    let stdoutDescriptor = null;
    let stderrDescriptor = null;
    let stdio = 'ignore';
    if (!dependencies.spawn) {
      stdoutDescriptor = openSync(join(temporaryDirectory, 'godot.stdout.log'), 'a');
      stderrDescriptor = openSync(join(temporaryDirectory, 'godot.stderr.log'), 'a');
      stdio = ['ignore', stdoutDescriptor, stderrDescriptor];
    }
    child = (dependencies.spawn || spawn)(godot, godotArgs, {
      cwd: resolvedRoot,
      env,
      stdio,
    });
    if (stdoutDescriptor !== null) closeSync(stdoutDescriptor);
    if (stderrDescriptor !== null) closeSync(stderrDescriptor);
    if (!Number.isInteger(child?.pid) || child.pid <= 0) return compact('failed', 'task-owned process PID was unavailable', { temporary_directory: temporaryDirectory });
    const window = await waitForExactWindow({
      pid: child.pid,
      env,
      timeoutMs,
      query: dependencies.queryWindows || queryWindows,
      sleep: dependencies.sleep,
    });
    if (!window) return compact('failed', 'no unambiguous task-owned window', { temporary_directory: temporaryDirectory });
    if (settleMs > 0) await (dependencies.sleep || (delay => new Promise(resolveDelay => setTimeout(resolveDelay, delay))))(settleMs);
    const output = join(temporaryDirectory, 'window.png');
    const capture = (dependencies.capture || spawnSync)(dependencies.captureTool || 'import', windowCaptureArgs({ window, output }), {
      cwd: resolvedRoot,
      env,
      stdio: 'ignore',
    });
    if (capture.error || capture.status !== 0) return compact('failed', 'window capture failed', { temporary_directory: temporaryDirectory });
    return compact('passed', 'captured exact task-owned window', { capture: output, temporary_directory: temporaryDirectory });
  } finally {
    terminateOwnedProcess(child);
  }
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (!argument.startsWith('--')) throw new Error(`unknown argument ${argument}`);
    const key = argument.slice(2);
    if (key === 'authorized') {
      values.set(key, 'true');
      continue;
    }
    if (!['project', 'scene', 'timeout-ms', 'settle-ms'].includes(key)) throw new Error(`unknown option --${key}`);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`--${key} needs a value`);
    values.set(key, value);
    index++;
  }
  return values;
}

async function main() {
  const values = parseArgs(process.argv.slice(2));
  const timeoutMs = Number(values.get('timeout-ms') || '10000');
  const settleMs = Number(values.get('settle-ms') || '3000');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) throw new Error('--timeout-ms must be an integer from 100 to 60000');
  if (!Number.isInteger(settleMs) || settleMs < 0 || settleMs > 30_000) throw new Error('--settle-ms must be an integer from 0 to 30000');
  const result = await runRenderedVerification({
    authorized: values.get('authorized') === 'true',
    project: values.get('project') || CLIENT_ROOT,
    scene: values.get('scene') || '',
    timeoutMs,
    settleMs,
  });
  console.log(JSON.stringify(result));
  if (result.status !== 'passed') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(JSON.stringify(compact('failed', error.message)));
    process.exitCode = 1;
  });
}
