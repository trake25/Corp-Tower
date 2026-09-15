import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIntegrationService } from '../lib/task-integration.mjs';
import { createFilesystemIntegrationStore, integrationTargetKey } from '../lib/task-integration-state.mjs';
import * as taskIntegrationGit from '../lib/task-integration-git.mjs';
import { normalizeRepositoryRemote } from '../lib/task-integration-git.mjs';

function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
function commitFile(worktree, file, content, message = file) {
  writeFileSync(join(worktree, file), content);
  git(worktree, ['add', file]);
  git(worktree, ['commit', '-m', message]);
}
function pushBranch(worktree, branch) { git(worktree, ['push', '-u', 'origin', branch]); }
function headOf(worktree) { return git(worktree, ['rev-parse', 'HEAD']); }

function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'corp-task-integrate-')); const remote = join(base, 'remote.git'); const seed = join(base, 'seed'); const clone = join(base, 'clone');
  execFileSync('git', ['init', '--bare', remote]); execFileSync('git', ['clone', remote, seed]);
  git(seed, ['config', 'user.name', 'Integration Test']); git(seed, ['config', 'user.email', 'integration@example.test']);
  mkdirSync(join(seed, 'scripts'), { recursive: true });
  writeFileSync(join(seed, 'base.txt'), 'base\n');
  // These marker files control the stub QA scripts below; .gitignore keeps toggling them from ever
  // being seen as a dirty finalization-scope violation during a candidate-verification test.
  writeFileSync(join(seed, '.gitignore'), '.qa-fail\n.extra-check-fail\n');
  writeFileSync(join(seed, 'scripts/qa-gate.mjs'), "import { existsSync } from 'node:fs';\nprocess.exitCode = existsSync('.qa-fail') ? 1 : 0;\n");
  writeFileSync(join(seed, 'scripts/extra-check.mjs'), "import { existsSync } from 'node:fs';\nprocess.exitCode = existsSync('.extra-check-fail') ? 1 : 0;\n");
  git(seed, ['add', 'base.txt', '.gitignore', 'scripts/qa-gate.mjs', 'scripts/extra-check.mjs']); git(seed, ['commit', '-m', 'initial']); git(seed, ['branch', '-M', 'main']); git(seed, ['push', '-u', 'origin', 'main']);
  git(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']); // otherwise a bare repo's default HEAD (e.g. master) leaves later clones with no local `main` to push from
  execFileSync('git', ['clone', remote, clone]); git(clone, ['config', 'user.name', 'Integration Test']); git(clone, ['config', 'user.email', 'integration@example.test']);
  return { base, remote, seed, clone, close: () => rmSync(base, { recursive: true, force: true }) };
}

test('task integration starts from remote main, queues immutable heads, and publishes a verified candidate', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Deterministic integration', taskId: 'integration-test', taskBranch: 'task/integration-test' });
    assert.equal(started.task_baseline, git(env.clone, ['rev-parse', 'origin/main']));
    writeFileSync(join(started.worktree, 'task.txt'), 'task revision\n'); git(started.worktree, ['add', 'task.txt']); git(started.worktree, ['commit', '-m', 'task']); git(started.worktree, ['push', '-u', 'origin', 'task/integration-test']);
    const taskHead = git(started.worktree, ['rev-parse', 'HEAD']);
    const taskService = createIntegrationService({ root: started.worktree });
    const queued = taskService.register({ task: 'Deterministic integration', taskBranch: 'task/integration-test', taskBaseline: started.task_baseline, expectedTaskHead: taskHead });
    assert.equal(taskService.register({ task: 'Deterministic integration', taskBranch: 'task/integration-test', taskBaseline: started.task_baseline, expectedTaskHead: taskHead }).request_id, queued.request_id);
    const ready = taskService.advance();
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    assert.equal(git(started.worktree, ['rev-parse', 'HEAD']), taskHead, 'candidate creation must not alter task worktree');
    const integrated = taskService.finish({ requestId: queued.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
    assert.equal(git(env.clone, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0], integrated.main_after);
    assert.equal(git(env.clone, ['log', '-1', '--format=%s', integrated.main_after]), `Integrate ${integrated.task_label}`);
  } finally { env.close(); }
});

