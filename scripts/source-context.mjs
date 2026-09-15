#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measuredText } from './lib/context-query.mjs';
import { extractSourceAnchors } from './lib/source-anchor-extraction.mjs';
import { repositoryRelativePath } from './lib/task-ownership.mjs';

const ROOT = resolve(process.env.SOURCE_CONTEXT_ROOT || process.cwd());
const COMMANDS = Object.freeze(['search', 'anchors', 'read']);
const DENY_ROOTS = new Set(['.git', 'node_modules', '.agent-state']);

export const MAX_SEARCH_RESULTS = 40;
export const MAX_SEARCH_BYTES = 8 * 1024;
export const MAX_SEARCH_LINE_CHARS = 300;
export const MAX_ANCHOR_SYMBOLS = 200;
export const MAX_ANCHOR_BYTES = 8 * 1024;
export const MAX_READ_LINES = 200;
export const MAX_READ_BYTES = 16 * 1024;
export const READ_WINDOW_BEFORE = 12;
export const READ_WINDOW_AFTER = 20;

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function problem(status, message, details = {}) {
  return { status, message, ...details };
}

/** Explicit repository-relative directory/file scope with the same traversal/symlink protections as file targets, without requiring a leaf file. */
export function repositoryRelativeScope(root, input, label = 'scope') {
  const base = resolve(root);
  if (typeof input !== 'string' || !input.trim() || /[\x00-\x1f\x7f*?]/.test(input))
    throw new Error(`${label} must be an explicit repository-relative path`);
  const portable = input.replaceAll('\\', '/').trim();
  if (posix.isAbsolute(portable) || /^[A-Za-z]:/.test(portable)) throw new Error(`${label} must be repository-relative`);
  const normalized = posix.normalize(portable).replace(/\/$/, '');
  if (normalized === '.' || normalized === '..' || normalized.startsWith('../'))
    throw new Error(`${label} must name an explicit path inside the repository`);
  const parts = normalized.split('/');
  if (DENY_ROOTS.has(parts[0])) throw new Error(`${label} must not enter '${parts[0]}/'`);
  let current = base;
  for (const part of parts) {
    current = resolve(current, part);
    if (current !== base && !current.startsWith(base + sep)) throw new Error(`${label} must stay inside the repository`);
    let info;
    try { info = lstatSync(current); } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`${label} does not exist: ${normalized}`);
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error(`${label} must not traverse symbolic links: ${normalized}`);
  }
  return { normalized, absolute: current, isDirectory: lstatSync(current).isDirectory() };
}

function boundedLine(value) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > MAX_SEARCH_LINE_CHARS ? `${normalized.slice(0, MAX_SEARCH_LINE_CHARS - 1)}…` : normalized;
}

function gitGrep(root, pattern, scope, { regex = false } = {}) {
  const args = ['-C', root, 'grep', '--no-color', '-n', '-I', '--untracked', regex ? '-E' : '-F', '-e', pattern, '--', scope];
  try {
    return execFileSync('git', args, { encoding: 'utf8' });
  } catch (error) {
    if (error.status === 1 && !error.stderr) return ''; // no matches
    throw new Error(`git grep failed: ${(error.stderr || error.message).toString().trim()}`);
  }
}

/** Bounded scoped search: explicit repository path/scope, fixed result count, and a hard output-byte cap. */
export function searchSource(root, pattern, { scope, regex = false } = {}) {
  const kind = 'search';
  if (typeof pattern !== 'string' || !pattern.trim()) return problem('bad-query', 'search pattern must be a non-empty string');
  let resolvedScope;
  try {
    resolvedScope = repositoryRelativeScope(root, scope, 'search scope');
  } catch (error) {
    return problem('access-denied', error.message);
  }
  let raw;
  try {
    raw = gitGrep(root, pattern, resolvedScope.normalized, { regex });
  } catch (error) {
    return problem('tool-error', error.message);
  }
  const allMatches = raw.split(/\r?\n/).filter(Boolean).map(line => {
    const split = /^(.*?):(\d+):(.*)$/.exec(line);
    if (!split) return null;
    return { path: split[1].replaceAll('\\', '/'), line: Number(split[2]), text: boundedLine(split[3]) };
  }).filter(Boolean);
  let matches = allMatches.slice(0, MAX_SEARCH_RESULTS);
  let truncated = allMatches.length > matches.length;
  while (matches.length
    && Buffer.byteLength(JSON.stringify(matches)) > MAX_SEARCH_BYTES) {
    matches = matches.slice(0, -1);
    truncated = true;
  }
  return {
    schema_version: 1,
    query: { kind, text: pattern, scope: resolvedScope.normalized },
    status: 'matched',
    matches,
    limits: { max_results: MAX_SEARCH_RESULTS, max_bytes: MAX_SEARCH_BYTES, returned: matches.length, total_found: allMatches.length, truncated },
  };
}

