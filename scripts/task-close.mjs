#!/usr/bin/env node
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapOwnerForPath, routeSourcePath } from './lib/context-routing.mjs';
import { scopeContext } from './lib/context-query.mjs';
import { selectQa } from './qa-gate.mjs';

const ROOT = resolve(process.env.TASK_CLOSE_ROOT || '.');
const DEFAULT_MANIFEST = '.agent-state/automation/close-out.json';
const SCHEMA_VERSION = 2;
const INTAKE_MAX_BYTES = 8 * 1024;

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
    if (!arg.startsWith('--')) fail(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`--${key} needs a value`);
    if (!values.has(key)) values.set(key, []);
    values.get(key).push(value);
    index++;
  }
  return values;
}

function checkOptions(values, allowed) {
  for (const key of values.keys()) if (!allowed.includes(key)) fail(`unknown option --${key}`);
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
  if (!paths.length) fail('supply one or more explicit paths');
  return normalizeOptionalPaths(paths, '--path');
}

function normalizeOptionalPaths(paths, label) {
  return [...new Set(paths.map(path => displayPath(safePath(path, label))))].sort();
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

function command(argv) {
  return {
    argv,
    display: argv.map(part => /^[a-z0-9_./,:-]+$/i.test(part) ? part : JSON.stringify(part)).join(' '),
  };
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fileHash(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

function mapHashes() {
  const root = resolve(ROOT, 'docs/context/map');
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root).filter(name => name.endsWith('.md')).sort().map(name => {
    const path = `docs/context/map/${name}`;
    return [path, fileHash(resolve(ROOT, path))];
  }));
}

function pathChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
}

export function publishPathsFor(changedPaths, documentedPaths, derivedPaths) {
  return [...new Set([...changedPaths, ...documentedPaths, ...derivedPaths])].sort();
}

function documentationFor(scope, sourceChanged = false) {
  return {
    source_changed: sourceChanged,
    candidate_docs: scope.docs,
    maps_to_regenerate: scope.maps,
    scope: null,
    decision: sourceChanged ? 'pending' : 'not-needed',
    reason: sourceChanged ? null : 'No source path is in the reviewed change set.',
    documented_paths: [],
  };
}

export function createManifest({ task, ownedPaths = null, changedPaths = null, runId = null }) {
  if (!task || task.length > 120) throw new Error('task must be present and at most 120 characters');
  const owned = [...new Set(ownedPaths || changedPaths || [])].sort();
  if (!owned.length) throw new Error('one or more owned paths are required');
  const intake = scopeContext(owned, { artifact: true });
  const hasSource = owned.some(sourcePath);
  return {
    schema_version: SCHEMA_VERSION,
    phase: 'prepared',
    task,
    run_id: runId || randomUUID(),
    owned_paths: owned,
    changed_paths: [],
    derived_paths: [],
    documented_paths: [],
    publish_paths: [],
    domains: [...new Set(owned.map(domainFor))].sort(),
    intake,
    retrieval: { fallbacks: [] },
    documentation: documentationFor(intake, hasSource),
    review: null,
    verification: null,
  };
}

function upgradeManifest(manifest) {
  if (manifest.schema_version === SCHEMA_VERSION) return manifest;
  if (manifest.schema_version !== 1) throw new Error(`unsupported manifest schema: ${manifest.schema_version}`);
  return createManifest({ task: manifest.task, ownedPaths: manifest.changed_paths, runId: manifest.run_id });
}

