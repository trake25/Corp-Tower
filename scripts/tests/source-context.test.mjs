import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  MAX_ANCHOR_BYTES,
  MAX_READ_BYTES,
  MAX_READ_LINES,
  MAX_SEARCH_BYTES,
  MAX_SEARCH_RESULTS,
  readAnchors,
  readSource,
  repositoryRelativeScope,
  searchSource,
} from '../source-context.mjs';

function measuredJsonBytes(value) {
  return Buffer.byteLength(JSON.stringify(value, null, 2)) + 1;
}

const CLI = resolve('scripts/source-context.mjs');

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'corp-source-context-'));
  execFileSync('git', ['init', '-q', root]);
  mkdirSync(join(root, 'scripts/lib'), { recursive: true });
  writeFileSync(join(root, 'scripts/lib/example.mjs'), [
    'export function alpha() {',
    '  return 1;',
    '}',
    '',
    'export function beta() {',
    '  return 2;',
    '}',
    '',
    '// TOKEN appears once',
    '',
  ].join('\n'));
  writeFileSync(join(root, 'scripts/lib/other.mjs'), 'export const gamma = 3;\nexport const TOKEN = 4;\n');
  return { root, close: () => rmSync(root, { recursive: true, force: true }) };
}

function run(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: { ...process.env, SOURCE_CONTEXT_ROOT: cwd } });
}

test('search requires an explicit repository-relative scope and rejects traversal/symlinks', () => {
  const env = fixture();
  try {
    assert.throws(() => repositoryRelativeScope(env.root, '../outside'), /explicit path inside the repository/);
    assert.throws(() => repositoryRelativeScope(env.root, '/etc'), /repository-relative/);
    assert.throws(() => repositoryRelativeScope(env.root, '.git'), /must not enter/);
    const link = join(env.root, 'link');
    symlinkSync(env.root, link);
    assert.throws(() => repositoryRelativeScope(env.root, 'link'), /symbolic links/);
  } finally {
    env.close();
  }
});

test('search returns bounded matches scoped to an explicit path', () => {
  const env = fixture();
  try {
    const scoped = searchSource(env.root, 'TOKEN', { scope: 'scripts/lib/example.mjs' });
    assert.equal(scoped.status, 'matched');
    assert.deepEqual(scoped.matches.map(match => match.path), ['scripts/lib/example.mjs']);

    const wide = searchSource(env.root, 'TOKEN', { scope: 'scripts/lib' });
    assert.equal(wide.matches.length, 2);
    assert.equal(wide.limits.truncated, false);

    const none = searchSource(env.root, 'export function gamma', { scope: 'scripts/lib/example.mjs' });
    assert.deepEqual(none.matches, []);
  } finally {
    env.close();
  }
});

test('search caps result count and marks truncation', () => {
  const env = fixture();
  try {
    const lines = Array.from({ length: MAX_SEARCH_RESULTS + 10 }, (_, index) => `needle ${index}`);
    writeFileSync(join(env.root, 'many.txt'), lines.join('\n') + '\n');
    const result = searchSource(env.root, 'needle', { scope: 'many.txt' });
    assert.equal(result.status, 'matched');
    assert.equal(result.matches.length, MAX_SEARCH_RESULTS);
    assert.equal(result.limits.truncated, true);
    assert.equal(result.limits.total_found, MAX_SEARCH_RESULTS + 10);
  } finally {
    env.close();
  }
});

test('anchors lists symbols for one explicit file and rejects a missing target', () => {
  const env = fixture();
  try {
    const result = readAnchors(env.root, 'scripts/lib/example.mjs');
    assert.equal(result.status, 'matched');
    assert.deepEqual(result.symbols.map(symbol => symbol.name), ['alpha', 'beta']);

    const missing = readAnchors(env.root, 'scripts/lib/missing.mjs');
    assert.equal(missing.status, 'source-target-missing');
  } finally {
    env.close();
  }
});

test('read resolves a bounded window around a named anchor', () => {
  const env = fixture();
  try {
    const result = readSource(env.root, 'scripts/lib/example.mjs', { anchor: 'beta' });
    assert.equal(result.status, 'matched');
    assert.match(result.text, /export function beta/);
    assert.equal(result.anchor, 'beta');
  } finally {
    env.close();
  }
});

test('read fails closed on missing and ambiguous anchors', () => {
  const env = fixture();
  try {
    writeFileSync(join(env.root, 'scripts/lib/dupe.mjs'), 'export function shared() {}\nexport function shared() {}\n');
    const missing = readSource(env.root, 'scripts/lib/example.mjs', { anchor: 'nope' });
    assert.equal(missing.status, 'source-anchor-missing');
    const ambiguous = readSource(env.root, 'scripts/lib/dupe.mjs', { anchor: 'shared' });
    assert.equal(ambiguous.status, 'anchor-ambiguous');
  } finally {
    env.close();
  }
});

test('read enforces the explicit line-range cap and rejects out-of-range requests', () => {
  const env = fixture();
  try {
    const ok = readSource(env.root, 'scripts/lib/example.mjs', { lines: '1-3' });
    assert.equal(ok.status, 'matched');
    assert.deepEqual(ok.lines, [1, 3]);

    const big = Array.from({ length: MAX_READ_LINES + 50 }, (_, index) => `line ${index}`).join('\n') + '\n';
    writeFileSync(join(env.root, 'big.txt'), big);
    const tooLarge = readSource(env.root, 'big.txt', { lines: `1-${MAX_READ_LINES + 1}` });
    assert.equal(tooLarge.status, 'budget-exceeded');

    const outOfRange = readSource(env.root, 'scripts/lib/example.mjs', { lines: '1-9999' });
    assert.equal(outOfRange.status, 'bad-query');
  } finally {
    env.close();
  }
});