test('stale task heads expose expected/actual evidence and explicit recovery is machine-readable', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Immutable head', taskId: 'stale-head', taskBranch: 'task/stale-head' });
    writeFileSync(join(started.worktree, 'task.txt'), 'first\n'); git(started.worktree, ['add', 'task.txt']); git(started.worktree, ['commit', '-m', 'first']); const first = git(started.worktree, ['rev-parse', 'HEAD']); git(started.worktree, ['push', '-u', 'origin', 'task/stale-head']);
    writeFileSync(join(started.worktree, 'task.txt'), 'second\n'); git(started.worktree, ['add', 'task.txt']); git(started.worktree, ['commit', '-m', 'second']); const second = git(started.worktree, ['rev-parse', 'HEAD']); git(started.worktree, ['push']);
    const taskService = createIntegrationService({ root: started.worktree });
    const request = taskService.register({ task: 'Immutable head', taskBranch: 'task/stale-head', taskBaseline: started.task_baseline, expectedTaskHead: first });
    const stale = taskService.advance();
    assert.equal(stale.state, 'STALE_HEAD');
    assert.equal(stale.expected_task_head, first);
    assert.equal(stale.actual_task_head, second);
    assert.equal(taskService.status().active_request_id, null, 'a stale head must release the queue slot');
    const recovered = taskService.recover({ requestId: request.request_id });
    assert.equal(recovered.state, 'STALE_HEAD');
  } finally { env.close(); }
});

test('FIFO requests wait for the active candidate and are evaluated against its resulting main', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const first = service.start({ task: 'First queued task', taskId: 'fifo-first', taskBranch: 'task/fifo-first' });
    const second = service.start({ task: 'Second queued task', taskId: 'fifo-second', taskBranch: 'task/fifo-second' });
    for (const [started, file] of [[first, 'first.txt'], [second, 'second.txt']]) {
      writeFileSync(join(started.worktree, file), `${file}\n`); git(started.worktree, ['add', file]); git(started.worktree, ['commit', '-m', file]); git(started.worktree, ['push', '-u', 'origin', started.task_branch]);
    }
    const taskService = createIntegrationService({ root: first.worktree });
    const firstRequest = taskService.register({ task: first.task, taskBranch: first.task_branch, taskBaseline: first.task_baseline, expectedTaskHead: git(first.worktree, ['rev-parse', 'HEAD']) });
    const secondRequest = taskService.register({ task: second.task, taskBranch: second.task_branch, taskBaseline: second.task_baseline, expectedTaskHead: git(second.worktree, ['rev-parse', 'HEAD']) });
    assert.equal(taskService.advance().request_id, firstRequest.request_id);
    assert.equal(taskService.status({ requestId: secondRequest.request_id }).state, 'QUEUED');
    assert.equal(taskService.finish({ requestId: firstRequest.request_id }).state, 'INTEGRATED');
    const readySecond = taskService.status({ requestId: secondRequest.request_id });
    assert.equal(readySecond.state, 'READY_FOR_FINALIZATION');
    assert.equal(readySecond.main_base, git(env.clone, ['ls-remote', 'origin', 'refs/heads/main']).split(/\s+/)[0]);
    assert.equal(taskService.finish({ requestId: secondRequest.request_id }).state, 'INTEGRATED');
  } finally { env.close(); }
});

test('resuming a started task returns the original recorded baseline even after remote main advances, and rejects context substitution', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Baseline lock', taskId: 'baseline-lock', taskBranch: 'task/baseline-lock' });
    const originalBaseline = started.task_baseline;
    commitFile(env.clone, 'advance.txt', 'advance\n', 'advance main directly'); git(env.clone, ['push', 'origin', 'main']);
    assert.notEqual(git(env.clone, ['rev-parse', 'origin/main']), originalBaseline);

    const resumed = service.start({ task: 'Baseline lock', taskId: 'baseline-lock', taskBranch: 'task/baseline-lock' });
    assert.equal(resumed.reused, true);
    assert.equal(resumed.task_baseline, originalBaseline);

    assert.throws(() => service.start({ task: 'Baseline lock', taskId: 'baseline-lock', taskBranch: 'task/different-branch' }), /already started on/);

    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/baseline-lock');
    const taskHead = headOf(started.worktree);
    assert.throws(() => service.register({ task: 'Baseline lock', taskBranch: 'task/baseline-lock', taskBaseline: '0'.repeat(40), expectedTaskHead: taskHead }), /cannot register a different baseline/);
    const queued = service.register({ task: 'Baseline lock', taskBranch: 'task/baseline-lock', taskBaseline: originalBaseline, expectedTaskHead: taskHead });
    assert.equal(queued.task_baseline, originalBaseline);
  } finally { env.close(); }
});

