import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, rmdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  appendHistory, compactIfTerminal, createFilesystemIntegrationStore, integrationTargetKey, isCallerAction, isTerminal, nextQueueOrder,
  publicRequest, targetRecord,
} from './task-integration-state.mjs';
import {
  candidateDirtyPaths, candidateHead, changedPaths, cleanupCandidate, cleanupIntegrated, commitCandidateFinalization, commonGitDir,
  createCandidate, fetchBranch, isAncestor, publishCandidateMain, pruneWorktrees, remoteHead, repositoryIdentity, runCandidateQa,
  startTaskGit, validateTaskGit,
} from './task-integration-git.mjs';
import { publishScopedTask, safeBranchName } from './git-publication.mjs';
import { boundedDisplayLabel } from './task-identity.mjs';

const SCHEMA_VERSION = 2;
const safeTask = value => {
  if (typeof value !== 'string' || !value.trim() || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) throw new Error('task must be 1-120 printable characters');
  return value.trim().replace(/\s+/g, ' ');
};
const safePaths = paths => {
  if (!Array.isArray(paths)) throw new Error('paths must be an array');
  return [...new Set(paths)].sort();
};
/**
 * Platform-neutral string gate: rejects any absolute, drive-letter, UNC, or traversal form on
 * either separator, independent of the OS this validation happens to run on. `runCandidateQa`'s
 * `resolveContainedCwd` is the second, filesystem-aware gate that proves containment (including
 * against a symlink escape) once the candidate worktree actually exists.
 */
