import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { MAX_PATCH_BYTES, gitPatch, gitStatusSummary } from '../git-state.mjs';

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
