import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
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

test('a crash left before the merge ever ran (worktree checked out bare at mainBase) is never accepted as a resumed candidate', () => {
  const env = fixture();
  try {
    git(env.clone, ['checkout', '-b', 'task/crash-before-merge']);
    commitFile(env.clone, 'task.txt', 'task\n', 'task change');
    const taskHead = headOf(env.clone);
    pushBranch(env.clone, 'task/crash-before-merge');
    git(env.clone, ['checkout', 'main']);
    const mainBase = git(env.clone, ['rev-parse', 'origin/main']);

    const gitRoot = taskIntegrationGit.commonGitDir(env.clone);
    const requestId = 'crash-before-merge-request';
    const branch = `task-integrate/candidate/${requestId}`;
    const worktree = join(gitRoot, 'task-integration', 'candidates', requestId);
    mkdirSync(join(gitRoot, 'task-integration', 'candidates'), { recursive: true });
    git(env.clone, ['worktree', 'add', '-b', branch, worktree, mainBase]); // crash happens here, before the merge ever runs

    const candidate = taskIntegrationGit.createCandidate({ root: gitRoot, requestId, mainBase, taskHead, taskLabel: 'Crash before merge' });
    assert.equal(candidate.conflict, false);
    assert.notEqual(candidate.head, mainBase, 'a worktree left checked out bare at mainBase must never be accepted as a merged candidate');
    assert.ok(taskIntegrationGit.isAncestor({ root: gitRoot, ancestor: taskHead, ref: candidate.head }), 'the rebuilt candidate must actually contain the task head');
  } finally { env.close(); }
});

test('a crash left after a completed merge resumes it only when it proves the recorded base and exact task head; a merge built from a stale base is rejected and rebuilt', () => {
  const env = fixture();
  try {
    git(env.clone, ['checkout', '-b', 'task/crash-after-merge']);
    commitFile(env.clone, 'task.txt', 'task\n', 'task change');
    const taskHead = headOf(env.clone);
    pushBranch(env.clone, 'task/crash-after-merge');
    git(env.clone, ['checkout', 'main']);
    const mainBase = git(env.clone, ['rev-parse', 'origin/main']);
    const gitRoot = taskIntegrationGit.commonGitDir(env.clone);

    // Scenario 1: a genuinely completed merge (crash after merge, before push) must be resumed as-is.
    const requestId = 'crash-after-merge-request';
    const branch = `task-integrate/candidate/${requestId}`;
    const worktree = join(gitRoot, 'task-integration', 'candidates', requestId);
    mkdirSync(join(gitRoot, 'task-integration', 'candidates'), { recursive: true });
    git(env.clone, ['worktree', 'add', '-b', branch, worktree, mainBase]);
    git(worktree, ['merge', '--no-ff', '-m', 'Integrate crash after merge', taskHead]);
    const mergedHead = headOf(worktree);

    const resumed = taskIntegrationGit.createCandidate({ root: gitRoot, requestId, mainBase, taskHead, taskLabel: 'Crash after merge' });
    assert.equal(resumed.head, mergedHead, 'a proven-valid completed merge must be resumed as-is, not rebuilt');

    // Scenario 2: main advances past the recorded base; a leftover merge built from the old base
    // is not a valid candidate for the new base and must be rejected and rebuilt.
    commitFile(env.clone, 'advance.txt', 'advance\n', 'advance main independently'); git(env.clone, ['push', 'origin', 'main']);
    const newerMainBase = git(env.clone, ['rev-parse', 'origin/main']);

    const staleRequestId = 'crash-after-merge-stale-base';
    const staleBranch = `task-integrate/candidate/${staleRequestId}`;
    const staleWorktree = join(gitRoot, 'task-integration', 'candidates', staleRequestId);
    git(env.clone, ['worktree', 'add', '-b', staleBranch, staleWorktree, mainBase]);
    git(staleWorktree, ['merge', '--no-ff', '-m', 'Integrate stale base', taskHead]);
    const staleMergedHead = headOf(staleWorktree);

    const rebuilt = taskIntegrationGit.createCandidate({ root: gitRoot, requestId: staleRequestId, mainBase: newerMainBase, taskHead, taskLabel: 'Crash after merge stale base' });
    assert.notEqual(rebuilt.head, staleMergedHead, 'a merge proven based on a stale main must never be resumed as-is');
    assert.ok(taskIntegrationGit.isAncestor({ root: gitRoot, ancestor: newerMainBase, ref: rebuilt.head }));
    assert.ok(taskIntegrationGit.isAncestor({ root: gitRoot, ancestor: taskHead, ref: rebuilt.head }));
  } finally { env.close(); }
});