test('start recovery is bounded: a missing recorded worktree returns RECOVERY_REQUIRED instead of a fabricated baseline', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Corrupt worktree', taskId: 'corrupt-worktree', taskBranch: 'task/corrupt-worktree' });
    rmSync(started.worktree, { recursive: true, force: true });
    const resumed = service.start({ task: 'Corrupt worktree', taskId: 'corrupt-worktree', taskBranch: 'task/corrupt-worktree' });
    assert.equal(resumed.state, 'RECOVERY_REQUIRED');
    assert.equal(resumed.task_baseline, started.task_baseline);
    assert.match(resumed.recovery_detail, /missing/);
  } finally { env.close(); }
});

test('two worktrees of one clone share a queue/state domain, and separate clones of the same remote share one repository identity with independent storage', () => {
  const env = fixture();
  try {
    const clone2 = join(env.base, 'clone2');
    execFileSync('git', ['clone', env.remote, clone2]);
    git(clone2, ['config', 'user.name', 'Integration Test']); git(clone2, ['config', 'user.email', 'integration@example.test']);
    const serviceA = createIntegrationService({ root: env.clone });
    const serviceB = createIntegrationService({ root: clone2 });
    assert.equal(serviceA.status().repository, serviceB.status().repository);
    const storeA = createFilesystemIntegrationStore({ root: env.clone });
    const storeB = createFilesystemIntegrationStore({ root: clone2 });
    assert.notEqual(storeA.base, storeB.base);

    const started = serviceA.start({ task: 'Shared queue', taskId: 'shared-queue', taskBranch: 'task/shared-queue' });
    commitFile(started.worktree, 'shared.txt', 'shared\n', 'shared change'); pushBranch(started.worktree, 'task/shared-queue');
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Shared queue', taskBranch: 'task/shared-queue', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    assert.equal(serviceA.status({ requestId: registered.request_id }).request_id, registered.request_id);
  } finally { env.close(); }
});

test('repository identity normalization collapses SSH/HTTPS forms and strips credentials', () => {
  assert.equal(normalizeRepositoryRemote('git@github.com:Example/Repo.git'), normalizeRepositoryRemote('https://github.com/Example/Repo.git'));
  const credentialed = normalizeRepositoryRemote('https://user:secret-token@github.com/Example/Repo.git');
  assert.equal(credentialed, normalizeRepositoryRemote('https://github.com/Example/Repo'));
  assert.doesNotMatch(credentialed, /user|secret-token/);
});

test('a non-conflicting overlap on an already-integrated file merges cleanly and is surfaced as a bounded risk signal', () => {
  const env = fixture();
  try {
    const lines = Array.from({ length: 20 }, (_, i) => `line ${i}`).join('\n') + '\n';
    writeFileSync(join(env.clone, 'risk.txt'), lines); git(env.clone, ['add', 'risk.txt']); git(env.clone, ['commit', '-m', 'seed risk file']); git(env.clone, ['push', 'origin', 'main']);
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Overlap risk', taskId: 'overlap-risk', taskBranch: 'task/overlap-risk' });
    const taskLines = lines.split('\n'); taskLines[18] = 'task changed near end'; writeFileSync(join(started.worktree, 'risk.txt'), taskLines.join('\n'));
    git(started.worktree, ['add', 'risk.txt']); git(started.worktree, ['commit', '-m', 'task edits risk.txt']); pushBranch(started.worktree, 'task/overlap-risk');
    const taskHead = headOf(started.worktree);
    writeFileSync(join(env.clone, 'risk.txt'), lines.replace('line 0', 'main changed start'));
    git(env.clone, ['add', 'risk.txt']); git(env.clone, ['commit', '-m', 'main edits risk.txt']); git(env.clone, ['push', 'origin', 'main']);
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Overlap risk', taskBranch: 'task/overlap-risk', taskBaseline: started.task_baseline, expectedTaskHead: taskHead });
    const ready = taskService.advance();
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    assert.deepEqual(ready.risk, { changed_path_overlap: ['risk.txt'] });
    assert.equal(taskService.finish({ requestId: registered.request_id }).state, 'INTEGRATED');
  } finally { env.close(); }
});

