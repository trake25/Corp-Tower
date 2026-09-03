import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { buildConceptMaps } from '../build-concept-map.mjs';
import {
  exportKbCalibrationReport,
  writeKbCalibrationReport,
} from '../export-kb-calibration-report.mjs';
import {
  KB_CALIBRATION_STATE_PATH,
  measureKbCalibration,
  readLatestKbCalibrationSnapshot,
  validateKbCalibrationSnapshot,
  writeKbCalibrationSnapshot,
} from '../lib/kb-calibration.mjs';

const FIXED_NOW = new Date('2026-09-03T04:05:06.789Z');

function fixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'corp-kb-calibration-test-'));
  mkdirSync(join(root, 'KB/docs/context'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  const source = Array.from({ length: 80 }, (_, index) => {
    if (index === 19) return 'export function firstAnchor() {}';
    if (index === 24) return 'const DO_NOT_PERSIST_SOURCE_CONTENT = true;';
    if (index === 29) return 'export function secondAnchor() {}';
    return `const line_${String(index + 1).padStart(2, '0')} = ${index + 1};`;
  }).join('\n');
  writeFileSync(join(root, 'src/example.mjs'), `${source}\n`);
  writeFileSync(join(root, 'KB/docs/context/index.md'), '# Experimental\n\n<!-- BEGIN GENERATED CONCEPT ROUTER -->\n<!-- END GENERATED CONCEPT ROUTER -->\n');
  writeFileSync(join(root, 'KB/docs/context/testing.md'), `<!-- kb
id: test.calibration.first
source: src/example.mjs#firstAnchor
source: src/example.mjs#secondAnchor
adjacent: test.calibration.second
-->
## First calibration concept

The first concept has overlapping source grants so deterministic measurement can prove range merging. It owns the overlap example rather than source behavior.

<!-- kb
id: test.calibration.second
source: src/example.mjs#secondAnchor
-->
## Second calibration concept

The second concept completes a two-concept journey. It shares one source window without copying the first concept's contract.
`);
  assert.equal(buildConceptMaps({ root }).status, 'passed');
  return root;
}

function measure(root, now = FIXED_NOW) {
  return measureKbCalibration({
    root,
    conceptIds: ['test.calibration.first'],
    journeys: [{
      id: 'overlap-journey',
      concepts: ['test.calibration.first', 'test.calibration.second'],
    }],
    now,
    head: null,
  });
}

function clean(root) {
  rmSync(root, { recursive: true, force: true });
}

test('calibration measurement is deterministic and merges overlapping source windows', () => {
  const root = fixtureRoot();
  try {
    const first = measure(root);
    const second = measure(root);
    const concept = first.concepts.find(item => item.id === 'test.calibration.first');
    const journey = first.journeys[0];

    assert.deepEqual(first, second);
    assert.equal(first.concepts.length, 2);
    assert.equal(concept.source_grant_count, 2);
    assert.equal(concept.source_ranges.length, 2);
    assert.deepEqual(concept.source_unique_ranges.map(range => range.lines), [[8, 50]]);
    assert.ok(concept.source_unique.bytes < concept.source_total.bytes);
    assert.equal(concept.complete_unique.bytes, concept.prose.bytes + concept.route_map.bytes + concept.source_unique.bytes);
    assert.equal(journey.concept_count, 2);
    assert.deepEqual(journey.adjacency_hops, [{ from: 'test.calibration.first', to: 'test.calibration.second' }]);
    assert.equal(journey.prose_route.bytes, journey.prose.bytes + journey.route_map.bytes);
    assert.ok(journey.source_unique.bytes < journey.source_total.bytes);
  } finally {
    clean(root);
  }
});

test('private snapshots use ignored benchmark state, retain bounded runs, and contain no source text', () => {
  const root = fixtureRoot();
  try {
    const snapshots = [0, 1, 2].map(offset => measure(root, new Date(FIXED_NOW.getTime() + offset)));
    for (const snapshot of snapshots) writeKbCalibrationSnapshot({ root, snapshot, retention: 2 });
    const stateRoot = join(root, KB_CALIBRATION_STATE_PATH);
    const latest = readLatestKbCalibrationSnapshot({ root });
    const serialized = readFileSync(join(stateRoot, 'latest.json'), 'utf8');

    assert.equal(latest.run_id, snapshots[2].run_id);
    assert.equal(readdirSync(join(stateRoot, 'runs')).length, 2);
    assert.equal(serialized.includes('DO_NOT_PERSIST_SOURCE_CONTENT'), false);
    assert.equal(serialized.includes('prompt'), false);
    assert.ok(existsSync(join(stateRoot, 'latest.json')));
    assert.throws(() => validateKbCalibrationSnapshot({ ...latest, prompt: 'private' }), /unsupported field/);
  } finally {
    clean(root);
  }
});

test('manual export versions sanitized reports deterministically and refuses collisions', () => {
  const root = fixtureRoot();
  try {
    const snapshot = measure(root);
    writeKbCalibrationSnapshot({ root, snapshot });
    const first = exportKbCalibrationReport({ root });
    const second = exportKbCalibrationReport({ root });
    const firstBody = readFileSync(join(root, first), 'utf8');

    assert.equal(first, 'report/benchmarks/kb-context/kb-context-calibration-v001.md');
    assert.equal(second, 'report/benchmarks/kb-context/kb-context-calibration-v002.md');
    assert.match(firstBody, /Footprint distribution/);
    assert.match(firstBody, /Calibration journeys/);
    assert.match(firstBody, /Heuristic review prompts/);
    assert.equal(firstBody.includes('DO_NOT_PERSIST_SOURCE_CONTENT'), false);
    assert.equal(firstBody.includes('src\/example.mjs'), false);
    assert.throws(() => writeKbCalibrationReport({
      snapshot,
      outputRoot: join(root, 'report/benchmarks/kb-context'),
      version: 2,
    }), /refusing to overwrite/);
  } finally {
    clean(root);
  }
});

test('manual export fails clearly when no completed private snapshot exists', () => {
  const root = mkdtempSync(join(tmpdir(), 'corp-kb-calibration-empty-'));
  try {
    assert.throws(() => exportKbCalibrationReport({ root }), /no private KB calibration snapshot/);
  } finally {
    clean(root);
  }
});
