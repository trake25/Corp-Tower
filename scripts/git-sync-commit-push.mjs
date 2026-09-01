#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicQaReceiptPath } from './lib/qa-receipt.mjs';
import { taskIdentityForManifest } from './lib/task-identity.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`FAIL — ${message}`);
  process.exit(2);
}

function usage() {
	console.error('usage: node scripts/git-sync-commit-push.mjs --approve --manifest <terminal-closeout.json> [--branch <branch> --switch] [--push-only --remote-branch <branch>]');
  process.exit(2);
}

function parseArgs(args) {
  const values = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--approve') {
      values.approve = true;
      continue;
    }
    if (arg === '--switch') {
      values.switch = true;
      continue;
    }
    if (arg === '--push-only') {
      values.pushOnly = true;
      continue;
    }
    if (arg === '--manifest') {
      if (values.manifest) fail('--manifest may be supplied once');
      values.manifest = args[++index];
      if (!values.manifest || values.manifest.startsWith('--')) usage();
      continue;
    }
    if (arg === '--branch') {
      if (values.branch) fail('--branch may be supplied once');
      values.branch = args[++index];
      if (!values.branch || values.branch.startsWith('--')) usage();
      continue;
    }
    if (arg === '--remote-branch') {
      if (values.remoteBranch) fail('--remote-branch may be supplied once');
      values.remoteBranch = args[++index];
      if (!values.remoteBranch || values.remoteBranch.startsWith('--')) usage();
      continue;
    }
    usage();
  }
  return values;
}

function git(args, options = {}) {
  try {
    const output = execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: options.quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    return typeof output === 'string' ? output.trim() : '';
  } catch (error) {
    const detail = error.stderr?.toString().trim();
    fail(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
}

function repoPath(input) {
  const path = resolve(ROOT, input);
  if (path !== ROOT && !path.startsWith(`${ROOT}/`)) fail(`path escapes repository: ${input}`);
  return input.replace(/^\.\//, '');
}

function branchName(input, label) {
  if (!input || !/^[A-Za-z0-9._/-]+$/.test(input) || input.startsWith('/') || input.startsWith('.') || input.endsWith('/') || input.endsWith('.') || input.includes('..') || input.includes('@{'))
    fail(`${label} is not a safe branch name`);
  return input;
}

export function manifestScope(manifest) {
  if (!manifest.task) throw new Error('manifest must contain a task');
  if (manifest.schema_version === 2) {
    const verification = manifest.verification?.status;
    if (manifest.phase !== 'closed' || !['passed', 'maintenance-blocked'].includes(verification))
      throw new Error('schema-v2 manifest must have terminal closeout verification');
    if (!Array.isArray(manifest.publish_paths) || !manifest.publish_paths.length)
      throw new Error('schema-v2 manifest must contain publish_paths');
    const publicReceipt = manifest.verification?.public_receipt || null;
    if (verification === 'maintenance-blocked' && !manifest.task_identity)
      throw new Error('maintenance-blocked publication requires a persisted task identity');
    if (manifest.task_identity) {
      if (!publicReceipt || !manifest.publish_paths.includes(publicReceipt))
        throw new Error('task identity publication requires its public QA receipt in publish_paths');
    }
    return {
      task: manifest.task,
      paths: [...new Set(manifest.publish_paths)],
      task_identity: manifest.task_identity || null,
      public_receipt: publicReceipt,
    };
  }
  if (!Array.isArray(manifest.changed_paths) || !manifest.changed_paths.length)
    throw new Error('schema-v1 manifest must contain changed_paths');
  return { task: manifest.task, paths: [...new Set(manifest.changed_paths)], task_identity: null, public_receipt: null };
}

export function validatePublicReceiptEvidence(manifest, root = ROOT) {
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

function taskScope(manifestInput) {
	const manifestPath = repoPath(requireManifest(manifestInput));
  if (!existsSync(resolve(ROOT, manifestPath))) fail(`manifest does not exist: ${manifestPath}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(ROOT, manifestPath), 'utf8'));
  } catch {
    fail(`manifest is not valid JSON: ${manifestPath}`);
  }
  let scope;
  try {
    scope = manifestScope(manifest);
  } catch (error) {
    fail(`${error.message}: ${manifestPath}`);
  }
  let identity = null;
  if (scope.task_identity) {
    try {
      identity = validatePublicReceiptEvidence(manifest, ROOT);
    } catch (error) {
      fail(error.message);
    }
  }
  return { task: scope.task, paths: scope.paths.map(repoPath), manifest, identity };
}

function main() {
	const values = parseArgs(process.argv.slice(2));
	if (!values.approve) fail('explicit approval required: pass --approve');
	let scope;
	try {
		scope = taskScope(values.manifest);
	} catch (error) {
		fail(error.message);
	}
  const paths = scope.paths;
  const currentBranch = git(['branch', '--show-current'], { quiet: true });
  if (!currentBranch) fail('detached HEAD is not supported');
  if (values.pushOnly) {
    if (!values.branch) fail('--push-only requires --branch');
    const localBranch = branchName(values.branch, '--branch');
    const remoteBranch = branchName(values.remoteBranch || localBranch, '--remote-branch');
    if (!git(['show-ref', '--verify', `refs/heads/${localBranch}`], { quiet: true })) fail(`local branch does not exist: ${localBranch}`);
    console.log(`Refreshing origin/main before publishing ${localBranch}...`);
    git(['fetch', 'origin', 'main']);
    git(['push', 'origin', `refs/heads/${localBranch}:refs/heads/${remoteBranch}`]);
    console.log(`PASS — pushed ${localBranch} to origin/${remoteBranch} without staging or committing`);
    return;
  }
  const branch = values.branch || currentBranch;
  if (!values.branch && currentBranch !== 'main') fail(`current branch is ${currentBranch}; local push requires main or an explicitly selected --branch`);
  if (values.branch && values.branch !== currentBranch && !values.switch) fail(`switching to ${branch} requires --switch and explicit user approval`);
  if (git(['diff', '--cached', '--name-only'], { quiet: true })) fail('working tree has pre-staged changes; clear them before using this tool');

  console.log('Syncing with the remote before staging local work...');
  git(['fetch', 'origin', branch]);
  if (branch !== currentBranch) {
    if (git(['status', '--short'], { quiet: true })) fail('working tree must be clean before switching branches');
    const localBranch = git(['branch', '--list', branch], { quiet: true });
    if (localBranch) git(['switch', branch]);
    else git(['switch', '--track', '-c', branch, `origin/${branch}`]);
  }
  git(['pull', '--ff-only']);

  git(['add', '--', ...paths]);

  const staged = git(['diff', '--cached', '--name-only'], { quiet: true });
  if (!staged) fail('no changes were staged');
  let identity = scope.identity;
  try {
    identity ||= taskIdentityForManifest(scope.manifest, { root: ROOT });
  } catch (error) {
    fail(error.message);
  }
  const message = identity.label;
  git(['commit', '-m', message]);
  git(['push', '-u', 'origin', branch]);
  console.log(`PASS — pushed ${message} from ${branch}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