test('a textual conflict releases the queue slot with bounded evidence, and a repaired head re-enters normal queue order', () => {
  const env = fixture();
  try {
    writeFileSync(join(env.clone, 'conflict.txt'), 'base\n'); git(env.clone, ['add', 'conflict.txt']); git(env.clone, ['commit', '-m', 'seed conflict file']); git(env.clone, ['push', 'origin', 'main']);
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Conflict repair', taskId: 'conflict-repair', taskBranch: 'task/conflict-repair' });
    writeFileSync(join(started.worktree, 'conflict.txt'), 'task version\n'); git(started.worktree, ['add', 'conflict.txt']); git(started.worktree, ['commit', '-m', 'task changes conflict.txt']); pushBranch(started.worktree, 'task/conflict-repair');
    const firstHead = headOf(started.worktree);
    writeFileSync(join(env.clone, 'conflict.txt'), 'main version\n'); git(env.clone, ['add', 'conflict.txt']); git(env.clone, ['commit', '-m', 'main changes conflict.txt']); git(env.clone, ['push', 'origin', 'main']);
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Conflict repair', taskBranch: 'task/conflict-repair', taskBaseline: started.task_baseline, expectedTaskHead: firstHead });
    const blocked = taskService.advance();
    assert.equal(blocked.state, 'BLOCKED_CONFLICT');
    assert.deepEqual(blocked.conflicts, ['conflict.txt']);
    assert.equal(blocked.main_base, git(env.clone, ['rev-parse', 'origin/main']));
    assert.equal(taskService.status().active_request_id, null);

    git(started.worktree, ['fetch', 'origin', 'main']); git(started.worktree, ['merge', '-X', 'ours', 'origin/main']); pushBranch(started.worktree, 'task/conflict-repair');
    const repairedHead = headOf(started.worktree);
    const repaired = taskService.register({ task: 'Conflict repair', taskBranch: 'task/conflict-repair', taskBaseline: started.task_baseline, expectedTaskHead: repairedHead });
    assert.notEqual(repaired.request_id, registered.request_id);
    const ready = taskService.advance();
    assert.equal(ready.request_id, repaired.request_id);
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    assert.equal(taskService.finish({ requestId: repaired.request_id }).state, 'INTEGRATED');
  } finally { env.close(); }
});

test('finalization outside the approved scope is an actionable, retained QA_FAILED that can be repaired and retried, and the finalize commit is task-named', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Finalization scope', taskId: 'finalization-scope', taskBranch: 'task/finalization-scope' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/finalization-scope');
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Finalization scope', taskBranch: 'task/finalization-scope', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), finalizationPaths: ['generated.txt'] });
    const ready = taskService.advance();
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    writeFileSync(join(ready.candidate.worktree, 'unapproved.txt'), 'outside scope\n');
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'QA_FAILED');
    assert.match(rejected.qa.detail, /outside finalization scope/);
    assert.equal(taskService.status().active_request_id, registered.request_id, 'QA_FAILED must retain the active slot');

    rmSync(join(ready.candidate.worktree, 'unapproved.txt'));
    writeFileSync(join(ready.candidate.worktree, 'generated.txt'), 'generated content\n');
    const integrated = taskService.finish({ requestId: registered.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
    const subjects = git(env.clone, ['log', '--format=%s', `${integrated.main_before}..${integrated.main_after}`]).split('\n');
    assert.ok(subjects.includes(`Finalize ${integrated.task_label}`), subjects.join(' | '));
    assert.ok(subjects.some(subject => subject.startsWith('Integrate ')), subjects.join(' | '));
    assert.ok(!subjects.some(subject => subject.includes(registered.request_id) || subject.includes('task-integrate/candidate')), subjects.join(' | '));
  } finally { env.close(); }
});

