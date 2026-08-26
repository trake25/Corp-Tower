import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { contextBundle, documentSection, mapSymbols, routeContext, scopeContext, searchContext } from '../lib/context-query.mjs';

const ROOT = resolve('.');

test('search returns a bounded, provenance-bearing exact symbol match', () => {
  const result = searchContext(ROOT, 'updateDebugConfig', { kinds: ['symbol'] });

  assert.equal(result.schema_version, 2);
  assert.equal(result.status, 'matched');
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].lines, [159, 159]);
  assert.equal(result.results[0].path, 'docs/context/map/backend.md');
  assert.equal(result.results[0].source.source_path, 'src/Server/app/Lobby_Manager.js');
  assert.equal(result.results[0].source.symbol, 'updateDebugConfig');
  assert.deepEqual(result.results[0].source.read.lines, [438, 470]);
  assert.equal('excerpt' in result.results[0], false);
  assert.equal(result.fallback.allowed, false);
  assert.equal(result.limits.returned_bytes, Buffer.byteLength(JSON.stringify(result, null, 2)) + 1);
});

test('search filters by an existing domain and asks for refinement when bounded', () => {
  const result = searchContext(ROOT, 'splash', { domains: ['screens'], anchor: true });

  assert.equal(result.status, 'needs-filter');
  assert.ok(result.results.length <= 5);
  assert.ok(result.results.every(item => item.path === 'docs/context/ui.md' || item.path === 'docs/context/map/ui-screens.md'));
  assert.ok(result.warnings.some(warning => warning.startsWith('refine query:')));
  assert.ok(result.next_actions.length <= 3);
  assert.ok(result.next_actions.some(action => action.command.argv[2] === 'filter'));
  assert.ok(result.next_actions.some(action => action.type === 'read-symbol'));
  assert.ok(result.limits.diagnostic_bytes <= 2 * 1024);
  assert.ok(result.limits.returned_bytes <= result.limits.max_bytes);
});

test('a weak narrative match teaches the anchor retry without authorizing source search', () => {
  const result = searchContext(ROOT, 'show startup splash screen');

  assert.equal(result.status, 'needs-anchor');
  assert.deepEqual(result.results, []);
  assert.ok(result.next_actions.some(action => action.anchor === 'splash'));
  assert.ok(result.next_actions.every(action => action.command.argv.includes('--anchor')));
  assert.equal(result.fallback.allowed, false);
});

test('an explicitly confirmed missing anchor is a repairable retrieval defect', () => {
  const result = searchContext(ROOT, 'impossible_anchor_xyz', { anchor: true });

  assert.equal(result.status, 'retrieval-defect');
  assert.deepEqual(result.results, []);
  assert.equal(result.fallback.allowed, true);
  assert.match(result.fallback.reason, /retrieval defect/);
});

