import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  conceptBundle,
  conceptRead,
  conceptRoute,
  contextBundle,
  documentSection,
  mapSymbols,
  routeContext,
  scopeContext,
  searchContext,
} from '../lib/context-query.mjs';
import { documentationNeedlesForPath, isNormalContextExcludedPath } from '../lib/context-routing.mjs';
import { AUTOMATION_PROTOCOL_TESTS, CONCEPT_KB_TESTS, TUTORIAL_PARITY_TEST } from '../qa-gate.mjs';

const ROOT = resolve('.');

function assertBoundedSource(source, path) {
  assert.equal(source.source_path, path);
  assert.ok(Number.isInteger(source.source_line) && source.source_line > 0);
  const [start, end] = source.read.lines;
  assert.ok(start <= source.source_line && end >= source.source_line);
  assert.ok(end - start <= 32);
  assert.equal(source.read.command.display, `sed -n ${start},${end}p ${path}`);
}

test('search returns a bounded, provenance-bearing exact symbol match', () => {
  const result = searchContext(ROOT, 'updateDebugConfig', { kinds: ['symbol'] });

  assert.equal(result.schema_version, 2);
  assert.equal(result.status, 'matched');
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0].lines[0], result.results[0].lines[1]);
  assert.ok(result.results[0].lines[0] > 0);
  assert.equal(result.results[0].path, 'docs/context/map/backend.md');
  assertBoundedSource(result.results[0].source, 'src/Server/app/Lobby_Manager.js');
  assert.equal(result.results[0].source.symbol, 'updateDebugConfig');
  assert.equal('excerpt' in result.results[0], false);
  assert.equal(result.fallback.allowed, false);
  assert.equal(result.limits.returned_bytes, Buffer.byteLength(JSON.stringify(result, null, 2)) + 1);
});