export function amendManifest(manifest, paths) {
  if (manifest.schema_version !== SCHEMA_VERSION) throw new Error('amend requires a schema-v2 manifest');
  if (manifest.phase === 'closed') throw new Error('a closed manifest cannot be amended; start a new task');
  const additions = [...new Set(paths)].filter(path => !manifest.owned_paths.includes(path)).sort();
  if (!additions.length) return manifest;
  const sourceAdded = additions.some(sourcePath);
  const owned = [...new Set([...manifest.owned_paths, ...additions])].sort();
  const intake = scopeContext(owned, { artifact: true });
  const resetReview = sourceAdded && ['reviewed', 'failed'].includes(manifest.phase);
  return {
    ...manifest,
    phase: resetReview ? 'prepared' : manifest.phase,
    owned_paths: owned,
    domains: [...new Set(owned.map(domainFor))].sort(),
    intake,
    changed_paths: resetReview ? [] : manifest.changed_paths,
    derived_paths: [],
    documented_paths: resetReview ? [] : manifest.documented_paths,
    publish_paths: [],
    documentation: resetReview ? documentationFor(intake, owned.some(sourcePath)) : manifest.documentation,
    review: resetReview ? null : manifest.review,
    verification: null,
  };
}

export function reviewManifest(manifest, { changedPaths, scope = null, mapBaseline = null }) {
  if (manifest.schema_version !== SCHEMA_VERSION) throw new Error('review requires a schema-v2 manifest');
  const changed = [...new Set(changedPaths)].sort();
  if (!changed.length) throw new Error('review needs one or more explicit changed paths');
  const outside = changed.filter(path => !manifest.owned_paths.includes(path));
  if (outside.length) throw new Error(`changed paths are not owned: ${outside.join(', ')}`);
  const intake = scopeContext(changed, { artifact: true });
  const sourceChanged = changed.some(sourcePath);
  const reviewInput = { changed_paths: changed, docs: intake.docs, maps: intake.maps, qa: intake.qa };
  const mapHashesAtReview = { ...(mapBaseline || mapHashes()), ...(manifest.review?.map_hashes || {}) };
  return {
    ...manifest,
    phase: 'reviewed',
    changed_paths: changed,
    derived_paths: [],
    documented_paths: [],
    publish_paths: changed,
    documentation: { ...documentationFor(intake, sourceChanged), scope },
    review: { input_fingerprint: fingerprint(reviewInput), reviewed_at: new Date().toISOString(), intake, map_hashes: mapHashesAtReview },
    verification: null,
  };
}

function decisionValues({ decision, reason, documentedPaths = [] }) {
  if (!['updated', 'not-needed'].includes(decision)) throw new Error('decision must be updated or not-needed');
  if (!reason?.trim()) throw new Error('a documentation decision needs a plain-English reason');
  if (decision === 'updated' && !documentedPaths.length) throw new Error('updated requires one or more --doc-path values');
  if (decision === 'not-needed' && documentedPaths.length) throw new Error('not-needed does not accept --doc-path values');
  if (documentedPaths.some(path => !/^((docs\/context|site\/docs)\/).+\.md$/.test(path)))
    throw new Error('every --doc-path must be a Markdown document in docs/context or site/docs');
  return { decision, reason: reason.trim(), documentedPaths: [...new Set(documentedPaths)].sort() };
}

export function applyDocumentationDecision(manifest, input) {
  const values = decisionValues(input);
  if (manifest.schema_version === 1) {
    return {
      ...manifest,
      documentation: {
        ...manifest.documentation,
        decision: values.decision,
        reason: values.reason,
        documented_paths: values.documentedPaths,
      },
      verification: null,
    };
  }
  if (!['reviewed', 'failed'].includes(manifest.phase)) throw new Error('close requires a reviewed manifest');
  const unowned = values.documentedPaths.filter(path => !manifest.owned_paths.includes(path));
  if (unowned.length) throw new Error(`documented paths must be owned before editing: ${unowned.join(', ')}`);
  if (values.decision === 'updated') {
    const unrelated = values.documentedPaths.filter(path => !manifest.documentation.candidate_docs.includes(path));
    if (unrelated.length) throw new Error(`documented paths are outside the reviewed documentation scope: ${unrelated.join(', ')}`);
  }
  return {
    ...manifest,
    documentation: {
      ...manifest.documentation,
      decision: values.decision,
      reason: values.reason,
      documented_paths: values.documentedPaths,
    },
    documented_paths: values.documentedPaths,
    publish_paths: publishPathsFor(manifest.changed_paths, values.documentedPaths, []),
    verification: null,
  };
}

