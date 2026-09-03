import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import {
  estimateConceptTokens,
  loadConceptRegistry,
  readConceptMapSection,
  resolveRegistrySources,
} from './concept-kb.mjs';

export const KB_CALIBRATION_SCHEMA_VERSION = 1;
export const KB_CALIBRATION_KIND = 'kb-context-calibration';
export const KB_CALIBRATION_STATE_PATH = '.agent-state/automation/rag-benchmark/kb-context';
export const KB_CALIBRATION_RUN_RETENTION = 20;
export const KB_CALIBRATION_REPORT_CONFIG = Object.freeze({
  largest_concepts: 10,
  prose_enrichment_below_tokens: 55,
  decomposition_above_tokens: 1200,
  source_review_above_tokens: 700,
  source_review_grants: 5,
  journey_fragment_concepts: 7,
  journey_min_adjacency_ratio: 0.5,
});

const CONCEPT_ID = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const JOURNEY_ID = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const RUN_ID = /^[A-Za-z0-9._-]+$/;
const FORBIDDEN_TELEMETRY_KEYS = /^(?:prompt|response|reasoning|transcript|raw_source|source_(?:content|text)|environment|secrets?|working_tree_diff|diff)$/i;

const normalizedPath = value => value.replaceAll('\\', '/');
const byteMetric = bytes => ({ bytes, estimated_tokens: estimateConceptTokens(bytes) });

function hash(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function repositoryHead(root) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const head = result.status === 0 ? result.stdout.trim() : '';
  return /^[a-f0-9]{40,64}$/i.test(head) ? head.toLowerCase() : null;
}

function catalogFingerprint(registry) {
  return hash(registry.concepts.map(concept => ({
    id: concept.id,
    owner: concept.owner.path,
    heading: concept.owner.heading,
    prose: concept.section,
    aliases: concept.aliases,
    sources: concept.sources.map(source => `${source.path}#${source.anchor}`),
    adjacent: concept.adjacent,
  })));
}

function sourceFileLines(root, path, cache) {
  if (!cache.has(path)) {
    const file = resolve(root, path);
    const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    cache.set(path, text.split('\n'));
  }
  return cache.get(path);
}

function rangeBytes(root, range, cache) {
  const lines = sourceFileLines(root, range.path, cache);
  if (range.start < 1 || range.end < range.start || range.end > lines.length)
    throw new Error(`invalid calibration source range ${range.path}:${range.start}-${range.end}`);
  return Buffer.byteLength(lines.slice(range.start - 1, range.end).join('\n'));
}

