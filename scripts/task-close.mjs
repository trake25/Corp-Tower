#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapOwnerForPath, routeSourcePath } from './lib/context-routing.mjs';
import { selectQa } from './qa-gate.mjs';

const ROOT = resolve(process.env.TASK_CLOSE_ROOT || '.');
const DEFAULT_MANIFEST = 'task/close-out.json';
const SCHEMA_VERSION = 1;

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function underRoot(path) {
  return path === ROOT || path.startsWith(ROOT + sep);
}

function safePath(input, label) {
  if (!input) fail(`${label} is required`);
  const path = resolve(ROOT, input);
  if (!underRoot(path)) fail(`${label} must stay inside the repository`);
  return path;
}

function displayPath(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`--${key} needs a value`);
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(value);
    index++;
  }
  return values;
}

function one(values, key, required = false) {
  const found = values.get(key) || [];
  if (found.length > 1) fail(`--${key} may be supplied once`);
  if (required && !found.length) fail(`--${key} is required`);
  return found[0] || '';
}

function many(values, key) {
  return values.get(key) || [];
}

function normalizePaths(paths) {
  if (!paths.length) fail('supply one or more task-owned paths with --changed');
  return normalizeOptionalPaths(paths, '--changed');
}

function normalizeOptionalPaths(paths, label) {
  return [...new Set(paths.map(path => {
    const absolute = safePath(path, label);
    return displayPath(absolute);
  }))].sort();
}

function sourcePath(path) {
  return /^(src\/|scripts\/|infra\/|docker\/|\.github\/|site\/src\/|site-root\/)/.test(path);
}

function agentConfigPath(path) {
  return /^(AGENTS\.md|CLAUDE\.md|\.agents\/skills\/|\.claude\/skills\/)/.test(path);
}

function domainFor(path) {
  if (path.startsWith('src/Server/')) return 'server';
  if (path.startsWith('src/Client/')) return 'client';
  if (path.startsWith('site/')) return 'site';
  if (path.startsWith('docs/context/')) return 'game-kb';
  if (path.startsWith('scripts/')) return 'tooling';
  if (path.startsWith('.github/') || path.startsWith('infra/') || path.startsWith('docker/')) return 'infra';
  return 'repository';
}

export function createManifest({ task, changedPaths }) {
  if (!task || task.length > 120) throw new Error('task must be present and at most 120 characters');
  const changed = [...new Set(changedPaths)].sort();
  if (!changed.length) throw new Error('one or more changed paths are required');
  const routes = changed.map(path => ({ path, route: routeSourcePath(path) }));
  const documentation = [...new Set(routes.flatMap(({ route }) => route?.docs || []))].sort();
  const maps = [...new Set(changed.map(mapOwnerForPath).filter(Boolean).map(map => `docs/context/map/${map}`))].sort();
  const domains = [...new Set(changed.map(domainFor))].sort();
  const hasSource = changed.some(sourcePath);
  return {
    schema_version: SCHEMA_VERSION,
    task,
    changed_paths: changed,
    domains,
    routes: routes.map(({ path, route }) => ({
      path,
      skill: route?.skill || null,
      docs: route?.docs || [],
      map: route?.map ? `docs/context/map/${route.map}` : null,
      read: route?.read || null,
    })),
    qa: selectQa(changed),
    documentation: {
      source_changed: hasSource,
      candidate_docs: documentation,
      maps_to_regenerate: maps,
      decision: hasSource ? 'pending' : 'not-needed',
      reason: hasSource ? null : 'No source path is in the manifest.',
      documented_paths: [],
      scope: null,
    },
    verification: null,
    report: null,
  };
}

export function applyDocumentationDecision(manifest, { decision, reason, documentedPaths = [] }) {
  if (!['updated', 'not-needed'].includes(decision)) throw new Error('decision must be updated or not-needed');
  if (!reason?.trim()) throw new Error('a documentation decision needs a plain-English reason');
  if (decision === 'updated' && !documentedPaths.length) throw new Error('updated requires one or more --doc-path values');
  if (documentedPaths.some(path => !/^((docs\/context|site\/docs)\/).+\.md$/.test(path)))
    throw new Error('every --doc-path must be a Markdown document in docs/context or site/docs');
  return {
    ...manifest,
    documentation: {
      ...manifest.documentation,
      decision,
      reason: reason.trim(),
      documented_paths: [...new Set(documentedPaths)].sort(),
    },
    verification: null,
    report: null,
  };
}

export function intakeForManifest(manifest, manifestFile) {
  return {
    schema_version: SCHEMA_VERSION,
    manifest: manifestFile,
    intake: {
      task_owned_paths: manifest.changed_paths,
      routes: manifest.routes,
      qa: manifest.qa,
      documentation: {
        decision: manifest.documentation.decision,
        candidate_docs: manifest.documentation.candidate_docs,
        maps_to_regenerate: manifest.documentation.maps_to_regenerate,
        scope: manifest.documentation.scope?.output || null,
      },
    },
  };
}

function manifestPath(values) {
  return safePath(one(values, 'manifest') || DEFAULT_MANIFEST, '--manifest');
}

function writeManifest(path, manifest) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function readManifest(path) {
  if (!existsSync(path)) fail(`manifest not found: ${displayPath(path)}`, 1);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`manifest is not valid JSON: ${displayPath(path)}`, 1);
  }
  if (manifest.schema_version !== SCHEMA_VERSION) fail(`unsupported manifest schema: ${manifest.schema_version}`, 1);
  return manifest;
}

function receiptPath(path) {
  return path.replace(/\.json$/, '.receipt.json');
}

function compactOutput(output) {
  return output.trim().split(/\r?\n/).filter(Boolean).at(-1) || '';
}

