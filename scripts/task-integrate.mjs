#!/usr/bin/env node
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createIntegrationService } from './lib/task-integration.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
function fail(message) { console.error(JSON.stringify({ ok: false, error: message })); process.exitCode = 2; }
function parse(argv) {
  const [command, ...args] = argv; const values = { paths: [], finalizationPaths: [] };
  for (let index = 0; index < args.length; index++) {
    const key = args[index];
    if (key === '--json') { values.json = true; continue; }
    const name = { '--task': 'task', '--task-branch': 'taskBranch', '--task-id': 'taskId', '--baseline': 'taskBaseline', '--head': 'expectedTaskHead', '--target': 'target', '--request': 'requestId', '--timeout-ms': 'timeoutMs', '--path': 'paths', '--finalization-path': 'finalizationPaths', '--abort': 'abort' }[key];
    if (!name) throw new Error(`unknown argument: ${key}`);
    if (name === 'abort') { values.abort = true; continue; }
    const value = args[++index]; if (!value || value.startsWith('--')) throw new Error(`${key} needs a value`);
    if (name === 'paths' || name === 'finalizationPaths') values[name].push(value); else values[name] = value;
  }
  return { command, values };
}
function required(values, names) { for (const name of names) if (!values[name] || (Array.isArray(values[name]) && !values[name].length)) throw new Error(`--${name.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)} is required`); }
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
  else if (command === 'await') { required(values, ['requestId']); result = await service.await({ ...values, timeoutMs: Number(values.timeoutMs || 30_000) }); }
  else throw new Error('usage: task-integrate <start|submit|register|advance|finish|status|abort|recover|await> [options]');
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}
main().catch(error => fail(error.message));
