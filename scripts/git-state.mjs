#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGit } from './lib/git-publication.mjs';
import { repositoryRelativePath } from './lib/task-ownership.mjs';

const ROOT = resolve(process.env.GIT_STATE_ROOT || process.cwd());
const COMMANDS = Object.freeze(['status', 'patch']);
const GIT_PATCH_LOG_DIRECTORY = '.agent-state/automation/git-patches';

export const MAX_STATUS_PATHS = 20;
export const MAX_PATCH_BYTES = 8 * 1024;

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function parseStatusEntries(root) {
  const output = runGit(root, ['status', '--porcelain=v1', '-z'], { trim: false });
  const parts = output.length ? output.split('\0') : [];
  if (parts.length && parts[parts.length - 1] === '') parts.pop();
  const entries = [];
  for (let index = 0; index < parts.length; index++) {
    const raw = parts[index];
    if (!raw) continue;
    const code = raw.slice(0, 2);
    const path = raw.slice(3).replaceAll('\\', '/');
    let from = null;
    if (code[0] === 'R' || code[0] === 'C') from = (parts[++index] || '').replaceAll('\\', '/');
    entries.push({ code, path, from });
  }
  return entries;
}

function bounded(entries, maxPaths) {
  const shown = entries.slice(0, maxPaths).map(entry => ({ path: entry.path, status: entry.code, ...(entry.from ? { from: entry.from } : {}) }));
  return { total: entries.length, shown, truncated: entries.length > shown.length };
}

function shortstat(root, args) {
  const output = runGit(root, args);
  const files = Number(/(\d+) files? changed/.exec(output)?.[1] || 0);
  const insertions = Number(/(\d+) insertions?\(\+\)/.exec(output)?.[1] || 0);
  const deletions = Number(/(\d+) deletions?\(-\)/.exec(output)?.[1] || 0);
  return { files, insertions, deletions };
}