test('a broken retrieval index returns tool-error and authorizes repair fallback', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-context-error-'));
  try {
    mkdirSync(join(root, 'docs/context'), { recursive: true });
    writeFileSync(join(root, 'docs/context/retrieval-aliases.json'), '{broken');
    const result = searchContext(root, 'splash', { anchor: true });

    assert.equal(result.status, 'tool-error');
    assert.equal(result.fallback.allowed, true);
    assert.match(result.warnings[0], /not valid JSON/);
    assert.ok(result.limits.returned_bytes <= result.limits.max_bytes);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('working folders route to explicit plan and reference guidance', () => {
  const plan = routeContext('plan/example.md');
  assert.equal(plan.skill, 'docs-steward');
  assert.deepEqual(plan.workspace, {
    name: 'plan',
    purpose: 'Task plans. Read existing plans for context; save new plans here.',
    policy: 'Existing plans are read-only unless the user explicitly authorizes an edit.',
  });
  const reference = routeContext('reference/play-screen-guides/Bugs/crash.png');
  assert.equal(reference.skill, 'client-engineer');
  assert.equal(reference.workspace.name, 'reference');
  assert.match(reference.workspace.purpose, /screen guides and bug screenshots/);
});

test('checked retrieval benchmarks route to the automation contract', () => {
  const route = routeContext('report/benchmarks/latest.json');

  assert.equal(route.skill, 'docs-steward');
  assert.deepEqual(route.docs, ['docs/context/automation.md']);
  assert.deepEqual(route.maps, []);
  assert.equal(route.read, 'hunk');
});

test('scope derives routing, map, and QA selection from explicit paths', () => {
  const result = scopeContext(['src/Server/app/engine/Scoring.js']);

  assert.equal(result.schema_version, 2);
  assert.deepEqual(result.task_paths, ['src/Server/app/engine/Scoring.js']);
  assert.deepEqual(result.docs, ['docs/context/backend.md']);
  assert.deepEqual(result.maps, ['docs/context/map/backend.md']);
  assert.deepEqual(result.qa.server_tests, [
    'Gameplay_Events.test.js',
    'Placement_Geometry.test.js',
    'Stability_Scoring.test.js',
  ]);
  assert.ok(result.tools.some(tool => tool.name === 'QA' && tool.command.argv.includes('src/Server/app/engine/Scoring.js')));
  assert.ok(result.tools.some(tool => tool.name === 'file map'));
  assert.ok(result.limits.returned_bytes <= result.limits.max_bytes);
  assert.deepEqual(result.unmapped, []);
});

test('automation scope selects the protocol suite and retrieval benchmark', () => {
  const result = scopeContext(['scripts/context.mjs', 'scripts/task-close.mjs']);

  assert.ok(result.tools.some(tool => tool.name === 'automation protocol' && tool.command.argv.includes('scripts/tests/task-close.test.mjs')));
  assert.ok(result.tools.some(tool => tool.name === 'retrieval benchmark' && tool.command.argv.at(-1) === '--check'));
});

test('section and bundle enforce bounded source material', () => {
  const section = documentSection(ROOT, 'testing', 'Local selection matrix');
  const bundle = contextBundle(ROOT, 'updateDebugConfig', { kinds: ['symbol'], maxBytes: 1024 });

  assert.match(section.text, /qa-gate/);
  assert.match(bundle.bundle, /Source: docs\/context\/map\/backend\.md:159-159/);
  assert.ok(Buffer.byteLength(bundle.bundle) <= 1024);
  assert.equal(bundle.limits.returned_bytes, Buffer.byteLength(bundle.bundle));
});

test('direct symbol lookup exposes the same structured bounded source target', () => {
  const result = mapSymbols(ROOT, 'backend', 'updateDebugConfig');

  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].source.source_path, 'src/Server/app/Lobby_Manager.js');
  assert.equal(result.rows[0].source.read.command.display, 'sed -n 438,470p src/Server/app/Lobby_Manager.js');
});

test('the minimum search budget sheds optional metadata but keeps the bounded target', () => {
  const result = searchContext(ROOT, 'updateDebugConfig', { anchor: true, kinds: ['symbol'], maxBytes: 1024 });

  assert.equal(result.status, 'matched');
  assert.equal(result.results[0].source.source_path, 'src/Server/app/Lobby_Manager.js');
  assert.equal(result.results[0].source.read.command.display, 'sed -n 438,470p src/Server/app/Lobby_Manager.js');
  assert.ok(result.limits.returned_bytes <= 1024);
});

test('large manifest scope stays artifact-only instead of breaching the public budget', () => {
  const paths = Array.from({ length: 50 }, (_, index) => `unmapped/manifest-owned-path-${String(index).padStart(2, '0')}.mjs`);

  assert.throws(() => scopeContext(paths), /split the explicit path set/);
  const artifact = scopeContext(paths, { artifact: true });
  assert.equal(artifact.limits.max_bytes, 24 * 1024);
  assert.ok(artifact.limits.returned_bytes <= artifact.limits.max_bytes);
});