function runStep(name, args, retainOutput = false) {
  const result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const output = `${result.stdout || ''}${result.stderr || ''}${result.error ? result.error.message : ''}`;
  return {
    name,
    command: [process.execPath, ...args],
    status: result.error ? 1 : result.status ?? 1,
    summary: compactOutput(output),
    output: result.status === 0 && !retainOutput ? undefined : output.trim(),
  };
}

function requireDocumentationDecision(manifest) {
  if (!manifest.documentation.source_changed) return;
  if (!manifest.documentation.scope) fail('manifest has no documentation scope; rerun task-close prepare', 1);
  if (manifest.documentation.decision === 'pending')
    fail('documentation decision is pending; an agent must run task-close decide before verification', 1);
  if (!manifest.documentation.reason) fail('documentation decision has no reason', 1);
  if (manifest.documentation.decision === 'updated' && !manifest.documentation.documented_paths.length)
    fail('updated documentation decision has no documented paths', 1);
}

function verify(manifest, manifestFile) {
  requireDocumentationDecision(manifest);
  const steps = [];
  steps.push(runStep('QA', ['scripts/qa-gate.mjs', '--changed', ...manifest.changed_paths]));
  if (manifest.documentation.source_changed) steps.push(runStep('file map', ['scripts/build-file-map.mjs']));
  if (manifest.documentation.source_changed || manifest.changed_paths.some(path => path.startsWith('docs/context/')) || manifest.documentation.documented_paths.some(path => path.startsWith('docs/context/')))
    steps.push(runStep('game KB', ['scripts/validate-docs.mjs']));
  if (manifest.changed_paths.some(path => path.startsWith('site/')) || manifest.documentation.documented_paths.some(path => path.startsWith('site/docs/')))
    steps.push(runStep('site KB', ['-e', "process.chdir('site'); require('node:child_process').execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'docs:check'], { stdio: 'inherit' })"]));
  if (manifest.changed_paths.some(agentConfigPath)) steps.push(runStep('agent config', ['scripts/validate-agent-config.mjs']));
  steps.push(runStep('task report', ['scripts/task-report.mjs', 'validate']));
  const failed = steps.find(step => step.status !== 0);
  const receipt = {
    schema_version: SCHEMA_VERSION,
    task: manifest.task,
    manifest: displayPath(manifestFile),
    status: failed ? 'failed' : 'passed',
    steps,
  };
  writeFileSync(receiptPath(manifestFile), `${JSON.stringify(receipt, null, 2)}\n`);
  manifest.verification = {
    status: receipt.status,
    receipt: displayPath(receiptPath(manifestFile)),
  };
  writeManifest(manifestFile, manifest);
  if (failed) fail(`FAIL — ${failed.name}: ${failed.summary || 'no summary'}`, 1);
  console.log(`PASS — ${steps.map(step => `${step.name}: ${step.summary}`).join('; ')}`);
}

function report(manifest, manifestFile, values) {
  if (manifest.verification?.status !== 'passed') fail('verification must pass before reporting', 1);
  const required = ['complexity', 'mode', 'r-est', 'r-act', 'total', 'main', 'hit', 'verdict', 'model', 'effort', 'skills'];
  for (const key of required) one(values, key, true);
  const files = new Set([...manifest.changed_paths, ...manifest.documentation.documented_paths]);
  const args = ['scripts/task-report.mjs', 'append', '--task', manifest.task, '--domains', String(manifest.domains.length), '--files', String(files.size)];
  for (const key of required) args.push(`--${key}`, one(values, key, true));
  const summary = one(values, 'summary');
  if (summary) args.push('--summary', summary);
  const step = runStep('task report append', args);
  if (step.status !== 0) fail(`FAIL — ${step.name}: ${step.summary || 'no summary'}`, 1);
  manifest.report = { status: 'appended', summary: step.summary };
  writeManifest(manifestFile, manifest);
  console.log(`PASS — ${step.summary}`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args.shift();
  const values = parseArgs(args);
  if (command === 'prepare') {
    const manifestFile = safePath(one(values, 'output') || one(values, 'manifest') || DEFAULT_MANIFEST, '--output');
    const manifest = createManifest({ task: one(values, 'task', true), changedPaths: normalizePaths(many(values, 'changed')) });
    if (manifest.documentation.source_changed) {
      const scope = runStep('documentation scope', ['scripts/docs-scope.mjs', ...manifest.changed_paths], true);
      if (scope.status !== 0) fail(`FAIL — ${scope.name}: ${scope.summary || 'no summary'}`, 1);
      manifest.documentation.scope = { command: scope.command, output: scope.output, summary: scope.summary };
    }
    writeManifest(manifestFile, manifest);
    console.log(JSON.stringify(intakeForManifest(manifest, displayPath(manifestFile)), null, 2));
    return;
  }
  if (command === 'decide') {
    const manifestFile = manifestPath(values);
    const manifest = applyDocumentationDecision(readManifest(manifestFile), {
      decision: one(values, 'decision', true),
      reason: one(values, 'reason', true),
      documentedPaths: normalizeOptionalPaths(many(values, 'doc-path'), '--doc-path'),
    });
    writeManifest(manifestFile, manifest);
    console.log(`PASS — documentation decision: ${manifest.documentation.decision}`);
    return;
  }
  if (command === 'verify') {
    const manifestFile = manifestPath(values);
    verify(readManifest(manifestFile), manifestFile);
    return;
  }
  if (command === 'report') {
    const manifestFile = manifestPath(values);
    report(readManifest(manifestFile), manifestFile, values);
    return;
  }
  fail('usage: node scripts/task-close.mjs <prepare|decide|verify|report> ...');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