test('RECOVERY_REQUIRED recognizes an already-published exact verified candidate and proceeds to cleanup without republishing', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Recovery already integrated', taskId: 'recovery-already-integrated', taskBranch: 'task/recovery-already-integrated' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/recovery-already-integrated');
    let calls = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { calls += 1; const real = taskIntegrationGit.publishCandidateMain(args); return calls === 1 ? { state: 'RECOVERY_REQUIRED', detail: 'simulated verify-after-push failure' } : real; } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Recovery already integrated', taskBranch: 'task/recovery-already-integrated', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const stuck = taskService.finish({ requestId: registered.request_id });
    assert.equal(stuck.state, 'RECOVERY_REQUIRED');
    assert.ok(stuck.verified_candidate_head, 'the QA-passed head must be persisted before the push attempt');
    assert.equal(taskService.status().active_request_id, registered.request_id, 'RECOVERY_REQUIRED must retain the active slot');
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), stuck.verified_candidate_head, 'the push actually landed even though the process could not confirm it');

    const recovered = taskService.recover({ requestId: registered.request_id });
    assert.equal(recovered.state, 'INTEGRATED');
    assert.equal(recovered.main_after, stuck.verified_candidate_head);
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), stuck.verified_candidate_head, 'recovery must never republish or move main');
    assert.equal(existsSync(started.worktree), false);
  } finally { env.close(); }
});

test('RECOVERY_REQUIRED safely retries the exact verified candidate when remote main is still the recorded base', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Recovery safe retry', taskId: 'recovery-safe-retry', taskBranch: 'task/recovery-safe-retry' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/recovery-safe-retry');
    let calls = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { calls += 1; return calls === 1 ? { state: 'RECOVERY_REQUIRED', detail: 'simulated crash before push' } : taskIntegrationGit.publishCandidateMain(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Recovery safe retry', taskBranch: 'task/recovery-safe-retry', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const stuck = taskService.finish({ requestId: registered.request_id });
    assert.equal(stuck.state, 'RECOVERY_REQUIRED');
    assert.notEqual(git(env.remote, ['rev-parse', 'refs/heads/main']), stuck.verified_candidate_head, 'main must not have moved yet in this scenario');

    const recovered = taskService.recover({ requestId: registered.request_id });
    assert.equal(recovered.state, 'INTEGRATED');
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), stuck.verified_candidate_head);
    assert.equal(calls, 2);
  } finally { env.close(); }
});

test('RECOVERY_REQUIRED refuses publication when remote main moved incompatibly', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Recovery stale main', taskId: 'recovery-stale-main', taskBranch: 'task/recovery-stale-main' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/recovery-stale-main');
    let calls = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { calls += 1; return calls === 1 ? { state: 'RECOVERY_REQUIRED', detail: 'simulated crash before push' } : taskIntegrationGit.publishCandidateMain(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Recovery stale main', taskBranch: 'task/recovery-stale-main', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const stuck = taskService.finish({ requestId: registered.request_id });
    assert.equal(stuck.state, 'RECOVERY_REQUIRED');

    commitFile(env.clone, 'other.txt', 'other\n', 'independent main advance'); git(env.clone, ['push', 'origin', 'main']);
    const movedMain = git(env.clone, ['rev-parse', 'origin/main']);

    const recovered = taskService.recover({ requestId: registered.request_id });
    assert.equal(recovered.state, 'STALE_MAIN');
    assert.equal(recovered.actual_main, movedMain);
    assert.equal(taskService.status().active_request_id, null, 'STALE_MAIN releases the queue slot');
  } finally { env.close(); }
});

