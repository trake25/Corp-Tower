import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { MAX_PATCH_BYTES, MAX_STATUS_PATHS, gitPatch, gitStatusSummary } from '../git-state.mjs';
import { createFilesystemIntegrationStore, integrationTargetKey, targetRecord } from '../lib/task-integration-state.mjs';

const CLI = resolve('scripts/git-state.mjs');

function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'corp-git-state-'));
  execFileSync('git', ['init', '-q', '-b', 'main', root]);
  git(root, ['config', 'user.name', 'State Test']);
  git(root, ['config', 'user.email', 'state@example.test']);
  writeFileSync(join(root, 'tracked.txt'), 'first\n');
  git(root, ['add', 'tracked.txt']);
  git(root, ['commit', '-q', '-m', 'initial']);
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, GIT_STATE_ROOT: cwd } });
}

test('status stays compact with no patch content by default and classifies staged/unstaged/untracked', () => {
  const env = fixture();
  try {
    writeFileSync(join(env.root, 'tracked.txt'), 'first\nsecond\n');
    writeFileSync(join(env.root, 'new.txt'), 'new\n');
    git(env.root, ['add', 'new.txt']);

    const summary = gitStatusSummary(env.root);
    assert.equal(summary.branch, 'main');
    assert.equal(summary.staged.total, 1);
    assert.deepEqual(summary.staged.shown[0].path, 'new.txt');
    assert.equal(summary.unstaged.total, 1);
    assert.deepEqual(summary.unstaged.shown[0].path, 'tracked.txt');
    assert.equal(summary.untracked.total, 0);
    assert.equal(summary.upstream, null);
    assert.ok(!JSON.stringify(summary).includes('diff --git'), 'status must not embed patch text');
  } finally {
    env.close();
  }
});

test('status bounds the shown path count and marks truncation', () => {
  const env = fixture();
  try {
    for (let index = 0; index < 5; index++) writeFileSync(join(env.root, `file-${index}.txt`), `${index}\n`);
    const summary = gitStatusSummary(env.root, { maxPaths: 2 });
    assert.equal(summary.untracked.total, 5);
    assert.equal(summary.untracked.shown.length, 2);
    assert.equal(summary.untracked.truncated, true);
  } finally {
    env.close();
  }
});

test('patch requires an exact path, is capped, and stores overflow privately', () => {
  const env = fixture();
  try {
    const clean = gitPatch(env.root, 'tracked.txt');
    assert.equal(clean.status, 'no-changes');

    writeFileSync(join(env.root, 'tracked.txt'), 'first\nsecond\n');
    const small = gitPatch(env.root, 'tracked.txt');
    assert.equal(small.status, 'matched');
    assert.match(small.patch, /diff --git/);
    assert.equal(small.truncated, false);
    assert.equal(small.full_patch_path, null);

    const bigLines = Array.from({ length: 2000 }, (_, index) => `line ${index}`).join('\n') + '\n';
    writeFileSync(join(env.root, 'tracked.txt'), bigLines);
    const big = gitPatch(env.root, 'tracked.txt', { maxBytes: 500 });
    assert.equal(big.truncated, true);
    assert.ok(Buffer.byteLength(big.patch) <= 500);
    assert.ok(big.full_patch_path);
    const savedPath = resolve(env.root, big.full_patch_path);
    assert.ok(existsSync(savedPath));
    assert.equal(readFileSync(savedPath, 'utf8').length > big.patch.length, true);
  } finally {
    env.close();
  }
});

test('patch rejects paths outside the repository', () => {
  const env = fixture();
  try {
    assert.throws(() => gitPatch(env.root, '../outside.txt'), /repository/);
    assert.throws(() => gitPatch(env.root, '/etc/passwd'), /repository-relative/);
  } finally {
    env.close();
  }
});

test('CLI status/patch commands emit compact text and JSON with default byte caps intact', () => {
  const env = fixture();
  try {
    writeFileSync(join(env.root, 'tracked.txt'), 'first\nsecond\n');

    const status = run(['status'], env.root);
    assert.equal(status.status, 0);
    assert.match(status.stdout, /^branch: main$/m);
    assert.doesNotMatch(status.stdout, /diff --git/);

    const patch = run(['patch', '--path', 'tracked.txt', '--json'], env.root);
    const payload = JSON.parse(patch.stdout);
    assert.equal(patch.status, 0);
    assert.equal(payload.status, 'matched');
    assert.ok(Buffer.byteLength(payload.patch) <= MAX_PATCH_BYTES);

    const bad = run(['patch', '--path', '../outside.txt'], env.root);
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /repository/);
  } finally {
    env.close();
  }
});

