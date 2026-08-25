#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function fail(message) {
  console.error(`FAIL — ${message}`);
  process.exit(2);
}

function usage() {
  console.error('usage: node scripts/git-sync-commit-push.mjs --approve [--manifest .agent-state/automation/close-out.json] [--branch <branch> --switch] [--push-only --remote-branch <branch>]');
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

function taskScope(manifestInput) {
  const manifestPath = repoPath(manifestInput || '.agent-state/automation/close-out.json');
  if (!existsSync(resolve(ROOT, manifestPath))) fail(`manifest does not exist: ${manifestPath}`);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(ROOT, manifestPath), 'utf8'));
  } catch {
    fail(`manifest is not valid JSON: ${manifestPath}`);
  }
  if (!manifest.task || !Array.isArray(manifest.changed_paths) || !manifest.changed_paths.length)
    fail(`manifest must contain a task and changed_paths: ${manifestPath}`);
  return { task: manifest.task, paths: [...new Set(manifest.changed_paths.map(repoPath))] };
}

function keywordsFor(task) {
  const ignored = new Set(['a', 'an', 'and', 'as', 'add', 'build', 'by', 'change', 'create', 'enable', 'fix', 'for', 'from', 'implement', 'improve', 'in', 'into', 'make', 'of', 'on', 'or', 'refactor', 'remove', 'the', 'to', 'update', 'use', 'with']);
  const words = task.match(/[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*/g) || [];
  const selected = words.filter(word => !ignored.has(word.toLowerCase())).slice(0, 3);
  if (!selected.length) fail('task title does not provide commit keywords');
  return selected.map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ');
}

function versionFor(keywords) {
  const escaped = keywords.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped} v(\\d+\\.\\d{2})$`);
  const subjects = git(['log', '--all', '--format=%s'], { quiet: true }).split(/\r?\n/).filter(Boolean);
  let highest = 0;
  for (const subject of subjects) {
    const match = pattern.exec(subject);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return (highest + 0.01).toFixed(2);
}

function main() {
  const values = parseArgs(process.argv.slice(2));
  if (!values.approve) fail('explicit approval required: pass --approve');
  const scope = taskScope(values.manifest);
  const keywords = keywordsFor(scope.task);
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
  const version = versionFor(keywords);
  const message = `${keywords} v${version}`;
  git(['commit', '-m', message]);
  git(['push', '-u', 'origin', branch]);
  console.log(`PASS — pushed ${message} from ${branch}`);
}

main();