export function recordFallback(manifest, { query, classification, searchedRoot, fixture }) {
  if (manifest.schema_version !== SCHEMA_VERSION) throw new Error('fallback recording requires a schema-v2 manifest');
  if (!['retrieval-defect', 'tool-error'].includes(classification)) throw new Error('classification must be retrieval-defect or tool-error');
  if (!query?.trim() || !searchedRoot || !fixture?.trim()) throw new Error('fallback needs query, searched root, and repair fixture');
  const entry = { query: query.trim(), classification, searched_root: searchedRoot, repair_fixture: fixture.trim() };
  return {
    ...manifest,
    retrieval: { fallbacks: [...manifest.retrieval.fallbacks.filter(item => fingerprint(item) !== fingerprint(entry)), entry] },
    verification: null,
  };
}

export function intakeForManifest(manifest, manifestFile) {
  if (manifest.schema_version === 1) {
    return {
      schema_version: 1,
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
  const result = {
    schema_version: SCHEMA_VERSION,
    manifest: manifestFile,
    phase: manifest.phase,
    owned_paths: manifest.owned_paths,
    roles: [...new Set(manifest.intake.routes.map(route => route.skill).filter(Boolean))].sort(),
    docs: manifest.intake.docs,
    maps: manifest.intake.maps,
    qa: {
      applies: manifest.intake.qa.applies,
      server_tests: manifest.intake.qa.server_tests,
      client_tests: manifest.intake.qa.client_tests,
    },
    tools: manifest.intake.tools.map(tool => ({ name: tool.name, command: tool.command.display })),
    next: command(['node', 'scripts/task-close.mjs', 'review', '--manifest', manifestFile, '--changed', '<final-path>']).display,
  };
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > INTAKE_MAX_BYTES) throw new Error('task intake exceeds 8192 bytes; split the manifest');
  return result;
}

function reviewForManifest(manifest, manifestFile) {
  const intake = manifest.review.intake;
  const result = {
    schema_version: SCHEMA_VERSION,
    manifest: manifestFile,
    phase: manifest.phase,
    changed_paths: manifest.changed_paths,
    docs: manifest.documentation.candidate_docs,
    maps: manifest.documentation.maps_to_regenerate,
    qa: {
      applies: intake.qa.applies,
      server_tests: intake.qa.server_tests,
      client_tests: intake.qa.client_tests,
    },
    documentation_scope: manifest.documentation.scope?.output || null,
    next: command(['node', 'scripts/task-close.mjs', 'close', '--manifest', manifestFile, '--decision', '<updated|not-needed>', '--reason', '<reason>']).display,
  };
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > INTAKE_MAX_BYTES) throw new Error('task review exceeds 8192 bytes; read the manifest artifact for full documentation scope');
  return result;
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
  if (![1, SCHEMA_VERSION].includes(manifest.schema_version)) fail(`unsupported manifest schema: ${manifest.schema_version}`, 1);
  return manifest;
}

function receiptPath(path) {
  return path.replace(/\.json$/, '.receipt.json');
}

function diagnosticLine(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const marker = lines.find(line => /\bnot ok\b|\bFAIL(?:URE)?\b|\[Failed\]:|(?:Error|Exception):/i.test(line));
  if (marker) return marker;
  return lines.find(line => /(?:^|\s)(?:at\s+)?[^\s()]+:\d+(?::\d+)?(?:\s|$)/.test(line)) || lines.at(-1) || '';
}

function compactOutput(output, { status = null, signal = null } = {}) {
  const prefix = signal ? `signal ${signal}` : `exit ${status ?? 'unknown'}`;
  const line = diagnosticLine(output);
  return line ? `${prefix}; ${line}` : status === 0 ? prefix : `${prefix}; process exited without output`;
}