export function mergeCalibrationRanges(ranges) {
  const ordered = ranges.map(range => ({
    path: normalizedPath(range.path),
    start: Number(range.start ?? range.lines?.[0]),
    end: Number(range.end ?? range.lines?.[1]),
  })).sort((left, right) => left.path.localeCompare(right.path) || left.start - right.start || left.end - right.end);
  const merged = [];
  for (const range of ordered) {
    const previous = merged.at(-1);
    if (previous && previous.path === range.path && range.start <= previous.end)
      previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function measuredSourceRanges(root, resolvedSources, cache) {
  const sourceRanges = resolvedSources.map(source => {
    if (source.status !== 'resolved') throw new Error(source.message || `unresolved source for ${source.path || 'concept'}`);
    const [start, end] = source.read.lines;
    const bytes = rangeBytes(root, { path: source.path, start, end }, cache);
    return {
      path: normalizedPath(source.path),
      anchor: source.anchor,
      lines: [start, end],
      ...byteMetric(bytes),
    };
  }).sort((left, right) => left.path.localeCompare(right.path)
    || left.lines[0] - right.lines[0]
    || left.lines[1] - right.lines[1]
    || left.anchor.localeCompare(right.anchor));
  const uniqueRanges = mergeCalibrationRanges(sourceRanges).map(range => {
    const bytes = rangeBytes(root, range, cache);
    return { path: range.path, lines: [range.start, range.end], ...byteMetric(bytes) };
  });
  return {
    source_ranges: sourceRanges,
    source_unique_ranges: uniqueRanges,
    source_total: byteMetric(sourceRanges.reduce((sum, range) => sum + range.bytes, 0)),
    source_unique: byteMetric(uniqueRanges.reduce((sum, range) => sum + range.bytes, 0)),
  };
}

function conceptMeasurement(registry, concept, cache) {
  const map = readConceptMapSection(registry, concept);
  if (map.status !== 'matched') throw new Error(map.message);
  const sources = measuredSourceRanges(registry.root, concept.resolved_sources, cache);
  const prose = byteMetric(Buffer.byteLength(concept.section));
  const route = byteMetric(Buffer.byteLength(map.text));
  return {
    id: concept.id,
    prose,
    route_map: route,
    source_grant_count: concept.resolved_sources.length,
    ...sources,
    adjacent_count: concept.adjacent.length,
    complete_total: byteMetric(prose.bytes + route.bytes + sources.source_total.bytes),
    complete_unique: byteMetric(prose.bytes + route.bytes + sources.source_unique.bytes),
  };
}

function journeyMeasurement(journey, registry, measurements, cache) {
  const concepts = journey.concepts.map(id => {
    const concept = registry.concepts.find(candidate => candidate.id === id);
    if (!concept) throw new Error(`calibration journey '${journey.id}' has unknown concept '${id}'`);
    return concept;
  });
  const conceptMetrics = concepts.map(concept => measurements.get(concept.id));
  const resolvedSources = concepts.flatMap(concept => concept.resolved_sources);
  const sources = measuredSourceRanges(registry.root, resolvedSources, cache);
  const prose = byteMetric(conceptMetrics.reduce((sum, concept) => sum + concept.prose.bytes, 0));
  const route = byteMetric(conceptMetrics.reduce((sum, concept) => sum + concept.route_map.bytes, 0));
  const adjacencyHops = [];
  for (let index = 0; index < concepts.length - 1; index++) {
    if (concepts[index].adjacent.includes(concepts[index + 1].id))
      adjacencyHops.push({ from: concepts[index].id, to: concepts[index + 1].id });
  }
  return {
    id: journey.id,
    concept_ids: concepts.map(concept => concept.id),
    concept_count: concepts.length,
    adjacency_hops: adjacencyHops,
    prose,
    route_map: route,
    prose_route: byteMetric(prose.bytes + route.bytes),
    source_grant_count: resolvedSources.length,
    source_total: sources.source_total,
    source_unique: sources.source_unique,
    complete_total: byteMetric(prose.bytes + route.bytes + sources.source_total.bytes),
    complete_unique: byteMetric(prose.bytes + route.bytes + sources.source_unique.bytes),
  };
}

function normalizedJourneys(journeys) {
  if (!Array.isArray(journeys)) throw new Error('calibration journeys must be an array');
  const ids = new Set();
  return journeys.map(journey => {
    if (!journey || !JOURNEY_ID.test(journey.id || '')) throw new Error('calibration journey needs a stable lowercase id');
    if (ids.has(journey.id)) throw new Error(`duplicate calibration journey '${journey.id}'`);
    ids.add(journey.id);
    if (!Array.isArray(journey.concepts) || journey.concepts.length < 2)
      throw new Error(`calibration journey '${journey.id}' needs at least two ordered concepts`);
    if (!journey.concepts.every(id => CONCEPT_ID.test(id)))
      throw new Error(`calibration journey '${journey.id}' contains an invalid concept id`);
    return { id: journey.id, concepts: [...journey.concepts] };
  });
}

export function measureKbCalibration({ root = '.', kbRoot = 'KB', conceptIds = [], journeys = [], now = new Date(), head } = {}) {
  const repositoryRoot = resolve(root);
  const resolved = resolveRegistrySources(loadConceptRegistry({ root: repositoryRoot, kbRoot }), { ready: true });
  if (resolved.errors.length) throw new Error(`concept calibration blocked: ${resolved.errors[0].message}`);
  const authoredJourneys = normalizedJourneys(journeys);
  const measuredIds = [...new Set([...conceptIds, ...authoredJourneys.flatMap(journey => journey.concepts)])].sort();
  if (!measuredIds.length) throw new Error('concept calibration needs at least one representative concept');
  const cache = new Map();
  const measurements = new Map();
  for (const id of measuredIds) {
    const concept = resolved.by_id.get(id)?.[0];
    if (!concept) throw new Error(`concept calibration has unknown concept '${id}'`);
    const resolvedConcept = resolved.concepts.find(candidate => candidate.id === id);
    measurements.set(id, conceptMeasurement(resolved, resolvedConcept, cache));
  }
  const fingerprint = catalogFingerprint(resolved);
  const completedAt = new Date(now).toISOString();
  const runId = `${completedAt.replaceAll('-', '').replaceAll(':', '').replace('.', '')}-${fingerprint.slice(0, 12)}`;
  const snapshot = {
    schema_version: KB_CALIBRATION_SCHEMA_VERSION,
    kind: KB_CALIBRATION_KIND,
    run_id: runId,
    completed_at: completedAt,
    concept_catalog_fingerprint: fingerprint,
    repository_head: head === undefined ? repositoryHead(repositoryRoot) : head,
    estimator: { name: 'utf8-bytes-divided-by-4-ceiling', bytes_per_token: 4 },
    concepts: [...measurements.values()],
    journeys: authoredJourneys.map(journey => journeyMeasurement(journey, resolved, measurements, cache)),
  };
  validateKbCalibrationSnapshot(snapshot);
  return snapshot;
}

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const extras = Object.keys(value).filter(key => !allowed.includes(key));
  if (extras.length) throw new Error(`${label} has unsupported field '${extras[0]}'`);
  for (const key of Object.keys(value)) if (FORBIDDEN_TELEMETRY_KEYS.test(key)) throw new Error(`${label} contains forbidden telemetry field '${key}'`);
}

function integer(value, label) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
}

