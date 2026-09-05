#!/usr/bin/env node
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConceptRegistry } from './lib/concept-kb.mjs';
import { buildConceptMaps } from './build-concept-map.mjs';
import { selectQa } from './qa-gate.mjs';
import { executeBestEffort } from './agent-observability.mjs';
import { buildTaskTelemetry } from './lib/agent-observability/task-telemetry.mjs';
import { candidateHandoffFields, flagEligibility, selectCandidateForHandoff } from './lib/agent-observability/flagging.mjs';
import { codexSessionIds } from './lib/agent-observability/runtime.mjs';
import { publicQaReceiptPath, writePublicQaReceipt } from './lib/qa-receipt.mjs';
import { taskIdentityForManifest } from './lib/task-identity.mjs';
import { finalizeOrchestrationScope } from './lib/orchestration-scope.mjs';
import {
  resolveTaskProcessControls,
  taskProcessControlsForManifest,
  validateTaskProcessControls,
} from './lib/task-process-controls.mjs';
import {
  createMaintenanceItem,
  failureClassificationFromOutput,
  isMaintenanceClassification,
  isMaintenancePath,
  resolveMaintenanceHandoff,
} from './lib/maintenance-handoff.mjs';
import {
  bindActiveTask,
  readTaskBundle,
  requestActiveTaskFinalization,
  resolveStateDir,
} from './lib/agent-observability/state.mjs';

const ROOT = resolve(process.env.TASK_CLOSE_ROOT || '.');
const CANONICAL_MANIFEST_DIRECTORY = '.agent-state/automation/task-close';
const SCHEMA_VERSION = 3;
const LEGACY_SCHEMA_VERSION = 2;
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

function displayPathFrom(root, path) {
  return relative(root, path).replaceAll('\\', '/');
}

function unboundPlan() {
  return {
    status: 'not-applicable',
    source_path: null,
    archive_path: null,
    diagnostic: null,
  };
}

export function planBindingFor(input, root = ROOT) {
  if (!input) return unboundPlan();
  const repositoryRoot = resolve(root);
  const planRoot = resolve(repositoryRoot, 'plan');
  const source = resolve(repositoryRoot, input);
  if (source === repositoryRoot || !source.startsWith(repositoryRoot + sep))
    throw new Error('--plan must stay inside the repository');
  if (!source.startsWith(planRoot + sep)) throw new Error('--plan must be an active Markdown file under plan/');
  const activeRelative = relative(planRoot, source);
  if (activeRelative.split(sep)[0] === 'done') throw new Error('--plan cannot already be under plan/done/');
  if (!source.endsWith('.md')) throw new Error('--plan must name a Markdown file');
  if (!existsSync(source) || !lstatSync(source).isFile()) throw new Error('--plan must name an existing active plan');
  const realPlanRoot = realpathSync(planRoot);
  const realSource = realpathSync(source);
  if (realSource === realPlanRoot || !realSource.startsWith(realPlanRoot + sep))
    throw new Error('--plan resolves outside plan/');
  const archive = resolve(planRoot, 'done', basename(source));
  if (existsSync(archive)) throw new Error(`plan archive destination already exists: ${displayPathFrom(repositoryRoot, archive)}`);
  return {
    status: 'pending',
    source_path: displayPathFrom(repositoryRoot, source),
    archive_path: displayPathFrom(repositoryRoot, archive),
    diagnostic: null,
  };
}

function bindPlan(manifest, binding) {
  const current = manifest.plan || unboundPlan();
  if (!binding || binding.status === 'not-applicable') return current;
  if (current.status !== 'not-applicable' && current.source_path !== binding.source_path)
    throw new Error(`manifest is already bound to plan ${current.source_path}`);
  return current.status === 'not-applicable' ? binding : current;
}

function parseArgs(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) fail(`unexpected argument: ${arg}`);
    const key = arg.slice(2);
    if (key === 'json') {
      if (values.has(key)) fail(`--${key} may be supplied once`);
      values.set(key, ['true']);
      continue;
    }
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
  return /^(src\/|scripts\/|infra\/|docker\/|\.github\/|site\/(?:src\/|worker\/|wrangler\.jsonc$)|site-root\/)/.test(path);
}

function testPath(path) {
  return /^(src\/Server\/tests\/|src\/Client\/.*\/Tests\/|scripts\/tests\/|site\/.*(?:test|spec)\.)/.test(path);
}

function qaToolingPath(path) {
  return /^(?:scripts\/(?:qa-gate|task-close)\.mjs|scripts\/lib\/.*(?:qa|test|fixture|harness)|\.github\/(?:workflows|actions)\/.*(?:qa|test|ci)|src\/Server\/tests\/(?:helpers|fixtures)\/)/i.test(path);
}

function domainFor(path) {
  if (path.startsWith('KB/')) return 'concept-kb';
  if (path.startsWith('src/Server/')) return 'server';
  if (path.startsWith('src/Client/')) return 'client';
  if (path.startsWith('site/')) return 'site';
  if (path.startsWith('scripts/')) return 'tooling';
  if (path.startsWith('.github/') || path.startsWith('infra/') || path.startsWith('docker/')) return 'infra';
  return 'repository';
}

export function deriveTaskComplexity(manifest) {
  const sourcePaths = manifest.owned_paths.filter(sourcePath);
  const sourceDomains = new Set(sourcePaths.map(domainFor));
  if (!sourcePaths.length) return {
    complexity: 'C1',
    reason: 'Documentation or repository metadata only.',
  };
  if (sourcePaths.length <= 3 && sourceDomains.size === 1) return {
    complexity: 'C2',
    reason: 'Scoped implementation in one source domain.',
  };
  if (sourcePaths.length <= 8 && sourceDomains.size <= 2) return {
    complexity: 'C3',
    reason: 'Multi-file implementation across at most two source domains.',
  };
  return {
    complexity: 'C4',
    reason: 'Broad implementation spanning many files or source domains.',
  };
}

function command(argv) {
  return {
    argv,
    display: argv.map(part => /^[a-z0-9_./,:-]+$/i.test(part) ? part : JSON.stringify(part)).join(' '),
  };
}

function authoredKbDocument(path) {
  return /^KB\/docs\/context\/(?!map\/)(?!index\.md$).+\.md$/.test(path) ? path : null;
}

function conceptOwnershipFor(paths, root) {
  const registry = loadConceptRegistry({ root });
  const documents = new Set();
  const maps = new Set();
  const gaps = [];
  for (const path of paths) {
    if (authoredKbDocument(path)) {
      for (const concept of registry.concepts.filter(item => item.owner.path === path))
        maps.add(`KB/docs/context/map/concept/${concept.domain}.md`);
    }
    const ids = registry.reverse_sources.get(path) || [];
    if (sourcePath(path) && !testPath(path) && !ids.length) gaps.push(path);
    for (const id of ids) {
      const concept = registry.by_id.get(id)?.[0];
      if (!concept) continue;
      documents.add(concept.owner.path);
      maps.add(`KB/docs/context/map/concept/${concept.domain}.md`);
    }
  }
  return {
    documents: [...documents].sort(),
    maps: [...maps].sort(),
    gaps: [...new Set(gaps)].sort(),
  };
}

