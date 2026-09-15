import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runGit, safeBranchName } from './git-publication.mjs';
import { boundedDisplayLabel } from './task-identity.mjs';

function safeId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new Error('integration request id is unsafe');
  return value;
}

/** Normalizes an origin remote into a credential-free, scheme/host/path identity shared by equivalent clones. */
export function normalizeRepositoryRemote(remote) {
  const value = String(remote || '').trim().replace(/\.git$/i, '');
  if (!value) throw new Error('remote.origin.url is empty');
  const scpLike = /^(?:[^@/\s]+@)?([^:/\s]+):(.+)$/.exec(value);
  if (scpLike && !/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    const host = scpLike[1].toLowerCase();
    const path = scpLike[2].replace(/^\/+/, '').replace(/\/+$/, '');
    return `git://${host}/${path}`;
  }
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const path = url.pathname.replace(/^\/+/, '').replace(/\/+$/, '');
    return `git://${host}/${path}`;
  } catch {
    // No scheme/host (e.g. a local filesystem remote in tests): the literal path is the only stable identity.
    return `git://local/${value.replace(/^\/+/, '')}`;
  }
}
export function repositoryIdentity(root = process.cwd()) {
  const remote = runGit(root, ['config', '--get', 'remote.origin.url']);
  return normalizeRepositoryRemote(remote);
}
export function commonGitDir(root = process.cwd()) { return resolve(root, runGit(root, ['rev-parse', '--git-common-dir'])); }
export function remoteHead(root, branch) {
  const safe = safeBranchName(branch, 'remote branch');
  const output = runGit(root, ['ls-remote', 'origin', `refs/heads/${safe}`]);
  return output ? output.split(/\s+/)[0] : null;
}
export function fetchBranch(root, branch) {
  const safe = safeBranchName(branch, 'branch');
  runGit(root, ['fetch', 'origin', `refs/heads/${safe}:refs/remotes/origin/${safe}`], { quiet: false });
  return runGit(root, ['rev-parse', `refs/remotes/origin/${safe}`]);
}
export function changedPaths(root, from, to) {
  return runGit(root, ['diff', '--name-only', `${from}..${to}`]).split('\n').filter(Boolean).sort();
}
export function isAncestor({ root = process.cwd(), ancestor, ref }) {
  try { runGit(root, ['merge-base', '--is-ancestor', ancestor, ref]); return true; }
  catch { return false; }
}