function validateMetric(metric, label) {
  exactKeys(metric, ['bytes', 'estimated_tokens'], label);
  integer(metric.bytes, `${label}.bytes`);
  integer(metric.estimated_tokens, `${label}.estimated_tokens`);
  if (metric.estimated_tokens !== estimateConceptTokens(metric.bytes)) throw new Error(`${label} token estimate does not match byte/4 ceiling`);
}

function validateRange(range, label, unique = false) {
  exactKeys(range, unique ? ['path', 'lines', 'bytes', 'estimated_tokens'] : ['path', 'anchor', 'lines', 'bytes', 'estimated_tokens'], label);
  if (typeof range.path !== 'string' || !range.path || range.path.startsWith('/') || range.path.includes('..')) throw new Error(`${label}.path is invalid`);
  if (!unique && (typeof range.anchor !== 'string' || !range.anchor)) throw new Error(`${label}.anchor is invalid`);
  if (!Array.isArray(range.lines) || range.lines.length !== 2) throw new Error(`${label}.lines must be a two-item range`);
  integer(range.lines[0], `${label}.lines[0]`);
  integer(range.lines[1], `${label}.lines[1]`);
  if (range.lines[0] < 1 || range.lines[1] < range.lines[0]) throw new Error(`${label}.lines is invalid`);
  validateMetric({ bytes: range.bytes, estimated_tokens: range.estimated_tokens }, label);
}

function validateConceptMeasurement(concept, index) {
  const label = `concepts[${index}]`;
  exactKeys(concept, ['id', 'prose', 'route_map', 'source_grant_count', 'source_ranges', 'source_unique_ranges', 'source_total', 'source_unique', 'adjacent_count', 'complete_total', 'complete_unique'], label);
  if (!CONCEPT_ID.test(concept.id || '')) throw new Error(`${label}.id is invalid`);
  for (const key of ['prose', 'route_map', 'source_total', 'source_unique', 'complete_total', 'complete_unique']) validateMetric(concept[key], `${label}.${key}`);
  integer(concept.source_grant_count, `${label}.source_grant_count`);
  integer(concept.adjacent_count, `${label}.adjacent_count`);
  if (!Array.isArray(concept.source_ranges) || concept.source_ranges.length !== concept.source_grant_count)
    throw new Error(`${label}.source_ranges does not match source_grant_count`);
  if (!Array.isArray(concept.source_unique_ranges)) throw new Error(`${label}.source_unique_ranges must be an array`);
  concept.source_ranges.forEach((range, rangeIndex) => validateRange(range, `${label}.source_ranges[${rangeIndex}]`));
  concept.source_unique_ranges.forEach((range, rangeIndex) => validateRange(range, `${label}.source_unique_ranges[${rangeIndex}]`, true));
  const sourceTotalBytes = concept.source_ranges.reduce((sum, range) => sum + range.bytes, 0);
  const sourceUniqueBytes = concept.source_unique_ranges.reduce((sum, range) => sum + range.bytes, 0);
  if (concept.source_total.bytes !== sourceTotalBytes) throw new Error(`${label}.source_total does not match source_ranges`);
  if (concept.source_unique.bytes !== sourceUniqueBytes || sourceUniqueBytes > sourceTotalBytes)
    throw new Error(`${label}.source_unique does not match merged ranges`);
  if (concept.complete_total.bytes !== concept.prose.bytes + concept.route_map.bytes + sourceTotalBytes)
    throw new Error(`${label}.complete_total is inconsistent`);
  if (concept.complete_unique.bytes !== concept.prose.bytes + concept.route_map.bytes + sourceUniqueBytes)
    throw new Error(`${label}.complete_unique is inconsistent`);
}