export function taskCloseIntake(paths, options = {}) {
  if (!paths.length) throw new Error('task-close needs one or more explicit task-owned paths');
  const changed = [...new Set(paths.map(path => path.replace(/^\.\//, '')))].sort();
  const ownership = conceptOwnershipFor(changed, options.root || ROOT);
  const docs = [...new Set([
    ...changed.map(authoredKbDocument).filter(Boolean),
    ...ownership.documents,
  ])].sort();
  const qaEnabled = options.qa !== false;
  const qa = qaEnabled ? selectQa(changed) : {
    changed,
    server_sources: [],
    server_tests: [],
    full_server: false,
    client_runtime: false,
    client_tests: [],
    full_client: false,
    tooling_tests: [],
    contract_tests: [],
    concept_kb: false,
    runtime_applies: false,
    applies: false,
    skipped_by_process_control: true,
  };
  const tools = qaEnabled
    ? [{ name: 'QA', command: command(['node', 'scripts/qa-gate.mjs', '--changed', ...changed]) }]
    : [];
  if (changed.some(authoredKbDocument) || ownership.maps.length) {
    tools.push({ name: 'concept map', command: command(['node', 'scripts/build-concept-map.mjs', '--check', '--quiet']) });
    tools.push({ name: 'concept KB', command: command(['node', 'scripts/validate-concept-kb.mjs', '--quiet']) });
  }
  if (qaEnabled && qa.concept_kb) {
    tools.push({ name: 'concept benchmark', command: command(['node', 'scripts/benchmark-rag.mjs', '--concept-check']) });
  }
  const maxBytes = options.artifact ? 24 * 1024 : 8 * 1024;
  const result = {
    schema_version: 2,
    task_paths: changed,
    docs,
    maps: ownership.maps,
    qa,
    tools,
    unmapped: ownership.gaps,
    context_gaps: ownership.gaps,
    limits: { max_bytes: maxBytes, returned_bytes: 0 },
  };
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > maxBytes)
    throw new Error(`task-close intake exceeds ${maxBytes} bytes; split the explicit path set`);
  return result;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function fileHash(path) {
  return existsSync(path) ? createHash('sha256').update(readFileSync(path)).digest('hex') : null;
}

function mapHashes() {
  const root = resolve(ROOT, 'KB/docs/context/map/concept');
  if (!existsSync(root)) return {};
  return Object.fromEntries(readdirSync(root).filter(name => name.endsWith('.md')).sort().map(name => {
    const path = `KB/docs/context/map/concept/${name}`;
    return [path, fileHash(resolve(ROOT, path))];
  }));
}

function pathChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(path => before[path] !== after[path]).sort();
}

export function publishPathsFor(changedPaths, documentedPaths, derivedPaths) {
  return [...new Set([...changedPaths, ...documentedPaths, ...derivedPaths])]
    .filter(path => !isMaintenancePath(path))
    .filter(path => !/^\.agent-state(?:\/|$)/.test(path))
    .filter(path => !/^plan(?:\/|$)/.test(path))
    .sort();
}

function documentationFor(scope, sourceChanged = false) {
  return {
    source_changed: sourceChanged,
    candidate_docs: scope.docs,
    maps_to_regenerate: scope.maps,
    status: sourceChanged ? 'pending' : 'not-applicable',
    reason: sourceChanged ? null : 'No source path is in the reviewed change set.',
    documented_paths: [],
  };
}

function coverageFor(sourceChanged = false, enabled = true) {
  return {
    source_changed: sourceChanged,
    status: enabled ? (sourceChanged ? 'pending' : 'none') : 'disabled',
    protected_contract: null,
  };
}

function qaToolingFor(plannedPaths = [], changedPaths = []) {
  const changed = changedPaths.filter(qaToolingPath);
  const unplanned = changed.filter(path => !plannedPaths.includes(path));
  return {
    planned_paths: [...new Set(plannedPaths)].sort(),
    changed_paths: changed,
    unplanned_paths: unplanned,
    status: !changed.length ? 'unchanged' : unplanned.length ? 'unplanned-change' : 'planned-change',
  };
}

export function createManifest({
  task,
  ownedPaths = null,
  changedPaths = null,
  plannedQaToolingPaths = [],
  runId = null,
  planPath = null,
  processControls = resolveTaskProcessControls(),
  root = ROOT,
}) {
  if (!task || task.length > 120) throw new Error('task must be present and at most 120 characters');
  const process = validateTaskProcessControls(processControls);
  const owned = [...new Set(ownedPaths || changedPaths || [])].sort();
  if (!owned.length) throw new Error('one or more owned paths are required');
  const intake = taskCloseIntake(owned, { artifact: true, qa: process.qa, root });
  const hasSource = owned.some(sourcePath);
  const plannedQaTooling = [...new Set(plannedQaToolingPaths)].sort();
  const unownedQaTooling = plannedQaTooling.filter(path => !owned.includes(path));
  if (unownedQaTooling.length) throw new Error(`planned QA-tooling paths must be owned: ${unownedQaTooling.join(', ')}`);
  return {
    schema_version: SCHEMA_VERSION,
    phase: 'prepared',
    lifecycle: { status: 'open' },
    process,
    plan: planBindingFor(planPath, root),
    task,
    run_id: runId || randomUUID(),
    owned_paths: owned,
    changed_paths: [],
    derived_paths: [],
    documented_paths: [],
    publish_paths: [],
    task_identity: null,
    domains: [...new Set(owned.map(domainFor))].sort(),
    intake,
    retrieval: { fallbacks: [] },
    documentation: documentationFor(intake, hasSource),
    coverage: coverageFor(hasSource, process.qa_coverage),
    qa: {
      ...qaToolingFor(plannedQaTooling),
      temporary_verification: 'not-used',
      execution: process.qa ? 'pending' : 'skipped-by-process-control',
    },
    review: null,
    verification: null,
    observability: { status: 'not_started', task_id: null, session_bindings: 0 },
  };
}

export function startObservability(manifest, env = process.env) {
  if (!taskProcessControlsForManifest(manifest).telemetry) {
    return {
      status: 'disabled',
      task_id: null,
      session_bindings: 0,
      reasons: ['disabled_by_process_control'],
    };
  }
  try {
    const stateDir = resolveStateDir({ root: ROOT, env });
    const complexity = deriveTaskComplexity(manifest);
    const result = executeBestEffort('start', {
      task_id: manifest.run_id,
      label: manifest.task,
      task_type: 'repository_task',
      complexity: complexity.complexity,
      complexity_reason: complexity.reason,
      domains: manifest.domains.map(domain => domain.replaceAll('-', '_')),
    }, { root: ROOT, stateDir });
    if (!['written', 'duplicate'].includes(result.status))
      return { status: 'partial', task_id: manifest.run_id, session_bindings: 0, reasons: [result.reason || 'telemetry_start_failed'] };
    let bindings = 0;
    for (const sessionId of codexSessionIds(env)) {
      bindActiveTask(stateDir, sessionId, manifest.run_id);
      bindings++;
    }
    return {
      status: bindings ? 'active' : 'partial',
      task_id: manifest.run_id,
      session_bindings: bindings,
      reasons: bindings ? [] : ['codex_session_id_unavailable'],
    };
  } catch {
    return { status: 'partial', task_id: manifest.run_id, session_bindings: 0, reasons: ['telemetry_start_failed'] };
  }
}

export function closeObservabilityUnsafe(manifest, receipt, env = process.env) {
  const processControls = taskProcessControlsForManifest(manifest);
  if (!processControls.telemetry) {
    return {
      status: 'disabled',
      task_id: null,
      session_bindings: 0,
      reasons: ['disabled_by_process_control'],
    };
  }
  const taskId = manifest.observability?.task_id || manifest.run_id;
  const stateDir = resolveStateDir({ root: ROOT, env });
  let bundle;
  try {
    bundle = readTaskBundle(stateDir, taskId);
  } catch {
    const result = {
      status: 'partial',
      task_id: taskId,
      reasons: ['telemetry_task_unavailable'],
    };
    if (processControls.workflow_inefficiency_flagging) result.formal_flag_gate = {
      eligible: false,
      candidate_id: null,
      stage: null,
      issue_code: null,
      cause_code: null,
      severity: null,
      same_required_turn: false,
    };
    return result;
  }
  const evidenceIds = bundle.evidence.slice(-5).map(item => item.evidence_event_id);
  const telemetry = buildTaskTelemetry(manifest, receipt, bundle.evidence, {
    domainFor,
    receiptHash: fingerprint(receipt).slice(0, 32),
  });
  executeBestEffort('close', {
    task_id: taskId,
    outcome: receipt.status === 'failed' ? 'failed' : 'completed',
    verification: receipt.status,
    telemetry,
  }, { root: ROOT, stateDir });
  if (!processControls.workflow_inefficiency_flagging) {
    let bindings = 0;
    for (const sessionId of codexSessionIds(env))
      if (requestActiveTaskFinalization(stateDir, sessionId, taskId)) bindings++;
    return {
      status: bindings ? 'pending_stop' : 'partial',
      task_id: taskId,
      session_bindings: bindings,
      workflow_inefficiency_flagging: 'disabled',
      reasons: bindings ? [] : ['codex_stop_hook_unavailable'],
    };
  }
  executeBestEffort('candidate', {
    task_id: taskId,
    telemetry,
    evidence_event_ids: evidenceIds,
  }, { root: ROOT, stateDir });
  const refreshed = readTaskBundle(stateDir, taskId);
  const candidateRecord = selectCandidateForHandoff(refreshed.flags);
  const candidate = candidateRecord ? {
    ...candidateHandoffFields(candidateRecord),
    evidence_event_ids: candidateRecord.evidence_event_ids,
  } : null;
  let bindings = 0;
  for (const sessionId of codexSessionIds(env))
    if (requestActiveTaskFinalization(stateDir, sessionId, taskId)) bindings++;
  const runtime = [...refreshed.evidence].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0] || null;
  const eligibility = flagEligibility({
    model_family: runtime?.model_family,
    effort: runtime?.effort,
    provider_turn_required: Boolean(runtime?.provider_turn_required),
    candidate: Boolean(candidate?.evidence_event_ids.length),
  });
  return {
    status: bindings ? 'pending_stop' : 'partial',
    task_id: taskId,
    session_bindings: bindings,
    formal_flag_gate: {
      eligible: eligibility.eligible,
      candidate_id: candidate?.candidate_id || null,
      stage: candidate?.stage || null,
      issue_code: candidate?.issue_code || null,
      cause_code: candidate?.cause_code || null,
      severity: candidate?.severity || null,
      same_required_turn: Boolean(runtime?.provider_turn_required),
    },
    reasons: bindings ? [] : ['codex_stop_hook_unavailable'],
  };
}

function closeObservability(manifest, receipt, env = process.env) {
  try {
    return closeObservabilityUnsafe(manifest, receipt, env);
  } catch {
    const processControls = taskProcessControlsForManifest(manifest);
    const result = {
      status: 'partial',
      task_id: manifest.observability?.task_id || manifest.run_id,
      session_bindings: 0,
      reasons: ['telemetry_close_failed'],
    };
    if (processControls.workflow_inefficiency_flagging) result.formal_flag_gate = {
      eligible: false,
      candidate_id: null,
      stage: null,
      issue_code: null,
      cause_code: null,
      severity: null,
      same_required_turn: false,
    };
    return result;
  }
}

function upgradeManifest(manifest) {
  if (![LEGACY_SCHEMA_VERSION, SCHEMA_VERSION].includes(manifest.schema_version))
    throw new Error(`unsupported manifest schema: ${manifest.schema_version}`);
  const process = taskProcessControlsForManifest(manifest);
  return {
    ...manifest,
    ...(manifest.schema_version === SCHEMA_VERSION ? { process } : {}),
    lifecycle: manifest.lifecycle || { status: manifest.phase === 'closed' ? 'closed' : 'open' },
    plan: manifest.plan || unboundPlan(),
  };
}

function supportsTaskClose(manifest) {
  return [LEGACY_SCHEMA_VERSION, SCHEMA_VERSION].includes(manifest.schema_version);
}

function manifestCompatibility(manifest) {
  return manifest.schema_version === LEGACY_SCHEMA_VERSION ? 'accepted-legacy-v2' : 'explicit-process-controls';
}

export function amendManifest(manifest, paths, plannedQaToolingPaths = [], planBinding = null) {
  if (!supportsTaskClose(manifest)) throw new Error('amend requires a schema-v2 or schema-v3 manifest');
  const process = taskProcessControlsForManifest(manifest);
  if (['closed', 'verified', 'closure-blocked'].includes(manifest.phase))
    throw new Error('a verified or closed manifest cannot be amended; start a new task');
  const additions = [...new Set(paths)].filter(path => !manifest.owned_paths.includes(path)).sort();
  const planned = [...new Set([...(manifest.qa?.planned_paths || []), ...plannedQaToolingPaths])].sort();
  const unownedQaTooling = planned.filter(path => ![...manifest.owned_paths, ...additions].includes(path));
  if (unownedQaTooling.length) throw new Error(`planned QA-tooling paths must be owned: ${unownedQaTooling.join(', ')}`);
  const plan = bindPlan(manifest, planBinding);
  const planChanged = plan !== manifest.plan;
  if (!additions.length && planned.length === (manifest.qa?.planned_paths || []).length && !planChanged) return manifest;
  const sourceAdded = additions.some(sourcePath);
  const owned = [...new Set([...manifest.owned_paths, ...additions])].sort();
  const intake = taskCloseIntake(owned, { artifact: true, qa: process.qa });
  const resetReview = sourceAdded && ['reviewed', 'failed'].includes(manifest.phase);
  return {
    ...manifest,
    phase: resetReview ? 'prepared' : manifest.phase,
    lifecycle: { status: 'open' },
    plan,
    owned_paths: owned,
    domains: [...new Set(owned.map(domainFor))].sort(),
    intake,
    changed_paths: resetReview ? [] : manifest.changed_paths,
    derived_paths: [],
    documented_paths: resetReview ? [] : manifest.documented_paths,
    publish_paths: [],
    documentation: resetReview ? documentationFor(intake, owned.some(sourcePath)) : manifest.documentation,
    coverage: resetReview ? coverageFor(owned.some(sourcePath), process.qa_coverage) : manifest.coverage,
    qa: {
      ...(resetReview ? {
        ...qaToolingFor(planned),
        temporary_verification: 'not-used',
        execution: process.qa ? 'pending' : 'skipped-by-process-control',
      } : manifest.qa),
      ...qaToolingFor(planned, resetReview ? [] : manifest.changed_paths),
    },
    review: resetReview ? null : manifest.review,
    verification: null,
  };
}

export function reviewManifest(manifest, { changedPaths, mapBaseline = null }) {
  if (!supportsTaskClose(manifest)) throw new Error('review requires a schema-v2 or schema-v3 manifest');
  const process = taskProcessControlsForManifest(manifest);
  const requested = [...new Set(changedPaths)].sort();
  if (!requested.length) throw new Error('review needs one or more explicit changed paths');
  const owned = new Set(manifest.owned_paths);
  const ownedChanged = requested.filter(path => owned.has(path));
  const affectedMaps = new Set(conceptOwnershipFor(ownedChanged.filter(path => sourcePath(path) || authoredKbDocument(path)), ROOT).maps);
  const changed = requested.filter(path => !affectedMaps.has(path));
  const requestedDerived = requested.filter(path => affectedMaps.has(path));
  const outside = changed.filter(path => !owned.has(path));
  if (outside.length) throw new Error(`changed paths are not owned: ${outside.join(', ')}`);
  if (affectedMaps.size) {
    const generated = buildConceptMaps({ root: ROOT, mapPaths: [...affectedMaps] });
    if (generated.status === 'failed') throw new Error('cannot regenerate affected generated maps');
  }
  const changedGeneratedMaps = changedMapCandidates([...affectedMaps]);
  const derived = [...new Set([...requestedDerived, ...changedGeneratedMaps])].sort();
  const intake = taskCloseIntake(changed, { artifact: true, qa: process.qa });
  const sourceChanged = changed.some(sourcePath);
  const sourceScope = sourceChanged
    ? taskCloseIntake(changed.filter(sourcePath), { artifact: true, qa: process.qa })
    : intake;
  const documentationScope = {
    ...sourceScope,
    docs: [...new Set([...sourceScope.docs, ...intake.docs])].sort(),
  };
  const reviewInput = {
    changed_paths: changed,
    docs: documentationScope.docs,
    maps: documentationScope.maps,
    context_gaps: documentationScope.context_gaps,
    qa: intake.qa,
    derived_paths: derived,
  };
  const mapHashesAtReview = { ...(mapBaseline || mapHashes()), ...(manifest.review?.map_hashes || {}) };
  return {
    ...manifest,
    phase: 'reviewed',
    changed_paths: changed,
    derived_paths: derived,
    documented_paths: [],
    publish_paths: publishPathsFor(changed, [], derived),
    documentation: documentationFor(documentationScope, sourceChanged),
    coverage: coverageFor(sourceChanged, process.qa_coverage),
    qa: {
      ...qaToolingFor(manifest.qa?.planned_paths || [], changed),
      temporary_verification: 'not-used',
      execution: process.qa ? 'pending' : 'skipped-by-process-control',
    },
    review: { input_fingerprint: fingerprint(reviewInput), reviewed_at: new Date().toISOString(), intake, map_hashes: mapHashesAtReview },
    verification: null,
  };
}

function changedMapCandidates(candidates) {
  if (!candidates.length) return [];
  const result = spawnSync('git', ['diff', '--name-only', '--', ...candidates], { cwd: ROOT, encoding: 'utf8' });
  if (result.error || result.status !== 0)
    throw new Error(`cannot determine affected generated-map changes: ${result.error?.message || result.stderr?.trim() || 'git diff failed'}`);
  const allowed = new Set(candidates);
  return result.stdout.split(/\r?\n/).filter(path => allowed.has(path)).sort();
}

function decisionValues({ decision, reason, documentedPaths = [] }) {
  if (!['updated', 'not-needed'].includes(decision)) throw new Error('decision must be updated or not-needed');
  if (!reason?.trim()) throw new Error('a documentation decision needs a plain-English reason');
  if (reason.trim().length > 240) throw new Error('documentation reason must be at most 240 characters');
  if (decision === 'updated' && !documentedPaths.length) throw new Error('updated requires one or more --doc-path values');
  if (decision === 'not-needed' && documentedPaths.length) throw new Error('not-needed does not accept --doc-path values');
  if (documentedPaths.some(path => !/^((KB\/docs\/context|site\/docs)\/).+\.md$/.test(path)))
    throw new Error('every --doc-path must be a Markdown document in KB/docs/context or site/docs');
  return { decision, reason: reason.trim(), documentedPaths: [...new Set(documentedPaths)].sort() };
}

export function applyDocumentationDecision(manifest, input) {
  const values = decisionValues(input);
  if (!['reviewed', 'failed'].includes(manifest.phase)) throw new Error('close requires a reviewed manifest');
  const unowned = values.documentedPaths.filter(path => !manifest.owned_paths.includes(path));
  if (unowned.length) throw new Error(`documented paths must be owned before editing: ${unowned.join(', ')}`);
  if (values.decision === 'updated') {
    const unrelated = values.documentedPaths.filter(path => !manifest.documentation.candidate_docs.includes(path));
    if (unrelated.length) throw new Error(`documented paths are outside the reviewed documentation scope: ${unrelated.join(', ')}`);
    const unchanged = values.documentedPaths.filter(path => !manifest.changed_paths.includes(path));
    if (unchanged.length) throw new Error(`documented paths must be present in the reviewed change set: ${unchanged.join(', ')}`);
  }
  return {
    ...manifest,
    documentation: {
      ...manifest.documentation,
      status: values.decision,
      reason: values.reason,
      documented_paths: values.documentedPaths,
    },
    documented_paths: values.documentedPaths,
    publish_paths: publishPathsFor(manifest.changed_paths, values.documentedPaths, manifest.derived_paths || []),
    verification: null,
  };
}

export function applyCoverageDecision(manifest, { status, protectedContract = null }) {
  if (!['reused', 'added', 'updated', 'none'].includes(status)) throw new Error('permanent coverage must be reused, added, updated, or none');
  if (!['reviewed', 'failed'].includes(manifest.phase)) throw new Error('close requires a reviewed manifest');
  const process = taskProcessControlsForManifest(manifest);
  if (!process.qa_coverage && status === 'none' && !protectedContract) {
    return {
      ...manifest,
      coverage: { ...(manifest.coverage || {}), status: 'disabled', protected_contract: null },
      verification: null,
    };
  }
  if (['added', 'updated'].includes(status) && !manifest.changed_paths.some(testPath))
    throw new Error(`${status} permanent coverage requires an explicit changed test path`);
  if (['added', 'updated'].includes(status) && !protectedContract?.trim())
    throw new Error(`${status} permanent coverage requires a protected contract`);
  if (protectedContract && protectedContract.trim().length > 240)
    throw new Error('protected contract must be at most 240 characters');
  return {
    ...manifest,
    coverage: {
      ...(manifest.coverage || coverageFor(true)),
      status,
      protected_contract: protectedContract?.trim() || null,
    },
    verification: null,
  };
}

export function recordFallback(manifest, { query, classification, searchedRoot, fixture }) {
  if (!supportsTaskClose(manifest)) throw new Error('fallback recording requires a schema-v2 or schema-v3 manifest');
  if (!['retrieval-defect', 'tool-error'].includes(classification)) throw new Error('classification must be retrieval-defect or tool-error');
  if (!query?.trim() || !searchedRoot) throw new Error('fallback needs a query and searched root');
  const repairFixture = fixture?.trim() || null;
  const entry = {
    query: query.trim(),
    classification,
    searched_root: searchedRoot,
    disposition: repairFixture ? 'task-owned-repair' : 'deferred-repair',
    repair_fixture: repairFixture,
  };
  return {
    ...manifest,
    retrieval: { fallbacks: [...manifest.retrieval.fallbacks.filter(item => fingerprint(item) !== fingerprint(entry)), entry] },
    verification: null,
  };
}

export function fallbackRequiresRetrievalProof(manifest) {
  return manifest.retrieval.fallbacks.some(item => Boolean(item.repair_fixture));
}

export function intakeForManifest(manifest, manifestFile) {
  const process = taskProcessControlsForManifest(manifest);
  const result = {
    schema_version: manifest.schema_version,
    compatibility: manifestCompatibility(manifest),
    manifest: manifestFile,
    phase: manifest.phase,
    lifecycle: manifest.lifecycle,
    process,
    plan: manifest.plan,
    owned_paths: manifest.owned_paths,
    docs: manifest.intake.docs,
    maps: manifest.intake.maps,
    context_gaps: manifest.intake.context_gaps,
    qa: {
      enabled: process.qa,
      applies: manifest.intake.qa.applies,
      server_tests: manifest.intake.qa.server_tests,
      client_tests: manifest.intake.qa.client_tests,
    },
    tools: manifest.intake.tools.map(tool => ({ name: tool.name, command: tool.command.display })),
    observability: manifest.observability,
    next: command(['node', 'scripts/task-close.mjs', 'review', '--manifest', manifestFile, '--changed', '<final-path>']).display,
  };
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > INTAKE_MAX_BYTES) throw new Error('task intake exceeds 8192 bytes; split the manifest');
  return result;
}

export function reviewForManifest(manifest, manifestFile) {
  const process = taskProcessControlsForManifest(manifest);
  const intake = manifest.review.intake;
  const closeArgs = ['node', 'scripts/task-close.mjs', 'close', '--manifest', manifestFile];
  if (manifest.documentation.source_changed) closeArgs.push(
    '--decision', '<updated|not-needed>',
    '--reason', '<doc-worthy gate reason>',
    '--doc-path', '<path when updated>',
  );
  if (process.qa_coverage) closeArgs.push('--coverage', '<reused|added|updated|none>', '--coverage-contract', '<contract when added or updated>');
  const result = {
    schema_version: manifest.schema_version,
    compatibility: manifestCompatibility(manifest),
    manifest: manifestFile,
    phase: manifest.phase,
    lifecycle: manifest.lifecycle,
    process,
    plan: manifest.plan,
    changed_paths: manifest.changed_paths,
    derived_paths: manifest.derived_paths || [],
    docs: manifest.documentation.candidate_docs,
    maps: manifest.documentation.maps_to_regenerate,
    context_gaps: intake.context_gaps,
    documentation_status: manifest.documentation.status,
    qa: {
      enabled: process.qa,
      applies: intake.qa.applies,
      server_tests: intake.qa.server_tests,
      client_tests: intake.qa.client_tests,
    },
    qa_tooling: manifest.qa,
    observability: manifest.observability,
    next: command(closeArgs).display,
  };
  if (Buffer.byteLength(JSON.stringify(result, null, 2)) + 1 > INTAKE_MAX_BYTES) throw new Error('task review exceeds 8192 bytes; read the manifest artifact for full documentation scope');
  return result;
}

function qaSummary(qa, process) {
  if (!process.qa) return 'disabled';
  return qa?.applies ? 'required' : 'not-applicable';
}

function compactLifecycleOutput(action, manifest, manifestFile) {
  const process = taskProcessControlsForManifest(manifest);
  const output = action === 'review'
    ? `PASS — task reviewed; manifest: ${manifestFile}; changed: ${manifest.changed_paths.length}; docs: ${manifest.documentation.status}; QA: ${qaSummary(manifest.review.intake.qa, process)}; process: ${manifestCompatibility(manifest) === 'accepted-legacy-v2' ? 'legacy' : process.profile}; next: close`
    : `PASS — task ${action}; manifest: ${manifestFile}; owned: ${manifest.owned_paths.length}; docs: ${manifest.intake.docs.length}; QA: ${qaSummary(manifest.intake.qa, process)}; process: ${manifestCompatibility(manifest) === 'accepted-legacy-v2' ? 'legacy' : process.profile}; next: review`;
  if (Buffer.byteLength(output) > 1024) throw new Error(`task ${action} output exceeds 1024 bytes`);
  return output;
}

function compactFlagGate(manifest) {
  const gate = manifest.observability?.formal_flag_gate;
  if (!gate?.eligible) return 'none';
  return ['candidate_id', 'stage', 'issue_code', 'cause_code', 'severity']
    .filter(key => gate[key])
    .map(key => `${key}: ${gate[key]}`)
    .join(', ');
}

function terminalOutput(verification, receipt, manifest, privateReceiptPath) {
  const label = receipt.status === 'passed' ? 'PASS' : 'MAINTENANCE-BLOCKED';
  const publicEvidence = receipt.public_receipt ? `; public receipt: ${receipt.public_receipt}` : '';
  const handoff = receipt.maintenance?.handoff ? `; maintenance handoff: ${receipt.maintenance.handoff}` : '';
  return `${label} — ${verification}; receipt: ${displayPath(privateReceiptPath)}${publicEvidence}${handoff}; flag: ${compactFlagGate(manifest)}`;
}

function compactStatus(manifest) {
  const process = taskProcessControlsForManifest(manifest);
  const profile = manifestCompatibility(manifest) === 'accepted-legacy-v2' ? 'legacy' : process.profile;
  return `STATUS — phase: ${manifest.phase}; lifecycle: ${manifest.lifecycle?.status || 'none'}; process: ${profile}; verification: ${manifest.verification?.status || 'none'}; receipt: ${manifest.verification?.receipt || 'none'}; public receipt: ${manifest.verification?.public_receipt || 'none'}; flag: ${compactFlagGate(manifest)}`;
}

function manifestPath(values) {
  return safePath(one(values, 'manifest', true), '--manifest');
}

function preparedManifestPath(values, runId) {
  const output = one(values, 'output');
  const manifest = one(values, 'manifest');
  if (output && manifest) fail('prepare accepts only one of --output or --manifest');
  const selected = output || manifest || `${CANONICAL_MANIFEST_DIRECTORY}/${runId}.json`;
  const path = safePath(selected, '--output');
  const canonicalRoot = resolve(ROOT, CANONICAL_MANIFEST_DIRECTORY);
  if (!path.startsWith(canonicalRoot + sep))
    fail(`new manifests must be under ${CANONICAL_MANIFEST_DIRECTORY}/`);
  if (!path.endsWith('.json') || path.endsWith('.receipt.json'))
    fail('new manifests must use a .json filename other than .receipt.json');
  return path;
}

function writeManifest(path, manifest, { exclusive = false } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, { flag: exclusive ? 'wx' : 'w' });
}

