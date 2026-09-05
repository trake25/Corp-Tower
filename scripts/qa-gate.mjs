#!/usr/bin/env node
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { failureClassificationLine } from './lib/maintenance-handoff.mjs';

const ROOT = resolve(process.cwd());
const CLIENT = 'src/Client/App/corp-tower';
const SERVER = 'src/Server';

const serverRules = [
  [/Auth_Verifier\.js$/, ['Auth_Verifier.test.js']],
  [/Profile_Store\.js$/, ['Profile_Store.test.js']],
  [/Redis_State\.js$/, ['Matchmaking_Queue.test.js']],
  [/Tower_Stability\.js$/, ['Stability_Scoring.test.js']],
  [/(Block_Supply|Impacts)\.js$/, ['Gameplay_Events.test.js']],
  [/Scoring\.js$/, ['Placement_Geometry.test.js', 'Stability_Scoring.test.js', 'Gameplay_Events.test.js']],
];

const clientRules = [
  [/(Auth_Manager|Auth_Config)\.gd$/, ['test_auth_manager.gd', 'test_auth_pkce.gd', 'test_auth_google_native.gd', 'test_auth_facebook_native.gd']],
  [/addons\/GoogleSignInPlugin\//, ['test_auth_google_native.gd']],
  [/addons\/FacebookSignInPlugin\//, ['test_auth_facebook_native.gd']],
  [/SignInDebugOverlay\.gd$/, ['test_sign_in_debug_overlay.gd']],
  [/SnapGrid/, ['GameUi/test_snap_grid.gd']],
  [/Inventory/, ['GameUi/test_inventory_controller.gd']],
  [/BlockData|Orientation/, ['GameUi/test_block_orientation.gd']],
  [/Emoji/, ['GameUi/test_block_emoji.gd']],
  [/CollapseSim/, ['GameUi/test_collapse_sim.gd']],
  [/VisualHooks|TowerStack/, ['GameUi/test_visual_hooks.gd']],
  [/Tutorial/, ['GameUi/test_tutorial_controller.gd', 'GameUi/test_tutorial_gates.gd', 'GameUi/test_tutorial_lessons.gd', 'GameUi/test_tutorial_progress.gd']],
  [/DebugPanel/, ['GameUi/test_debug_panel.gd']],
  [/LevelSummary|Summary/, ['GameUi/test_level_summary.gd']],
  [/Roster|PlayerContext/, ['GameUi/test_roster_view.gd', 'GameUi/test_player_context.gd']],
];

const automationTests = Object.freeze({
  context: 'scripts/tests/context-query.test.mjs',
  conceptKb: 'scripts/tests/concept-kb.test.mjs',
  kbCalibration: 'scripts/tests/kb-calibration.test.mjs',
  buildFileMap: 'scripts/tests/build-file-map.test.mjs',
  taskClose: 'scripts/tests/task-close.test.mjs',
  gitSync: 'scripts/tests/git-sync-commit-push.test.mjs',
  qaGate: 'scripts/tests/qa-gate.test.mjs',
  validateDocs: 'scripts/tests/validate-docs.test.mjs',
  observability: 'scripts/tests/agent-observability.test.mjs',
  observabilityHook: 'scripts/tests/codex-observability-hook.test.mjs',
  policyRouting: 'scripts/tests/policy-routing.test.mjs',
  renderedClient: 'scripts/tests/rendered-client-verify.test.mjs',
});

export const AUTOMATION_PROTOCOL_TESTS = Object.freeze(Object.values(automationTests)
  .filter(test => ![automationTests.conceptKb, automationTests.kbCalibration].includes(test)));
export const CONCEPT_KB_TESTS = Object.freeze([
  automationTests.buildFileMap,
  automationTests.conceptKb,
  automationTests.context,
  automationTests.kbCalibration,
]);

const automationTestSet = new Set(AUTOMATION_PROTOCOL_TESTS);
const automationRules = [
  [/^KB(?:\/|$)/, CONCEPT_KB_TESTS],
  [/^scripts\/(?:build-concept-map|validate-concept-kb|export-kb-calibration-report)\.mjs$/, CONCEPT_KB_TESTS],
  [/^scripts\/(?:lib\/(?:concept-kb|kb-calibration)\.mjs|fixtures\/concept-retrieval\.json|tests\/(?:concept-kb|kb-calibration)\.test\.mjs)$/, CONCEPT_KB_TESTS],
  [/^scripts\/benchmark-rag\.mjs$/, CONCEPT_KB_TESTS],
  [/^scripts\/build-file-map\.mjs$/, [automationTests.buildFileMap]],
  [/^scripts\/context\.mjs$/, [automationTests.context]],
  [/^scripts\/task-close\.mjs$/, [automationTests.taskClose]],
  [/^scripts\/git-sync-commit-push\.mjs$/, [automationTests.gitSync]],
  [/^scripts\/agent-observability\.mjs$/, [automationTests.observability, automationTests.observabilityHook]],
  [/^\.codex\/hooks\.json$/, [automationTests.observability, automationTests.observabilityHook]],
  [/^scripts\/codex-observability-hook\.mjs$/, [automationTests.observability, automationTests.observabilityHook]],
  [/^scripts\/qa-gate\.mjs$/, [automationTests.qaGate, automationTests.context, automationTests.taskClose]],
  [/^scripts\/rendered-client-verify\.mjs$/, [automationTests.renderedClient, automationTests.qaGate]],
  [/^scripts\/validate-docs\.mjs$/, [automationTests.validateDocs]],
  [/^scripts\/lib\/context-query\.mjs$/, [automationTests.context, automationTests.taskClose]],
  [/^scripts\/lib\/context-routing\.mjs$/, [automationTests.context]],
  [/^scripts\/lib\/task-identity\.mjs$/, [automationTests.taskClose, automationTests.gitSync]],
  [/^scripts\/lib\/qa-receipt\.mjs$/, [automationTests.taskClose]],
  [/^scripts\/lib\/agent-observability\/[^/]+$/, [automationTests.observability, automationTests.observabilityHook]],
  [/^scripts\/tests\/codex-observability-hook\.test\.mjs$/, [automationTests.observabilityHook]],
  [/^scripts\/lib\/docs-capacity\.mjs$/, [automationTests.validateDocs]],
  [/^scripts\/lib\/maintenance-handoff\.mjs$/, [automationTests.taskClose, automationTests.qaGate, automationTests.validateDocs, automationTests.observability]],
  [/^report\/benchmarks\//, [automationTests.context]],
  [/^(?:AGENTS\.md|policy\/[^/]+\.md)$/, [automationTests.policyRouting]],
];

export const TUTORIAL_PARITY_TEST = 'scripts/tests/tutorial-defaults-parity.test.mjs';
const contractRules = [
  [/^src\/Server\/app\/Game_Config\.js$/, [TUTORIAL_PARITY_TEST]],
  [/^src\/Client\/App\/corp-tower\/Cor\/Scripts\/GameUi\/Tutorial\/TutorialLessons\.gd$/, [TUTORIAL_PARITY_TEST]],
  [/^scripts\/lib\/tutorial-defaults-parity\.mjs$/, [TUTORIAL_PARITY_TEST]],
  [/^scripts\/tests\/tutorial-defaults-parity\.test\.mjs$/, [TUTORIAL_PARITY_TEST]],
];

function addMatches(path, rules, destination) {
  for (const [pattern, tests] of rules) {
    if (!pattern.test(path)) continue;
    tests.forEach(test => destination.add(test));
    return true;
  }
  return false;
}

export function selectToolingQa(changedPaths) {
  const changed = changedPaths.filter(Boolean).map(path => path.replace(/^\.\//, ''));
  const tests = new Set();
  let applies = false;

  for (const path of changed) {
    if (automationTestSet.has(path)) {
      tests.add(path);
      applies = true;
      continue;
    }
    for (const [pattern, matchedTests] of automationRules) {
      if (!pattern.test(path)) continue;
      matchedTests.forEach(test => tests.add(test));
      applies = true;
    }
  }

  return { applies, tests: [...tests].sort() };
}

export function selectContractQa(changedPaths) {
  const changed = changedPaths.filter(Boolean).map(path => path.replace(/^\.\//, ''));
  const tests = new Set();
  for (const path of changed) addMatches(path, contractRules, tests);
  return { applies: Boolean(tests.size), tests: [...tests].sort() };
}

export function selectQa(changedPaths) {
  const changed = changedPaths.filter(Boolean).map(path => path.replace(/^\.\//, ''));
  const serverTests = new Set();
  const clientTests = new Set();
  const serverSources = new Set();
  let fullServer = false;
  let fullClient = false;
  let clientRuntime = false;
  const tooling = selectToolingQa(changed);
  const contracts = selectContractQa(changed);
  const conceptKb = changed.some(path => /^KB(?:\/|$)/.test(path)
    || /^scripts\/(?:context|benchmark-rag|build-concept-map|validate-concept-kb|export-kb-calibration-report)\.mjs$/.test(path)
    || /^scripts\/(?:lib\/(?:context-query|concept-kb|kb-calibration)\.mjs|fixtures\/concept-retrieval\.json|tests\/(?:concept-kb|kb-calibration)\.test\.mjs)$/.test(path));

  for (const path of changed) {
    if (path.startsWith(`${SERVER}/tests/`) && path.endsWith('.test.js')) {
      serverTests.add(path.slice(`${SERVER}/tests/`.length));
    } else if (path.startsWith(`${SERVER}/`)) {
      if (path.endsWith('.js')) serverSources.add(path.slice(`${SERVER}/`.length));
      if (/\/(Game_Engine|Game_Config|Lobby_Manager|Server|Bot_Manager)\.js$/.test(path) || /test-fixture/i.test(path)) fullServer = true;
      else if (!addMatches(path, serverRules, serverTests)) fullServer = true;
    } else if (path.startsWith(`${CLIENT}/Tests/Gut/`) && path.endsWith('.gd')) {
      clientTests.add(path.slice(`${CLIENT}/Tests/Gut/`.length));
    } else if (path.startsWith(`${CLIENT}/`)) {
      clientRuntime ||= /\.(gd|tscn|godot)$/.test(path);
      if (/(Main\.gd|GameUI\.tscn|project\.godot|UiNodeBinder|GameUiHarness)/.test(path)) fullClient = true;
      else if (clientRuntime && !addMatches(path, clientRules, clientTests)) fullClient = true;
    }
  }

  const runtimeApplies = Boolean(serverSources.size || serverTests.size || clientRuntime || clientTests.size);
  return {
    changed,
    server_sources: [...serverSources].sort(),
    server_tests: [...serverTests].sort(),
    full_server: fullServer,
    client_runtime: clientRuntime,
    client_tests: [...clientTests].sort(),
    full_client: fullClient,
    tooling_tests: tooling.tests,
    contract_tests: contracts.tests,
    concept_kb: conceptKb,
    runtime_applies: runtimeApplies,
    applies: runtimeApplies || tooling.applies || contracts.applies || conceptKb,
  };
}

function failureDetail(output) {
  const lines = output.split(/\r?\n/);
  const nodeFailure = lines.find(line => /^\s*not ok\b/i.test(line))
    || lines.find(line => /\bAssertionError\b/.test(line))
    || lines.find(line => /^\s*error:\s*\S/i.test(line));
  if (nodeFailure) return boundedDetail(nodeFailure);
  const totals = output.match(/Totals\n[-\s\S]*?(?=\n\n|$)/)?.[0].replaceAll('\n', '; ').replace(/\s+/g, ' ').trim();
  const error = output.split(/\r?\n/).find(line => /Parse Error:|Compile Error:|\[Failed\]:/.test(line))?.trim();
  return boundedDetail([totals, error].filter(Boolean).join(' · '));
}

function boundedDetail(value, limit = 360) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
}

export function classifyQaFailure({ message = '', output = '', error = null, requestedClassification = null, evidence = '' } = {}) {
  const detail = `${message}\n${output}\n${error?.message || ''}`;
  if (error || /\b(?:EACCES|EPERM|ENOENT|permission denied|sandbox|missing root Godot binary)\b/i.test(detail))
    return 'tooling-environment';
  const assertion = /\b(?:AssertionError|not ok|\[Failed\]:|expected)\b/i.test(detail);
  if (requestedClassification === 'test-expectation' && evidence.trim() && assertion)
    return 'test-expectation';
  return 'implementation';
}

function fail(message, output = '', error = null, options = {}) {
  const classification = classifyQaFailure({
    message,
    output,
    error,
    requestedClassification: options.classification,
    evidence: options.evidence,
  });
  const detail = failureDetail(output);
  const log = output.trim() ? join(mkdtempSync(join(tmpdir(), 'corp-tower-qa-gate-')), 'failure.log') : '';
  if (log) writeFileSync(log, output);
  console.error(failureClassificationLine(classification));
  console.error(`FAIL — ${message}${detail ? ` — ${detail}` : ''}`);
  if (log) console.error(`Full output: ${log}`);
  process.exit(1);
}

function run(label, command, args, cwd, env = process.env, options = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  if (result.error) fail(`${label}: ${result.error.message}`, '', result.error, options);
  if (result.status !== 0) fail(label, [result.stdout, result.stderr].filter(Boolean).join('\n'), null, options);
  return label;
}

export function selectGodotBinary({ root = ROOT, platform = process.platform } = {}) {
  const suffix = platform === 'win32' ? '_win64.exe' : '_linux.x86_64';
  const candidates = readdirSync(root).filter(name => name.startsWith('Godot_v') && name.endsWith(suffix)).sort();
  if (!candidates.length) throw new Error(`missing root Godot binary matching Godot_v*${suffix}`);
  return join(root, candidates.at(-1));
}

function godotBinary(options) {
  try {
    return selectGodotBinary();
  } catch (error) {
    fail(error.message, '', error, options);
  }
}

function changedArguments(argv) {
  const changedAt = argv.indexOf('--changed');
  if (changedAt < 0) return [];
  const changed = [];
  for (const path of argv.slice(changedAt + 1)) {
    if (path.startsWith('--')) break;
    if (path) changed.push(path);
  }
  return changed;
}

function failureOptions(argv) {
  const classificationAt = argv.indexOf('--classification');
  if (classificationAt < 0) return { classification: null, evidence: '' };
  const classification = argv[classificationAt + 1] || '';
  const evidenceAt = argv.indexOf('--evidence');
  const evidence = evidenceAt < 0 ? '' : argv[evidenceAt + 1] || '';
  if (classification !== 'test-expectation') fail('only test-expectation may be supplied as an explicit QA classification');
  if (!evidence.trim()) fail('test-expectation classification requires bounded evidence');
  return { classification, evidence };
}

function main() {
  const argv = process.argv.slice(2);
  const options = failureOptions(argv);
  const changed = changedArguments(argv);
  if (!changed.length) fail('pass one or more task-owned paths after --changed', '', null, options);
  const plan = selectQa(changed);
  if (argv.includes('--plan')) {
    if (argv.includes('--json')) console.log(JSON.stringify(plan, null, 2));
    else if (plan.runtime_applies) console.log('PLAN — runtime QA applies');
    else if (plan.tooling_tests.length) console.log('PLAN — tooling QA applies');
    else if (plan.contract_tests.length) console.log('PLAN — contract QA applies');
    else console.log('PLAN — no runtime QA applies');
    return;
  }

  const completed = [];
  if (plan.concept_kb) {
    completed.push(run('concept map check', process.execPath, ['scripts/build-concept-map.mjs', '--check', '--quiet'], ROOT, process.env, options));
    completed.push(run('concept KB validation', process.execPath, ['scripts/validate-concept-kb.mjs', '--quiet'], ROOT, process.env, options));
    completed.push(run('concept retrieval benchmark', process.execPath, ['scripts/benchmark-rag.mjs', '--concept-check'], ROOT, process.env, options));
  }
  if (plan.contract_tests.length) {
    for (const contractTest of plan.contract_tests)
      run(`contract test ${contractTest}`, process.execPath, ['--test', contractTest], ROOT, process.env, options);
    completed.push(`contract targeted tests (${plan.contract_tests.length})`);
  }
  if (plan.server_sources.length) {
    for (const source of plan.server_sources) run(`server syntax ${source}`, process.execPath, ['--check', source], SERVER, process.env, options);
    completed.push(`server syntax (${plan.server_sources.length})`);
  }
  if (plan.full_server) {
    completed.push(run('server full suite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], SERVER, process.env, options));
  } else if (plan.server_tests.length) {
    completed.push(run('server targeted tests', process.execPath, ['--test', '--test-reporter=dot', ...plan.server_tests.map(test => `tests/${test}`)], SERVER, process.env, options));
  }

  if (plan.client_runtime || plan.client_tests.length) {
    const bin = godotBinary(options);
    const dataHome = mkdtempSync(join(tmpdir(), 'corp-tower-qa-gate-'));
    const env = { ...process.env, XDG_DATA_HOME: dataHome };
    if (plan.client_runtime) completed.push(run('client smoke', bin, ['--headless', '--path', CLIENT, '-s', 'Tests/CiSmokeTest.gd'], ROOT, env, options));
    if (plan.full_client) {
      completed.push(run('client full GUT', bin, ['--headless', '--path', CLIENT, '-s', 'addons/gut/gut_cmdln.gd', '-gdir=res://Tests/Gut', '-ginclude_subdirs', '-glog=0', '-gdisable_colors', '-gexit'], ROOT, env, options));
    } else {
      for (const test of plan.client_tests) run(`client GUT ${test}`, bin, ['--headless', '--path', CLIENT, '-s', 'addons/gut/gut_cmdln.gd', `-gtest=res://Tests/Gut/${test}`, '-glog=0', '-gdisable_colors', '-gexit'], ROOT, env, options);
      completed.push(`client targeted GUT (${plan.client_tests.length})`);
    }
  }

  if (plan.tooling_tests.length) {
    for (const toolingTest of plan.tooling_tests)
      run(`tooling test ${toolingTest}`, process.execPath, ['--test', toolingTest], ROOT, process.env, options);
    completed.push(`tooling targeted tests (${plan.tooling_tests.length})`);
  }

  if (!completed.length) console.log('PASS — no runtime, tooling, or contract QA applies to the supplied paths');
  else console.log(`PASS — ${completed.join('; ')}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(`qa gate: ${error.message}`, '', error);
  }
}
