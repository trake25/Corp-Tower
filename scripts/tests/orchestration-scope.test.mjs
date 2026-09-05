import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { createManifest } from '../task-close.mjs';
import {
  claimWorkerScope, releaseWorkerScope, orchestrationScopeStatus, finalizeOrchestrationScope,
} from '../lib/orchestration-scope.mjs';

const CLI = resolve('scripts/orchestration-scope.mjs');
const PATHS = ['src/feature-a.mjs', 'src/feature-b.mjs', 'src/shared.mjs'];

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'corp-orchestration-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const parent = '.agent-state/automation/task-close/parent.json';
  const manifest = createManifest({ task: 'Worker scope fixture', root, ownedPaths: PATHS, runId: 'parent-run' });
  const writeParent = (value = manifest) => writeFileSync(join(root, parent), `${JSON.stringify(value)}\n`);
  mkdirSync(dirname(join(root, parent)), { recursive: true });
  writeParent();
  return {
    root, parent, manifest, writeParent,
    stateFile: join(root, '.agent-state/automation/orchestration/parent-run.json'),
    options: { root, parent },
  };
}

function run(f, args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: f.root, encoding: 'utf8', env: { ...process.env, TASK_CLOSE_ROOT: f.root },
  });
}

test('claims use explicit normalized paths from an open parent without changing its manifest', t => {
  const f = fixture(t);
  const original = readFileSync(join(f.root, f.parent), 'utf8');
  const result = claimWorkerScope({ ...f.options, worker: 'worker-a', paths: ['./src/feature-a.mjs', 'src/sub/../shared.mjs'] });
  assert.deepEqual(result.workers, [{ worker_id: 'worker-a', status: 'active', paths: [PATHS[0], PATHS[2]] }]);
  assert.equal(result.parent_manifest, f.parent);
  assert.equal(result.parent_run_id, 'parent-run');
  assert.equal(result.state_exists, true);
  assert.equal(readFileSync(join(f.root, f.parent), 'utf8'), original);
  assert.deepEqual(readdirSync(dirname(f.stateFile)), ['parent-run.json']);
});

test('same-worker repeated claims and extensions are deterministic and idempotent', t => {
  const f = fixture(t);
  const claim = paths => claimWorkerScope({ ...f.options, worker: 'worker-a', paths });
  claim([PATHS[1], PATHS[0], PATHS[0]]);
  const original = readFileSync(f.stateFile, 'utf8');
  claim([PATHS[0], PATHS[1]]);
  assert.equal(readFileSync(f.stateFile, 'utf8'), original);
  assert.deepEqual(claim([PATHS[2]]).workers[0].paths, PATHS);
  const extended = readFileSync(f.stateFile, 'utf8');
  claim([...PATHS].reverse());
  assert.equal(readFileSync(f.stateFile, 'utf8'), extended);
});

test('parallel worker ownership rejects overlapping write claims', t => {
  const f = fixture(t);
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  const original = readFileSync(f.stateFile, 'utf8');
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[0], PATHS[1]] }), /overlapping.*worker-a: src\/feature-a.mjs/);
  assert.equal(readFileSync(f.stateFile, 'utf8'), original);
  const result = claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[1]] });
  assert.deepEqual(result.workers.map(worker => worker.paths), [[PATHS[0]], [PATHS[1]]]);
});

test('claims fail closed outside parent scope and reread explicit parent amendments', t => {
  const f = fixture(t);
  const options = { ...f.options, worker: 'worker-a', paths: ['src/new.mjs'] };
  assert.throws(() => claimWorkerScope(options), /outside parent owned_paths/);
  assert.equal(existsSync(f.stateFile), false);
  f.manifest.owned_paths.push('src/new.mjs');
  f.writeParent();
  assert.deepEqual(claimWorkerScope(options).workers[0].paths, ['src/new.mjs']);
  f.manifest.owned_paths.pop();
  f.writeParent();
  assert.throws(() => orchestrationScopeStatus(f.options), /outside parent owned_paths/);
});

test('unsafe, absolute, directory, and symlink write paths are rejected', t => {
  const f = fixture(t);
  for (const path of ['../outside.mjs', '/tmp/outside.mjs', 'C:\\outside.mjs', '\\\\host\\file', '.', '', 'src/*.mjs', 'src/\0file', 'src/new/']) {
    assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [path] }), /repository|explicit file/, path);
  }
  mkdirSync(join(f.root, 'src'));
  symlinkSync(tmpdir(), join(f.root, 'src/escape'));
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: ['src/escape/outside.mjs'] }), /symbolic links/);
  symlinkSync(join(f.root, 'src'), join(f.root, 'alias'));
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: ['alias/feature-a.mjs'] }), /symbolic links/);
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: ['src'] }), /explicit file/);
  assert.equal(existsSync(f.stateFile), false);
});

