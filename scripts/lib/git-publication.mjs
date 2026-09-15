import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { publicQaReceiptPath } from './qa-receipt.mjs';
import { createTaskIdentity, taskIdentityForManifest } from './task-identity.mjs';
import { repositoryRelativePath, resolveTaskOwnership } from './task-ownership.mjs';

export function safeBranchName(input, label = 'branch') {
  if (!input || !/^[A-Za-z0-9._/-]+$/.test(input) || input.startsWith('/') || input.startsWith('.') || input.endsWith('/') || input.endsWith('.') || input.includes('..') || input.includes('@{'))
    throw new Error(`${label} is not a safe branch name`);
  return input;
}

export function runGit(root, args, { quiet = true } = {}) {
  try {
    const output = execFileSync('git', ['-C', resolve(root), ...args], {
      encoding: 'utf8', stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    });
    return typeof output === 'string' ? output.trim() : '';
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}

export function manifestScope(manifest) {
  if (!manifest.task) throw new Error('manifest must contain a task');
  if ([2, 3, 4].includes(manifest.schema_version)) {
    const verification = manifest.verification?.status;
    if (manifest.phase !== 'closed' || !['passed', 'maintenance-blocked'].includes(verification))
      throw new Error('schema-v2 manifest must have terminal closeout verification');
    if (!Array.isArray(manifest.publish_paths) || !manifest.publish_paths.length)
      throw new Error('schema-v2 manifest must contain publish_paths');
    const publicReceipt = manifest.verification?.public_receipt || null;
    if (verification === 'maintenance-blocked' && !manifest.task_identity)
      throw new Error('maintenance-blocked publication requires a persisted task identity');
    if (manifest.task_identity && (!publicReceipt || !manifest.publish_paths.includes(publicReceipt)))
      throw new Error('task identity publication requires its public QA receipt in publish_paths');
    return { task: manifest.task, paths: [...new Set(manifest.publish_paths)], task_identity: manifest.task_identity || null, public_receipt: publicReceipt };
  }
  if (!Array.isArray(manifest.changed_paths) || !manifest.changed_paths.length)
    throw new Error('schema-v1 manifest must contain changed_paths');
  return { task: manifest.task, paths: [...new Set(manifest.changed_paths)], task_identity: null, public_receipt: null };
}

export function explicitPathScope({ task, paths, ownership = null, root = process.cwd() }) {
  if (typeof task !== 'string' || !task.trim() || task.trim().length > 120)
    throw new Error('explicit publication task is required');
  if (!Array.isArray(paths) || !paths.length) throw new Error('explicit publication requires one or more repository-relative paths');
  const scope = [...new Set(paths.map(path => repositoryRelativePath(root, path, 'publication path')))].sort();
  let ownershipRecord = null;
  if (ownership) {
    ownershipRecord = resolveTaskOwnership({ path: ownership }, { root });
    if (ownershipRecord.task !== task.trim().replace(/\s+/g, ' ')) throw new Error('publication task does not match supplied task ownership');
    const outside = scope.filter(path => !ownershipRecord.owned_paths.includes(path));
    if (outside.length) throw new Error(`publication paths outside supplied task ownership: ${outside.join(', ')}`);
  }
  return { task: task.trim().replace(/\s+/g, ' '), paths: scope, task_identity: null, public_receipt: null,
    ownership: ownershipRecord ? { path: ownershipRecord.path, run_id: ownershipRecord.run_id, status: ownershipRecord.status } : null };
}

export function validatePublicReceiptEvidence(manifest, root = process.cwd()) {
  const scope = manifestScope(manifest);
  if (!scope.task_identity) return null;
  const identity = taskIdentityForManifest(manifest, { root });
  const expected = publicQaReceiptPath(identity);
  if (scope.public_receipt !== expected) throw new Error(`public QA receipt does not match task identity: ${scope.public_receipt}`);
  if (!existsSync(resolve(root, expected)) || !statSync(resolve(root, expected)).isFile())
    throw new Error(`public QA receipt does not exist as a file: ${expected}`);
  return identity;
}

export function requireManifest(manifestInput) {
  if (!manifestInput) throw new Error('explicit manifest required: pass --manifest <terminal-closeout.json>');
  return manifestInput;
}

export function scopeFromManifest(manifestInput, { root = process.cwd() } = {}) {
  const manifestPath = repositoryRelativePath(root, requireManifest(manifestInput), 'publication manifest');
  if (!existsSync(resolve(root, manifestPath))) throw new Error(`manifest does not exist: ${manifestPath}`);
  let manifest;
  try { manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')); } catch { throw new Error(`manifest is not valid JSON: ${manifestPath}`); }
  const scope = manifestScope(manifest);
  const identity = scope.task_identity ? validatePublicReceiptEvidence(manifest, root) : null;
  return { task: scope.task, paths: scope.paths.map(path => repositoryRelativePath(root, path, 'publication path')), manifest, identity };
}

function statusPaths(root) {
  const output = runGit(root, ['status', '--porcelain=v1', '-z']);
  const paths = [];
  for (const entry of output.split('\0').filter(Boolean)) {
    const raw = entry.slice(3);
    if (raw) paths.push(raw.replaceAll('\\', '/'));
  }
  return [...new Set(paths)].sort();
}

export function assertOnlyScopeDirty({ root = process.cwd(), paths }) {
  const allowed = new Set(paths);
  const outside = statusPaths(root).filter(path => !allowed.has(path));
  if (outside.length) throw new Error(`working tree contains changes outside authorized publication scope: ${outside.join(', ')}`);
  const staged = runGit(root, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  if (staged.length) throw new Error('working tree has pre-staged changes; clear them before using this tool');
}

export function publishScopedTask({ root = process.cwd(), task, paths, branch, identity = null, rejectOutsideDirty = true }) {
  const scope = explicitPathScope({ task, paths, root });
  const target = safeBranchName(branch, 'task branch');
  const current = runGit(root, ['branch', '--show-current']);
  if (current !== target) throw new Error(`task checkout is on ${current || 'detached HEAD'}, not ${target}`);
  if (rejectOutsideDirty) assertOnlyScopeDirty({ root, paths: scope.paths });
  const selectedIdentity = identity || createTaskIdentity(scope.task, { root });
  runGit(root, ['add', '--', ...scope.paths]);
  if (!runGit(root, ['diff', '--cached', '--name-only'])) throw new Error('no changes were staged');
  runGit(root, ['commit', '-m', selectedIdentity.label], { quiet: false });
  runGit(root, ['push', '-u', 'origin', target], { quiet: false });
  const head = runGit(root, ['rev-parse', 'HEAD']);
  const remote = runGit(root, ['ls-remote', 'origin', `refs/heads/${target}`]).split(/\s+/)[0];
  if (remote !== head) throw new Error('remote task branch does not match the committed task head');
  return { ...scope, branch: target, head, identity: selectedIdentity };
}

export function pushExistingBranch({ root = process.cwd(), branch, remoteBranch = branch }) {
  const local = safeBranchName(branch, '--branch');
  const remote = safeBranchName(remoteBranch, '--remote-branch');
  runGit(root, ['show-ref', '--verify', `refs/heads/${local}`]);
  runGit(root, ['fetch', 'origin', 'main'], { quiet: false });
  runGit(root, ['push', 'origin', `refs/heads/${local}:refs/heads/${remote}`], { quiet: false });
  return { local, remote };
}