function readManifest(path) {
  if (!existsSync(path)) fail(`manifest not found: ${displayPath(path)}`, 1);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    fail(`manifest is not valid JSON: ${displayPath(path)}`, 1);
  }
  if (![LEGACY_SCHEMA_VERSION, SCHEMA_VERSION].includes(manifest.schema_version))
    fail(`unsupported manifest schema: ${manifest.schema_version}`, 1);
  const privateStateRoot = resolve(ROOT, '.agent-state');
  if (!path.startsWith(privateStateRoot + sep))
    fail('task-close manifests must stay under .agent-state/', 1);
  try {
    taskProcessControlsForManifest(manifest);
  } catch (error) {
    fail(error.message, 1);
  }
  return manifest;
}

function receiptPath(path) {
  return path.replace(/\.json$/, '.receipt.json');
}

function diagnosticLine(output) {
  const lines = output.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const actionable = lines.find(line => /^ACTIONABLE_BLOCKER:/i.test(line));
  if (actionable) {
    const classification = lines.find(line => /^FAILURE_CLASSIFICATION:/i.test(line));
    return classification ? `${actionable}; ${classification}` : actionable;
  }
  const marker = lines.find(line => /\bnot ok\b|\bFAIL(?:URE)?\b|\[Failed\]:|(?:Error|Exception):/i.test(line));
  if (marker) return marker;
  return lines.find(line => /(?:^|\s)(?:at\s+)?[^\s()]+:\d+(?::\d+)?(?:\s|$)/.test(line)) || lines.at(-1) || '';
}