function validateJourneyMeasurement(journey, index, conceptById) {
  const label = `journeys[${index}]`;
  exactKeys(journey, ['id', 'concept_ids', 'concept_count', 'adjacency_hops', 'prose', 'route_map', 'prose_route', 'source_grant_count', 'source_total', 'source_unique', 'complete_total', 'complete_unique'], label);
  if (!JOURNEY_ID.test(journey.id || '')) throw new Error(`${label}.id is invalid`);
  if (!Array.isArray(journey.concept_ids) || !journey.concept_ids.every(id => CONCEPT_ID.test(id))) throw new Error(`${label}.concept_ids is invalid`);
  integer(journey.concept_count, `${label}.concept_count`);
  if (journey.concept_count !== journey.concept_ids.length) throw new Error(`${label}.concept_count does not match concept_ids`);
  integer(journey.source_grant_count, `${label}.source_grant_count`);
  if (!Array.isArray(journey.adjacency_hops)) throw new Error(`${label}.adjacency_hops must be an array`);
  journey.adjacency_hops.forEach((hop, hopIndex) => {
    exactKeys(hop, ['from', 'to'], `${label}.adjacency_hops[${hopIndex}]`);
    const represented = journey.concept_ids.some((id, conceptIndex) => id === hop.from && journey.concept_ids[conceptIndex + 1] === hop.to);
    if (!represented) throw new Error(`${label}.adjacency_hops[${hopIndex}] is not a consecutive journey transition`);
  });
  for (const key of ['prose', 'route_map', 'prose_route', 'source_total', 'source_unique', 'complete_total', 'complete_unique']) validateMetric(journey[key], `${label}.${key}`);
  const concepts = journey.concept_ids.map(id => conceptById.get(id));
  if (concepts.some(concept => !concept)) throw new Error(`${label}.concept_ids references an unmeasured concept`);
  if (journey.prose.bytes !== concepts.reduce((sum, concept) => sum + concept.prose.bytes, 0)) throw new Error(`${label}.prose is inconsistent`);
  if (journey.route_map.bytes !== concepts.reduce((sum, concept) => sum + concept.route_map.bytes, 0)) throw new Error(`${label}.route_map is inconsistent`);
  if (journey.prose_route.bytes !== journey.prose.bytes + journey.route_map.bytes) throw new Error(`${label}.prose_route is inconsistent`);
  if (journey.source_grant_count !== concepts.reduce((sum, concept) => sum + concept.source_grant_count, 0))
    throw new Error(`${label}.source_grant_count is inconsistent`);
  if (journey.source_total.bytes !== concepts.reduce((sum, concept) => sum + concept.source_total.bytes, 0))
    throw new Error(`${label}.source_total is inconsistent`);
  if (journey.source_unique.bytes > journey.source_total.bytes) throw new Error(`${label}.source_unique exceeds source_total`);
  if (journey.complete_total.bytes !== journey.prose.bytes + journey.route_map.bytes + journey.source_total.bytes)
    throw new Error(`${label}.complete_total is inconsistent`);
  if (journey.complete_unique.bytes !== journey.prose.bytes + journey.route_map.bytes + journey.source_unique.bytes)
    throw new Error(`${label}.complete_unique is inconsistent`);
}