function safeFileTarget(root, path, label = 'source path') {
  const normalized = repositoryRelativePath(root, path, label);
  const absolute = resolve(root, normalized);
  if (!existsSync(absolute) || !lstatSync(absolute).isFile())
    return { error: problem('source-target-missing', `source target does not exist: ${normalized}`, { path: normalized }) };
  return { normalized, absolute };
}

/** Bounded symbol/anchor listing for one explicit file, capped in count and bytes. */
export function readAnchors(root, path) {
  const kind = 'anchors';
  let target;
  try {
    target = safeFileTarget(root, path);
  } catch (error) {
    return problem('access-denied', error.message);
  }
  if (target.error) return { ...target.error, query: { kind, text: path } };
  const text = readFileSync(target.absolute, 'utf8').replace(/\r\n/g, '\n');
  const { lines, symbols: allSymbols } = extractSourceAnchors(target.normalized, text);
  let symbols = allSymbols.slice(0, MAX_ANCHOR_SYMBOLS);
  let truncated = allSymbols.length > symbols.length;
  while (symbols.length && Buffer.byteLength(JSON.stringify(symbols)) > MAX_ANCHOR_BYTES) {
    symbols = symbols.slice(0, -1);
    truncated = true;
  }
  return {
    schema_version: 1,
    query: { kind, text: path },
    status: 'matched',
    path: target.normalized,
    lines,
    symbols,
    limits: { max_symbols: MAX_ANCHOR_SYMBOLS, max_bytes: MAX_ANCHOR_BYTES, returned: symbols.length, total_found: allSymbols.length, truncated },
  };
}

function stableTextMatches(lines, anchor) {
  const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const exactHeading = new RegExp(`^#{1,6}\\s+${escaped}\\s*$`, 'i');
  const exactKey = new RegExp(`^\\s*(?:["']?${escaped}["']?\\s*[:=]|\\[${escaped}\\])`);
  const word = new RegExp(`(^|[^A-Za-z0-9_%.-])${escaped}([^A-Za-z0-9_.-]|$)`);
  const preferred = lines.flatMap((line, index) => exactHeading.test(line) || exactKey.test(line) ? [index + 1] : []);
  if (preferred.length) return preferred;
  return lines.flatMap((line, index) => word.test(line) ? [index + 1] : []);
}

function anchorLine(path, text, anchor) {
  const lines = text.split('\n');
  const symbols = extractSourceAnchors(path, text).symbols.filter(symbol => symbol.name === anchor);
  const matches = symbols.length ? symbols.map(symbol => symbol.ln) : stableTextMatches(lines, anchor);
  const unique = [...new Set(matches)];
  if (!unique.length) return problem('source-anchor-missing', `source anchor '${anchor}' is missing in ${path}`, { path, anchor });
  if (unique.length > 1) return problem('anchor-ambiguous', `source anchor '${anchor}' is ambiguous (${unique.length} matches) in ${path}`, { path, anchor, matches: unique });
  return { line: unique[0] };
}