export function compactOutput(output, { status = null, signal = null } = {}) {
  const prefix = signal ? `signal ${signal}` : `exit ${status ?? 'unknown'}`;
  const line = status === 0 && !signal ? output.split(/\r?\n/).map(value => value.trim()).find(value => /^PASS — \S/.test(value)) || '' : diagnosticLine(output);
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
    classification: status === 0 ? null : failureClassificationFromOutput(output),
    output: output.trim() || undefined,
  };
}

export function validateDocumentationDecision(manifest) {
  if (!manifest.documentation.source_changed) return;
  if (!['updated', 'not-needed'].includes(manifest.documentation.status))
    throw new Error('documentation status is pending; pass updated or not-needed to task-close close');
  if (!manifest.documentation.reason)
    throw new Error('documentation decision needs a plain-English reason');
}

function requireDocumentationDecision(manifest) {
  try {
    validateDocumentationDecision(manifest);
  } catch (error) {
    fail(error.message, 1);
  }
}

function requireCoverageDecision(manifest) {
  if (!manifest.coverage?.source_changed) return;
  if (manifest.coverage.status === 'pending') fail('permanent-coverage status is pending; pass it to task-close close', 1);
  if (['added', 'updated'].includes(manifest.coverage.status) && !manifest.coverage.protected_contract)
    fail('added or updated permanent coverage needs a protected contract', 1);
}

