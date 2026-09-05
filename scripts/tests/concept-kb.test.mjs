import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildConceptMaps } from '../build-concept-map.mjs';
import { conceptBundle, conceptRead, conceptRoute } from '../lib/context-query.mjs';
import { extractSourceAnchors } from '../lib/source-anchor-extraction.mjs';
import {
  CONCEPT_INDEX_BEGIN,
  CONCEPT_INDEX_END,
  CONCEPT_MAP_MARKER,
  CONCEPT_PROSE_CAPACITY,
  CONCEPT_SECTION_HARD_BYTES,
  DEFAULT_CONCEPT_BYTES,
  MAX_CONCEPT_BYTES,
  conceptProseCapacity,
  loadConceptRegistry,
  resolveRegistrySources,
} from '../lib/concept-kb.mjs';
import { validateConceptKb } from '../validate-concept-kb.mjs';

const ROOT = resolve('.');

function temporaryKb(prose, source = 'export function firstAnchor() {}\nexport function secondAnchor() {}\n') {
  const root = mkdtempSync(join(tmpdir(), 'corp-concept-kb-test-'));
  mkdirSync(join(root, 'KB/docs/context'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/example.mjs'), source);
  writeFileSync(join(root, 'KB/docs/context/index.md'), `# Experimental concept KB\n\n${CONCEPT_INDEX_BEGIN}\n${CONCEPT_INDEX_END}\n`);
  writeFileSync(join(root, 'KB/docs/context/testing.md'), prose);
  return root;
}

function clean(root) {
  rmSync(root, { recursive: true, force: true });
}

const TWO_CONCEPTS = `<!-- kb
id: test.example.first
alias: first behavior
source: src/example.mjs#firstAnchor
adjacent: test.example.second
-->
## First behavior

Only the first concept prose belongs here.

<!-- kb
id: test.example.second
alias: second behavior
source: src/example.mjs#secondAnchor
adjacent: test.example.first
-->
## Second behavior

Only the second concept prose belongs here.
`;

test('the repository concept registry is complete, deterministic, and source-grounded', () => {
  const registry = resolveRegistrySources(loadConceptRegistry({ root: ROOT }), { ready: true });
  const repeated = resolveRegistrySources(loadConceptRegistry({ root: ROOT }), { ready: true });
  const ids = registry.concepts.map(concept => concept.id);
  const aliases = registry.concepts.flatMap(concept => concept.normalized_aliases);

  assert.ok(registry.concepts.length > 0);
  assert.deepEqual(registry.concepts, repeated.concepts);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(aliases).size, aliases.length);
  assert.deepEqual(registry.errors, []);
  assert.ok(registry.concepts.every(concept => concept.sources.length > 0));
  assert.ok(registry.concepts.every(concept => concept.resolved_sources.every(source => source.status === 'resolved' && source.anchor !== '@file')));
  assert.ok(registry.concepts.every(concept => concept.adjacent.every(adjacent => registry.by_id.has(adjacent) && adjacent !== concept.id)));
  assert.ok(registry.reverse_sources.get('scripts/task-close.mjs').includes('automation.task-close.lifecycle'));
  assert.equal(new Set(registry.reverse_sources.get('scripts/task-close.mjs')).size, registry.reverse_sources.get('scripts/task-close.mjs').length);
});

test('repository concept maps and router are generated and validate cleanly', () => {
  const generated = buildConceptMaps({ root: ROOT, check: true });
  const validated = validateConceptKb({ root: ROOT });

  assert.equal(generated.status, 'passed');
  assert.deepEqual(generated.stale, []);
  assert.deepEqual(generated.removed, []);
  assert.ok(generated.registry.outputs.size > 0);
  assert.equal(validated.status, 'passed');
  assert.deepEqual(validated.errors, []);
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

test('workflow flag retrieval grants eligibility, assessment, and deterministic recording evidence', () => {
  const result = conceptRead(ROOT, 'automation.observability.flags');
  const sources = new Set(result.sources.map(source => `${source.path}#${source.anchor}`));

  assert.equal(result.status, 'matched');
  for (const source of [
    'scripts/lib/agent-observability/flagging.mjs#flagEligibility',
    'scripts/lib/agent-observability/runtime.mjs#modelFamily',
    'scripts/lib/agent-observability/flagging.mjs#createFormalFlag',
    'scripts/agent-observability.mjs#executeCommand',
  ]) assert.ok(sources.has(source), source);
  assert.ok(result.sources.every(source => source.read.lines[1] - source.read.lines[0] <= 32));
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

test('source anchors cover repository languages without a locator-map dependency', () => {
  const scene = [
    '[gd_scene format=3]',
    '[node name="GameUI" type="Control"]',
    '[node name="PlayField" type="Control" parent="."]',
    'unique_name_in_owner = true',
  ].join('\n');
  const javascript = [
    'export class SummaryController {',
    '  showSummary() {',
    '  }',
    '}',
    'export function renderSummary() {}',
  ].join('\n');
  const gdscript = [
    'class_name SummaryController',
    'signal opened',
    'func show_summary():',
    '\tpass',
  ].join('\n');

  assert.deepEqual(extractSourceAnchors('GameUI.tscn', scene).symbols, [
    { ln: 2, name: 'GameUI', kind: 'scene root' },
    { ln: 3, name: '%PlayField', kind: 'unique node' },
  ]);
  assert.deepEqual(extractSourceAnchors('SummaryController.js', javascript).symbols, [
    { ln: 1, name: 'SummaryController', kind: 'class' },
    { ln: 2, name: 'showSummary', kind: 'method' },
    { ln: 5, name: 'renderSummary', kind: 'fn' },
  ]);
  assert.deepEqual(extractSourceAnchors('SummaryController.gd', gdscript).symbols, [
    { ln: 1, name: 'SummaryController', kind: 'class_name' },
    { ln: 2, name: 'opened', kind: 'signal' },
    { ln: 3, name: 'show_summary', kind: 'func' },
  ]);
  assert.deepEqual(extractSourceAnchors('main.tf', 'module "game" {}\noutput "endpoint" {}').symbols, [
    { ln: 1, name: 'game', kind: 'module' },
    { ln: 2, name: 'endpoint', kind: 'output' },
  ]);
  assert.deepEqual(extractSourceAnchors('ci.yml', 'jobs:\n  verify:\n    runs-on: ubuntu-latest').symbols, [
    { ln: 1, name: 'jobs', kind: 'key' },
    { ln: 2, name: 'verify', kind: 'job' },
  ]);
});

test('leaf prose ownership stops before the next concept metadata block', () => {
  const root = temporaryKb(TWO_CONCEPTS);
  try {
    const registry = loadConceptRegistry({ root });
    const first = registry.by_id.get('test.example.first')[0];
    const second = registry.by_id.get('test.example.second')[0];

    assert.equal(first.section, '## First behavior\n\nOnly the first concept prose belongs here.');
    assert.equal(first.section.includes('<!-- kb'), false);
    assert.equal(second.section, '## Second behavior\n\nOnly the second concept prose belongs here.');
  } finally {
    clean(root);
  }
});

test('temporary concept maps are deterministic and include bounded resolved anchors', () => {
  const root = temporaryKb(TWO_CONCEPTS);
  try {
    const written = buildConceptMaps({ root });
    const checked = buildConceptMaps({ root, check: true });
    const map = readFileSync(join(root, 'KB/docs/context/map/concept/test.md'), 'utf8');
    const index = readFileSync(join(root, 'KB/docs/context/index.md'), 'utf8');

    assert.equal(written.status, 'passed');
    assert.equal(checked.status, 'passed');
    assert.match(map, new RegExp(CONCEPT_MAP_MARKER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(map, /src\/example\.mjs.*firstAnchor.*sed -n/);
    assert.match(map, /Adjacent concepts: `test\.example\.second`/);
    assert.match(index, /`test\.example\.first`/);
    assert.equal(validateConceptKb({ root }).status, 'passed');
  } finally {
    clean(root);
  }
});

test('filtered map generation preserves unrelated generated-map changes', () => {
  const root = temporaryKb(TWO_CONCEPTS);
  const selectedPath = 'KB/docs/context/map/concept/test.md';
  const unrelatedPath = join(root, 'KB/docs/context/map/concept/backend.md');
  try {
    writeFileSync(join(root, 'src/backend.mjs'), 'export function backendAnchor() {}\n');
    writeFileSync(join(root, 'KB/docs/context/backend.md'), `<!-- kb
id: backend.example.contract
source: src/backend.mjs#backendAnchor
-->
## Backend contract

An unrelated generated domain.
`);
    assert.equal(buildConceptMaps({ root }).status, 'passed');
    const unrelated = `${readFileSync(unrelatedPath, 'utf8')}concurrent change\n`;
    writeFileSync(unrelatedPath, unrelated);
    writeFileSync(join(root, 'src/example.mjs'), '\nexport function firstAnchor() {}\nexport function secondAnchor() {}\n');

    const filtered = buildConceptMaps({ root, mapPaths: [selectedPath] });
    const fullCheck = buildConceptMaps({ root, check: true });

    assert.equal(filtered.status, 'passed');
    assert.deepEqual(filtered.stale, [selectedPath]);
    assert.equal(readFileSync(unrelatedPath, 'utf8'), unrelated);
    assert.equal(fullCheck.status, 'stale');
    assert.deepEqual(fullCheck.stale, ['KB/docs/context/map/concept/backend.md']);
  } finally {
    clean(root);
  }
});

test('duplicate IDs and ambiguous normalized aliases are rejected', () => {
  const duplicateRoot = temporaryKb(TWO_CONCEPTS.replace('id: test.example.second', 'id: test.example.first'));
  const ambiguousRoot = temporaryKb(TWO_CONCEPTS.replace('alias: second behavior', 'alias: FIRST   BEHAVIOR'));
  try {
    assert.ok(loadConceptRegistry({ root: duplicateRoot }).errors.some(error => error.status === 'section-duplicate'));
    assert.ok(loadConceptRegistry({ root: ambiguousRoot }).errors.some(error => error.status === 'alias-ambiguous'));
    assert.equal(buildConceptMaps({ root: duplicateRoot }).status, 'failed');
    assert.equal(buildConceptMaps({ root: ambiguousRoot }).status, 'failed');
  } finally {
    clean(duplicateRoot);
    clean(ambiguousRoot);
  }
});

test('unknown and self adjacency are rejected while cycles remain valid', () => {
  const invalid = `<!-- kb
id: test.example.first
source: src/example.mjs#firstAnchor
adjacent: test.example.first
-->
## First behavior

First concept.

<!-- kb
id: test.example.second
source: src/example.mjs#secondAnchor
adjacent: test.example.missing
-->
## Second behavior

Second concept.
`;
  const root = temporaryKb(invalid);
  try {
    const errors = loadConceptRegistry({ root }).errors;
    assert.ok(errors.some(error => error.status === 'concept-unmapped' && /cannot be adjacent to itself/.test(error.message)));
    assert.ok(errors.some(error => error.status === 'concept-unmapped' && /unknown adjacency/.test(error.message)));
  } finally {
    clean(root);
  }
});

test('missing targets, missing anchors, line-number anchors, and prohibited roots fail closed', () => {
  const root = temporaryKb(`<!-- kb
id: test.failure.missing-target
source: src/missing.mjs#missingTarget
-->
## Missing target

Missing target.

<!-- kb
id: test.failure.missing-anchor
source: src/example.mjs#missingAnchor
-->
## Missing anchor

Missing anchor.

<!-- kb
id: test.failure.line-number
source: src/example.mjs#12
-->
## Line number

Line-number dependency.

<!-- kb
id: test.failure.prohibited
source: plan/secret.md#Secret
-->
## Prohibited

Prohibited source.
`);
  try {
    const resolved = resolveRegistrySources(loadConceptRegistry({ root }), { ready: true });
    const statuses = new Set(resolved.errors.map(error => error.status));

    assert.ok(statuses.has('source-target-missing'));
    assert.ok(statuses.has('source-anchor-missing'));
    assert.ok(statuses.has('access-denied'));
    assert.equal(buildConceptMaps({ root }).status, 'failed');
  } finally {
    clean(root);
  }
});

test('the validator detects stale generated output and the KB Tree line ceiling', () => {
  const root = temporaryKb(TWO_CONCEPTS);
  try {
    assert.equal(buildConceptMaps({ root }).status, 'passed');
    const mapPath = join(root, 'KB/docs/context/map/concept/test.md');
    writeFileSync(mapPath, `${readFileSync(mapPath, 'utf8')}stale\n`);
    assert.ok(validateConceptKb({ root }).errors.some(error => error.status === 'map-stale'));

    writeFileSync(join(root, 'KB/docs/context/testing.md'), TWO_CONCEPTS.replace('Only the first concept prose belongs here.', 'x'.repeat(401)));
    buildConceptMaps({ root });
    assert.ok(validateConceptKb({ root }).errors.some(error => error.status === 'budget-exceeded' && /401 chars > 400/.test(error.message)));
    assert.ok(existsSync(mapPath));
  } finally {
    clean(root);
  }
});

test('concept prose uses independent advisory bands and a wider hard ceiling', () => {
  assert.equal(DEFAULT_CONCEPT_BYTES, 16 * 1024);
  assert.equal(MAX_CONCEPT_BYTES, 32 * 1024);
  assert.equal(CONCEPT_SECTION_HARD_BYTES, 10_000);
  assert.deepEqual(CONCEPT_PROSE_CAPACITY, {
    advisory_tokens: 1200,
    strong_advisory_tokens: 1800,
    hard_tokens: 2500,
  });
  assert.equal(conceptProseCapacity(4800).status, 'ordinary');
  assert.equal(conceptProseCapacity(4801).status, 'advisory');
  assert.equal(conceptProseCapacity(7201).status, 'strong-advisory');
  assert.equal(conceptProseCapacity(10_001).status, 'hard-overage');

  const nearCeiling = Array.from({ length: 97 }, () => 'x'.repeat(100)).join('\n');
  const root = temporaryKb(TWO_CONCEPTS.replace('Only the first concept prose belongs here.', nearCeiling));
  try {
    assert.equal(buildConceptMaps({ root }).status, 'passed');
    const validated = validateConceptKb({ root });
    const read = conceptRead(root, 'test.example.first');

    assert.equal(validated.status, 'passed');
    assert.ok(validated.warnings.some(warning => warning.status === 'strong-advisory'));
    assert.equal(read.status, 'matched');
    assert.equal(read.limits.max_bytes, DEFAULT_CONCEPT_BYTES);

    const overCeiling = Array.from({ length: 101 }, () => 'x'.repeat(100)).join('\n');
    writeFileSync(join(root, 'KB/docs/context/testing.md'), TWO_CONCEPTS.replace('Only the first concept prose belongs here.', overCeiling));
    buildConceptMaps({ root });
    assert.ok(validateConceptKb({ root }).errors.some(error => error.status === 'budget-exceeded' && /KB Tree hard ceiling/.test(error.message)));
  } finally {
    clean(root);
  }
});

test('concept routing preserves the structural and tool failure taxonomy', () => {
  const root = temporaryKb(TWO_CONCEPTS);
  try {
    assert.equal(buildConceptMaps({ root }).status, 'passed');
    const sourcePath = join(root, 'src/example.mjs');
    const source = readFileSync(sourcePath, 'utf8');
    const mapPath = join(root, 'KB/docs/context/map/concept/test.md');
    const map = readFileSync(mapPath, 'utf8');

    rmSync(sourcePath);
    assert.equal(conceptRoute(root, 'test.example.first').status, 'source-target-missing');
    writeFileSync(sourcePath, source);

    writeFileSync(mapPath, map.replace('## test.example.first', '## test.example.absent'));
    assert.equal(conceptRoute(root, 'test.example.first').status, 'section-missing');

    writeFileSync(mapPath, `${map}\n## test.example.first\n`);
    assert.equal(conceptRoute(root, 'test.example.first').status, 'section-duplicate');

    writeFileSync(mapPath, map);
    writeFileSync(sourcePath, `\n${source}`);
    assert.equal(conceptRoute(root, 'test.example.first').status, 'map-stale');

    const toolError = conceptRoute({}, 'test.example.first');
    assert.equal(toolError.status, 'tool-error');
    assert.ok(toolError.reason);
    assert.equal(toolError.fallback.allowed, false);
  } finally {
    clean(root);
  }
});
