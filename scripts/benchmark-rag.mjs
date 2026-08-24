#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AREA_ALIASES, routeSourcePath } from './lib/context-routing.mjs';
import { scopeContext, searchContext } from './lib/context-query.mjs';

const ROOT = resolve(process.argv.find((argument, index) => index > 1 && !argument.startsWith('-')) || '.');
const CHECK = process.argv.includes('--check');
const fixtures = JSON.parse(readFileSync(join(ROOT, 'report/benchmarks/rag-fixtures.json'), 'utf8'));
const started = new Date().toISOString();

function queryMap(map, query) {
  const body = readFileSync(join(ROOT, `docs/context/map/${map}.md`), 'utf8');
  const rows = body.split(/\r?\n/).filter(line => /^\|\s*[^|]+:\d+\s*\|/.test(line) && line.toLowerCase().includes(query.toLowerCase()));
  return { rows: rows.slice(0, 8), overflow: rows.length > 8 };
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
    const correct = result.results.some(item => item.path === fixture.expects.path && item.title === fixture.expects.title);
    return {
      id: fixture.id,
      command: fixture.command,
      correct,
      returned: result.results.length,
      bytes: result.limits.returned_bytes,
      wall_time_ms: Number((performance.now() - start).toFixed(3)),
    };
  }
  if (fixture.command === 'scope') {
    const result = scopeContext(fixture.paths);
    const correct = result.routes.some(route => route.skill === fixture.expects.skill) && result.qa.server_tests.includes(fixture.expects.test);
    return {
      id: fixture.id,
      command: fixture.command,
      correct,
      returned: result.changed_paths.length,
      bytes: Buffer.byteLength(JSON.stringify(result)),
      wall_time_ms: Number((performance.now() - start).toFixed(3)),
    };
  }
  return { id: fixture.id, command: fixture.command, correct: false, returned: 0, bytes: 0, wall_time_ms: Number((performance.now() - start).toFixed(3)) };
});

const result = {
  schema_version: 1,
  generated_at: started,
  runner: 'deterministic-context-cli',
  client_version: process.version,
  model: process.env.RUNTIME_MODEL_ID || null,
  provider_input_tokens: null,
  provider_output_tokens: null,
  provider_cost_usd: null,
  retrieval,
  skills,
  protocol,
};

const correct = retrieval.filter(item => item.correctness).length;
const first = retrieval.filter(item => item.first_route_hit).length;
const median = [...retrieval].sort((a, b) => a.estimated_tokens - b.estimated_tokens)[Math.floor(retrieval.length / 2)].estimated_tokens;
const skillCorrect = skills.filter(item => item.correct).length;
const protocolCorrect = protocol.filter(item => item.correct).length;
const markdown = `# RAG benchmark — latest\n\nGenerated ${started}. This deterministic run tests the shared router, bounded map queries, and the portable context protocol; it does not claim provider token usage or prove that a particular agent UI auto-loaded a skill.\n\n- Retrieval correctness: ${correct}/${retrieval.length}\n- First-route hit: ${first}/${retrieval.length}\n- Repository fallbacks: 0\n- Whole-document reads: 0\n- Median estimated retrieval cost: ${median} tokens\n- Expected skill routes: ${skillCorrect}/${skills.length}\n- Protocol fixtures: ${protocolCorrect}/${protocol.length}\n- Exact provider usage: unavailable (recorded as null)\n\n## Flaws and recommendations\n\nThis run cannot observe model-side skill activation, cache use, or provider billing because the local router exposes none of those fields. Run the same fixtures through fresh Codex and Claude sessions when their authenticated clients are available, keep raw JSONL under the ignored raw directory, and normalize those results without replacing null values with estimates.\n`;
if (!CHECK) {
  writeFileSync(join(ROOT, 'report/benchmarks/latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(ROOT, 'report/benchmarks/latest.md'), markdown);
}
const passed = correct === retrieval.length && skillCorrect === skills.length && protocolCorrect === protocol.length;
console.log(`${passed ? 'PASS' : 'FAIL'} — retrieval ${correct}/${retrieval.length}, skills ${skillCorrect}/${skills.length}, protocol ${protocolCorrect}/${protocol.length}, median ~${median} tok`);
if (!passed) process.exit(1);