export function validateKbCalibrationSnapshot(snapshot) {
  exactKeys(snapshot, ['schema_version', 'kind', 'run_id', 'completed_at', 'concept_catalog_fingerprint', 'repository_head', 'estimator', 'concepts', 'journeys'], 'snapshot');
  if (snapshot.schema_version !== KB_CALIBRATION_SCHEMA_VERSION) throw new Error(`unsupported KB calibration schema ${snapshot.schema_version}`);
  if (snapshot.kind !== KB_CALIBRATION_KIND) throw new Error('snapshot kind is not KB context calibration');
  if (!RUN_ID.test(snapshot.run_id || '')) throw new Error('snapshot run_id is invalid');
  if (typeof snapshot.completed_at !== 'string'
    || Number.isNaN(Date.parse(snapshot.completed_at))
    || new Date(snapshot.completed_at).toISOString() !== snapshot.completed_at)
    throw new Error('snapshot completed_at is invalid');
  if (!/^[a-f0-9]{64}$/.test(snapshot.concept_catalog_fingerprint || '')) throw new Error('snapshot concept catalog fingerprint is invalid');
  if (snapshot.repository_head !== null && !/^[a-f0-9]{40,64}$/.test(snapshot.repository_head || '')) throw new Error('snapshot repository_head is invalid');
  exactKeys(snapshot.estimator, ['name', 'bytes_per_token'], 'snapshot.estimator');
  if (snapshot.estimator.name !== 'utf8-bytes-divided-by-4-ceiling' || snapshot.estimator.bytes_per_token !== 4)
    throw new Error('snapshot estimator is unsupported');
  if (!Array.isArray(snapshot.concepts) || !snapshot.concepts.length) throw new Error('snapshot concepts must be a non-empty array');
  if (!Array.isArray(snapshot.journeys)) throw new Error('snapshot journeys must be an array');
  snapshot.concepts.forEach(validateConceptMeasurement);
  const conceptById = new Map(snapshot.concepts.map(concept => [concept.id, concept]));
  snapshot.journeys.forEach((journey, index) => validateJourneyMeasurement(journey, index, conceptById));
  if (new Set(snapshot.concepts.map(concept => concept.id)).size !== snapshot.concepts.length) throw new Error('snapshot repeats a concept measurement');
  if (new Set(snapshot.journeys.map(journey => journey.id)).size !== snapshot.journeys.length) throw new Error('snapshot repeats a journey measurement');
  return snapshot;
}

export function writeKbCalibrationSnapshot({ root = '.', snapshot, retention = KB_CALIBRATION_RUN_RETENTION } = {}) {
  validateKbCalibrationSnapshot(snapshot);
  if (!Number.isInteger(retention) || retention < 1) throw new Error('calibration retention must be a positive integer');
  const repositoryRoot = resolve(root);
  const stateRoot = join(repositoryRoot, KB_CALIBRATION_STATE_PATH);
  const runsRoot = join(stateRoot, 'runs');
  mkdirSync(runsRoot, { recursive: true });
  const runFile = join(runsRoot, `${snapshot.run_id}.json`);
  const body = `${JSON.stringify(snapshot)}\n`;
  if (existsSync(runFile)) {
    if (readFileSync(runFile, 'utf8') !== body) throw new Error(`private KB calibration run id collision at ${snapshot.run_id}`);
  } else writeFileSync(runFile, body, { encoding: 'utf8', flag: 'wx' });
  writeFileSync(join(stateRoot, 'latest.json'), body, 'utf8');
  const runs = readdirSync(runsRoot).filter(name => name.endsWith('.json')).sort();
  for (const name of runs.slice(0, Math.max(0, runs.length - retention))) unlinkSync(join(runsRoot, name));
  return {
    latest: normalizedPath(relative(repositoryRoot, join(stateRoot, 'latest.json'))),
    run: normalizedPath(relative(repositoryRoot, runFile)),
  };
}

export function readLatestKbCalibrationSnapshot({ root = '.' } = {}) {
  const file = join(resolve(root), KB_CALIBRATION_STATE_PATH, 'latest.json');
  if (!existsSync(file)) throw new Error(`no private KB calibration snapshot at ${KB_CALIBRATION_STATE_PATH}/latest.json`);
  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`invalid private KB calibration snapshot: ${error.message}`);
  }
  return validateKbCalibrationSnapshot(snapshot);
}