function qaToolingMaintenanceItems(manifest) {
  if (manifest.qa?.status !== 'unplanned-change') return [];
  return [createMaintenanceItem({
    state: 'advisory',
    classification: 'qa-infrastructure',
    stage: 'unplanned QA-infrastructure scope expansion',
    affected: manifest.qa.unplanned_paths.join(', '),
    diagnostic: 'QA infrastructure changed without a matching --qa-tooling-path at task intake.',
    verificationImpact: 'Advisory only; verification remains valid.',
    completed: 'The implementation stayed verified, but the QA infrastructure expansion needs planner review.',
    recommendedFollowUp: 'Have the planning session approve the infrastructure scope or move the change into a QA/tooling task.',
  })];
}

export function retrievalFallbackMaintenanceItems(manifest) {
  const deferred = manifest.retrieval.fallbacks.filter(item => !item.repair_fixture);
  if (!deferred.length) return [];
  const affected = [...new Set(deferred.map(item => item.searched_root))].sort().join(', ');
  const diagnostics = deferred.map(item => `${item.classification}: ${item.query}`).join('; ');
  return [createMaintenanceItem({
    state: 'advisory',
    classification: 'retrieval-map-maintenance',
    stage: 'ordinary product-task retrieval fallback',
    affected,
    diagnostic: diagnostics,
    verificationImpact: 'Advisory only; the bounded role-owned source fallback allowed implementation to continue.',
    completed: 'The approved task completed without changing retrieval infrastructure.',
    recommendedFollowUp: 'Repair the router, map, or retrieval tool in a dedicated maintenance task with focused fixture and benchmark proof.',
  })];
}

