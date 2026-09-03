#!/usr/bin/env node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { tmpdir } from 'node:os';
import { AREA_ALIASES, routeSourcePath } from './lib/context-routing.mjs';
import {
  conceptBundle,
  conceptRead,
  conceptRoute,
  measuredText,
  routeContext,
  routeTextLines,
  scopeContext,
  scopeTextLines,
  searchContext,
  searchTextLines,
} from './lib/context-query.mjs';

const ROOT = resolve(process.argv.find((argument, index) => index > 1 && !argument.startsWith('-')) || '.');
const CHECK = process.argv.includes('--check');
const CONCEPT_CHECK = process.argv.includes('--concept-check');

function syntheticConceptRoot(setup) {
  const root = mkdtempSync(join(tmpdir(), 'corp-concept-benchmark-'));
  mkdirSync(join(root, 'KB/docs/context'), { recursive: true });
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/example.mjs'), 'export function firstAnchor() {}\nexport function secondAnchor() {}\n');
  writeFileSync(join(root, 'KB/docs/context/index.md'), '# Experimental\n\n<!-- BEGIN GENERATED CONCEPT ROUTER -->\n<!-- END GENERATED CONCEPT ROUTER -->\n');
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

function runConceptBenchmark() {
  const conceptFixtures = JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/concept-retrieval.json'), 'utf8'));
  const routes = conceptFixtures.routes.map(fixture => {
    const startedAt = performance.now();
    const route = conceptRoute(ROOT, fixture.query);
    const read = conceptRead(ROOT, fixture.query);
    const bundle = conceptBundle(ROOT, fixture.query);
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
    const root = fixture.setup === 'repository' ? ROOT : syntheticConceptRoot(fixture.setup);
    try {
      const result = conceptRoute(root, fixture.query);
      return {
        id: fixture.id,
        correct: result.status === fixture.status && Boolean(result.reason) && result.fallback.allowed === false,
        status: result.status,
      };
    } finally {
      if (root !== ROOT) rmSync(root, { recursive: true, force: true });
    }
  });
  const passedRoutes = routes.filter(result => result.correct).length;
  const passedFailures = failures.filter(result => result.correct).length;
  const passed = passedRoutes === routes.length && passedFailures === failures.length;
  for (const result of [...routes, ...failures].filter(result => !result.correct))
    console.error(`x ${result.id}: ${result.status}`);
  console.log(`${passed ? 'PASS' : 'FAIL'} — concept retrieval ${passedRoutes}/${routes.length}, fail-closed ${passedFailures}/${failures.length}`);
  process.exit(passed ? 0 : 1);
}

if (CONCEPT_CHECK) runConceptBenchmark();

const fixtures = JSON.parse(readFileSync(join(ROOT, 'scripts/fixtures/context-retrieval.json'), 'utf8'));
const started = new Date().toISOString();

function queryMap(map, query) {
  const body = readFileSync(join(ROOT, `docs/context/map/${map}.md`), 'utf8');
  const rows = body.split(/\r?\n/).filter(line => /^\|\s*[^|]+:\d+\s*\|/.test(line) && line.toLowerCase().includes(query.toLowerCase()));
  return { rows: rows.slice(0, 8), overflow: rows.length > 8 };
}

function matchesExpectation(result, expects) {
  if (expects.status && result.status !== expects.status) return false;
  if (expects.path && !result.results.some(item => item.path === expects.path && (!expects.title || item.title === expects.title))) return false;
  if (expects.source && !result.results.some(item => item.source?.source_path === expects.source)) return false;
  if (expects.anchor && !result.next_actions.some(item => item.anchor === expects.anchor)) return false;
  if (expects.action && !result.next_actions.some(item => item.type === expects.action || item.command.argv[2] === expects.action)) return false;
  if (typeof expects.fallback === 'boolean' && result.fallback.allowed !== expects.fallback) return false;
  return true;
}

const retrieval = fixtures.retrieval.map(fixture => {
  const start = performance.now();
  const route = AREA_ALIASES[fixture.area];
  let bytes = Buffer.byteLength(JSON.stringify(route || {}));
  const lookups = fixture.queries.map(item => {
    const result = queryMap(item.map, item.query);
    bytes += Buffer.byteLength(result.rows.join('\n'));
    return { ...item, matches: result.rows.length, overflow: result.overflow, correct: result.rows.some(row => row.includes(item.expects)) };
  });
  return {
    id: fixture.id,
    correctness: lookups.every(item => item.correct),
    first_route_hit: Boolean(route),
    fallback: false,
    whole_document_reads: 0,
    repository_bytes_returned: bytes,
    estimated_tokens: Math.round(bytes / 4),
    tool_calls: 1 + lookups.length,
    wall_time_ms: Number((performance.now() - start).toFixed(3)),
    route: fixture.area,
    skill: route?.skill || null,
    lookups,
  };
});

const skills = fixtures.skills.map(fixture => {
  const start = performance.now();
  const route = routeSourcePath(fixture.path);
  return {
    id: fixture.id,
    path: fixture.path,
    expected_skill: fixture.expects,
    selected_skill: route?.skill || null,
    correct: route?.skill === fixture.expects,
    wall_time_ms: Number((performance.now() - start).toFixed(3)),
  };
});

const protocol = (fixtures.protocol || []).map(fixture => {
  const start = performance.now();
  if (fixture.command === 'search') {
    const result = searchContext(ROOT, fixture.query, fixture.options);
    return {
      id: fixture.id,
      command: fixture.command,
      correct: matchesExpectation(result, fixture.expects),
      status: result.status,
      returned: result.results.length,
      bytes: result.limits.returned_bytes,
      wall_time_ms: Number((performance.now() - start).toFixed(3)),
    };
  }
  if (fixture.command === 'scope') {
    const result = scopeContext(fixture.paths);
    const correct = result.routes.some(route => route.skill === fixture.expects.skill) && result.qa.server_tests.includes(fixture.expects.test) && result.tools.some(tool => tool.name === 'QA');
    return {
      id: fixture.id,
      command: fixture.command,
      correct,
      returned: result.task_paths.length,
      bytes: result.limits.returned_bytes,
      wall_time_ms: Number((performance.now() - start).toFixed(3)),
    };
  }
  return { id: fixture.id, command: fixture.command, correct: false, returned: 0, bytes: 0, wall_time_ms: Number((performance.now() - start).toFixed(3)) };
});

const sessions = (fixtures.sessions || []).map(fixture => {
  const start = performance.now();
  const route = routeContext(fixture.route);
  let providerBytes = measuredText(routeTextLines(route)).bytes;
  const steps = fixture.steps.map(step => {
    const result = searchContext(ROOT, step.query, step.options);
    const rendered = measuredText(searchTextLines(result));
    providerBytes += rendered.bytes;
    return {
      query: step.query,
      status: result.status,
      correct: matchesExpectation(result, step.expects),
      provider_facing_bytes: rendered.bytes,
      results: result.results.length,
      fallback_authorized: result.fallback.allowed,
      fallback_used: false,
    };
  });
  return {
    id: fixture.id,
    correct: steps.every(step => step.correct),
    provider_facing_bytes: providerBytes,
    estimated_tokens: Math.round(providerBytes / 4),
    tool_calls: 1 + steps.length,
    whole_document_reads: 0,
    fallback_used: false,
    wall_time_ms: Number((performance.now() - start).toFixed(3)),
    steps,
  };
});

const correct = retrieval.filter(item => item.correctness).length;
const first = retrieval.filter(item => item.first_route_hit).length;
const legacyMedian = [...retrieval].sort((a, b) => a.estimated_tokens - b.estimated_tokens)[Math.floor(retrieval.length / 2)].estimated_tokens;
const skillCorrect = skills.filter(item => item.correct).length;
const protocolCorrect = protocol.filter(item => item.correct).length;
const sessionCorrect = sessions.filter(item => item.correct).length;
const providerMedianBytes = [...sessions].sort((a, b) => a.provider_facing_bytes - b.provider_facing_bytes)[Math.floor(sessions.length / 2)]?.provider_facing_bytes || 0;
const baselineBytes = fixtures.baseline.median_provider_facing_bytes;
const reductionPercent = baselineBytes ? Number((((baselineBytes - providerMedianBytes) / baselineBytes) * 100).toFixed(1)) : null;
const reductionTargetMet = reductionPercent !== null && reductionPercent >= 30;

const result = {
  schema_version: 2,
  generated_at: started,
  runner: 'deterministic-context-cli',
  client_version: process.version,
  model: process.env.RUNTIME_MODEL_ID || null,
  provider_input_tokens: null,
  provider_output_tokens: null,
  provider_cost_usd: null,
  baseline: fixtures.baseline,
  summary: {
    retrieval_correct: `${correct}/${retrieval.length}`,
    skill_routes_correct: `${skillCorrect}/${skills.length}`,
    protocol_correct: `${protocolCorrect}/${protocol.length}`,
    sessions_correct: `${sessionCorrect}/${sessions.length}`,
    median_provider_facing_bytes: providerMedianBytes,
    median_estimated_tokens: Math.round(providerMedianBytes / 4),
    reduction_percent: reductionPercent,
    reduction_target_met: reductionTargetMet,
    repository_fallbacks: 0,
    whole_document_reads: 0,
  },
  retrieval,
  skills,
  protocol,
  sessions,
};

const markdown = `# RAG benchmark — latest\n\nGenerated ${started}. This deterministic run tests the shared router, bounded retrieval protocol, source-target handoff, and provider-facing text. It does not claim provider billing or prove that a particular agent UI auto-loaded a skill.\n\n- Retrieval correctness: ${correct}/${retrieval.length}\n- First-route hit: ${first}/${retrieval.length}\n- Expected skill routes: ${skillCorrect}/${skills.length}\n- Protocol fixtures: ${protocolCorrect}/${protocol.length}\n- Complete retrieval sessions: ${sessionCorrect}/${sessions.length}\n- Repository fallbacks used: 0\n- Whole-document reads: 0\n- Legacy map median: ~${legacyMedian} tokens\n- Provider-facing session median: ${providerMedianBytes} bytes (~${Math.round(providerMedianBytes / 4)} tokens)\n- Saved baseline: ${baselineBytes} bytes\n- Reduction from baseline: ${reductionPercent}% (${reductionTargetMet ? 'target met' : 'target missed'})\n- Exact provider usage: unavailable (recorded as null)\n\n## Measurement boundary\n\nProvider-facing bytes count the exact compact text produced by route and search steps in each deterministic session. The local runner cannot observe model-side skill activation, cache use, tokenizer behavior, or provider billing, so exact provider fields remain null rather than estimates.\n`;

if (!CHECK) {
  const outputDir = join(ROOT, '.agent-state/automation/rag-benchmark');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(join(outputDir, 'latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(outputDir, 'latest.md'), markdown);
}
const passed = correct === retrieval.length && skillCorrect === skills.length && protocolCorrect === protocol.length && sessionCorrect === sessions.length && reductionTargetMet;
console.log(`${passed ? 'PASS' : 'FAIL'} — retrieval ${correct}/${retrieval.length}, skills ${skillCorrect}/${skills.length}, protocol ${protocolCorrect}/${protocol.length}, sessions ${sessionCorrect}/${sessions.length}, median ${providerMedianBytes} bytes (${reductionPercent}% reduction)`);
if (!passed) process.exit(1);
