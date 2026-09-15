import { randomUUID } from 'node:crypto';
import {
  createFilesystemIntegrationStore, integrationTargetKey, isCallerAction, isTerminal, publicRequest, targetRecord,
} from './task-integration-state.mjs';
import {
  candidateHead, changedPaths, cleanupCandidate, cleanupIntegrated, commitCandidateFinalization, commonGitDir, createCandidate,
  fetchBranch, isAncestor, publishCandidateMain, remoteHead, repositoryIdentity, runCandidateQa, startTaskGit, validateTaskGit,
} from './task-integration-git.mjs';
import { publishScopedTask, safeBranchName } from './git-publication.mjs';
import { boundedDisplayLabel } from './task-identity.mjs';

const SCHEMA_VERSION = 1;
const safeTask = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('task must be 1-120 printable characters');
  return value.trim().replace(/\s+/g, ' ');
};
const safePaths = paths => {
  if (!Array.isArray(paths)) throw new Error('paths must be an array');
  return [...new Set(paths)].sort();
};
function safeVerificationCheck(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check)) throw new Error('verification check must be an object');
  const { argv, cwd = null, label = null } = check;
  if (!Array.isArray(argv) || !argv.length || argv.some(part => typeof part !== 'string' || !part.length))
    throw new Error('verification check argv must be a non-empty array of strings');
  if (cwd !== null && (typeof cwd !== 'string' || cwd.startsWith('/') || cwd.split('/').includes('..')))
    throw new Error('verification check cwd must be a bounded repository-relative path');
  if (label !== null && (typeof label !== 'string' || !label.trim())) throw new Error('verification check label must be a non-empty string');
  return { argv: [...argv], cwd, label };
}
const requestId = () => `integration-${randomUUID().replaceAll('-', '')}`;
const now = () => new Date().toISOString();
function targetArgs(gitRoot, target = 'main') { return { repository: repositoryIdentity(gitRoot), target: safeBranchName(target, 'target branch') }; }
function history(request, event, detail = null) { (request.history ||= []).push({ at: now(), event, ...(detail ? { detail } : {}) }); request.timestamps.updated_at = now(); }
function release(target, request) { if (target.active_request_id === request.request_id) target.active_request_id = null; target.queue = target.queue.filter(id => id !== request.request_id); }
function findStartRecord(state, repository, branch, taskId = null) {
  if (taskId) { const direct = state.starts[`${repository}::${taskId}`]; if (direct) return direct; }
  return Object.values(state.starts).find(entry => entry.repository === repository && entry.task_branch === branch) || null;
}

/**
 * `root` may be the task's own worktree, and successful integration removes that exact directory
 * (see `cleanupIntegrated`). Every admin/plumbing Git call below is anchored to the stable
 * git-common-dir instead, which is never deleted by a linked-worktree cleanup; only `submit()`
 * (staging/committing the task's own file content) still uses the original `root`.
 */
