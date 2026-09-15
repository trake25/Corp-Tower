import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { runGit, safeBranchName } from './git-publication.mjs';

function safeId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value)) throw new Error('integration request id is unsafe');
  return value;
}
export function repositoryIdentity(root = process.cwd()) {
  const remote = runGit(root, ['config', '--get', 'remote.origin.url']);
  return `${remote}#${commonGitDir(root)}`;
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
export function startTaskGit({ root = process.cwd(), taskBranch, taskId }) {
  const branch = safeBranchName(taskBranch, 'task branch');
  const id = safeId(taskId);
  const baseline = fetchBranch(root, 'main');
  const worktree = join(commonGitDir(root), 'task-integration', 'tasks', id);
  if (existsSync(worktree)) return { baseline, branch, worktree, reused: true };
  mkdirSync(dirname(worktree), { recursive: true, mode: 0o700 });
  let local = null;
  try { local = runGit(root, ['rev-parse', '--verify', `refs/heads/${branch}`]); } catch { /* branch will be created */ }
  if (!local) runGit(root, ['branch', branch, baseline]);
  runGit(root, ['worktree', 'add', worktree, branch], { quiet: false });
  return { baseline, branch, worktree, reused: false };
}
export function createCandidate({ root = process.cwd(), requestId, mainBase, taskHead }) {
  const id = safeId(requestId);
  const branch = `task-integrate/candidate/${id}`;
  const worktree = join(commonGitDir(root), 'task-integration', 'candidates', id);
  if (existsSync(worktree)) throw new Error(`candidate worktree already exists for ${id}; recover or abort it explicitly`);
  mkdirSync(dirname(worktree), { recursive: true, mode: 0o700 });
  runGit(root, ['worktree', 'add', '-b', branch, worktree, mainBase], { quiet: false });
  try {
    runGit(worktree, ['merge', '--no-ff', '--no-edit', taskHead], { quiet: false });
  } catch (error) {
    const conflicts = runGit(worktree, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean).sort();
    try { runGit(worktree, ['merge', '--abort']); } catch { /* cleanup continues */ }
    try { runGit(root, ['worktree', 'remove', '--force', worktree]); } catch { /* caller will report recovery evidence */ }
    try { runGit(root, ['branch', '-D', branch]); } catch { /* no branch after failed add is fine */ }
    return { conflict: true, conflicts, error: error.message };
  }
  const head = runGit(worktree, ['rev-parse', 'HEAD']);
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
  runGit(request.candidate.worktree, ['commit', '-m', `Finalize integration ${request.request_id}`], { quiet: false });
  const head = candidateHead(root, request.candidate.worktree);
  runGit(root, ['push', 'origin', `refs/heads/${request.candidate.branch}:refs/heads/${request.candidate.branch}`], { quiet: false });
  return head;
}
export function runCandidateQa({ root = process.cwd(), worktree, changed }) {
  const result = spawnSync(process.execPath, ['scripts/qa-gate.mjs', '--changed', ...changed], { cwd: worktree, encoding: 'utf8' });
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  return { ok: !result.error && result.status === 0, detail: output.replace(/\s+/g, ' ').slice(0, 600), error: result.error?.message || null };
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
export function cleanupCandidate({ root = process.cwd(), candidate, taskBranch = null }) {
  const errors = [];
  try { if (candidate?.worktree && existsSync(candidate.worktree)) runGit(root, ['worktree', 'remove', '--force', candidate.worktree]); } catch (error) { errors.push(error.message); }
  try { if (candidate?.branch) runGit(root, ['branch', '-D', candidate.branch]); } catch (error) { errors.push(error.message); }
  try { if (candidate?.branch) runGit(root, ['push', 'origin', `:refs/heads/${candidate.branch}`]); } catch (error) { errors.push(error.message); }
  // Task branches are retained as portable review history unless a caller explicitly removes them.
  return errors;
}
export function removeTaskWorktree({ root = process.cwd(), worktree }) {
  if (worktree && existsSync(worktree)) runGit(root, ['worktree', 'remove', '--force', worktree]);
}