function executionStatus(steps, name) {
  const selected = steps.filter(step => step.name === name);
  if (!selected.length) return 'not-applicable';
  if (selected.every(step => step.status === 0)) return 'passed';
  return selected.every(step => step.status !== 0 && isMaintenanceClassification(step.classification))
    ? 'maintenance-blocked'
    : 'failed';
}

function recordedPlanPaths(plan, root = ROOT) {
  const repositoryRoot = resolve(root);
  const source = resolve(repositoryRoot, plan.source_path || '');
  const archive = resolve(repositoryRoot, plan.archive_path || '');
  const planRoot = resolve(repositoryRoot, 'plan');
  const expectedArchive = resolve(planRoot, 'done', basename(source));
  if (!plan.source_path || !source.startsWith(planRoot + sep) || source.startsWith(resolve(planRoot, 'done') + sep))
    throw new Error('recorded plan source is unsafe');
  if (archive !== expectedArchive) throw new Error('recorded plan archive destination is unsafe');
  return { source, archive };
}

export function archivePlan(plan, root = ROOT) {
  if (!plan || plan.status === 'not-applicable') return unboundPlan();
  try {
    const { source, archive } = recordedPlanPaths(plan, root);
    const sourceExists = existsSync(source);
    const archiveExists = existsSync(archive);
    if (sourceExists && archiveExists) throw new Error('active plan and archive destination both exist; refusing to overwrite');
    if (!sourceExists && archiveExists) return { ...plan, status: 'archived', diagnostic: null };
    if (!sourceExists) throw new Error('active plan is absent and no completed archive exists');
    mkdirSync(dirname(archive), { recursive: true });
    renameSync(source, archive);
    return { ...plan, status: 'archived', diagnostic: null };
  } catch (error) {
    return { ...plan, status: 'failed', diagnostic: error.message };
  }
}

export function retainPlan(plan, root = ROOT) {
  if (!plan || plan.status === 'not-applicable') return unboundPlan();
  try {
    const { source, archive } = recordedPlanPaths(plan, root);
    if (!existsSync(source)) throw new Error('active plan is absent while archival is disabled');
    if (existsSync(archive)) throw new Error('archive destination exists while archival is disabled');
    return { ...plan, status: 'retained', diagnostic: 'skipped-by-process-control' };
  } catch (error) {
    return { ...plan, status: 'failed', diagnostic: error.message };
  }
}

function persistVerifiedClosure(manifest, manifestFile, receipt, verifiedPublishPaths) {
  try {
    finalizeOrchestrationScope({ parent: manifestFile, root: ROOT });
  } catch (error) {
    // A claim may have arrived during QA. Its later release cannot make that proof reusable.
    manifest.lifecycle = { status: 'open' };
    manifest.phase = 'reviewed';
    manifest.verification = null;
    manifest.publish_paths = [];
    receipt.lifecycle = { status: 'open' };
    receipt.public_receipt = null;
    writeFileSync(receiptPath(manifestFile), `${JSON.stringify(receipt, null, 2)}\n`);
    writeManifest(manifestFile, manifest);
    throw error;
  }
  const process = taskProcessControlsForManifest(manifest);
  const plan = process.plan_archival ? archivePlan(manifest.plan) : retainPlan(manifest.plan);
  const closed = ['archived', 'retained', 'not-applicable'].includes(plan.status);
  const lifecycle = { status: closed ? 'closed' : 'blocked' };
  const publishPaths = closed
    ? publishPathsFor([...verifiedPublishPaths, receipt.public_receipt], [], [])
    : [];
  receipt.plan = plan;
  receipt.lifecycle = lifecycle;
  receipt.verified_publish_paths = verifiedPublishPaths;
  receipt.publish_paths = publishPaths;
  manifest.plan = plan;
  manifest.lifecycle = lifecycle;
  manifest.publish_paths = publishPaths;
  manifest.phase = closed ? 'closed' : 'closure-blocked';
  if (receipt.public_receipt) writePublicQaReceipt(ROOT, {
    identity: manifest.task_identity,
    task: manifest.task,
    verificationStatus: receipt.status,
    lifecycle,
    plan,
    changedPaths: manifest.changed_paths,
    publishPaths,
    steps: receipt.steps,
    coverage: manifest.coverage,
    qa: { ...manifest.qa, executable_status: receipt.qa.executed },
    maintenanceItems: receipt.maintenance.items,
  });
  if (closed) manifest.observability = closeObservability(manifest, receipt);
  writeFileSync(receiptPath(manifestFile), `${JSON.stringify(receipt, null, 2)}\n`);
  writeManifest(manifestFile, manifest);
  return closed;
}