test('immutable structured verification checks run from the candidate and fail closed on any failing check', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Verification checks', taskId: 'verification-checks', taskBranch: 'task/verification-checks' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/verification-checks');
    const taskService = createIntegrationService({ root: started.worktree });
    const checks = [{ argv: [process.execPath, 'scripts/extra-check.mjs'], label: 'extra check' }];
    const registered = taskService.register({ task: 'Verification checks', taskBranch: 'task/verification-checks', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), verificationChecks: checks });
    assert.throws(() => taskService.register({ task: 'Verification checks', taskBranch: 'task/verification-checks', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), verificationChecks: [] }), /immutable/);
    const ready = taskService.advance();
    writeFileSync(join(ready.candidate.worktree, '.extra-check-fail'), '1\n');
    const failed = taskService.finish({ requestId: registered.request_id });
    assert.equal(failed.state, 'QA_FAILED');
    assert.equal(failed.qa.check, 'extra check');
    assert.equal(taskService.status().active_request_id, registered.request_id);
    rmSync(join(ready.candidate.worktree, '.extra-check-fail'));
    const integrated = taskService.finish({ requestId: registered.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
  } finally { env.close(); }
});

test('a main that moves before publication becomes STALE_MAIN with bounded evidence and releases the queue', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Stale main', taskId: 'stale-main', taskBranch: 'task/stale-main' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/stale-main');
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Stale main', taskBranch: 'task/stale-main', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    const ready = taskService.advance();
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    const recordedBase = ready.main_base;
    commitFile(env.clone, 'other.txt', 'other\n', 'other independent change'); git(env.clone, ['push', 'origin', 'main']);
    const staleMain = git(env.clone, ['rev-parse', 'origin/main']);
    const failed = taskService.finish({ requestId: registered.request_id });
    assert.equal(failed.state, 'STALE_MAIN');
    assert.equal(failed.main_base, recordedBase);
    assert.equal(failed.actual_main, staleMain);
    assert.equal(taskService.status().active_request_id, null);
  } finally { env.close(); }
});

test('a recoverable PUSH_REJECTED retains the active slot and retries publication after rechecking the exact candidate head and current main', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push retry', taskId: 'push-retry', taskBranch: 'task/push-retry' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-retry');
    let attempts = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { attempts += 1; return attempts === 1 ? { state: 'PUSH_REJECTED', detail: 'simulated non-fast-forward rejection' } : taskIntegrationGit.publishCandidateMain(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Push retry', taskBranch: 'task/push-retry', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');
    assert.match(rejected.error, /simulated non-fast-forward/);
    assert.equal(taskService.status().active_request_id, registered.request_id);
    const integrated = taskService.finish({ requestId: registered.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
    assert.equal(attempts, 2);
  } finally { env.close(); }
});

test('a VERIFYING stage interrupted by a crash is resumed by explicit recovery rather than left stuck', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Verifying crash', taskId: 'verifying-crash', taskBranch: 'task/verifying-crash' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/verifying-crash');
    const taskStore = createFilesystemIntegrationStore({ root: started.worktree });
    const taskService = createIntegrationService({ root: started.worktree, store: taskStore });
    const registered = taskService.register({ task: 'Verifying crash', taskBranch: 'task/verifying-crash', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    const ready = taskService.advance();
    assert.equal(ready.state, 'READY_FOR_FINALIZATION');
    taskStore.mutate(state => {
      const key = integrationTargetKey(registered.repository, registered.target);
      state.targets[key].requests[registered.request_id].state = 'VERIFYING';
      return null;
    });
    assert.equal(taskService.status({ requestId: registered.request_id }).state, 'VERIFYING');
    const recovered = taskService.recover({ requestId: registered.request_id });
    assert.equal(recovered.state, 'INTEGRATED');
  } finally { env.close(); }
});

test('an abandoned mutation lock is explicitly recoverable by proven-dead PID, and a live lock is never stolen', () => {
  const env = fixture();
  try {
    const store = createFilesystemIntegrationStore({ root: env.clone });
    mkdirSync(store.base, { recursive: true });
    const lockPath = join(store.base, 'state.lock');
    const dead = spawnSync(process.execPath, ['-e', '1']).pid;
    writeFileSync(lockPath, JSON.stringify({ pid: dead, owner: 'dead-owner' }));
    const service = createIntegrationService({ root: env.clone, store });
    assert.throws(() => service.start({ task: 'Lock probe', taskId: 'lock-probe' }), /busy/);
    const recovered = service.recoverLock();
    assert.equal(recovered.recovered, true);
    const started = service.start({ task: 'Lock probe', taskId: 'lock-probe' });
    assert.ok(started.task_baseline);

    writeFileSync(lockPath, JSON.stringify({ pid: process.pid, owner: 'live-owner' }));
    const refused = service.recoverLock();
    assert.equal(refused.recovered, false);
    assert.match(refused.detail, /still be alive/);
    assert.throws(() => service.start({ task: 'Lock probe 2', taskId: 'lock-probe-2' }), /busy/);
    rmSync(lockPath, { force: true });
  } finally { env.close(); }
});