test('release frees ownership for another worker without fabricating task completion', t => {
  const f = fixture(t);
  assert.throws(() => releaseWorkerScope({ ...f.options, worker: 'typo' }), /unknown worker/);
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  const released = releaseWorkerScope({ ...f.options, worker: 'worker-a' });
  assert.deepEqual(released.workers, [{ worker_id: 'worker-a', status: 'released', paths: [] }]);
  assert.deepEqual(releaseWorkerScope({ ...f.options, worker: 'worker-a' }), released);
  claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[0]] });
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] }), /overlapping/);
  const manifest = JSON.parse(readFileSync(join(f.root, f.parent), 'utf8'));
  assert.equal(manifest.lifecycle.status, 'open');
  assert.equal(manifest.verification, null);
  assert.equal(existsSync(join(f.root, 'report')), false);
});

test('finalize reports all active workers then removes released private state', t => {
  const f = fixture(t);
  claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[1]] });
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  assert.throws(() => finalizeOrchestrationScope(f.options), /worker-a: src\/feature-a.mjs; worker-b: src\/feature-b.mjs/);
  assert.equal(existsSync(f.stateFile), true);
  releaseWorkerScope({ ...f.options, worker: 'worker-a' });
  releaseWorkerScope({ ...f.options, worker: 'worker-b' });
  assert.equal(finalizeOrchestrationScope(f.options).state_exists, false);
  assert.equal(existsSync(f.stateFile), false);
  assert.equal(existsSync(dirname(f.stateFile)), false);
  assert.equal(existsSync(join(f.root, f.parent)), true);
});

test('finalize without state is a no-op and cleanup preserves other parents', t => {
  const f = fixture(t);
  const original = readFileSync(join(f.root, f.parent), 'utf8');
  assert.deepEqual(finalizeOrchestrationScope(f.options), orchestrationScopeStatus(f.options));
  assert.equal(existsSync(dirname(f.stateFile)), false);
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  const sibling = join(dirname(f.stateFile), 'another-parent.json');
  writeFileSync(sibling, 'unrelated private state\n');
  releaseWorkerScope({ ...f.options, worker: 'worker-a' });
  finalizeOrchestrationScope(f.options);
  assert.equal(readFileSync(sibling, 'utf8'), 'unrelated private state\n');
  assert.equal(readFileSync(join(f.root, f.parent), 'utf8'), original);
});

test('single-run cleanup does not inspect unrelated parent-owned files', t => {
  const f = fixture(t);
  mkdirSync(join(f.root, 'src'));
  symlinkSync(tmpdir(), join(f.root, 'src/link'));
  f.writeParent({ ...f.manifest, owned_paths: [...PATHS, 'src', 'src/link'] });
  assert.equal(finalizeOrchestrationScope(f.options).state_exists, false);
  assert.equal(existsSync(dirname(f.stateFile)), false);
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: ['src/link'] }), /symbolic links/);
});

test('invalid or closed parent manifests fail closed before claims or cleanup', t => {
  const f = fixture(t);
  for (const patch of [
    { schema_version: 1 }, { run_id: null }, { run_id: '../escape' },
    { owned_paths: [] }, { owned_paths: ['/outside.mjs'] },
    { phase: 'closed', lifecycle: { status: 'closed' } }, { lifecycle: null },
  ]) {
    f.writeParent({ ...f.manifest, ...patch });
    assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] }));
    assert.throws(() => finalizeOrchestrationScope(f.options));
  }
  writeFileSync(join(f.root, f.parent), '{broken');
  assert.throws(() => finalizeOrchestrationScope(f.options), /not valid JSON/);
  f.writeParent();
  assert.throws(() => finalizeOrchestrationScope({ ...f.options, parent: '.agent-state/missing.json' }), /existing schema-v2/);
  assert.throws(() => finalizeOrchestrationScope({ ...f.options, parent: '../outside.json' }), /inside the repository/);
  writeFileSync(join(f.root, 'public.json'), JSON.stringify(f.manifest));
  assert.throws(() => finalizeOrchestrationScope({ ...f.options, parent: 'public.json' }), /under .agent-state/);
});

test('verified parents permit cleanup but cannot acquire new writer claims', t => {
  const f = fixture(t);
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  f.writeParent({ ...f.manifest, phase: 'verified', lifecycle: { status: 'verified' } });
  assert.throws(() => claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[1]] }), /lifecycle must be open/);
  assert.throws(() => finalizeOrchestrationScope(f.options), /active worker claims/);
  releaseWorkerScope({ ...f.options, worker: 'worker-a' });
  assert.equal(finalizeOrchestrationScope(f.options).state_exists, false);
});