test('compact maps keep an existing domain search within the result budget', () => {
  const result = searchContext(ROOT, 'splash', { domains: ['screens'], anchor: true });

  assert.equal(result.status, 'matched');
  assert.ok(result.results.length <= 5);
  assert.ok(result.results.every(item => item.path === 'docs/context/ui.md' || item.path === 'docs/context/map/ui-screens.md'));
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

test('an explicit anchor resolves through the bounded retrieval vocabulary bridge', () => {
  const result = searchContext(ROOT, 'bindTask', { anchor: true });

  assert.equal(result.status, 'matched');
  assert.equal(result.results[0].source.source_path, 'scripts/lib/agent-observability/state.mjs');
  assert.equal(result.results[0].source.symbol, 'bindActiveTask');
});

test('a product-state anchor returns a bounded source target instead of docs only', () => {
  const result = searchContext(ROOT, 'tower_collapsed', { anchor: true });
  const source = result.results.find(item => item.source?.source_path === 'src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd');

  assert.equal(result.status, 'matched');
  assert.equal(source.source.symbol, 'tower_collapsed');
  assertBoundedSource(source.source, 'src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd');
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

test('working folders route to explicit plan, repair, and reference guidance', () => {
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
  const repair = routeContext('repair/retrieval-repair-12345678.md');
  assert.equal(repair.skill, 'docs-steward');
  assert.equal(repair.workspace.name, 'repair');
  assert.match(repair.workspace.policy, /Never use repair handoffs/);
});

test('legacy retrieval benchmark reports remain non-context output', () => {
  const route = routeContext('report/benchmarks/latest.json');

  assert.equal(route.skill, 'docs-steward');
  assert.deepEqual(route.docs, []);
  assert.deepEqual(route.maps, []);
  assert.equal(route.workspace.name, 'report');
});

test('observability reports route as explicit non-context output', () => {
  const route = routeContext('report/archive/v2/data/task-records.jsonl');

  assert.equal(route.skill, 'docs-steward');
  assert.deepEqual(route.docs, []);
  assert.equal(route.workspace.name, 'report');
  assert.match(route.workspace.policy, /Never use reports/);
  assert.equal(isNormalContextExcludedPath('report/observability/2026-W35.md'), true);
  assert.equal(isNormalContextExcludedPath('./.agent-state/telemetry/v2/tasks/a.json'), true);
  assert.equal(isNormalContextExcludedPath('.\\report\\observability\\2026-W35.md'), true);
  assert.equal(isNormalContextExcludedPath('repair/retrieval-repair-12345678.md'), true);
  assert.equal(isNormalContextExcludedPath('scripts/agent-observability.mjs'), false);
});

test('observability source routes to the automation contract', () => {
  const route = routeContext('scripts/lib/agent-observability/usage.mjs');

  assert.equal(route.skill, 'docs-steward');
  assert.deepEqual(route.docs, ['docs/context/automation.md']);
  assert.deepEqual(route.maps, ['docs/context/map/infra.md']);
});

test('game state source routes to both backend and wire contracts', () => {
  const route = routeContext('src/Server/app/Game_Engine.js');

  assert.equal(route.skill, 'server-engineer');
  assert.deepEqual(route.docs, [
    'docs/context/backend.md',
    'docs/context/networking.md',
  ]);
  assert.deepEqual(route.maps, ['docs/context/map/backend.md']);
});

test('documentation scope follows routed anchors when a source file moves its artifact', () => {
  const needles = documentationNeedlesForPath('scripts/fixtures/context-retrieval.json');
  const automation = readFileSync(join(ROOT, 'docs/context/automation.md'), 'utf8');

  assert.ok(needles.includes('report/benchmarks/'));
  assert.ok(needles.some(needle => automation.includes(needle)));
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
  const protocol = result.tools.find(tool => tool.name === 'automation protocol');

  assert.deepEqual(result.qa.tooling_tests, [
    'scripts/tests/context-query.test.mjs',
    'scripts/tests/task-close.test.mjs',
  ]);
  assert.deepEqual(protocol.command.argv, ['node', '--test', ...AUTOMATION_PROTOCOL_TESTS]);
  assert.ok(result.tools.some(tool => tool.name === 'retrieval benchmark' && tool.command.argv.at(-1) === '--check'));
});

test('tutorial parity selection does not create automation protocol scope', () => {
  const paths = [
    'src/Server/app/Game_Config.js',
    'src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd',
    'scripts/lib/tutorial-defaults-parity.mjs',
    TUTORIAL_PARITY_TEST,
  ];

  for (const path of paths) {
    const result = scopeContext([path]);
    assert.deepEqual(result.qa.contract_tests, [TUTORIAL_PARITY_TEST]);
    assert.deepEqual(result.qa.tooling_tests, []);
    assert.equal(result.tools.some(tool => tool.name === 'automation protocol'), false);
    assert.equal(result.tools.some(tool => tool.name === 'retrieval benchmark'), false);
    assert.ok(result.tools.find(tool => tool.name === 'QA').command.argv.includes(path));
    if (path.startsWith('scripts/')) {
      assert.ok(result.docs.includes('docs/context/testing.md'));
      assert.ok(result.docs.includes('docs/context/ui-tutorial.md'));
    }
  }
});

test('section and bundle enforce bounded source material', () => {
  const section = documentSection(ROOT, 'testing', 'Local selection');
  const bundle = contextBundle(ROOT, 'updateDebugConfig', { kinds: ['symbol'], maxBytes: 1024 });

  assert.match(section.text, /qa-gate/);
  assert.match(bundle.bundle, /Source: docs\/context\/map\/backend\.md:(\d+)-\1/);
  assert.ok(Buffer.byteLength(bundle.bundle) <= 1024);
  assert.equal(bundle.limits.returned_bytes, Buffer.byteLength(bundle.bundle));
});

test('direct symbol lookup exposes the same structured bounded source target', () => {
  const result = mapSymbols(ROOT, 'backend', 'updateDebugConfig');

  assert.equal(result.rows.length, 1);
  assertBoundedSource(result.rows[0].source, 'src/Server/app/Lobby_Manager.js');
});

test('the minimum search budget sheds optional metadata but keeps the bounded target', () => {
  const result = searchContext(ROOT, 'updateDebugConfig', { anchor: true, kinds: ['symbol'], maxBytes: 1024 });

  assert.equal(result.status, 'matched');
  assertBoundedSource(result.results[0].source, 'src/Server/app/Lobby_Manager.js');
  assert.ok(result.limits.returned_bytes <= 1024);
});

test('large manifest scope stays artifact-only instead of breaching the public budget', () => {
  const paths = Array.from({ length: 50 }, (_, index) => `unmapped/manifest-owned-path-${String(index).padStart(2, '0')}.mjs`);

  assert.throws(() => scopeContext(paths), /split the explicit path set/);
  const artifact = scopeContext(paths, { artifact: true });
  assert.equal(artifact.limits.max_bytes, 24 * 1024);
  assert.ok(artifact.limits.returned_bytes <= artifact.limits.max_bytes);
});

test('concept routing resolves an exact ID to its owner, generated map, and bounded source grant', () => {
  const result = conceptRoute(ROOT, 'hud.tower.collapse.presentation');

  assert.equal(result.schema_version, 1);
  assert.equal(result.status, 'matched');
  assert.equal(result.query.resolution, 'id');
  assert.equal(result.concept.id, 'hud.tower.collapse.presentation');
  assert.equal(result.concept.owner.path, 'KB/docs/context/ui-hud.md');
  assert.equal(result.map.path, 'KB/docs/context/map/concept/hud.md');
  assert.match(result.map.text, /^## hud\.tower\.collapse\.presentation/m);
  assert.ok(result.sources.some(source => source.path.endsWith('/TowerStack.gd') && source.anchor === '_begin_collapse'));
  assert.ok(result.sources.every(source => source.read.lines[1] - source.read.lines[0] <= 32));
  assert.equal(result.fallback.allowed, false);
  assert.ok(result.limits.returned_bytes <= result.limits.max_bytes);
});

test('concept read resolves an exact normalized alias and returns only its prose leaf', () => {
  const result = conceptRead(ROOT, '  CRITICAL   SAVE  ');

  assert.equal(result.status, 'matched');
  assert.equal(result.query.resolution, 'alias');
  assert.equal(result.concept.id, 'gameplay.scoring.critical-save');
  assert.equal(result.prose.heading, 'Critical Save');
  assert.equal(result.prose.lines[0], result.concept.owner.lines[0]);
  assert.equal(result.prose.lines[1], result.concept.owner.lines[1]);
  assert.match(result.prose.text, /^## Critical Save/);
  assert.equal(result.prose.text.includes('<!-- kb'), false);
  assert.ok(result.sources.some(source => source.path.endsWith('/Scoring.js') && source.anchor === 'getCriticalSavePreview'));
});

test('concept adjacency is an explicit next call and is never auto-loaded', () => {
  const presentation = conceptRead(ROOT, 'hud.tower.collapse.presentation');
  const recoveryEdge = presentation.adjacent.find(adjacent => adjacent.id === 'hud.tower.collapse.recovery');

  assert.equal(recoveryEdge.loaded, false);
  assert.deepEqual(recoveryEdge.command.argv, ['node', 'scripts/context.mjs', 'concept-route', 'hud.tower.collapse.recovery']);
  assert.equal(presentation.prose.text.includes('Collapse recovery after presentation'), false);

  const recovery = conceptRead(ROOT, recoveryEdge.id);
  assert.equal(recovery.status, 'matched');
  assert.equal(recovery.concept.id, 'hud.tower.collapse.recovery');
  assert.ok(recovery.adjacent.some(adjacent => adjacent.id === presentation.concept.id && adjacent.loaded === false));
});

test('concept bundle remains bounded, provenance-bearing, and excludes adjacent prose', () => {
  const result = conceptBundle(ROOT, 'collapse framing', { maxBytes: 2048 });

  assert.equal(result.status, 'matched');
  assert.equal(result.limits.returned_bytes, Buffer.byteLength(result.bundle));
  assert.ok(result.limits.returned_bytes <= 2048);
  assert.match(result.bundle, /## Concept prose/);
  assert.match(result.bundle, /## Source grants/);
  assert.match(result.bundle, /## Provenance/);
  assert.match(result.bundle, /hud\.tower\.collapse\.recovery.*not loaded/);
  assert.equal(result.bundle.includes('Collapse recovery after presentation'), false);
});

test('concept retrieval fails closed for unknown concepts and insufficient budgets', () => {
  const unknown = conceptRoute(ROOT, 'concept.that.does.not.exist');
  const tooSmall = conceptRead(ROOT, 'gameplay.scoring.critical-save', { maxBytes: 1024 });

  assert.equal(unknown.status, 'concept-unmapped');
  assert.match(unknown.reason, /no canonical concept id/);
  assert.equal(unknown.fallback.allowed, false);
  assert.equal(tooSmall.status, 'budget-exceeded');
  assert.match(tooSmall.reason, /exceeds the 1024 byte limit/);
  assert.equal(tooSmall.fallback.allowed, false);
});

test('legacy route and search corpora remain isolated from the experimental KB', () => {
  const route = routeContext('gameplay');
  const search = searchContext(ROOT, 'critical save', { includeExcerpt: true });
  const kbRoute = routeContext('KB/docs/context/gameplay.md');

  assert.ok(route.docs.every(path => path.startsWith('docs/context/')));
  assert.ok(route.maps.every(path => path.startsWith('docs/context/map/')));
  assert.ok(search.results.every(result => !result.path.startsWith('KB/')));
  assert.deepEqual(kbRoute.docs, []);
  assert.deepEqual(kbRoute.maps, []);
  assert.equal(kbRoute.skill, 'docs-steward');
  assert.equal(isNormalContextExcludedPath('KB/docs/context/gameplay.md'), false);
});

test('concept KB scope selects only the focused concept protocol additions', () => {
  const result = scopeContext(['KB/docs/context/gameplay.md']);

  assert.equal(result.qa.concept_kb, true);
  assert.deepEqual(result.qa.tooling_tests, [...CONCEPT_KB_TESTS].sort());
  assert.deepEqual(result.docs, []);
  assert.deepEqual(result.maps, []);
  assert.ok(result.tools.some(tool => tool.name === 'concept map'));
  assert.ok(result.tools.some(tool => tool.name === 'concept KB'));
  assert.ok(result.tools.some(tool => tool.name === 'concept benchmark'));
  assert.equal(result.qa.runtime_applies, false);
});