export function validateTaskGit({ root = process.cwd(), taskBranch, worktree }) {
  const branch = safeBranchName(taskBranch, 'task branch');
  if (!worktree || !existsSync(worktree)) return { ok: false, detail: `recorded task worktree is missing: ${worktree}` };
  let checkedOutBranch;
  try { checkedOutBranch = runGit(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']); }
  catch (error) { return { ok: false, detail: `recorded task worktree is not a valid git checkout: ${error.message}` }; }
  if (checkedOutBranch !== branch) return { ok: false, detail: `recorded task worktree is checked out on ${checkedOutBranch}, not ${branch}` };
  return { ok: true };
}

export function startTaskGit({ root = process.cwd(), taskBranch, taskId }) {
  const branch = safeBranchName(taskBranch, 'task branch');
  const id = safeId(taskId);
  const worktree = join(commonGitDir(root), 'task-integration', 'tasks', id);
  if (existsSync(worktree)) throw new Error(`task worktree already exists without a recorded task-start context: ${worktree}; recover or remove it explicitly before starting`);
  const baseline = fetchBranch(root, 'main');
  mkdirSync(dirname(worktree), { recursive: true, mode: 0o700 });
  let local = null;
  try { local = runGit(root, ['rev-parse', '--verify', `refs/heads/${branch}`]); } catch { /* branch will be created */ }
  if (!local) runGit(root, ['branch', branch, baseline]);
  runGit(root, ['worktree', 'add', worktree, branch], { quiet: false });
  return { baseline, branch, worktree };
}

function candidatePaths(root, requestId) {
  const id = safeId(requestId);
  return { id, branch: `task-integrate/candidate/${id}`, worktree: join(commonGitDir(root), 'task-integration', 'candidates', id) };
}

/** Resumes a candidate left behind by a crash between `worktree add` and the completed merge, if it is cleanly reusable. */
function resumableCandidate(worktree, branch) {
  if (!existsSync(worktree)) return null;
  try {
    const gitDir = runGit(worktree, ['rev-parse', '--git-dir']);
    if (existsSync(resolve(worktree, gitDir, 'MERGE_HEAD'))) { try { runGit(worktree, ['merge', '--abort']); } catch { /* fall through to rebuild */ } }
  } catch { return null; }
  let checkedOutBranch;
  try { checkedOutBranch = runGit(worktree, ['rev-parse', '--abbrev-ref', 'HEAD']); } catch { return null; }
  if (checkedOutBranch !== branch) return null;
  const conflicted = runGit(worktree, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean);
  if (conflicted.length) return null;
  return runGit(worktree, ['rev-parse', 'HEAD']);
}

export function createCandidate({ root = process.cwd(), requestId, mainBase, taskHead, taskLabel = 'task' }) {
  const { id, branch, worktree } = candidatePaths(root, requestId);
  let head = existsSync(worktree) ? resumableCandidate(worktree, branch) : null;
  if (existsSync(worktree) && head === null) {
    try { runGit(root, ['worktree', 'remove', '--force', worktree]); } catch { /* caller will report recovery evidence if this leaves state behind */ }
    try { runGit(root, ['branch', '-D', branch]); } catch { /* no branch after a failed add is fine */ }
  }
  if (head === null) {
    mkdirSync(dirname(worktree), { recursive: true, mode: 0o700 });
    runGit(root, ['worktree', 'add', '-b', branch, worktree, mainBase], { quiet: false });
    try {
      runGit(worktree, ['merge', '--no-ff', '-m', `Integrate ${boundedDisplayLabel(taskLabel)}`, taskHead], { quiet: false });
    } catch (error) {
      const conflicts = runGit(worktree, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean).sort();
      try { runGit(worktree, ['merge', '--abort']); } catch { /* cleanup continues */ }
      try { runGit(root, ['worktree', 'remove', '--force', worktree]); } catch { /* caller will report recovery evidence */ }
      try { runGit(root, ['branch', '-D', branch]); } catch { /* no branch after failed add is fine */ }
      return { conflict: true, conflicts, error: error.message };
    }
    head = runGit(worktree, ['rev-parse', 'HEAD']);
  }
  runGit(root, ['push', 'origin', `refs/heads/${branch}:refs/heads/${branch}`], { quiet: false });
  return { conflict: false, branch, worktree, head };
}
export function candidateHead(root, worktree) { return runGit(worktree, ['rev-parse', 'HEAD']); }
export function candidateDirtyPaths(worktree) {
  const output = runGit(worktree, ['status', '--porcelain=v1', '-z'], { trim: false });
  return [...new Set(output.split('\0').filter(Boolean).map(line => line.slice(3)).filter(Boolean))].sort();
}
export function commitCandidateFinalization({ root = process.cwd(), request, paths }) {
  const dirty = candidateDirtyPaths(request.candidate.worktree);
  const allowed = new Set(paths);
  const outside = dirty.filter(path => !allowed.has(path));
  if (outside.length) throw new Error(`candidate contains changes outside finalization scope: ${outside.join(', ')}`);
  if (!dirty.length) return candidateHead(root, request.candidate.worktree);
  runGit(request.candidate.worktree, ['add', '--', ...dirty]);
  runGit(request.candidate.worktree, ['commit', '-m', `Finalize ${boundedDisplayLabel(request.task_label || request.task)}`], { quiet: false });
  const head = candidateHead(root, request.candidate.worktree);
  runGit(root, ['push', 'origin', `refs/heads/${request.candidate.branch}:refs/heads/${request.candidate.branch}`], { quiet: false });
  return head;
}
function runProcess(cwd, argv) {
  const [command, ...args] = argv;
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', shell: false });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return { ok: !result.error && result.status === 0, detail: output.replace(/\s+/g, ' ').slice(0, 600), error: result.error?.message || null };
}
/**
 * Always runs the mandatory changed-path gate, then any immutable plan-selected structured checks
 * (argv + optional bounded cwd only — never a shell string, never request-provided env replacement).
 */
export function runCandidateQa({ root = process.cwd(), worktree, changed, checks = [] }) {
  const primary = runProcess(worktree, [process.execPath, 'scripts/qa-gate.mjs', '--changed', ...changed]);
  if (!primary.ok) return { ...primary, check: 'changed-path' };
  for (const check of checks) {
    const cwd = check.cwd ? resolve(worktree, check.cwd) : worktree;
    const result = runProcess(cwd, check.argv);
    if (!result.ok) return { ...result, check: check.label || check.argv.join(' ') };
  }
  return { ok: true, detail: primary.detail, error: null };
}
export function publishCandidateMain({ root = process.cwd(), mainBase, candidateHead: head }) {
  const current = fetchBranch(root, 'main');
  if (current !== mainBase) return { state: 'STALE_MAIN', current };
  try { runGit(root, ['push', 'origin', `${head}:refs/heads/main`], { quiet: false }); }
  catch (error) { return { state: 'PUSH_REJECTED', detail: error.message }; }
  const verified = fetchBranch(root, 'main');
  if (verified !== head) return { state: 'RECOVERY_REQUIRED', detail: 'remote main did not resolve to the published candidate head' };
  return { state: 'INTEGRATED', main_after: verified };
}
/** Candidate-only cleanup used when a request will not integrate (abort/QA-failed): the task branch is retained. */
export function cleanupCandidate({ root = process.cwd(), candidate, taskBranch = null }) {
  const errors = [];
  try { if (candidate?.worktree && existsSync(candidate.worktree)) runGit(root, ['worktree', 'remove', '--force', candidate.worktree]); } catch (error) { errors.push(error.message); }
  try { if (candidate?.branch) runGit(root, ['branch', '-D', candidate.branch]); } catch (error) { errors.push(error.message); }
  try { if (candidate?.branch) runGit(root, ['push', 'origin', `:refs/heads/${candidate.branch}`]); } catch (error) { errors.push(error.message); }
  // Task branches are retained as portable review history unless a caller explicitly removes them.
  void taskBranch;
  return errors;
}
/** Full post-integration cleanup: candidate refs plus the exact recorded task worktree/branch, never a name sweep. */
export function cleanupIntegrated({ root = process.cwd(), candidate, taskBranch = null, taskWorktree = null }) {
  const errors = [];
  try { if (candidate?.branch) runGit(root, ['push', 'origin', `:refs/heads/${candidate.branch}`]); } catch (error) { errors.push(`remote candidate branch: ${error.message}`); }
  try { if (candidate?.worktree && existsSync(candidate.worktree)) runGit(root, ['worktree', 'remove', '--force', candidate.worktree]); } catch (error) { errors.push(`candidate worktree: ${error.message}`); }
  try { if (candidate?.branch) runGit(root, ['branch', '-D', candidate.branch]); } catch (error) { errors.push(`local candidate branch: ${error.message}`); }
  try { if (taskWorktree && existsSync(taskWorktree)) runGit(root, ['worktree', 'remove', '--force', taskWorktree]); } catch (error) { errors.push(`task worktree: ${error.message}`); }
  try { if (taskBranch) runGit(root, ['branch', '-D', taskBranch]); }
  catch (error) { if (!/not fully merged|checked out|not found|cannot delete/i.test(error.message)) errors.push(`local task branch: ${error.message}`); }
  try { if (taskBranch) runGit(root, ['push', 'origin', `:refs/heads/${taskBranch}`]); } catch (error) { errors.push(`remote task branch: ${error.message}`); }
  const remaining = [];
  if (candidate?.branch) { try { if (remoteHead(root, candidate.branch)) remaining.push(`remote ${candidate.branch}`); } catch { /* an ls-remote failure is not proof the ref remains */ } }
  if (taskBranch) { try { if (remoteHead(root, taskBranch)) remaining.push(`remote ${taskBranch}`); } catch { /* an ls-remote failure is not proof the ref remains */ } }
  if (remaining.length) errors.push(`refs still present after cleanup: ${remaining.join(', ')}`);
  return errors;
}