function runStep(name, args) {
  const logRoot = resolve(ROOT, '.agent-state/automation/task-close-logs');
  mkdirSync(logRoot, { recursive: true });
  const logPath = resolve(logRoot, `${randomUUID()}.log`);
  const log = openSync(logPath, 'w');
  let result;
  try {
    result = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', log, log] });
  } finally {
    closeSync(log);
  }
  const output = `${readFileSync(logPath, 'utf8')}${result.error ? result.error.message : ''}`;
  unlinkSync(logPath);
  const status = result.error ? 1 : result.status ?? 1;
  return {
    name,
    command: [process.execPath, ...args],
    status,
    exit_code: result.status,
    signal: result.signal || null,
    summary: compactOutput(output, { status, signal: result.signal }),
    output: output.trim() || undefined,
  };
}

function requireDocumentationDecision(manifest) {
  if (!manifest.documentation.source_changed) return;
  if (!manifest.documentation.scope) fail('manifest has no post-edit documentation scope; run task-close review', 1);
  if (manifest.documentation.decision === 'pending') fail('documentation decision is pending; pass it to task-close close', 1);
  if (!manifest.documentation.reason) fail('documentation decision has no reason', 1);
  if (manifest.documentation.decision === 'updated' && !manifest.documentation.documented_paths.length)
    fail('updated documentation decision has no documented paths', 1);
}

function requireFallbackFixtures(manifest) {
  if (!manifest.retrieval.fallbacks.length) return;
  const fixtureFile = resolve(ROOT, 'report/benchmarks/rag-fixtures.json');
  let fixtures;
  try {
    fixtures = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  } catch {
    fail('retrieval fallbacks exist but benchmark fixtures cannot be read', 1);
  }
  const ids = new Set(Object.values(fixtures).flatMap(group => Array.isArray(group) ? group.map(item => item.id) : []));
  const missing = manifest.retrieval.fallbacks.filter(item => !ids.has(item.repair_fixture));
  if (missing.length) fail(`retrieval fallback repair fixtures are missing: ${missing.map(item => item.repair_fixture).join(', ')}`, 1);
}

function verifyV1(manifest, manifestFile) {
  if (manifest.documentation.source_changed) {
    if (!manifest.documentation.scope) fail('manifest has no documentation scope; rerun task-close prepare', 1);
    if (manifest.documentation.decision === 'pending') fail('documentation decision is pending; an agent must run task-close decide before verification', 1);
  }
  const steps = [runStep('QA', ['scripts/qa-gate.mjs', '--changed', ...manifest.changed_paths])];
  if (manifest.documentation.source_changed) steps.push(runStep('file map', ['scripts/build-file-map.mjs']));
  if (manifest.documentation.source_changed || manifest.changed_paths.some(path => path.startsWith('docs/context/')) || manifest.documentation.documented_paths.some(path => path.startsWith('docs/context/')))
    steps.push(runStep('game KB', ['scripts/validate-docs.mjs']));
  if (manifest.changed_paths.some(path => path.startsWith('site/')) || manifest.documentation.documented_paths.some(path => path.startsWith('site/docs/')))
    steps.push(runStep('site KB', ['-e', "process.chdir('site'); require('node:child_process').execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'docs:check'], { stdio: 'inherit' })"]));
  if (manifest.changed_paths.some(agentConfigPath)) steps.push(runStep('agent config', ['scripts/validate-agent-config.mjs']));
  finishVerification(manifest, manifestFile, steps, manifest.changed_paths);
}