function safeRelativeCwd(cwd) {
  if (typeof cwd !== 'string' || !cwd.length || /[\x00-\x1f]/.test(cwd)) throw new Error('verification check cwd must be a non-empty bounded repository-relative path');
  if (/^[A-Za-z]:/.test(cwd)) throw new Error('verification check cwd must not be a drive-letter path');
  if (/^[\\/]{2}/.test(cwd)) throw new Error('verification check cwd must not be a UNC path');
  if (/^[\\/]/.test(cwd)) throw new Error('verification check cwd must not be an absolute path');
  if (cwd.split(/[\\/]+/).some(part => part === '..')) throw new Error('verification check cwd must not traverse outside its root');
  return cwd;
}
function safeVerificationCheck(check) {
  if (!check || typeof check !== 'object' || Array.isArray(check)) throw new Error('verification check must be an object');
  const { argv, cwd = null, label = null } = check;
  if (!Array.isArray(argv) || !argv.length || argv.some(part => typeof part !== 'string' || !part.length))
    throw new Error('verification check argv must be a non-empty array of strings');
  if (cwd !== null) safeRelativeCwd(cwd);
  if (label !== null && (typeof label !== 'string' || !label.trim())) throw new Error('verification check label must be a non-empty string');
  return { argv: [...argv], cwd, label };
}
const requestId = () => `integration-${randomUUID().replaceAll('-', '')}`;
const now = () => new Date().toISOString();
function targetArgs(gitRoot, target = 'main') { return { repository: repositoryIdentity(gitRoot), target: safeBranchName(target, 'target branch') }; }
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
    fetchBranch, remoteHead, changedPaths, createCandidate, candidateHead, candidateDirtyPaths, commitCandidateFinalization, runCandidateQa,
    publishCandidateMain, cleanupCandidate, cleanupIntegrated, startTaskGit, validateTaskGit, isAncestor, pruneWorktrees,
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
        if (!duplicate.compacted && JSON.stringify(duplicate.verification_checks || []) !== JSON.stringify(checks))
          throw new Error('verification checks are immutable once the exact task revision is registered');
        return publicRequest(duplicate);
      }
      const request = {
        schema_version: SCHEMA_VERSION, request_id: requestId(), repository: args.repository, target: args.target,
        task: label, task_id: startRecord?.task_id || taskId || null, task_label: boundedDisplayLabel(taskLabel || startRecord?.task || label),
        task_branch: branch, task_worktree: startRecord?.worktree || null,
        task_baseline: startRecord ? startRecord.task_baseline : taskBaseline, expected_task_head: expectedTaskHead,
        state: 'QUEUED', queue_order: nextQueueOrder(record), finalization_paths: safePaths(finalizationPaths), verification_checks: checks,
        cleanup_progress: null, timestamps: { submitted_at: now(), updated_at: now() }, history: [],
      };
      appendHistory(request, 'submitted'); record.requests[request.request_id] = request; record.queue.push(request.request_id); return publicRequest(request);
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
      const request = record.requests[id]; record.active_request_id = id; request.state = 'INTEGRATING'; appendHistory(request, 'activation-claimed'); return publicRequest(request);
    });
  }
  /** Every terminal-setting mutation flows through here: it returns the full rich view computed at
   *  the moment of the call, then (only for storage going forward) compacts an already-settled
   *  compactable-terminal request to its bounded summary — the caller that just triggered this exact
   *  transition still sees full detail; a later `status`/`findRequest` sees the slim persisted form. */
  function transition(id, target, callback) {
    const args = targetArgs(gitRoot, target);
    return store.mutate(state => {
      const record = targetRecord(state, args); const request = record.requests[id];
      if (!request) throw new Error(`unknown integration request: ${id}`);
      callback(request, record);
      const view = publicRequest(request);
      compactIfTerminal(record, request);
      return view;
    });
  }

  function progressClaimed(claimed, target) {
    let taskHead;
    try {
      taskHead = adapter.fetchBranch(gitRoot, claimed.task_branch);
    } catch (error) {
      transition(claimed.request_id, target, (request, record) => { request.state = 'STALE_HEAD'; request.error = error.message; appendHistory(request, 'task-ref-unavailable', error.message); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    if (taskHead !== claimed.expected_task_head) {
      transition(claimed.request_id, target, (request, record) => { request.state = 'STALE_HEAD'; request.actual_task_head = taskHead; appendHistory(request, 'stale-head'); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    const mainBase = adapter.fetchBranch(gitRoot, claimed.target);
    const taskPaths = adapter.changedPaths(gitRoot, claimed.task_baseline, taskHead);
    const mainPaths = adapter.changedPaths(gitRoot, claimed.task_baseline, mainBase);
    const overlap = taskPaths.filter(path => mainPaths.includes(path));
    const candidate = adapter.createCandidate({ root: gitRoot, requestId: claimed.request_id, mainBase, taskHead, taskLabel: claimed.task_label });
    if (candidate.conflict) {
      transition(claimed.request_id, target, (request, record) => { request.main_base = mainBase; request.conflicts = candidate.conflicts; request.state = 'BLOCKED_CONFLICT'; appendHistory(request, 'merge-conflict'); release(record, request); });
      return advance({ target }) || findRequest(claimed.request_id, target);
    }
    return transition(claimed.request_id, target, request => {
      request.main_base = mainBase; request.candidate = candidate; request.risk = overlap.length ? { changed_path_overlap: overlap } : null;
      request.state = 'READY_FOR_FINALIZATION'; appendHistory(request, 'candidate-ready');
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

  /** Shared by `finish()`'s own publish attempt and `recover()`'s RECOVERY_REQUIRED reconciliation. */
  function applyPublishResult(id, target, head, published) {
    if (published.state !== 'INTEGRATED') {
      const failed = transition(id, target, (request, record) => {
        request.state = published.state; request.error = published.detail || null; request.actual_main = published.current || null;
        appendHistory(request, published.state.toLowerCase());
        if (isTerminal(request.state)) release(record, request);
      });
      if (isTerminal(failed.state)) advance({ target });
      return failed;
    }
    const request = findRequest(id, target);
    const cleanup = adapter.cleanupIntegrated({
      root: gitRoot, candidate: request.candidate, taskBranch: request.task_branch, taskWorktree: request.task_worktree,
      verifiedHead: head, progress: request.cleanup_progress || {},
    });
    const finalState = cleanup.errors.length ? 'INTEGRATED_CLEANUP_REQUIRED' : 'INTEGRATED';
    const integrated = transition(id, target, (request, record) => {
      request.state = finalState; request.main_before = request.main_base; request.main_after = published.main_after; request.candidate.head = head;
      request.cleanup_error = cleanup.errors.length ? cleanup.errors.join('; ') : null; request.cleanup_progress = cleanup.progress;
      appendHistory(request, finalState.toLowerCase()); release(record, request);
    });
    if (!cleanup.errors.length) clearStartRecord(integrated);
    advance({ target });
    return integrated;
  }

  /**
   * A `PUSH_REJECTED` retry must classify remote `main` against the persisted `verified_candidate_head`
   * and recorded `main_base` *before* any candidate commit, QA, or mutation:
   *  - already reached (an ancestor of) remote main -> the push actually landed; reconcile via
   *    `applyPublishResult`'s own divergence-aware cleanup instead of ever publishing again;
   *  - still exactly at the recorded base, candidate unchanged -> retry the exact verified head
   *    directly, skipping unnecessary re-finalization/QA;
   *  - still exactly at the recorded base, candidate changed -> return null so the standard
   *    finalization/QA/publish cycle in `finish()` runs and mints a new verified head;
   *  - moved to anything else -> `STALE_MAIN` immediately, before the candidate worktree is ever
   *    touched (so dirty/out-of-scope candidate content never gets committed or QA'd first);
   *  - remote unreadable -> a retained, non-mutating recoverable result (never a blind publish/retry).
   */
  function reconcilePushRejected(id, target, request) {
    const verifiedHead = request.verified_candidate_head;
    if (!verifiedHead) return null;
    let remoteMain;
    try { remoteMain = adapter.fetchBranch(gitRoot, request.target); }
    catch (error) { return { ...request, recovery: `remote main could not be verified: ${error.message}` }; }

    if (adapter.isAncestor({ root: gitRoot, ancestor: verifiedHead, ref: `refs/remotes/origin/${request.target}` }))
      return applyPublishResult(id, target, verifiedHead, { state: 'INTEGRATED', main_after: remoteMain });

    if (remoteMain !== request.main_base)
      return transition(id, target, (entry, record) => { entry.state = 'STALE_MAIN'; entry.actual_main = remoteMain; appendHistory(entry, 'stale-main'); release(record, entry); });

    const dirty = adapter.candidateDirtyPaths(request.candidate.worktree);
    const actualHead = adapter.candidateHead(gitRoot, request.candidate.worktree);
    if (dirty.length || actualHead !== verifiedHead) return null; // candidate changed: let the standard cycle mint a fresh verified head

    let published;
    try { published = adapter.publishCandidateMain({ root: gitRoot, mainBase: request.main_base, candidateHead: verifiedHead }); }
    catch (error) { return { ...request, recovery: `remote main could not be verified: ${error.message}` }; }
    return applyPublishResult(id, target, verifiedHead, published);
  }

  function finish({ requestId: id, target = 'main' }) {
    const current = findRequest(id, target);
    if (!current) throw new Error(`unknown integration request: ${id}`);
    if (!['READY_FOR_FINALIZATION', 'QA_FAILED', 'PUSH_REJECTED', 'VERIFYING'].includes(current.state)) return current;
    if (current.state === 'PUSH_REJECTED') {
      const reconciled = reconcilePushRejected(id, target, current);
      if (reconciled) return reconciled;
    }
    if (current.state !== 'VERIFYING') transition(id, target, request => { request.state = 'VERIFYING'; appendHistory(request, 'verification-started'); });
    const request = findRequest(id, target);
    let head;
    try { head = adapter.commitCandidateFinalization({ root: gitRoot, request, paths: request.finalization_paths }); }
    catch (error) { return transition(id, target, request => { request.state = 'QA_FAILED'; request.qa = { detail: error.message }; appendHistory(request, 'finalization-scope-rejected'); }); }
    const changed = adapter.changedPaths(gitRoot, request.main_base, head);
    const qa = adapter.runCandidateQa({ root: gitRoot, worktree: request.candidate.worktree, changed, checks: request.verification_checks || [] });
    if (!qa.ok) return transition(id, target, request => { request.state = 'QA_FAILED'; request.qa = qa; appendHistory(request, 'candidate-qa-failed'); });
    // Persist the exact QA-passed head before any push attempt: publication and later recovery
    // must use this immutable SHA, never the candidate worktree's current mutable HEAD.
    transition(id, target, request => { request.verified_candidate_head = head; appendHistory(request, 'candidate-verified'); });
    const published = adapter.publishCandidateMain({ root: gitRoot, mainBase: request.main_base, candidateHead: head });
    return applyPublishResult(id, target, head, published);
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
    const result = transition(id, target, (entry, record) => { entry.state = 'ABORTED'; entry.cleanup_error = cleanup.length ? cleanup.join('; ') : null; appendHistory(entry, 'aborted'); release(record, entry); });
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
      const cleanup = adapter.cleanupIntegrated({
        root: gitRoot, candidate: request.candidate, taskBranch: request.task_branch, taskWorktree: request.task_worktree,
        verifiedHead: request.candidate?.head || request.verified_candidate_head || null, progress: request.cleanup_progress || {},
      });
      const recovered = transition(id, target, request => {
        request.cleanup_error = cleanup.errors.length ? cleanup.errors.join('; ') : null; request.cleanup_progress = cleanup.progress;
        request.state = cleanup.errors.length ? 'INTEGRATED_CLEANUP_REQUIRED' : 'INTEGRATED';
        appendHistory(request, cleanup.errors.length ? 'cleanup-retry-failed' : 'cleanup-recovered');
      });
      if (!cleanup.errors.length) clearStartRecord(recovered);
      return recovered;
    }
    if (request.state === 'RECOVERY_REQUIRED') {
      // Reconcile deterministically against the verified-exact candidate identity: already
      // published -> integrated/cleanup; remote still at recorded base -> safe exact-head retry;
      // remote moved elsewhere -> STALE_MAIN. `publishCandidateMain` distinguishes all three.
      // Evidence that cannot be read (network/ref failure) must never advance or blindly republish,
      // so the request is left exactly as-is, still RECOVERY_REQUIRED.
      const head = request.verified_candidate_head;
      if (!head) return { ...request, recovery: 'no verified candidate head is recorded; explicit repair then finish is required' };
      let published;
      try { published = adapter.publishCandidateMain({ root: gitRoot, mainBase: request.main_base, candidateHead: head }); }
      catch (error) { return { ...request, recovery: `remote main could not be verified: ${error.message}` }; }
      return applyPublishResult(id, target, head, published);
    }
    if (isCallerAction(request.state)) return { ...request, recovery: 'explicit repair then finish (or abort) is required; the active candidate was not stolen' };
    return request;
  }
  function recoverLock() { return store.recoverStaleLock ? store.recoverStaleLock() : { recovered: false, detail: 'store does not support lock recovery' }; }

  /**
   * Safe, bounded housekeeping: never touches a worktree/branch still referenced by live state, never
   * sweeps remote branches by prefix, and never deletes a non-empty orphan directory — dirty/diverged/
   * unproven orphan candidate or task work is preserved and reported, not guessed away.
   */
  function gc() {
    const prunedTemp = store.pruneOrphanArtifacts ? store.pruneOrphanArtifacts() : { removed: [] };
    adapter.pruneWorktrees(gitRoot);
    const state = store.read();
    const known = new Set();
    for (const record of Object.values(state.targets)) {
      for (const request of Object.values(record.requests)) {
        if (request.candidate?.worktree) known.add(resolve(request.candidate.worktree));
        if (request.task_worktree) known.add(resolve(request.task_worktree));
      }
    }
    for (const entry of Object.values(state.starts)) if (entry.worktree) known.add(resolve(entry.worktree));

    const removedDirectories = []; const preservedOrphans = [];
    for (const kind of ['tasks', 'candidates']) {
      const dir = join(store.base, kind);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        const path = resolve(dir, name);
        if (known.has(path)) continue;
        let entries;
        try { entries = readdirSync(path); } catch { continue; }
        if (!entries.length) { try { rmdirSync(path); removedDirectories.push(path); } catch { /* best-effort */ } }
        else preservedOrphans.push(path);
      }
    }
    return { pruned_temp_files: prunedTemp.removed, removed_directories: removedDirectories, preserved_orphans: preservedOrphans };
  }

  return { start, register, submit, advance, finish, status, abort, recover, recoverLock, gc, await: awaitRequest };
}
