import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildConceptMaps } from '../build-concept-map.mjs';
import { conceptRoute } from '../lib/context-query.mjs';
import {
  CONCEPT_INDEX_BEGIN,
  CONCEPT_INDEX_END,
  CONCEPT_MAP_MARKER,
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
  const ids = registry.concepts.map(concept => concept.id);
  const aliases = registry.concepts.flatMap(concept => concept.normalized_aliases);

  assert.equal(registry.concepts.length, 185);
  assert.equal(registry.concepts.reduce((sum, concept) => sum + concept.sources.length, 0), 247);
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
  assert.equal(generated.registry.outputs.size, 11);
  assert.equal(validated.status, 'passed');
  assert.deepEqual(validated.errors, []);
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

test('the validator detects stale generated output and the experimental line ceiling', () => {
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
