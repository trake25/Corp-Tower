import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createIntegrationService } from '../lib/task-integration.mjs';

function git(root, args) { return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim(); }
function fixture() {
  const base = mkdtempSync(join(tmpdir(), 'corp-task-integrate-')); const remote = join(base, 'remote.git'); const seed = join(base, 'seed'); const clone = join(base, 'clone');
  execFileSync('git', ['init', '--bare', remote]); execFileSync('git', ['clone', remote, seed]);
  git(seed, ['config', 'user.name', 'Integration Test']); git(seed, ['config', 'user.email', 'integration@example.test']);
  mkdirSync(join(seed, 'scripts'), { recursive: true }); writeFileSync(join(seed, 'base.txt'), 'base\n'); writeFileSync(join(seed, 'scripts/qa-gate.mjs'), 'process.exitCode = 0;\n');
  git(seed, ['add', 'base.txt', 'scripts/qa-gate.mjs']); git(seed, ['commit', '-m', 'initial']); git(seed, ['branch', '-M', 'main']); git(seed, ['push', '-u', 'origin', 'main']);
  execFileSync('git', ['clone', remote, clone]); git(clone, ['config', 'user.name', 'Integration Test']); git(clone, ['config', 'user.email', 'integration@example.test']);
  return { base, remote, clone, close: () => rmSync(base, { recursive: true, force: true }) };
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
  } finally { env.close(); }
});

test('stale task heads and explicit recovery are machine-readable', () => {
  const env = fixture();
  try {
    const service = createIntegrationService({ root: env.clone });
    const started = service.start({ task: 'Immutable head', taskId: 'stale-head', taskBranch: 'task/stale-head' });
    writeFileSync(join(started.worktree, 'task.txt'), 'first\n'); git(started.worktree, ['add', 'task.txt']); git(started.worktree, ['commit', '-m', 'first']); const first = git(started.worktree, ['rev-parse', 'HEAD']); git(started.worktree, ['push', '-u', 'origin', 'task/stale-head']);
    writeFileSync(join(started.worktree, 'task.txt'), 'second\n'); git(started.worktree, ['add', 'task.txt']); git(started.worktree, ['commit', '-m', 'second']); git(started.worktree, ['push']);
    const taskService = createIntegrationService({ root: started.worktree });
    const request = taskService.register({ task: 'Immutable head', taskBranch: 'task/stale-head', taskBaseline: started.task_baseline, expectedTaskHead: first });
    const stale = taskService.advance();
    assert.equal(stale.state, 'STALE_HEAD');
    assert.equal(taskService.recover({ requestId: request.request_id }).state, 'STALE_HEAD');
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