test('a PUSH_REJECTED retry that mutates the candidate before retrying produces and persists a new verified head, never republishing the stale one', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push retry mutation', taskId: 'push-retry-mutation', taskBranch: 'task/push-retry-mutation' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-retry-mutation');
    let attempts = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { attempts += 1; return attempts === 1 ? { state: 'PUSH_REJECTED', detail: 'simulated non-fast-forward rejection' } : taskIntegrationGit.publishCandidateMain(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Push retry mutation', taskBranch: 'task/push-retry-mutation', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), finalizationPaths: ['generated.txt'] });
    const ready = taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');
    const firstVerifiedHead = rejected.verified_candidate_head;
    assert.ok(firstVerifiedHead, 'the QA-passed head must be persisted before the push attempt');
    assert.equal(git(ready.candidate.worktree, ['rev-parse', 'HEAD']), firstVerifiedHead);

    writeFileSync(join(ready.candidate.worktree, 'generated.txt'), 'generated content\n');
    const integrated = taskService.finish({ requestId: registered.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
    assert.notEqual(integrated.candidate.head, firstVerifiedHead, 'a candidate mutation before retry must produce a new verified head, never reuse the stale one');
    assert.equal(integrated.main_after, integrated.candidate.head);
    assert.equal(attempts, 2, 'a mutated retry must go through a fresh publish attempt, not skip straight through');
  } finally { env.close(); }
});

test('verification check cwd rejects absolute, drive-letter, UNC, and traversal forms on either separator before registration', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const baseArgs = { task: 'Cwd unsafe forms', taskBranch: 'task/cwd-unsafe-forms', taskBaseline: '0'.repeat(40), expectedTaskHead: '1'.repeat(40) };
    const unsafe = ['/etc/passwd', '../escape', 'sub/../../escape', 'C:\\Windows', 'C:evil', '\\\\server\\share', '//server/share', '..\\escape', 'sub\\..\\..\\escape'];
    for (const cwd of unsafe) {
      assert.throws(() => service.register({ ...baseArgs, verificationChecks: [{ argv: [process.execPath, 'scripts/extra-check.mjs'], cwd }] }), /cwd/, `expected rejection for cwd: ${JSON.stringify(cwd)}`);
    }
    assert.doesNotThrow(() => service.register({ ...baseArgs, verificationChecks: [{ argv: [process.execPath, 'scripts/extra-check.mjs'], cwd: 'sub/dir' }] }));
  } finally { env.close(); }
});

test('runCandidateQa resolves each check cwd against the worktree and proves containment via realpath: a nested subdirectory is honored, and a symlink escape is rejected before the process ever runs', () => {
  const worktreeDir = mkdtempSync(join(tmpdir(), 'corp-task-integrate-qa-'));
  const outsideDir = mkdtempSync(join(tmpdir(), 'corp-task-integrate-outside-'));
  try {
    mkdirSync(join(worktreeDir, 'scripts'), { recursive: true });
    writeFileSync(join(worktreeDir, 'scripts', 'qa-gate.mjs'), 'process.exitCode = 0;\n');
    mkdirSync(join(worktreeDir, 'sub'), { recursive: true });
    execFileSync('ln', ['-s', outsideDir, join(worktreeDir, 'evil-link')]);

    const symlinkResult = taskIntegrationGit.runCandidateQa({ worktree: worktreeDir, changed: [], checks: [{ argv: [process.execPath, '-e', 'process.exit(0)'], cwd: 'evil-link', label: 'symlink escape' }] });
    assert.equal(symlinkResult.ok, false);
    assert.equal(symlinkResult.check, 'symlink escape');
    assert.match(symlinkResult.detail, /escapes the candidate root/);

    const expectedSub = JSON.stringify(realpathSync(join(worktreeDir, 'sub')));
    const subResult = taskIntegrationGit.runCandidateQa({ worktree: worktreeDir, changed: [], checks: [{ argv: [process.execPath, '-e', `process.exit(process.cwd() === ${expectedSub} ? 0 : 1)`], cwd: 'sub', label: 'contained subdirectory' }] });
    assert.equal(subResult.ok, true, subResult.detail);
  } finally { rmSync(worktreeDir, { recursive: true, force: true }); rmSync(outsideDir, { recursive: true, force: true }); }
});