function retryVerifiedClosure(manifest, manifestFile, closeInputFingerprint) {
  const privateReceiptPath = receiptPath(manifestFile);
  if (!existsSync(privateReceiptPath)) fail('verified closure receipt is missing; verification must be rerun', 1);
  const receipt = JSON.parse(readFileSync(privateReceiptPath, 'utf8'));
  if (!['passed', 'maintenance-blocked'].includes(receipt.status))
    fail('verified closure receipt does not contain reusable verification proof', 1);
  if (receipt.input_fingerprint !== closeInputFingerprint)
    fail('close inputs changed after verification; rerun task-close review', 1);
  const verifiedPublishPaths = receipt.verified_publish_paths || publishPathsFor(manifest.changed_paths, manifest.documented_paths, manifest.derived_paths || []);
  const closed = persistVerifiedClosure(manifest, manifestFile, receipt, verifiedPublishPaths);
  if (!closed) fail(`CLOSURE-BLOCKED — plan archive failed: ${manifest.plan?.diagnostic || receipt.plan?.diagnostic}; receipt: ${displayPath(privateReceiptPath)}`, 1);
  console.log(terminalOutput('verification reused', receipt, manifest, privateReceiptPath));
}

function requireFallbackFixtures(manifest) {
  const fixtureBacked = manifest.retrieval.fallbacks.filter(item => item.repair_fixture);
  if (!fixtureBacked.length) return;
  const fixtureFile = resolve(ROOT, 'scripts/fixtures/concept-retrieval.json');
  let fixtures;
  try {
    fixtures = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  } catch {
    fail('retrieval fallbacks exist but benchmark fixtures cannot be read', 1);
  }
  const ids = new Set(Object.values(fixtures).flatMap(group => Array.isArray(group) ? group.map(item => item.id) : []));
  const missing = fixtureBacked.filter(item => !ids.has(item.repair_fixture));
  if (missing.length) fail(`retrieval fallback repair fixtures are missing: ${missing.map(item => item.repair_fixture).join(', ')}`, 1);
}

function finishVerification(manifest, manifestFile, steps, publishPaths, closeInputFingerprint = null) {
  const process = taskProcessControlsForManifest(manifest);
  const maintenance = resolveMaintenanceHandoff({
    root: ROOT,
    task: manifest.task,
    runId: manifest.run_id || fingerprint({ task: manifest.task, manifest: displayPath(manifestFile) }).slice(0, 8),
    steps,
    changedPaths: manifest.changed_paths,
    advisoryItems: [...retrievalFallbackMaintenanceItems(manifest), ...qaToolingMaintenanceItems(manifest)],
  });
  const failed = steps.find(step => step.status !== 0);
  let publicReceipt = null;
  const verifiedPublishPaths = publishPathsFor(publishPaths, [], []);
  if (process.qa_receipt && maintenance.status !== 'failed') {
    manifest.task_identity = taskIdentityForManifest(manifest, { root: ROOT });
    publicReceipt = publicQaReceiptPath(manifest.task_identity);
  }
  const receipt = {
    schema_version: manifest.schema_version,
    task: manifest.task,
    manifest: displayPath(manifestFile),
    status: maintenance.status,
    input_fingerprint: closeInputFingerprint,
    lifecycle: maintenance.status === 'failed' ? { status: 'open' } : { status: 'verified' },
    plan: manifest.plan || unboundPlan(),
    verified_publish_paths: verifiedPublishPaths,
    publish_paths: [],
    maintenance: {
      handoff: maintenance.handoff,
      items: maintenance.items,
    },
    qa: {
      executed: process.qa ? executionStatus(steps, 'QA') : 'skipped-by-process-control',
      permanent_coverage: manifest.coverage?.status || 'none',
      protected_contract: manifest.coverage?.protected_contract || null,
      temporary_verification: manifest.qa?.temporary_verification || 'not-used',
      qa_tooling: manifest.qa?.status || 'unchanged',
    },
    public_receipt: publicReceipt,
    steps,
  };
  writeFileSync(receiptPath(manifestFile), `${JSON.stringify(receipt, null, 2)}\n`);
  manifest.publish_paths = [];
  manifest.verification = {
    status: receipt.status,
    receipt: displayPath(receiptPath(manifestFile)),
    close_input_fingerprint: closeInputFingerprint,
    maintenance_handoff: maintenance.handoff,
    public_receipt: publicReceipt,
    qa: receipt.qa.executed,
  };
  manifest.qa = { ...manifest.qa, execution: receipt.qa.executed };
  if (maintenance.status === 'failed') {
    manifest.lifecycle = { status: 'open' };
    manifest.observability = closeObservability(manifest, receipt);
    if (supportsTaskClose(manifest)) manifest.phase = 'failed';
  } else {
    manifest.lifecycle = { status: 'verified' };
    if (supportsTaskClose(manifest)) manifest.phase = 'verified';
  }
  writeManifest(manifestFile, manifest);
  if (maintenance.status === 'failed') fail(`FAIL — ${failed.name}: ${failed.summary}; receipt: ${displayPath(receiptPath(manifestFile))}`, 1);
  if (!persistVerifiedClosure(manifest, manifestFile, receipt, verifiedPublishPaths))
    fail(`CLOSURE-BLOCKED — plan archive failed: ${receipt.plan.diagnostic}; receipt: ${displayPath(receiptPath(manifestFile))}`, 1);
  console.log(terminalOutput(`verification ${receipt.status}`, receipt, manifest, receiptPath(manifestFile)));
}

function verifyManifest(manifest, manifestFile, closeInputFingerprint, qaOverride = null) {
  const process = taskProcessControlsForManifest(manifest);
  requireDocumentationDecision(manifest);
  requireCoverageDecision(manifest);
  if (process.qa) requireFallbackFixtures(manifest);
  finalizeOrchestrationScope({ parent: manifestFile, root: ROOT });
  const steps = [];
  const changedMaps = pathChanges(manifest.review.map_hashes || {}, mapHashes());
  if (changedMaps.length) steps.push({
    name: 'concept map scope',
    command: [],
    status: 1,
    exit_code: 1,
    signal: null,
    summary: `exit 1; concept maps changed after review: ${changedMaps.join(', ')}`,
  });
  for (const tool of manifest.review.intake.tools.filter(tool => ['concept map', 'concept KB'].includes(tool.name)
    || (process.qa && tool.name === 'concept benchmark')))
    steps.push(runStep(tool.name, tool.command.argv.slice(1)));
  if (process.qa && fallbackRequiresRetrievalProof(manifest) && !steps.some(step => step.name === 'concept benchmark'))
    steps.push(runStep('concept benchmark', ['scripts/benchmark-rag.mjs', '--concept-check']));
  if (process.qa) {
    const qaArgs = ['scripts/qa-gate.mjs', '--changed', ...manifest.changed_paths];
    if (qaOverride) qaArgs.push('--classification', qaOverride.classification, '--evidence', qaOverride.evidence);
    steps.push(runStep('QA', qaArgs));
  }
  const derived = manifest.derived_paths || [];
  manifest.derived_paths = derived;
  const publishPaths = publishPathsFor(manifest.changed_paths, manifest.documented_paths, derived);
  if (publishPaths.some(path => path.startsWith('site/')))
    steps.push(runStep('site KB', ['-e', "process.chdir('site'); require('node:child_process').execFileSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'docs:check'], { stdio: 'inherit' })"]));
  finishVerification(manifest, manifestFile, steps, publishPaths, closeInputFingerprint);
}