export function createIntegrationService({ root = process.cwd(), store = createFilesystemIntegrationStore({ root }), git = null } = {}) {
  const gitRoot = commonGitDir(root);
  const adapter = git || {
    fetchBranch, remoteHead, changedPaths, createCandidate, candidateHead, commitCandidateFinalization, runCandidateQa,
    publishCandidateMain, cleanupCandidate, cleanupIntegrated, startTaskGit, validateTaskGit, isAncestor,
  };
  function findRequest(id, target = 'main') {
    const args = targetArgs(gitRoot, target); const state = store.read(); const record = state.targets[integrationTargetKey(args.repository, args.target)];
    return record?.requests[id] ? publicRequest(record.requests[id]) : null;
  }

  function start({ task, taskBranch = null, taskId = null, target = 'main', finalizationPaths = [] }) {
    const label = safeTask(task); const args = targetArgs(gitRoot, target);
    const id = taskId || `task-${randomUUID().replaceAll('-', '')}`;
    const branch = safeBranchName(taskBranch || `task/${id}`, 'task branch');
    const key = `${args.repository}::${id}`;
    const existing = store.read().starts[key];
    if (existing) {
      if (existing.task_branch !== branch) throw new Error(`task ${id} already started on ${existing.task_branch}; cannot resume with a different task branch`);
      if (existing.target !== args.target) throw new Error(`task ${id} already started against target ${existing.target}; cannot resume against a different target`);
      const validation = adapter.validateTaskGit({ root: gitRoot, taskBranch: branch, worktree: existing.worktree });
      if (!validation.ok)
        return { task_id: id, task: existing.task, task_branch: existing.task_branch, task_baseline: existing.task_baseline, worktree: existing.worktree, reused: true, state: 'RECOVERY_REQUIRED', recovery_detail: validation.detail };
      return { task_id: id, task: existing.task, task_branch: existing.task_branch, task_baseline: existing.task_baseline, worktree: existing.worktree, reused: true };
    }
    // Git worktree creation runs inside the locked mutation so a busy lock fails closed before any
    // git state is touched, rather than leaving an orphaned worktree with no persisted start record.
    let started = null;
    store.mutate(state => {
      if (state.starts[key]) return null; // lost a concurrent-start race; re-read below instead of double-creating
      started = adapter.startTaskGit({ root: gitRoot, taskBranch: branch, taskId: id });
      state.starts[key] = {
        schema_version: SCHEMA_VERSION, repository: args.repository, task_id: id, task: label, task_branch: branch, target: args.target,
        task_baseline: started.baseline, finalization_paths: safePaths(finalizationPaths), worktree: started.worktree,
        timestamps: { started_at: now(), updated_at: now() },
      };
      return null;
    });
    if (!started) {
      const raced = store.read().starts[key];
      return { task_id: id, task: raced.task, task_branch: raced.task_branch, task_baseline: raced.task_baseline, worktree: raced.worktree, reused: true };
    }
    return { task_id: id, task: label, task_branch: branch, task_baseline: started.baseline, worktree: started.worktree, reused: false };
  }

  function register({ task, taskBranch, taskBaseline, expectedTaskHead, target = 'main', finalizationPaths = [], taskId = null, taskLabel = null, verificationChecks = [] }) {
    const label = safeTask(task); const args = targetArgs(gitRoot, target); const branch = safeBranchName(taskBranch, 'task branch');
    if (!/^[0-9a-f]{40}$/i.test(expectedTaskHead) || !/^[0-9a-f]{40}$/i.test(taskBaseline)) throw new Error('task baseline and expected task head must be full Git SHAs');
    const checks = verificationChecks.map(safeVerificationCheck);
    return store.mutate(state => {
      const startRecord = findStartRecord(state, args.repository, branch, taskId);
      if (startRecord && startRecord.task_baseline !== taskBaseline)
        throw new Error(`task ${branch} was started from recorded baseline ${startRecord.task_baseline}; cannot register a different baseline ${taskBaseline}`);
      const record = targetRecord(state, args);
      const duplicate = Object.values(record.requests).find(request => request.task === label && request.task_branch === branch && request.expected_task_head === expectedTaskHead);
      if (duplicate) {
        if (JSON.stringify(duplicate.verification_checks || []) !== JSON.stringify(checks))
          throw new Error('verification checks are immutable once the exact task revision is registered');
        return publicRequest(duplicate);
      }
      const request = {
        schema_version: SCHEMA_VERSION, request_id: requestId(), repository: args.repository, target: args.target,
        task: label, task_id: startRecord?.task_id || taskId || null, task_label: boundedDisplayLabel(taskLabel || startRecord?.task || label),
        task_branch: branch, task_worktree: startRecord?.worktree || null,
        task_baseline: startRecord ? startRecord.task_baseline : taskBaseline, expected_task_head: expectedTaskHead,
        state: 'QUEUED', queue_order: record.queue.length, finalization_paths: safePaths(finalizationPaths), verification_checks: checks,
        timestamps: { submitted_at: now(), updated_at: now() }, history: [],
      };
      history(request, 'submitted'); record.requests[request.request_id] = request; record.queue.push(request.request_id); return publicRequest(request);
    });
  }

  function submit({ task, taskBranch, taskBaseline, paths, target = 'main', finalizationPaths = [], verificationChecks = [] }) {
    const published = publishScopedTask({ root, task, paths: safePaths(paths), branch: taskBranch, rejectOutsideDirty: true });
    const request = register({
      task: published.task, taskBranch: published.branch, taskBaseline, expectedTaskHead: published.head, target, finalizationPaths,
      taskLabel: published.identity?.label || null, verificationChecks,
    });
    const activated = advance({ target });
    return activated?.request_id === request.request_id ? activated : findRequest(request.request_id, target);
  }

  function claim(target) {
    const args = targetArgs(gitRoot, target);
    return store.mutate(state => {
      const record = targetRecord(state, args);
      if (record.active_request_id) return null;
      const id = record.queue.find(id => record.requests[id]?.state === 'QUEUED');
      if (!id) return null;
      const request = record.requests[id]; record.active_request_id = id; request.state = 'INTEGRATING'; history(request, 'activation-claimed'); return publicRequest(request);
    });
  }
  function transition(id, target, callback) {
    const args = targetArgs(gitRoot, target);
    return store.mutate(state => {
      const record = targetRecord(state, args); const request = record.requests[id];
      if (!request) throw new Error(`unknown integration request: ${id}`);
      callback(request, record); return publicRequest(request);
    });
  }

  function progressClaimed(claimed, target) {
    let taskHead;
    try {
      taskHead = adapter.fetchBranch(gitRoot, claimed.task_branch);
    } catch (error) {
      transition(claimed.request_id, target, (request, record) => { request.state = 'STALE_HEAD'; request.error = error.message; history(request, 'task-ref-unavailable', error.message); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    if (taskHead !== claimed.expected_task_head) {
      transition(claimed.request_id, target, (request, record) => { request.state = 'STALE_HEAD'; request.actual_task_head = taskHead; history(request, 'stale-head'); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    const mainBase = adapter.fetchBranch(gitRoot, claimed.target);
    const taskPaths = adapter.changedPaths(gitRoot, claimed.task_baseline, taskHead);
    const mainPaths = adapter.changedPaths(gitRoot, claimed.task_baseline, mainBase);
    const overlap = taskPaths.filter(path => mainPaths.includes(path));
    const candidate = adapter.createCandidate({ root: gitRoot, requestId: claimed.request_id, mainBase, taskHead, taskLabel: claimed.task_label });
    if (candidate.conflict) {
      transition(claimed.request_id, target, (request, record) => { request.main_base = mainBase; request.conflicts = candidate.conflicts; request.state = 'BLOCKED_CONFLICT'; history(request, 'merge-conflict'); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    return transition(claimed.request_id, target, request => {
      request.main_base = mainBase; request.candidate = candidate; request.risk = overlap.length ? { changed_path_overlap: overlap } : null;
      request.state = 'READY_FOR_FINALIZATION'; history(request, 'candidate-ready');
    });
  }
  function advance({ target = 'main' } = {}) {
    const claimed = claim(target); if (!claimed) return null;
    return progressClaimed(claimed, target);
  }

  function clearStartRecord(request) {
    if (!request.task_id) return;
    store.mutate(state => { delete state.starts[`${request.repository}::${request.task_id}`]; return null; });
  }

  function finish({ requestId: id, target = 'main' }) {
    const current = findRequest(id, target);
    if (!current) throw new Error(`unknown integration request: ${id}`);
    if (!['READY_FOR_FINALIZATION', 'QA_FAILED', 'PUSH_REJECTED', 'VERIFYING'].includes(current.state)) return current;
    if (current.state !== 'VERIFYING') transition(id, target, request => { request.state = 'VERIFYING'; history(request, 'verification-started'); });
    const request = findRequest(id, target);
    let head;
    try { head = adapter.commitCandidateFinalization({ root: gitRoot, request, paths: request.finalization_paths }); }
    catch (error) { return transition(id, target, request => { request.state = 'QA_FAILED'; request.qa = { detail: error.message }; history(request, 'finalization-scope-rejected'); }); }
    const changed = adapter.changedPaths(gitRoot, request.main_base, head);
    const qa = adapter.runCandidateQa({ root: gitRoot, worktree: request.candidate.worktree, changed, checks: request.verification_checks || [] });
    if (!qa.ok) return transition(id, target, request => { request.state = 'QA_FAILED'; request.qa = qa; history(request, 'candidate-qa-failed'); });
    const published = adapter.publishCandidateMain({ root: gitRoot, mainBase: request.main_base, candidateHead: head });
    if (published.state !== 'INTEGRATED') {
      const failed = transition(id, target, (request, record) => {
        request.state = published.state; request.error = published.detail || null; request.actual_main = published.current || null;
        history(request, published.state.toLowerCase());
        if (isTerminal(request.state)) release(record, request);
      });
      if (isTerminal(failed.state)) advance({ target });
      return failed;
    }
    const cleanupErrors = adapter.cleanupIntegrated({ root: gitRoot, candidate: request.candidate, taskBranch: request.task_branch, taskWorktree: request.task_worktree });
    const finalState = cleanupErrors.length ? 'INTEGRATED_CLEANUP_REQUIRED' : 'INTEGRATED';
    const integrated = transition(id, target, (request, record) => {
      request.state = finalState; request.main_before = request.main_base; request.main_after = published.main_after; request.candidate.head = head;
      request.cleanup_error = cleanupErrors.length ? cleanupErrors.join('; ') : null;
      history(request, finalState.toLowerCase()); release(record, request);
    });
    if (!cleanupErrors.length) clearStartRecord(integrated);
    advance({ target });
    return integrated;
  }

  function status({ requestId: id = null, target = 'main' } = {}) {
    if (id) return findRequest(id, target);
    const args = targetArgs(gitRoot, target); const record = store.read().targets[integrationTargetKey(args.repository, args.target)];
    return { repository: args.repository, target: args.target, active_request_id: record?.active_request_id || null, requests: Object.values(record?.requests || {}).map(publicRequest).sort((a, b) => a.queue_order - b.queue_order) };
  }
  function abort({ requestId: id, target = 'main' }) {
    const request = findRequest(id, target); if (!request) throw new Error(`unknown integration request: ${id}`);
    if (request.state === 'INTEGRATED' || request.state === 'INTEGRATED_CLEANUP_REQUIRED') throw new Error('an integrated request cannot be aborted');
    const cleanup = adapter.cleanupCandidate({ root: gitRoot, candidate: request.candidate, taskBranch: request.task_branch });
    const result = transition(id, target, (entry, record) => { entry.state = 'ABORTED'; entry.cleanup_error = cleanup.length ? cleanup.join('; ') : null; history(entry, 'aborted'); release(record, entry); });
    advance({ target }); return result;
  }
  async function awaitRequest({ requestId: id, target = 'main', timeoutMs = 30_000 }) {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const request = findRequest(id, target); if (!request) throw new Error(`unknown integration request: ${id}`);
      if (isTerminal(request.state) || isCallerAction(request.state)) return request;
      const remaining = deadline - Date.now(); if (remaining <= 0) return request;
      await store.waitForChange(Math.min(remaining, 30_000));
    }
  }
  function recover({ requestId: id, target = 'main', abort: shouldAbort = false }) {
    const request = findRequest(id, target); if (!request) throw new Error(`unknown integration request: ${id}`);
    if (shouldAbort) return abort({ requestId: id, target });
    if (request.state === 'INTEGRATING') return progressClaimed(request, target);
    if (request.state === 'VERIFYING') return finish({ requestId: id, target });
    if (request.state === 'INTEGRATED_CLEANUP_REQUIRED') {
      adapter.fetchBranch(gitRoot, request.target);
      if (!adapter.isAncestor({ root: gitRoot, ancestor: request.expected_task_head, ref: `refs/remotes/origin/${request.target}` }))
        return { ...request, recovery: 'recorded task head is not proven contained in current main; refusing bounded stale-branch cleanup' };
      const cleanupErrors = adapter.cleanupIntegrated({ root: gitRoot, candidate: request.candidate, taskBranch: request.task_branch, taskWorktree: request.task_worktree });
      const recovered = transition(id, target, request => {
        request.cleanup_error = cleanupErrors.length ? cleanupErrors.join('; ') : null;
        request.state = cleanupErrors.length ? 'INTEGRATED_CLEANUP_REQUIRED' : 'INTEGRATED';
        history(request, cleanupErrors.length ? 'cleanup-retry-failed' : 'cleanup-recovered');
      });
      if (!cleanupErrors.length) clearStartRecord(recovered);
      return recovered;
    }
    if (isCallerAction(request.state)) return { ...request, recovery: 'explicit repair then finish (or abort) is required; the active candidate was not stolen' };
    return request;
  }
  function recoverLock() { return store.recoverStaleLock ? store.recoverStaleLock() : { recovered: false, detail: 'store does not support lock recovery' }; }
  return { start, register, submit, advance, finish, status, abort, recover, recoverLock, await: awaitRequest };
}
