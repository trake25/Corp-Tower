import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import * as query from '../lib/context-query.mjs';

const ROOT = resolve('.');
const CLI = resolve('scripts/context.mjs');

function run(args) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, CONTEXT_ROOT: ROOT },
  });
}

test('context query exports only the KB Tree protocol surface', () => {
  assert.deepEqual(Object.keys(query).sort(), [
    'DEFAULT_CONCEPT_BYTES',
    'MAX_CONCEPT_BYTES',
    'conceptBundle',
    'conceptRead',
    'conceptRoute',
    'conceptTextLines',
    'measuredText',
  ]);
});

test('concept-route JSON returns exact route evidence on stdout only', () => {
  const result = run(['concept-route', 'critical save', '--json']);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(payload.status, 'matched');
  assert.equal(payload.concept.id, 'gameplay.scoring.critical-save');
  assert.equal(payload.query.resolution, 'alias');
  assert.ok(payload.sources.some(source => source.anchor === 'getCriticalSavePreview'));
  assert.ok(payload.adjacent.every(concept => concept.loaded === false));
});

test('concept-read emits one owning prose leaf without loading adjacency', () => {
  const result = run(['concept-read', 'hud.tower.collapse.presentation']);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.match(result.stdout, /concept: hud\.tower\.collapse\.presentation/);
  assert.match(result.stdout, /## Collapse presentation/);
  assert.match(result.stdout, /adjacent: hud\.tower\.collapse\.recovery \(not loaded\)/);
  assert.doesNotMatch(result.stdout, /Collapse recovery after presentation/);
});

test('concept retrieval failures remain structured and fail closed', () => {
  const result = run(['concept-route', 'concept.that.does.not.exist', '--json']);
  const payload = JSON.parse(result.stdout);

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(payload.status, 'concept-unmapped');
  assert.ok(payload.reason);
  assert.deepEqual(payload.fallback, { allowed: false, reason: null });
});

test('concept-bundle writes only beneath ignored private automation state', () => {
  const root = resolve('.agent-state/automation');
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, 'context-query-test-'));
  const relativeOutput = join('.agent-state/automation', directory.split('/').at(-1), 'bundle.md');
  try {
    const result = run(['concept-bundle', 'task close', '--output', relativeOutput, '--json']);
    const payload = JSON.parse(result.stdout);
    const bundle = readFileSync(resolve(relativeOutput), 'utf8');

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    assert.equal(payload.bundle, relativeOutput);
    assert.match(bundle, /# Concept bundle/);
    assert.match(bundle, /## Provenance/);
    assert.match(bundle, /Adjacent concepts \(not loaded\)/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('concept-bundle rejects output outside private automation state', () => {
  const result = run(['concept-bundle', 'task close', '--output', 'bundle.md']);

  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, /must be a Markdown file under ignored \.agent-state\/automation/);
});

test('retired context commands fail clearly without fallback', () => {
  for (const command of ['route', 'outline', 'section', 'symbol', 'search', 'filter', 'scope', 'bundle']) {
    const result = run([command, 'anything']);
    assert.equal(result.status, 2, command);
    assert.equal(result.stdout, '', command);
    assert.match(result.stderr, /unsupported context command/, command);
    assert.match(result.stderr, /concept-route, concept-read, concept-bundle/, command);
  }
});

test('concept CLI source has no legacy command dispatch', () => {
  const source = readFileSync(CLI, 'utf8');

  assert.doesNotMatch(source, /command === '(?:route|outline|section|symbol|search|filter|scope|bundle)'/);
});