test('read rejects path traversal and symlinked targets', () => {
  const env = fixture();
  try {
    const traversal = readSource(env.root, '../outside.mjs', { lines: '1-1' });
    assert.equal(traversal.status, 'access-denied');

    const link = join(env.root, 'scripts/lib/linked.mjs');
    symlinkSync(join(env.root, 'scripts/lib/example.mjs'), link);
    const symlinked = readSource(env.root, 'scripts/lib/linked.mjs', { lines: '1-1' });
    assert.equal(symlinked.status, 'access-denied');
  } finally {
    env.close();
  }
});

test('CLI emits bounded text and JSON output with fail-closed exit codes', () => {
  const env = fixture();
  try {
    const textResult = run(['search', 'TOKEN', '--scope', 'scripts/lib'], env.root);
    assert.equal(textResult.status, 0);
    assert.match(textResult.stdout, /matches: 2\/2/);
    assert.match(textResult.stdout, /^bytes: \d+$/m);

    const jsonResult = run(['read', 'scripts/lib/example.mjs', '--anchor', 'alpha', '--json'], env.root);
    const payload = JSON.parse(jsonResult.stdout);
    assert.equal(jsonResult.status, 0);
    assert.equal(payload.status, 'matched');
    assert.equal(payload.anchor, 'alpha');

    const failed = run(['read', 'scripts/lib/example.mjs', '--anchor', 'missing-anchor'], env.root);
    assert.equal(failed.status, 1);
    assert.match(failed.stdout, /status: source-anchor-missing/);
  } finally {
    env.close();
  }
});

test('the full result envelope, not just its content array, is measured against the byte ceiling', () => {
  const env = fixture();
  try {
    const search = searchSource(env.root, 'TOKEN', { scope: 'scripts/lib' });
    assert.equal(search.limits.returned_bytes, measuredJsonBytes(search));
    assert.ok(search.limits.returned_bytes <= MAX_SEARCH_BYTES);

    const anchors = readAnchors(env.root, 'scripts/lib/example.mjs');
    assert.equal(anchors.limits.returned_bytes, measuredJsonBytes(anchors));
    assert.ok(anchors.limits.returned_bytes <= MAX_ANCHOR_BYTES);

    const read = readSource(env.root, 'scripts/lib/example.mjs', { lines: '1-3' });
    assert.equal(read.limits.returned_bytes, measuredJsonBytes(read));
    assert.ok(read.limits.returned_bytes <= MAX_READ_BYTES);
  } finally {
    env.close();
  }
});

test('search fails closed with bounded failure metadata when even a zero-match envelope cannot fit', () => {
  const env = fixture();
  try {
    const hugePattern = 'x'.repeat(MAX_SEARCH_BYTES);
    const result = searchSource(env.root, hugePattern, { scope: 'scripts/lib/example.mjs' });
    assert.equal(result.status, 'budget-exceeded');
    assert.ok(!('matches' in result));
    assert.ok(measuredJsonBytes(result) < MAX_SEARCH_BYTES, 'the failure response itself must stay small');
    assert.ok(result.query.text.length < hugePattern.length, 'an oversized query must not be echoed back verbatim');

    const cliText = run(['search', hugePattern, '--scope', 'scripts/lib/example.mjs'], env.root);
    assert.equal(cliText.status, 1);
    assert.match(cliText.stdout, /status: budget-exceeded/);
    assert.ok(Buffer.byteLength(cliText.stdout) < MAX_SEARCH_BYTES);

    const cliJson = run(['search', hugePattern, '--scope', 'scripts/lib/example.mjs', '--json'], env.root);
    assert.equal(cliJson.status, 1);
    assert.equal(JSON.parse(cliJson.stdout).status, 'budget-exceeded');
  } finally {
    env.close();
  }
});

test('anchors caps symbol count against the full envelope, not just a raw array size, and marks truncation', () => {
  const env = fixture();
  try {
    const manySymbols = Array.from({ length: 600 }, (_, index) => `export function symbolNumber${index}() { return ${index}; }`).join('\n') + '\n';
    writeFileSync(join(env.root, 'scripts/lib/many-symbols.mjs'), manySymbols);

    const result = readAnchors(env.root, 'scripts/lib/many-symbols.mjs');
    assert.equal(result.status, 'matched');
    assert.equal(result.limits.truncated, true);
    assert.ok(result.limits.returned < result.limits.total_found);
    assert.equal(result.limits.returned_bytes, measuredJsonBytes(result));
    assert.ok(result.limits.returned_bytes <= MAX_ANCHOR_BYTES);
  } finally {
    env.close();
  }
});

test('read fails closed when an oversized anchor name alone cannot fit the byte ceiling', () => {
  const env = fixture();
  try {
    const hugeAnchor = 'y'.repeat(MAX_READ_BYTES);
    writeFileSync(join(env.root, 'scripts/lib/huge-anchor.mjs'), `${hugeAnchor}\n`);

    const result = readSource(env.root, 'scripts/lib/huge-anchor.mjs', { anchor: hugeAnchor });
    assert.equal(result.status, 'budget-exceeded');
    assert.ok(measuredJsonBytes(result) < MAX_READ_BYTES);
    assert.ok(result.anchor.length < hugeAnchor.length, 'an oversized anchor must not be echoed back verbatim');
  } finally {
    env.close();
  }
});