test('starting a task accepts a pre-existing local branch only when its HEAD exactly equals the freshly fetched baseline, and never persists a false baseline start record otherwise', () => {
  const env = fixture();
  try {
    const mainHead = git(env.clone, ['rev-parse', 'origin/main']);
    git(env.clone, ['branch', 'task/preexisting-baseline', mainHead]);
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Preexisting baseline', taskId: 'preexisting-baseline', taskBranch: 'task/preexisting-baseline' });
    assert.equal(started.reused, false);
    assert.equal(started.task_baseline, mainHead);
    assert.equal(git(started.worktree, ['rev-parse', 'HEAD']), mainHead);

    const mismatchSource = join(env.base, 'mismatch-src');
    git(env.clone, ['branch', 'task/preexisting-mismatch', mainHead]);
    git(env.clone, ['worktree', 'add', mismatchSource, 'task/preexisting-mismatch']);
    commitFile(mismatchSource, 'extra.txt', 'extra\n', 'unrelated pre-existing commit');
    git(env.clone, ['worktree', 'remove', '--force', mismatchSource]);

    assert.throws(() => service.start({ task: 'Preexisting mismatch', taskId: 'preexisting-mismatch', taskBranch: 'task/preexisting-mismatch' }), /differs from the freshly fetched task baseline/);
    const store = createFilesystemIntegrationStore({ root: env.clone }).read();
    const repository = service.status().repository;
    assert.equal(store.starts[`${repository}::preexisting-mismatch`], undefined, 'a rejected start must never persist a false baseline start record');
  } finally { env.close(); }
});

function flakyPushLanded() {
  let realPublishCalls = 0;
  const git = {
    ...taskIntegrationGit,
    publishCandidateMain(args) {
      realPublishCalls += 1;
      const real = taskIntegrationGit.publishCandidateMain(args); // actually pushes, regardless of what is reported below
      return realPublishCalls === 1 ? { state: 'PUSH_REJECTED', detail: 'simulated ambiguous network response after an actual push' } : real;
    },
  };
  return { git, calls: () => realPublishCalls };
}

test('a PUSH_REJECTED retry reconciles a push that actually landed and never attempts a second publication', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push actually landed', taskId: 'push-actually-landed', taskBranch: 'task/push-actually-landed' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-actually-landed');
    const flaky = flakyPushLanded();
    const taskService = createIntegrationService({ root: started.worktree, git: flaky.git });
    const registered = taskService.register({ task: 'Push actually landed', taskBranch: 'task/push-actually-landed', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');
    const verifiedHead = rejected.verified_candidate_head;
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), verifiedHead, 'the push actually landed despite the reported rejection');

    const integrated = taskService.finish({ requestId: registered.request_id });
    assert.equal(integrated.state, 'INTEGRATED');
    assert.equal(integrated.main_after, verifiedHead);
    assert.equal(flaky.calls(), 1, 'the retry must reconcile the already-landed push instead of attempting a second publication');
  } finally { env.close(); }
});

test('a PUSH_REJECTED retry with a dirty candidate after a push that actually landed preserves the candidate and reports cleanup-required', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push landed dirty candidate', taskId: 'push-landed-dirty', taskBranch: 'task/push-landed-dirty' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-landed-dirty');
    const flaky = flakyPushLanded();
    const taskService = createIntegrationService({ root: started.worktree, git: flaky.git });
    const registered = taskService.register({ task: 'Push landed dirty candidate', taskBranch: 'task/push-landed-dirty', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), finalizationPaths: ['generated.txt'] });
    const ready = taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');
    const verifiedHead = rejected.verified_candidate_head;
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), verifiedHead);

    writeFileSync(join(ready.candidate.worktree, 'generated.txt'), 'newer candidate edits\n'); // dirty, never committed

    const result = taskService.finish({ requestId: registered.request_id });
    assert.equal(result.state, 'INTEGRATED_CLEANUP_REQUIRED');
    assert.match(result.cleanup_error, /diverged from the verified head/);
    assert.equal(result.main_after, verifiedHead);
    assert.equal(flaky.calls(), 1, 'dirty candidate edits must never trigger a second publication attempt');
    assert.equal(existsSync(ready.candidate.worktree), true, 'the candidate worktree must be preserved, not deleted');
    assert.equal(readFileSync(join(ready.candidate.worktree, 'generated.txt'), 'utf8'), 'newer candidate edits\n', 'dirty edits must survive');
    assert.notEqual(git(env.clone, ['branch', '--list', ready.candidate.branch]), '', 'the local candidate branch must be preserved');
  } finally { env.close(); }
});