function finishVerification(manifest, manifestFile, steps, publishPaths, closeInputFingerprint = null) {
  const failed = steps.find(step => step.status !== 0);
  const receipt = {
    schema_version: manifest.schema_version,
    task: manifest.task,
    manifest: displayPath(manifestFile),
    status: failed ? 'failed' : 'passed',
    input_fingerprint: closeInputFingerprint,
    publish_paths: publishPaths,
    steps,
  };
  writeFileSync(receiptPath(manifestFile), `${JSON.stringify(receipt, null, 2)}\n`);
  manifest.publish_paths = publishPaths;
  manifest.verification = {
    status: receipt.status,
    receipt: displayPath(receiptPath(manifestFile)),
    close_input_fingerprint: closeInputFingerprint,
  };
  if (manifest.schema_version === SCHEMA_VERSION) manifest.phase = failed ? 'failed' : 'closed';
  writeManifest(manifestFile, manifest);
  if (failed) fail(`FAIL — ${failed.name}: ${failed.summary}; receipt: ${displayPath(receiptPath(manifestFile))}`, 1);
  console.log(`PASS — receipt: ${displayPath(receiptPath(manifestFile))}; ${steps.map(step => `${step.name} ${step.summary}`).join('; ')}`);
}

function verifyV2(manifest, manifestFile, closeInputFingerprint) {
  requireDocumentationDecision(manifest);
  requireFallbackFixtures(manifest);
  const steps = [];
  for (const tool of manifest.review.intake.tools.filter(tool => ['automation protocol', 'retrieval benchmark'].includes(tool.name)))
    steps.push(runStep(tool.name, tool.command.argv.slice(1)));
  if (manifest.retrieval.fallbacks.length && !steps.some(step => step.name === 'retrieval benchmark'))
    steps.push(runStep('retrieval benchmark', ['scripts/benchmark-rag.mjs', '--check']));
  steps.push(runStep('QA', ['scripts/qa-gate.mjs', '--changed', ...manifest.changed_paths]));
  let derived = [];
  if (manifest.documentation.source_changed) {
    const before = manifest.review.map_hashes || mapHashes();
    const mapStep = runStep('file map', ['scripts/build-file-map.mjs']);
    steps.push(mapStep);
    if (mapStep.status === 0) {
      derived = pathChanges(before, mapHashes());
      const unexpected = derived.filter(path => !manifest.documentation.maps_to_regenerate.includes(path));
      if (unexpected.length) steps.push({
        name: 'map scope',
        command: [],
        status: 1,
        exit_code: 1,
        signal: null,
        summary: `exit 1; generated out-of-scope maps: ${unexpected.join(', ')}`,
      });
    }
  }
  manifest.derived_paths = derived;
  const publishPaths = publishPathsFor(manifest.changed_paths, manifest.documented_paths, derived);
  if (manifest.documentation.source_changed || publishPaths.some(path => path.startsWith('docs/context/')))
    steps.push(runStep('game KB', ['scripts/validate-docs.mjs']));
  if (publishPaths.some(path => path.startsWith('site/')))
    steps.push(runStep('site KB', ['-e', "process.chdir('site'); require('node:child_process').execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'docs:check'], { stdio: 'inherit' })"]));
  if (publishPaths.some(agentConfigPath)) steps.push(runStep('agent config', ['scripts/validate-agent-config.mjs']));
  finishVerification(manifest, manifestFile, steps, publishPaths, closeInputFingerprint);
}