/** Bounded exact-file read: an anchor name or explicit line range, clamped to a hard line/byte cap, never silently truncated. */
export function readSource(root, path, { anchor = null, lines: range = null } = {}) {
  const kind = 'read';
  let target;
  try {
    target = safeFileTarget(root, path);
  } catch (error) {
    return problem('access-denied', error.message);
  }
  if (target.error) return { ...target.error, query: { kind, text: path } };
  if (!anchor && !range) return problem('bad-query', 'read requires either --anchor or --lines');
  if (anchor && range) return problem('bad-query', 'read accepts either --anchor or --lines, not both');
  const text = readFileSync(target.absolute, 'utf8').replace(/\r\n/g, '\n');
  const fileLines = text.split('\n');
  let start;
  let end;
  let resolvedAnchor = null;
  if (anchor) {
    const located = anchorLine(target.normalized, text, anchor);
    if (located.status) return { ...located, query: { kind, text: path } };
    start = Math.max(1, located.line - READ_WINDOW_BEFORE);
    end = Math.min(fileLines.length, located.line + READ_WINDOW_AFTER);
    resolvedAnchor = anchor;
  } else {
    const match = /^(\d+)-(\d+)$/.exec(String(range));
    if (!match) return problem('bad-query', '--lines must be A-B');
    start = Number(match[1]);
    end = Number(match[2]);
    if (start < 1 || end < start || end > fileLines.length)
      return problem('bad-query', `--lines must be within 1-${fileLines.length}`, { path: target.normalized, file_lines: fileLines.length });
  }
  if (end - start + 1 > MAX_READ_LINES)
    return problem('budget-exceeded', `requested range exceeds the ${MAX_READ_LINES} line limit`, { path: target.normalized, lines: [start, end] });
  const slice = fileLines.slice(start - 1, end).join('\n');
  const bytes = Buffer.byteLength(slice);
  if (bytes > MAX_READ_BYTES)
    return problem('budget-exceeded', `requested range exceeds the ${MAX_READ_BYTES} byte limit`, { path: target.normalized, lines: [start, end] });
  return {
    schema_version: 1,
    query: { kind, text: path },
    status: 'matched',
    path: target.normalized,
    anchor: resolvedAnchor,
    lines: [start, end],
    file_lines: fileLines.length,
    text: slice,
    limits: { max_lines: MAX_READ_LINES, max_bytes: MAX_READ_BYTES, returned_lines: end - start + 1, returned_bytes: bytes },
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
    if (key === 'json' || key === 'regex') {
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

function resultLines(result) {
  const output = [`status: ${result.status}`];
  if (result.message) output.push(`reason: ${result.message}`);
  if (result.query?.kind === 'search') {
    for (const match of result.matches || []) output.push(`${match.path}:${match.line}: ${match.text}`);
    if (result.limits) output.push(`matches: ${result.limits.returned}/${result.limits.total_found}${result.limits.truncated ? ' (truncated)' : ''}`);
  } else if (result.query?.kind === 'anchors') {
    for (const symbol of result.symbols || []) output.push(`${symbol.ln}\t${symbol.kind}\t${symbol.name}`);
    if (result.limits) output.push(`symbols: ${result.limits.returned}/${result.limits.total_found}${result.limits.truncated ? ' (truncated)' : ''}`);
  } else if (result.query?.kind === 'read') {
    if (result.status === 'matched') {
      output.push(`${result.path}:${result.lines[0]}-${result.lines[1]}${result.anchor ? ` (#${result.anchor})` : ''}`, '', result.text);
    }
  }
  return output;
}

function printResult(options, result) {
  if (options.has('json')) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(measuredText(resultLines(result)).output);
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  if (!COMMANDS.includes(command))
    fail(`unsupported source-context command '${command || ''}'; available commands: ${COMMANDS.join(', ')}`);
  const { positionals, options } = parseArgs(argv);

  if (command === 'search') {
    checkOptions(options, ['json', 'scope', 'regex']);
    const pattern = positionals.join(' ').trim();
    if (!pattern) fail('usage: node scripts/source-context.mjs search <pattern> --scope <path>');
    const scope = option(options, 'scope');
    if (!scope) fail('--scope is required');
    const result = searchSource(ROOT, pattern, { scope, regex: options.has('regex') });
    printResult(options, result);
    if (result.status !== 'matched') process.exitCode = 1;
    return;
  }

  const path = positionals.join(' ').trim();
  if (!path) fail(`usage: node scripts/source-context.mjs ${command} <repository-relative-path> [options]`);

  if (command === 'anchors') {
    checkOptions(options, ['json']);
    const result = readAnchors(ROOT, path);
    printResult(options, result);
    if (result.status !== 'matched') process.exitCode = 1;
    return;
  }

  checkOptions(options, ['json', 'anchor', 'lines']);
  const result = readSource(ROOT, path, { anchor: option(options, 'anchor'), lines: option(options, 'lines') });
  printResult(options, result);
  if (result.status !== 'matched') process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    fail(error.message, 1);
  }
}