test('a PUSH_REJECTED retry with a candidate HEAD committed past the verified head after a push that actually landed preserves the divergent candidate', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push landed committed divergence', taskId: 'push-landed-committed', taskBranch: 'task/push-landed-committed' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-landed-committed');
    const flaky = flakyPushLanded();
    const taskService = createIntegrationService({ root: started.worktree, git: flaky.git });
    const registered = taskService.register({ task: 'Push landed committed divergence', taskBranch: 'task/push-landed-committed', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree), finalizationPaths: ['generated.txt'] });
    const ready = taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');
    const verifiedHead = rejected.verified_candidate_head;
    assert.equal(git(env.remote, ['rev-parse', 'refs/heads/main']), verifiedHead);

    writeFileSync(join(ready.candidate.worktree, 'generated.txt'), 'newer candidate edits\n');
    git(ready.candidate.worktree, ['add', 'generated.txt']);
    git(ready.candidate.worktree, ['commit', '-m', 'candidate edits committed after the ambiguous push']);
    const divergedHead = git(ready.candidate.worktree, ['rev-parse', 'HEAD']);
    assert.notEqual(divergedHead, verifiedHead);

    const result = taskService.finish({ requestId: registered.request_id });
    assert.equal(result.state, 'INTEGRATED_CLEANUP_REQUIRED');
    assert.match(result.cleanup_error, /diverged from the verified head/);
    assert.equal(flaky.calls(), 1, 'a committed divergent candidate must never trigger a second publication attempt');
    assert.equal(existsSync(ready.candidate.worktree), true);
    assert.equal(git(ready.candidate.worktree, ['rev-parse', 'HEAD']), divergedHead, 'the committed divergent head must be preserved untouched');
  } finally { env.close(); }
});

test('a PUSH_REJECTED retry becomes STALE_MAIN and releases the slot when remote main moved incompatibly (the rejected push never actually landed)', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Push retry stale main', taskId: 'push-retry-stale-main', taskBranch: 'task/push-retry-stale-main' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/push-retry-stale-main');
    let attempts = 0;
    const flaky = { ...taskIntegrationGit, publishCandidateMain(args) { attempts += 1; return attempts === 1 ? { state: 'PUSH_REJECTED', detail: 'simulated non-fast-forward rejection' } : taskIntegrationGit.publishCandidateMain(args); } };
    const taskService = createIntegrationService({ root: started.worktree, git: flaky });
    const registered = taskService.register({ task: 'Push retry stale main', taskBranch: 'task/push-retry-stale-main', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    taskService.advance();
    const rejected = taskService.finish({ requestId: registered.request_id });
    assert.equal(rejected.state, 'PUSH_REJECTED');

    commitFile(env.clone, 'other.txt', 'other\n', 'independent main advance'); git(env.clone, ['push', 'origin', 'main']);
    const movedMain = git(env.clone, ['rev-parse', 'origin/main']);

    const result = taskService.finish({ requestId: registered.request_id });
    assert.equal(result.state, 'STALE_MAIN');
    assert.equal(result.actual_main, movedMain);
    assert.equal(taskService.status().active_request_id, null, 'STALE_MAIN releases the queue slot');
  } finally { env.close(); }
});

test('cleanup records a genuine ls-remote/ref-verification failure as its own error, never silently treating it as confirmed absence', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Cleanup verify failure', taskId: 'cleanup-verify-failure', taskBranch: 'task/cleanup-verify-failure' });
    commitFile(started.worktree, 'task.txt', 'task\n', 'task change'); pushBranch(started.worktree, 'task/cleanup-verify-failure');
    const taskService = createIntegrationService({ root: started.worktree });
    const registered = taskService.register({ task: 'Cleanup verify failure', taskBranch: 'task/cleanup-verify-failure', taskBaseline: started.task_baseline, expectedTaskHead: headOf(started.worktree) });
    const ready = taskService.advance();

    const gitRoot = taskIntegrationGit.commonGitDir(started.worktree);
    const realRemoteUrl = git(gitRoot, ['config', '--get', 'remote.origin.url']);
    git(gitRoot, ['config', 'remote.origin.url', join(env.base, 'does-not-exist.git')]);
    let errors;
    try { errors = taskIntegrationGit.cleanupIntegrated({ root: gitRoot, candidate: ready.candidate, taskBranch: 'task/cleanup-verify-failure', taskWorktree: started.worktree }); }
    finally { git(gitRoot, ['config', 'remote.origin.url', realRemoteUrl]); }
    assert.ok(errors.some(message => /candidate ref absence unverified/.test(message)), errors.join(' | '));
    assert.ok(errors.some(message => /task ref absence unverified/.test(message)), errors.join(' | '));
  } finally { env.close(); }
});
