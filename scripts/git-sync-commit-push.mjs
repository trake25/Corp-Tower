#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  explicitPathScope,
  manifestScope,
  publishScopedTask,
  pushExistingBranch,
  requireManifest,
  runGit,
  safeBranchName,
  scopeFromManifest,
  validatePublicReceiptEvidence,
} from './lib/git-publication.mjs';
import { createTaskIdentity } from './lib/task-identity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export { explicitPathScope, manifestScope, requireManifest, validatePublicReceiptEvidence } from './lib/git-publication.mjs';

function fail(message) { console.error(`FAIL — ${message}`); process.exit(2); }
function usage() {
  console.error('usage: node scripts/git-sync-commit-push.mjs --approve (--manifest <terminal-closeout.json> | --task <task> --path <repository-path> [--path <repository-path> ...] [--ownership <ownership.json>]) [--branch <branch> --switch] [--push-only --remote-branch <branch>]');
  process.exit(2);
}
function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--approve') { values.approve = true; continue; }
    if (arg === '--switch') { values.switch = true; continue; }
    if (arg === '--push-only') { values.pushOnly = true; continue; }
    const key = { '--manifest': 'manifest', '--task': 'task', '--path': 'paths', '--ownership': 'ownership', '--branch': 'branch', '--remote-branch': 'remoteBranch' }[arg];
    if (!key) usage();
    const value = args[++index];
    if (!value || value.startsWith('--')) usage();
    if (key === 'paths') (values.paths ||= []).push(value);
    else { if (values[key]) fail(`${arg} may be supplied once`); values[key] = value; }
  }
  return values;
}
function currentBranch() {
  const branch = execFileSync('git', ['-C', ROOT, 'branch', '--show-current'], { encoding: 'utf8' }).trim();
  if (!branch) fail('detached HEAD is not supported');
  return branch;
}
function main() {
  const values = parseArgs(process.argv.slice(2));
  if (!values.approve) fail('explicit approval required: pass --approve');
  if (values.manifest && (values.task || values.paths?.length || values.ownership)) fail('use either --manifest or explicit --task/--path publication scope, not both');
  if (!values.manifest && (!values.task || !values.paths?.length)) fail('provide --manifest or explicit --task plus one or more --path values');
  try {
    if (values.pushOnly) {
      if (!values.branch) fail('--push-only requires --branch');
      const result = pushExistingBranch({ root: ROOT, branch: values.branch, remoteBranch: values.remoteBranch || values.branch });
      console.log(`PASS — pushed ${result.local} to origin/${result.remote} without staging or committing`);
      return;
    }
    const current = currentBranch();
    const requested = values.branch ? safeBranchName(values.branch, '--branch') : current;
    if (!values.branch && current !== 'main') fail(`current branch is ${current}; local push requires main or an explicitly selected --branch`);
    if (values.branch && requested !== current) {
      if (!values.switch) fail(`switching to ${requested} requires --switch and explicit user approval`);
      if (runGit(ROOT, ['status', '--short'])) fail('working tree must be clean before switching branches');
      let exists = true;
      try { runGit(ROOT, ['rev-parse', '--verify', `refs/heads/${requested}`]); } catch { exists = false; }
      runGit(ROOT, exists ? ['switch', requested] : ['switch', '--track', '-c', requested, `origin/${requested}`], { quiet: false });
    }
    const scope = values.manifest ? scopeFromManifest(values.manifest, { root: ROOT }) : {
      ...explicitPathScope({ task: values.task, paths: values.paths || [], ownership: values.ownership || null, root: ROOT }),
      identity: createTaskIdentity(values.task, { root: ROOT }),
    };
    if (runGit(ROOT, ['diff', '--cached', '--name-only'])) fail('working tree has pre-staged changes; clear them before using this tool');
    runGit(ROOT, ['fetch', 'origin', requested], { quiet: false });
    runGit(ROOT, ['pull', '--ff-only'], { quiet: false });
    const result = publishScopedTask({ root: ROOT, task: scope.task, paths: scope.paths, branch: requested, identity: scope.identity || null, rejectOutsideDirty: false });
    console.log(`PASS — pushed ${result.identity.label} from ${requested}`);
  } catch (error) { fail(error.message); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