function upstreamInfo(root) {
  let ref;
  try { ref = runGit(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']); }
  catch { return null; }
  const counts = runGit(root, ['rev-list', '--left-right', '--count', '@{u}...HEAD']).split(/\s+/);
  return { ref, behind: Number(counts[0] || 0), ahead: Number(counts[1] || 0) };
}

/** Compact Git inspection: branch/task identity, changed/staged paths, and small stats — no patch content by default. */
export function gitStatusSummary(root, { maxPaths = MAX_STATUS_PATHS } = {}) {
  let branch = runGit(root, ['branch', '--show-current']);
  let detachedAt = null;
  if (!branch) detachedAt = runGit(root, ['rev-parse', '--short', 'HEAD']);
  const head = runGit(root, ['rev-parse', '--short=12', 'HEAD']);
  const upstream = upstreamInfo(root);
  const entries = parseStatusEntries(root);
  const staged = entries.filter(entry => entry.code[0] !== ' ' && entry.code[0] !== '?');
  const unstaged = entries.filter(entry => entry.code[1] !== ' ' && entry.code[1] !== '?');
  const untracked = entries.filter(entry => entry.code === '??');
  return {
    schema_version: 1,
    branch: branch || null,
    detached_at: detachedAt,
    head,
    upstream,
    staged: { ...bounded(staged, maxPaths), stat: shortstat(root, ['diff', '--cached', '--shortstat']) },
    unstaged: { ...bounded(unstaged, maxPaths), stat: shortstat(root, ['diff', '--shortstat']) },
    untracked: bounded(untracked, maxPaths),
    limits: { max_paths: maxPaths },
  };
}

/** Bounded exact-path patch: never returned by default from `status`, always capped, overflow saved privately. */
export function gitPatch(root, path, { staged = false, maxBytes = MAX_PATCH_BYTES } = {}) {
  const normalized = repositoryRelativePath(root, path, 'patch path', { inspect: false });
  const args = ['diff', ...(staged ? ['--cached'] : []), '--', normalized];
  const full = runGit(root, args, { trim: false });
  if (!full.trim()) {
    return { schema_version: 1, path: normalized, staged, status: 'no-changes', bytes: 0, truncated: false, patch: '', full_patch_path: null, limits: { max_bytes: maxBytes } };
  }
  const bytes = Buffer.byteLength(full);
  if (bytes <= maxBytes) {
    return { schema_version: 1, path: normalized, staged, status: 'matched', bytes, truncated: false, patch: full, full_patch_path: null, limits: { max_bytes: maxBytes } };
  }
  const directory = resolve(root, GIT_PATCH_LOG_DIRECTORY);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const logPath = resolve(directory, `${randomUUID()}.diff`);
  writeFileSync(logPath, full, { mode: 0o600 });
  let truncatedText = full;
  while (Buffer.byteLength(truncatedText) > maxBytes) truncatedText = truncatedText.slice(0, -256);
  return {
    schema_version: 1, path: normalized, staged, status: 'matched', bytes,
    truncated: true, patch: truncatedText, full_patch_path: relative(resolve(root), logPath).replaceAll('\\', '/'),
    limits: { max_bytes: maxBytes },
  };
}

function parseArgs(args) {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (key === 'json' || key === 'staged') {
      options.set(key, ['true']);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`--${key} needs a value`);
    if (options.has(key)) fail(`--${key} may be supplied once`);
    options.set(key, [value]);
    index++;
  }
  return { positionals, options };
}

function option(options, key, fallback = null) {
  return options.get(key)?.[0] ?? fallback;
}

function checkOptions(options, allowed) {
  for (const key of options.keys()) if (!allowed.includes(key)) fail(`unknown option --${key}`);
}

function statusLines(result) {
  const output = [
    `branch: ${result.branch || `detached@${result.detached_at}`}`,
    `head: ${result.head}`,
  ];
  if (result.upstream) output.push(`upstream: ${result.upstream.ref} (ahead ${result.upstream.ahead}, behind ${result.upstream.behind})`);
  for (const [label, group] of [['staged', result.staged], ['unstaged', result.unstaged], ['untracked', result.untracked]]) {
    output.push(`${label}: ${group.total}${group.truncated ? ` (showing ${group.shown.length})` : ''}`);
    for (const entry of group.shown) output.push(`  ${entry.status} ${entry.path}${entry.from ? ` (from ${entry.from})` : ''}`);
    if (group.stat) output.push(`  stat: ${group.stat.files} files, +${group.stat.insertions}/-${group.stat.deletions}`);
  }
  return output;
}

function patchLines(result) {
  const output = [`status: ${result.status}`, `path: ${result.path}`, `bytes: ${result.bytes}${result.truncated ? ' (truncated)' : ''}`];
  if (result.full_patch_path) output.push(`full patch: ${result.full_patch_path}`);
  if (result.patch) output.push('', result.patch.trimEnd());
  return output;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  if (!COMMANDS.includes(command))
    fail(`unsupported git-state command '${command || ''}'; available commands: ${COMMANDS.join(', ')}`);
  const { positionals, options } = parseArgs(argv);

  if (command === 'status') {
    checkOptions(options, ['json', 'max-paths']);
    const maxPaths = Number(option(options, 'max-paths', String(MAX_STATUS_PATHS)));
    const result = gitStatusSummary(ROOT, { maxPaths });
    if (options.has('json')) console.log(JSON.stringify(result, null, 2));
    else console.log(statusLines(result).join('\n'));
    return;
  }

  checkOptions(options, ['json', 'path', 'staged', 'max-bytes']);
  const path = option(options, 'path') || positionals.join(' ').trim();
  if (!path) fail('--path is required');
  const maxBytes = Number(option(options, 'max-bytes', String(MAX_PATCH_BYTES)));
  const result = gitPatch(ROOT, path, { staged: options.has('staged'), maxBytes });
  if (options.has('json')) console.log(JSON.stringify(result, null, 2));
  else console.log(patchLines(result).join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error.message, 1);
  }
}
