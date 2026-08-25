import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { contextBundle, documentSection, routeContext, scopeContext, searchContext } from '../lib/context-query.mjs';

const ROOT = resolve('.');

test('search returns a bounded, provenance-bearing exact symbol match', () => {
  const result = searchContext(ROOT, 'updateDebugConfig', { kinds: ['symbol'] });

  assert.equal(result.schema_version, 1);
  assert.equal(result.results.length, 1);
  assert.deepEqual(result.results[0].lines, [159, 159]);
  assert.equal(result.results[0].path, 'docs/context/map/backend.md');
  assert.match(result.results[0].excerpt, /Lobby_Manager\.js/);
});

test('search filters by an existing domain and asks for refinement when bounded', () => {
  const result = searchContext(ROOT, 'impact', { domains: ['backend'] });

  assert.ok(result.results.length <= 8);
  assert.ok(result.results.every(item => item.path === 'docs/context/backend.md' || item.path === 'docs/context/map/backend.md'));
  assert.ok(result.warnings.some(warning => warning.startsWith('refine query:')));
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

test('scope derives routing, map, and QA selection from explicit paths', () => {
  const result = scopeContext(['src/Server/app/engine/Scoring.js']);

  assert.deepEqual(result.docs, ['docs/context/backend.md']);
  assert.deepEqual(result.maps, ['docs/context/map/backend.md']);
  assert.deepEqual(result.qa.server_tests, [
    'Gameplay_Events.test.js',
    'Placement_Geometry.test.js',
    'Stability_Scoring.test.js',
  ]);
  assert.deepEqual(result.unmapped, []);
});

test('section and bundle enforce bounded source material', () => {
  const section = documentSection(ROOT, 'testing', 'Local selection matrix');
  const bundle = contextBundle(ROOT, 'updateDebugConfig', { kinds: ['symbol'], maxBytes: 1024 });

  assert.match(section.text, /qa-gate/);
  assert.match(bundle.bundle, /Source: docs\/context\/map\/backend\.md:159-159/);
  assert.ok(Buffer.byteLength(bundle.bundle) <= 1024);
});
