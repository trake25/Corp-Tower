#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AREA_ALIASES, routeSourcePath } from './lib/context-routing.mjs';
import {
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
const fixtures = JSON.parse(readFileSync(join(ROOT, 'report/benchmarks/rag-fixtures.json'), 'utf8'));
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
  writeFileSync(join(ROOT, 'report/benchmarks/latest.json'), `${JSON.stringify(result, null, 2)}\n`);
  writeFileSync(join(ROOT, 'report/benchmarks/latest.md'), markdown);
}
const passed = correct === retrieval.length && skillCorrect === skills.length && protocolCorrect === protocol.length && sessionCorrect === sessions.length && reductionTargetMet;
console.log(`${passed ? 'PASS' : 'FAIL'} — retrieval ${correct}/${retrieval.length}, skills ${skillCorrect}/${skills.length}, protocol ${protocolCorrect}/${protocol.length}, sessions ${sessionCorrect}/${sessions.length}, median ${providerMedianBytes} bytes (${reductionPercent}% reduction)`);
if (!passed) process.exit(1);
