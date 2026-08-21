#!/usr/bin/env node
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = resolve(process.cwd());
const CLIENT = 'src/Client/App/corp-tower';
const SERVER = 'src/Server';
const argv = process.argv.slice(2);
const changedAt = argv.indexOf('--changed');
const changed = changedAt < 0 ? [] : argv.slice(changedAt + 1).filter(path => path && !path.startsWith('-')).map(path => path.replace(/^\.\//, ''));
const serverTests = new Set();
const clientTests = new Set();
const serverSources = new Set();
let fullServer = false;
let fullClient = false;
let clientRuntime = false;

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
  [/SnapGrid/, ['test_snap_grid.gd']],
  [/Inventory/, ['test_inventory_controller.gd']],
  [/BlockData|Orientation/, ['test_block_orientation.gd']],
  [/Emoji/, ['test_block_emoji.gd']],
  [/CollapseSim/, ['test_collapse_sim.gd']],
  [/VisualHooks|TowerStack/, ['test_visual_hooks.gd']],
  [/Tutorial/, ['test_tutorial_controller.gd', 'test_tutorial_gates.gd', 'test_tutorial_lessons.gd', 'test_tutorial_progress.gd']],
  [/DebugPanel/, ['test_debug_panel.gd']],
  [/LevelSummary|Summary/, ['test_level_summary.gd']],
  [/Roster|PlayerContext/, ['test_roster_view.gd', 'test_player_context.gd']],
];

function addMatches(path, rules, destination) {
  for (const [pattern, tests] of rules) {
    if (!pattern.test(path)) continue;
    tests.forEach(test => destination.add(test));
    return true;
  }
  return false;
}

function failureDetail(output) {
  const totals = output.match(/Totals\n[-\s\S]*?(?=\n\n|$)/)?.[0].replaceAll('\n', '; ').replace(/\s+/g, ' ').trim();
  const error = output.split(/\r?\n/).find(line => /Parse Error:|Compile Error:|\[Failed\]:/.test(line))?.trim();
  return [totals, error].filter(Boolean).join(' · ');
}

function fail(message, output = '') {
  const detail = failureDetail(output);
  const log = output.trim() ? join(mkdtempSync(join(tmpdir(), 'corp-tower-qa-gate-')), 'failure.log') : '';
  if (log) writeFileSync(log, output);
  console.error(`FAIL — ${message}${detail ? ` — ${detail}` : ''}`);
  if (log) console.error(`Full output: ${log}`);
  process.exit(1);
}

function run(label, command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8' });
  if (result.error) fail(`${label}: ${result.error.message}`);
  if (result.status !== 0) fail(label, `${result.stdout || ''}${result.stderr || ''}`);
  return label;
}

function godotBinary() {
  const suffix = process.platform === 'win32' ? '_win64.exe' : '_linux.x86_64';
  const candidates = readdirSync(ROOT).filter(name => name.startsWith('Godot_v') && name.endsWith(suffix)).sort();
  if (!candidates.length) fail(`missing root Godot binary matching Godot_v*${suffix}`);
  return join(ROOT, candidates.at(-1));
}

if (!changed.length) fail('pass one or more task-owned paths after --changed');

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

const completed = [];
if (serverSources.size) {
  for (const source of serverSources) run(`server syntax ${source}`, process.execPath, ['--check', source], SERVER);
  completed.push(`server syntax (${serverSources.size})`);
}
if (fullServer) {
  completed.push(run('server full suite', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['test'], SERVER));
} else if (serverTests.size) {
  completed.push(run('server targeted tests', process.execPath, ['--test', '--test-reporter=dot', ...[...serverTests].sort().map(test => `tests/${test}`)], SERVER));
}

if (clientRuntime || clientTests.size) {
  const bin = godotBinary();
  const dataHome = mkdtempSync(join(tmpdir(), 'corp-tower-qa-gate-'));
  const env = { ...process.env, XDG_DATA_HOME: dataHome };
  if (clientRuntime) completed.push(run('client smoke', bin, ['--headless', '--path', CLIENT, '-s', 'Tests/CiSmokeTest.gd'], ROOT, env));
  if (fullClient) {
    completed.push(run('client full GUT', bin, ['--headless', '--path', CLIENT, '-s', 'addons/gut/gut_cmdln.gd', '-gdir=res://Tests/Gut', '-ginclude_subdirs', '-glog=0', '-gdisable_colors', '-gexit'], ROOT, env));
  } else {
    for (const test of [...clientTests].sort()) run(`client GUT ${test}`, bin, ['--headless', '--path', CLIENT, '-s', 'addons/gut/gut_cmdln.gd', `-gtest=res://Tests/Gut/${test}`, '-glog=0', '-gdisable_colors', '-gexit'], ROOT, env);
    completed.push(`client targeted GUT (${clientTests.size})`);
  }
}

if (!completed.length) console.log('PASS — no runtime QA applies to the supplied paths');
else console.log(`PASS — ${completed.join('; ')}`);
