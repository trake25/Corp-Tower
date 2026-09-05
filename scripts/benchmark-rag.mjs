#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { measureKbCalibration, writeKbCalibrationSnapshot } from './lib/kb-calibration.mjs';
import { conceptBundle, conceptRead, conceptRoute } from './lib/context-query.mjs';

const ROOT = resolve(process.argv.find((argument, index) => index > 1 && !argument.startsWith('-')) || '.');

function syntheticConceptRoot(setup) {
  const root = mkdtempSync(join(tmpdir(), 'corp-concept-benchmark-'));
  mkdirSync(join(root, 'KB/docs/context'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/example.mjs'), 'export function firstAnchor() {}\nexport function secondAnchor() {}\n');
  writeFileSync(join(root, 'KB/docs/context/index.md'), '# KB Tree fixture\n\n<!-- BEGIN GENERATED CONCEPT ROUTER -->\n<!-- END GENERATED CONCEPT ROUTER -->\n');
  let prose = '';
  if (setup === 'ambiguous-alias') {
    prose = `<!-- kb
id: test.alias.first
alias: shared alias
source: src/example.mjs#firstAnchor
-->
## First

First concept.

<!-- kb
id: test.alias.second
alias: shared alias
source: src/example.mjs#secondAnchor
-->
## Second

Second concept.
`;
  } else if (setup === 'missing-anchor') {
    prose = `<!-- kb
id: test.failure.missing-anchor
source: src/example.mjs#absentAnchor
-->
## Missing anchor

The target anchor is deliberately absent.
`;
  } else if (setup === 'prohibited-source') {
    mkdirSync(join(root, 'plan'), { recursive: true });
    writeFileSync(join(root, 'plan/secret.md'), '## Secret\n');
    prose = `<!-- kb
id: test.failure.prohibited-source
source: plan/secret.md#Secret
-->
## Prohibited source

The source grant is deliberately prohibited.
`;
  }
  writeFileSync(join(root, 'KB/docs/context/testing.md'), prose);
  return root;
}

export function runConceptBenchmark({ root = ROOT } = {}) {
  const conceptFixtures = JSON.parse(readFileSync(join(root, 'scripts/fixtures/concept-retrieval.json'), 'utf8'));
  const routes = conceptFixtures.routes.map(fixture => {
    const startedAt = performance.now();
    const route = conceptRoute(root, fixture.query);
    const read = conceptRead(root, fixture.query);
    const bundle = conceptBundle(root, fixture.query);
    const source = route.sources?.find(item => item.path === fixture.source && item.anchor === fixture.anchor);
    const adjacent = fixture.adjacent ? route.adjacent?.find(item => item.id === fixture.adjacent) : true;
    const correct = route.status === 'matched'
      && route.query.resolution === fixture.resolution
      && route.concept.id === fixture.concept
      && route.concept.owner.path === fixture.owner
      && route.map.path.startsWith('KB/docs/context/map/concept/')
      && route.map.text.startsWith(`## ${fixture.concept}\n`)
      && Boolean(source)
      && source.read.command.argv[0] === 'sed'
      && source.read.lines[1] - source.read.lines[0] <= 32
      && (!fixture.adjacent || adjacent?.loaded === false)
      && read.status === 'matched'
      && read.prose.path === fixture.owner
      && read.prose.lines[0] === route.concept.owner.lines[0]
      && read.prose.lines[1] === route.concept.owner.lines[1]
      && read.prose.text.startsWith(`## ${route.concept.owner.heading}\n`)
      && !read.prose.text.includes('<!-- kb')
      && bundle.status === 'matched'
      && bundle.limits.returned_bytes === Buffer.byteLength(bundle.bundle)
      && bundle.limits.returned_bytes <= bundle.limits.max_bytes
      && bundle.bundle.includes('## Provenance')
      && (!fixture.bundle_excludes || !bundle.bundle.includes(fixture.bundle_excludes));
    return {
      id: fixture.id,
      correct,
      status: route.status,
      concept: route.concept?.id || null,
      bytes: bundle.limits.returned_bytes,
      wall_time_ms: Number((performance.now() - startedAt).toFixed(3)),
    };
  });
  const failures = conceptFixtures.failures.map(fixture => {
    const fixtureRoot = fixture.setup === 'repository' ? root : syntheticConceptRoot(fixture.setup);
    try {
      const result = conceptRoute(fixtureRoot, fixture.query);
      return {
        id: fixture.id,
        correct: result.status === fixture.status && Boolean(result.reason) && result.fallback.allowed === false,
        status: result.status,
      };
    } finally {
      if (fixtureRoot !== root) rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
  const passedRoutes = routes.filter(result => result.correct).length;
  const passedFailures = failures.filter(result => result.correct).length;
  let passed = passedRoutes === routes.length && passedFailures === failures.length;
  for (const result of [...routes, ...failures].filter(result => !result.correct))
    console.error(`x ${result.id}: ${result.status}`);
  let calibration = null;
  if (passed) {
    try {
      const snapshot = measureKbCalibration({
        root,
        conceptIds: routes.map(result => result.concept),
        journeys: conceptFixtures.journeys || [],
      });
      const paths = writeKbCalibrationSnapshot({ root, snapshot });
      calibration = { concepts: snapshot.concepts.length, journeys: snapshot.journeys.length, latest: paths.latest };
    } catch (error) {
      passed = false;
      console.error(`x calibration: ${error.message}`);
    }
  }
  const calibrationSummary = calibration
    ? `; calibration ${calibration.concepts} concepts/${calibration.journeys} journeys -> ${calibration.latest}`
    : '';
  const summary = `${passed ? 'PASS' : 'FAIL'} — concept retrieval ${passedRoutes}/${routes.length}, fail-closed ${passedFailures}/${failures.length}${calibrationSummary}`;
  return { passed, summary, routes, failures, calibration };
}

function main() {
  const options = process.argv.slice(2).filter(argument => argument.startsWith('-'));
  if (options.length !== 1 || options[0] !== '--concept-check') {
    console.error('usage: node scripts/benchmark-rag.mjs --concept-check [repository-root]');
    process.exit(2);
  }
  const result = runConceptBenchmark();
  console.log(result.summary);
  if (!result.passed) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