test('successful integration deletes exact candidate/task refs and worktrees, verifies their absence, never sweeps unrelated task branches, and cleanup failures recover without republishing', () => {
  const env = fixture();
  try {
    writeFileSync(join(env.clone, 'unrelated.txt'), 'unrelated\n');
    git(env.clone, ['checkout', '-b', 'task/unrelated']); git(env.clone, ['add', 'unrelated.txt']); git(env.clone, ['commit', '-m', 'unrelated task branch']); pushBranch(env.clone, 'task/unrelated'); git(env.clone, ['checkout', 'main']);

    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Full cleanup', taskId: 'full-cleanup', taskBranch: 'task/full-cleanup' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/full-cleanup');
    const taskHead = headOf(started.worktree);

    let cleanupAttempts = 0;
    const flakyCleanup = { ...taskIntegrationGit, cleanupIntegrated(args) { cleanupAttempts += 1; return cleanupAttempts === 1 ? ['simulated cleanup failure'] : taskIntegrationGit.cleanupIntegrated(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flakyCleanup });
    const registered = taskService.register({ task: 'Full cleanup', taskBranch: 'task/full-cleanup', taskBaseline: started.task_baseline, expectedTaskHead: taskHead });
    const ready = taskService.advance();
    const candidateBranch = ready.candidate.branch;
    const candidateWorktree = ready.candidate.worktree;

    const firstAttempt = taskService.finish({ requestId: registered.request_id });
    assert.equal(firstAttempt.state, 'INTEGRATED_CLEANUP_REQUIRED');
    assert.match(firstAttempt.cleanup_error, /simulated cleanup failure/);
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), firstAttempt.main_after, 'main must already be verified-integrated despite the cleanup failure');

    const recovered = taskService.recover({ requestId: registered.request_id });
    assert.equal(recovered.state, 'INTEGRATED');
    assert.equal(cleanupAttempts, 2);
    assert.equal(recovered.main_after, firstAttempt.main_after, 'recovery must never republish');

    assert.equal(existsSync(candidateWorktree), false);
    assert.equal(existsSync(started.worktree), false);
    assert.equal(git(env.clone, ['branch', '--list', candidateBranch]), '');
    assert.equal(git(env.clone, ['branch', '--list', 'task/full-cleanup']), '');
    assert.equal(git(env.remote, ['branch', '--list', candidateBranch]), '');
    assert.equal(git(env.remote, ['branch', '--list', 'task/full-cleanup']), '');
    assert.notEqual(git(env.remote, ['branch', '--list', 'task/unrelated']), '', 'an unrelated task/* branch must never be swept by this exact-request cleanup');

    const restarted = service.start({ task: 'Full cleanup', taskId: 'full-cleanup', taskBranch: 'task/full-cleanup' });
    assert.equal(restarted.reused, false, 'start metadata must be cleared only after cleanup succeeds');
  } finally { env.close(); }
});

test('await resolves immediately on a caller-action-required state and never creates a duplicate request', async () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Await caller action', taskId: 'await-caller-action', taskBranch: 'task/await-caller-action' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/await-caller-action');
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Await caller action', taskBranch: 'task/await-caller-action', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    const ready = taskService.advance();
    writeFileSync(join(ready.candidate.worktree, '.qa-fail'), '1\n');
    const failed = taskService.finish({ requestId: registered.request_id });
    assert.equal(failed.state, 'QA_FAILED');
    const awaited = await taskService.await({ requestId: registered.request_id, timeoutMs: 500 });
    assert.equal(awaited.state, 'QA_FAILED');
    const duplicate = taskService.register({ task: 'Await caller action', taskBranch: 'task/await-caller-action', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    assert.equal(duplicate.request_id, registered.request_id);
  } finally { env.close(); }
});