async function main() {
  const args = process.argv.slice(2);
  const action = args.shift();
  const values = parseArgs(args);
  if (action === 'prepare') {
    checkOptions(values, ['task', 'output', 'manifest', 'path', 'changed', 'qa-tooling-path', 'plan', 'process-profile', 'process', 'json']);
    const runId = randomUUID();
    const manifestFile = preparedManifestPath(values, runId);
    if (existsSync(manifestFile)) fail(`manifest already exists: ${displayPath(manifestFile)}; start a new run with --output`, 1);
    const paths = normalizePaths([...many(values, 'path'), ...many(values, 'changed')]);
    const manifest = createManifest({
      task: one(values, 'task', true),
      ownedPaths: paths,
      plannedQaToolingPaths: normalizeOptionalPaths(many(values, 'qa-tooling-path'), '--qa-tooling-path'),
      runId,
      planPath: one(values, 'plan'),
      processControls: resolveTaskProcessControls({
        profile: one(values, 'process-profile') || 'bare',
        overrides: many(values, 'process'),
      }),
      root: ROOT,
    });
    manifest.observability = startObservability(manifest);
    writeManifest(manifestFile, manifest, { exclusive: true });
    const output = intakeForManifest(manifest, displayPath(manifestFile));
    console.log(values.has('json') ? JSON.stringify(output, null, 2) : compactLifecycleOutput('prepared', manifest, output.manifest));
    return;
  }
  if (action === 'amend') {
    checkOptions(values, ['manifest', 'path', 'qa-tooling-path', 'plan', 'json']);
    const manifestFile = manifestPath(values);
    const paths = many(values, 'path');
    const toolingPaths = many(values, 'qa-tooling-path');
    const planPath = one(values, 'plan');
    if (!paths.length && !toolingPaths.length && !planPath) fail('supply one or more --path, --qa-tooling-path, or --plan values');
    const manifest = amendManifest(
      upgradeManifest(readManifest(manifestFile)),
      paths.length ? normalizeOptionalPaths(paths, '--path') : [],
      normalizeOptionalPaths(toolingPaths, '--qa-tooling-path'),
      planPath ? planBindingFor(planPath) : null,
    );
    writeManifest(manifestFile, manifest);
    const output = intakeForManifest(manifest, displayPath(manifestFile));
    console.log(values.has('json') ? JSON.stringify(output, null, 2) : compactLifecycleOutput('amended', manifest, output.manifest));
    return;
  }
  if (action === 'review') {
    checkOptions(values, ['manifest', 'changed', 'json']);
    const manifestFile = manifestPath(values);
    let manifest = upgradeManifest(readManifest(manifestFile));
    const changed = normalizePaths(many(values, 'changed'));
    manifest = reviewManifest(manifest, { changedPaths: changed, mapBaseline: mapHashes() });
    writeManifest(manifestFile, manifest);
    const output = reviewForManifest(manifest, displayPath(manifestFile));
    console.log(values.has('json') ? JSON.stringify(output, null, 2) : compactLifecycleOutput('review', manifest, output.manifest));
    return;
  }
  if (action === 'status') {
    checkOptions(values, ['manifest', 'json']);
    const manifest = upgradeManifest(readManifest(manifestPath(values)));
    const output = {
      schema_version: manifest.schema_version,
      compatibility: manifestCompatibility(manifest),
      process: taskProcessControlsForManifest(manifest),
      phase: manifest.phase,
      lifecycle: manifest.lifecycle?.status || 'none',
      verification: manifest.verification?.status || 'none',
      receipt: manifest.verification?.receipt || null,
      public_receipt: manifest.verification?.public_receipt || null,
      flag: compactFlagGate(manifest),
    };
    if (values.has('json')) console.log(JSON.stringify(output));
    else console.log(compactStatus(manifest));
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
      fixture: one(values, 'fixture'),
    });
    writeManifest(manifestFile, manifest);
    console.log(`PASS — recorded ${manifest.retrieval.fallbacks.at(-1).classification} fallback`);
    return;
  }
  if (action === 'close') {
    checkOptions(values, ['manifest', 'decision', 'reason', 'doc-path', 'coverage', 'coverage-contract', 'temporary-verification', 'qa-classification', 'qa-evidence']);
    const manifestFile = manifestPath(values);
    let manifest = upgradeManifest(readManifest(manifestFile));
    const process = taskProcessControlsForManifest(manifest);
    const documentedPaths = normalizeOptionalPaths(many(values, 'doc-path'), '--doc-path');
    const documentationDecision = one(values, 'decision', manifest.documentation.source_changed);
    const documentationReason = one(values, 'reason', manifest.documentation.source_changed).trim();
    if (!manifest.documentation.source_changed && (documentationDecision || documentationReason || documentedPaths.length))
      fail('documentation options apply only when the reviewed change set contains source', 1);
    const qaClassification = one(values, 'qa-classification');
    const qaEvidence = one(values, 'qa-evidence');
    if (qaClassification && qaClassification !== 'test-expectation') fail('only test-expectation may be supplied as a QA maintenance classification');
    if (qaClassification && (!qaEvidence.trim() || qaEvidence.length > 240))
      fail('test-expectation classification requires 1-240 characters of bounded evidence');
    if (!qaClassification && qaEvidence) fail('QA evidence requires a QA classification');
    if (!process.qa && (qaClassification || qaEvidence)) fail('QA classification options require qa=on', 1);
    const qaOverride = qaClassification ? { classification: qaClassification, evidence: qaEvidence.trim() } : null;
    const coverage = one(values, 'coverage', process.qa_coverage && manifest.coverage?.source_changed) || 'none';
    const coverageContract = one(values, 'coverage-contract');
    const temporaryVerification = one(values, 'temporary-verification') || 'not-used';
    if (!['used', 'not-used'].includes(temporaryVerification)) fail('temporary verification must be used or not-used');
    const closeInput = {
      review: manifest.review?.input_fingerprint || null,
      documentation: documentationDecision || 'not-applicable',
      documentation_reason: documentationReason || null,
      documented_paths: documentedPaths,
      coverage,
      coverage_contract: coverageContract.trim() || null,
      temporary_verification: temporaryVerification,
      qa_classification: qaOverride?.classification || null,
      qa_evidence: qaOverride?.evidence || null,
      plan_source: manifest.plan?.source_path || null,
      process,
    };
    const closeInputFingerprint = fingerprint(closeInput);
    if (manifest.phase === 'closed') {
      if (manifest.verification?.close_input_fingerprint === closeInputFingerprint) {
        console.log(`PASS — reused receipt: ${manifest.verification.receipt}`);
        return;
      }
      fail('close inputs changed after verification; rerun task-close review', 1);
    }
    if (['verified', 'closure-blocked'].includes(manifest.phase)) {
      if (manifest.verification?.close_input_fingerprint !== closeInputFingerprint)
        fail('close inputs changed after verification; rerun task-close review', 1);
      retryVerifiedClosure(manifest, manifestFile, closeInputFingerprint);
      return;
    }
    if (manifest.documentation.source_changed) manifest = applyDocumentationDecision(manifest, {
      decision: closeInput.documentation,
      reason: closeInput.documentation_reason,
      documentedPaths: closeInput.documented_paths,
    });
    manifest = applyCoverageDecision(manifest, {
      status: closeInput.coverage,
      protectedContract: closeInput.coverage_contract,
    });
    manifest = { ...manifest, qa: { ...manifest.qa, temporary_verification: closeInput.temporary_verification } };
    writeManifest(manifestFile, manifest);
    verifyManifest(manifest, manifestFile, closeInputFingerprint, qaOverride);
    return;
  }
  fail('usage: node scripts/task-close.mjs <prepare|amend|review|fallback|close> ...');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => fail(error.message));