async function main() {
  const args = process.argv.slice(2);
  const action = args.shift();
  const values = parseArgs(args);
  if (action === 'prepare') {
    checkOptions(values, ['task', 'output', 'manifest', 'path', 'changed']);
    const manifestFile = safePath(one(values, 'output') || one(values, 'manifest') || DEFAULT_MANIFEST, '--output');
    if (existsSync(manifestFile)) fail(`manifest already exists: ${displayPath(manifestFile)}; start a new run with --output`, 1);
    const paths = normalizePaths([...many(values, 'path'), ...many(values, 'changed')]);
    const manifest = createManifest({ task: one(values, 'task', true), ownedPaths: paths });
    writeManifest(manifestFile, manifest);
    console.log(JSON.stringify(intakeForManifest(manifest, displayPath(manifestFile)), null, 2));
    return;
  }
  if (action === 'amend') {
    checkOptions(values, ['manifest', 'path']);
    const manifestFile = manifestPath(values);
    const manifest = amendManifest(upgradeManifest(readManifest(manifestFile)), normalizePaths(many(values, 'path')));
    writeManifest(manifestFile, manifest);
    console.log(JSON.stringify(intakeForManifest(manifest, displayPath(manifestFile)), null, 2));
    return;
  }
  if (action === 'review') {
    checkOptions(values, ['manifest', 'changed']);
    const manifestFile = manifestPath(values);
    let manifest = upgradeManifest(readManifest(manifestFile));
    const changed = normalizePaths(many(values, 'changed'));
    const sourceChanged = changed.some(sourcePath);
    const scope = sourceChanged ? runStep('documentation scope', ['scripts/docs-scope.mjs', ...changed]) : null;
    if (scope?.status !== 0) fail(`FAIL — ${scope.name}: ${scope.summary}`, 1);
    manifest = reviewManifest(manifest, { changedPaths: changed, scope, mapBaseline: mapHashes() });
    writeManifest(manifestFile, manifest);
    console.log(JSON.stringify(reviewForManifest(manifest, displayPath(manifestFile)), null, 2));
    return;
  }
  if (action === 'fallback') {
    checkOptions(values, ['manifest', 'query', 'classification', 'root', 'fixture']);
    const manifestFile = manifestPath(values);
    let manifest = upgradeManifest(readManifest(manifestFile));
    const searchedRoot = displayPath(safePath(one(values, 'root', true), '--root'));
    manifest = recordFallback(manifest, {
      query: one(values, 'query', true),
      classification: one(values, 'classification', true),
      searchedRoot,
      fixture: one(values, 'fixture', true),
    });
    writeManifest(manifestFile, manifest);
    console.log(`PASS — recorded ${manifest.retrieval.fallbacks.at(-1).classification} fallback`);
    return;
  }
  if (action === 'close') {
    checkOptions(values, ['manifest', 'decision', 'reason', 'doc-path']);
    const manifestFile = manifestPath(values);
    let manifest = upgradeManifest(readManifest(manifestFile));
    const documentedPaths = normalizeOptionalPaths(many(values, 'doc-path'), '--doc-path');
    const closeInput = {
      review: manifest.review?.input_fingerprint || null,
      decision: one(values, 'decision', true),
      reason: one(values, 'reason', true).trim(),
      documented_paths: documentedPaths,
    };
    const closeInputFingerprint = fingerprint(closeInput);
    if (manifest.phase === 'closed') {
      if (manifest.verification?.close_input_fingerprint === closeInputFingerprint) {
        console.log(`PASS — reused receipt: ${manifest.verification.receipt}`);
        return;
      }
      fail('close inputs changed after verification; rerun task-close review', 1);
    }
    manifest = applyDocumentationDecision(manifest, {
      decision: closeInput.decision,
      reason: closeInput.reason,
      documentedPaths,
    });
    writeManifest(manifestFile, manifest);
    verifyV2(manifest, manifestFile, closeInputFingerprint);
    return;
  }
  if (action === 'decide') {
    checkOptions(values, ['manifest', 'decision', 'reason', 'doc-path']);
    const manifestFile = manifestPath(values);
    const original = readManifest(manifestFile);
    if (original.schema_version !== 1) fail('schema-v2 manifests record the decision through task-close close', 1);
    const manifest = applyDocumentationDecision(original, {
      decision: one(values, 'decision', true),
      reason: one(values, 'reason', true),
      documentedPaths: normalizeOptionalPaths(many(values, 'doc-path'), '--doc-path'),
    });
    writeManifest(manifestFile, manifest);
    console.log(`PASS — documentation decision: ${manifest.documentation.decision}`);
    return;
  }
  if (action === 'verify') {
    checkOptions(values, ['manifest']);
    const manifestFile = manifestPath(values);
    const manifest = readManifest(manifestFile);
    if (manifest.schema_version !== 1) fail('schema-v2 manifests verify through task-close close', 1);
    verifyV1(manifest, manifestFile);
    return;
  }
  fail('usage: node scripts/task-close.mjs <prepare|amend|review|fallback|close|decide|verify> ...');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => fail(error.message));