test('caller limits may only narrow the hard ceiling: oversized/negative/zero/fractional/non-numeric values are rejected', () => {
  const env = fixture();
  try {
    assert.equal(gitStatusSummary(env.root, { maxPaths: 1 }).limits.max_paths, 1);
    assert.equal(gitStatusSummary(env.root).limits.max_paths, MAX_STATUS_PATHS);
    for (const invalid of [MAX_STATUS_PATHS + 1, 0, -5, 3.5, NaN, Infinity])
      assert.throws(() => gitStatusSummary(env.root, { maxPaths: invalid }), /positive integer up to/, String(invalid));

    assert.equal(gitPatch(env.root, 'tracked.txt', { maxBytes: 16 }).limits.max_bytes, 16);
    for (const invalid of [MAX_PATCH_BYTES + 1, 0, -5, 3.5, NaN, Infinity])
      assert.throws(() => gitPatch(env.root, 'tracked.txt', { maxBytes: invalid }), /positive integer up to/, String(invalid));

    for (const flag of ['999999', '-5', '0', '5.5', 'not-a-number']) {
      const result = run(['status', '--max-paths', flag], env.root);
      assert.notEqual(result.status, 0, flag);
      assert.match(result.stderr, /positive integer up to/, flag);
    }
  } finally {
    env.close();
  }
});

test('an invalid patch byte limit fails closed instead of hanging', () => {
  const env = fixture();
  try {
    const bigLines = Array.from({ length: 2000 }, (_, index) => `line ${index}`).join('\n') + '\n';
    writeFileSync(join(env.root, 'tracked.txt'), bigLines);

    for (const invalid of ['-5', '0', 'NaN']) {
      const result = run(['patch', '--path', 'tracked.txt', '--max-bytes', invalid], env.root);
      assert.notEqual(result.status, 0, invalid);
      assert.match(result.stderr, /positive integer up to/, invalid);
    }
  } finally {
    env.close();
  }
});

test('status reports current task identity from a task worktree, including a nested subdirectory, and omits it elsewhere', () => {
  const env = fixture();
  try {
    const store = createFilesystemIntegrationStore({ root: env.root });
    store.mutate(state => {
      state.starts['git://example/repo::task-1'] = {
        schema_version: 1, repository: 'git://example/repo', task_id: 'task-1', task: 'Example task',
        task_branch: 'task/example', target: 'main', task_baseline: '0'.repeat(40), finalization_paths: [],
        worktree: env.root, timestamps: { started_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      };
      return null;
    });

    const summary = gitStatusSummary(env.root);
    assert.deepEqual(summary.identity, { kind: 'task', task_id: 'task-1', task: 'Example task', task_branch: 'task/example', task_baseline: '0'.repeat(40) });

    const nested = join(env.root, 'nested', 'dir');
    mkdirSync(nested, { recursive: true });
    assert.deepEqual(gitStatusSummary(nested).identity.task_id, 'task-1');

    const statusText = run(['status'], env.root);
    assert.match(statusText.stdout, /^task: Example task \(task-1\) on task\/example$/m);

    const other = mkdtempSync(join(tmpdir(), 'corp-git-state-no-identity-'));
    try {
      execFileSync('git', ['init', '-q', '-b', 'main', other]);
      git(other, ['config', 'user.name', 'No Identity']);
      git(other, ['config', 'user.email', 'no-identity@example.test']);
      writeFileSync(join(other, 'file.txt'), 'x\n');
      git(other, ['add', 'file.txt']);
      git(other, ['commit', '-q', '-m', 'initial']);
      assert.equal(gitStatusSummary(other).identity, null);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  } finally {
    env.close();
  }
});

test('status reports an active candidate identity but never a stale terminal one', () => {
  const env = fixture();
  try {
    const store = createFilesystemIntegrationStore({ root: env.root });
    const args = { repository: 'git://example/repo', target: 'main' };
    const requestId = 'integration-active';

    store.mutate(state => {
      const record = targetRecord(state, args);
      record.requests[requestId] = {
        schema_version: 1, request_id: requestId, repository: args.repository, target: args.target,
        task: 'Active candidate task', task_id: null, task_label: 'Active candidate task', task_branch: 'task/active',
        task_worktree: null, task_baseline: '0'.repeat(40), expected_task_head: '1'.repeat(40), actual_task_head: null,
        state: 'READY_FOR_FINALIZATION', queue_order: 0, main_base: '0'.repeat(40),
        candidate: { branch: 'task-integrate/candidate/integration-active', worktree: env.root, head: '2'.repeat(40) },
        finalization_paths: [], verification_checks: [], risk: null, conflicts: [],
        timestamps: { submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() }, history: [],
      };
      return null;
    });

    const active = gitStatusSummary(env.root);
    assert.deepEqual(active.identity, {
      kind: 'candidate', request_id: requestId, task: 'Active candidate task', task_branch: 'task/active',
      state: 'READY_FOR_FINALIZATION', candidate_branch: 'task-integrate/candidate/integration-active',
    });

    store.mutate(state => {
      state.targets[integrationTargetKey(args.repository, args.target)].requests[requestId].state = 'INTEGRATED';
      return null;
    });

    assert.equal(gitStatusSummary(env.root).identity, null, 'an integrated (queue-released) request must not be reported as current');
  } finally {
    env.close();
  }
});