test('malformed or mismatched ownership state is never silently discarded', t => {
  const f = fixture(t);
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  const state = JSON.parse(readFileSync(f.stateFile, 'utf8'));
  for (const corrupt of [null, { ...state, parent_run_id: 'other' }, { ...state, workers: [{ worker_id: 'a', status: 'released', paths: [PATHS[0]] }] }]) {
    const body = JSON.stringify(corrupt);
    writeFileSync(f.stateFile, body);
    assert.throws(() => finalizeOrchestrationScope(f.options), /orchestration state/);
    assert.equal(readFileSync(f.stateFile, 'utf8'), body);
  }
  writeFileSync(f.stateFile, '{broken');
  assert.throws(() => orchestrationScopeStatus(f.options), /not valid JSON/);
});

test('status projects compact deterministic ownership metadata only', t => {
  const f = fixture(t);
  f.writeParent({ ...f.manifest, task: 'PRIVATE PROMPT', transcript: 'PRIVATE TRANSCRIPT', environment: 'PRIVATE ENVIRONMENT' });
  claimWorkerScope({ ...f.options, worker: 'worker-b', paths: [PATHS[1]] });
  claimWorkerScope({ ...f.options, worker: 'worker-a', paths: [PATHS[0]] });
  const state = JSON.parse(readFileSync(f.stateFile, 'utf8'));
  writeFileSync(f.stateFile, JSON.stringify({ ...state, transcript: 'PRIVATE TRANSCRIPT' }));
  const result = orchestrationScopeStatus(f.options);
  assert.deepEqual(Object.keys(result).sort(), ['parent_manifest', 'parent_run_id', 'state_exists', 'workers']);
  assert.deepEqual(result.workers.map(worker => worker.worker_id), ['worker-a', 'worker-b']);
  for (const worker of result.workers) assert.deepEqual(Object.keys(worker).sort(), ['paths', 'status', 'worker_id']);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE|transcript|environment/);
});

test('CLI supports the ownership lifecycle and rejects mistaken arguments', t => {
  const f = fixture(t);
  const claimed = run(f, ['claim', '--parent', f.parent, '--worker', 'worker-a', '--path', PATHS[0], '--path', PATHS[1]]);
  assert.equal(claimed.status, 0, claimed.stderr);
  assert.equal(claimed.stderr, '');
  assert.equal(claimed.stdout.trim().split('\n').length, 1);
  assert.equal(JSON.parse(claimed.stdout).workers[0].paths.length, 2);
  for (const args of [
    ['finalize', '--parent', f.parent], ['release', '--parent', f.parent, '--worker', 'typo'],
    ['claim', '--parent', f.parent, '--worker', 'worker-b'], ['status', '--parent', f.parent, '--worker', 'worker-a'],
    ['status', '--parent', f.parent, '--parent', f.parent], ['status'], ['unknown'],
    ['claim', '--parent', f.parent, '--worker', '../invalid', '--path', PATHS[2]],
  ]) {
    const result = run(f, args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /^FAIL/);
  }
  assert.equal(run(f, ['release', '--parent', f.parent, '--worker', 'worker-a']).status, 0);
  assert.equal(run(f, ['finalize', '--parent', f.parent]).status, 0);
  const result = run(f, ['status', '--parent', f.parent]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout).workers, []);
});

test('concurrent CLI writers cannot lose or overwrite sibling ownership', async t => {
  const f = fixture(t);
  const results = await Promise.all(Array.from({ length: 6 }, (_, index) => new Promise((accept, reject) => {
    const child = spawn(process.execPath, [CLI, 'claim', '--parent', f.parent, '--worker', `worker-${index}`, '--path', PATHS[0]], {
      cwd: f.root, env: { ...process.env, TASK_CLOSE_ROOT: f.root }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', data => { stdout += data; });
    child.stderr.on('data', data => { stderr += data; });
    child.on('error', reject);
    child.on('close', code => accept({ code, stdout, stderr }));
  })));
  assert.equal(results.filter(result => result.code === 0).length, 1, JSON.stringify(results));
  for (const result of results.filter(result => result.code !== 0)) assert.match(result.stderr, /overlapping|scope is busy/);
  assert.equal(orchestrationScopeStatus(f.options).workers.length, 1);
  assert.deepEqual(readdirSync(dirname(f.stateFile)), ['parent-run.json']);
});
