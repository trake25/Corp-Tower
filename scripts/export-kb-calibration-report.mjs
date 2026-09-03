#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  KB_CALIBRATION_REPORT_CONFIG,
  readLatestKbCalibrationSnapshot,
  validateKbCalibrationSnapshot,
} from './lib/kb-calibration.mjs';

export const KB_CALIBRATION_REPORT_PATH = 'report/benchmarks/kb-context';

const normalizedPath = value => value.replaceAll('\\', '/');

function percentile(values, fraction) {
  if (!values.length) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.max(0, Math.ceil(fraction * ordered.length) - 1)];
}

function metricLabel(metric) {
  return `${metric.bytes} B (~${metric.estimated_tokens} tok)`;
}

function listOrNone(ids) {
  return ids.length ? ids.map(id => `\`${id}\``).join(', ') : 'none';
}

function reviewCategories(snapshot) {
  const config = KB_CALIBRATION_REPORT_CONFIG;
  const proseEnrichment = [];
  const decomposition = [];
  const sourceReview = [];
  const flagged = new Set();
  for (const concept of snapshot.concepts) {
    if (concept.prose.estimated_tokens < config.prose_enrichment_below_tokens) {
      proseEnrichment.push(concept.id);
      flagged.add(concept.id);
    }
    const overlapRatio = concept.source_total.bytes
      ? (concept.source_total.bytes - concept.source_unique.bytes) / concept.source_total.bytes
      : 0;
    if (concept.prose.estimated_tokens > config.decomposition_above_tokens || overlapRatio >= 0.3) {
      decomposition.push(concept.id);
      flagged.add(concept.id);
    }
    if (concept.source_unique.estimated_tokens > config.source_review_above_tokens
      || concept.source_grant_count >= config.source_review_grants) {
      sourceReview.push(concept.id);
      flagged.add(concept.id);
    }
  }
  const fragmentedJourneys = snapshot.journeys.filter(journey => {
    const possible = Math.max(1, journey.concept_count - 1);
    return journey.concept_count >= config.journey_fragment_concepts
      || journey.adjacency_hops.length / possible < config.journey_min_adjacency_ratio;
  }).map(journey => journey.id);
  return {
    prose_enrichment: proseEnrichment,
    decomposition,
    source_review: sourceReview,
    fragmented_journeys: fragmentedJourneys,
    healthy_count: snapshot.concepts.length - flagged.size,
  };
}

export function renderKbCalibrationReport(snapshot, version) {
  validateKbCalibrationSnapshot(snapshot);
  if (!Number.isInteger(version) || version < 1) throw new Error('calibration report version must be a positive integer');
  const concepts = snapshot.concepts;
  const prose = concepts.map(concept => concept.prose.bytes);
  const sourceTotal = concepts.map(concept => concept.source_total.bytes);
  const sourceUnique = concepts.map(concept => concept.source_unique.bytes);
  const total = concepts.map(concept => concept.complete_total.bytes);
  const totalUnique = concepts.map(concept => concept.complete_unique.bytes);
  const largest = [...concepts]
    .sort((left, right) => right.complete_unique.bytes - left.complete_unique.bytes || left.id.localeCompare(right.id))
    .slice(0, KB_CALIBRATION_REPORT_CONFIG.largest_concepts);
  const review = reviewCategories(snapshot);
  const tag = String(version).padStart(3, '0');
  const lines = [
    `# KB context calibration v${tag}`,
    '',
    'This is a sanitized, manually exported review aid for the parallel experimental concept KB. It is not repository context, a correctness gate, or a cloud-agent activation signal.',
    '',
    '## Snapshot',
    '',
    `- Run: \`${snapshot.run_id}\``,
    `- Completed: ${snapshot.completed_at}`,
    `- Catalog fingerprint: \`${snapshot.concept_catalog_fingerprint}\``,
    `- Repository HEAD: ${snapshot.repository_head ? `\`${snapshot.repository_head}\`` : 'unavailable'}`,
    `- Concepts measured: ${concepts.length}`,
    `- Journeys measured: ${snapshot.journeys.length}`,
    `- Estimator: ${snapshot.estimator.name}`,
    '',
    '## Footprint distribution',
    '',
    '| Footprint | Median | p95 |',
    '|---|---:|---:|',
    `| Concept prose | ${metricLabel({ bytes: percentile(prose, 0.5), estimated_tokens: Math.ceil(percentile(prose, 0.5) / 4) })} | ${metricLabel({ bytes: percentile(prose, 0.95), estimated_tokens: Math.ceil(percentile(prose, 0.95) / 4) })} |`,
    `| Bounded source total | ${metricLabel({ bytes: percentile(sourceTotal, 0.5), estimated_tokens: Math.ceil(percentile(sourceTotal, 0.5) / 4) })} | ${metricLabel({ bytes: percentile(sourceTotal, 0.95), estimated_tokens: Math.ceil(percentile(sourceTotal, 0.95) / 4) })} |`,
    `| Unique bounded source | ${metricLabel({ bytes: percentile(sourceUnique, 0.5), estimated_tokens: Math.ceil(percentile(sourceUnique, 0.5) / 4) })} | ${metricLabel({ bytes: percentile(sourceUnique, 0.95), estimated_tokens: Math.ceil(percentile(sourceUnique, 0.95) / 4) })} |`,
    `| Complete total context | ${metricLabel({ bytes: percentile(total, 0.5), estimated_tokens: Math.ceil(percentile(total, 0.5) / 4) })} | ${metricLabel({ bytes: percentile(total, 0.95), estimated_tokens: Math.ceil(percentile(total, 0.95) / 4) })} |`,
    `| Complete unique context | ${metricLabel({ bytes: percentile(totalUnique, 0.5), estimated_tokens: Math.ceil(percentile(totalUnique, 0.5) / 4) })} | ${metricLabel({ bytes: percentile(totalUnique, 0.95), estimated_tokens: Math.ceil(percentile(totalUnique, 0.95) / 4) })} |`,
    '',
    '## Largest measured concepts',
    '',
    '| Concept | Prose | Route/map | Unique source | Complete |',
    '|---|---:|---:|---:|---:|',
    ...largest.map(concept => `| \`${concept.id}\` | ${metricLabel(concept.prose)} | ${metricLabel(concept.route_map)} | ${metricLabel(concept.source_unique)} | ${metricLabel(concept.complete_unique)} |`),
    '',
    '## Calibration journeys',
    '',
    '| Journey | Concepts | Adjacency hops | Prose + route/map | Source grants | Total source | Unique source | Complete unique |',
    '|---|---:|---:|---:|---:|---:|---:|---:|',
    ...snapshot.journeys.map(journey => {
      return `| \`${journey.id}\` | ${journey.concept_count} | ${journey.adjacency_hops.length} | ${metricLabel(journey.prose_route)} | ${journey.source_grant_count} | ${metricLabel(journey.source_total)} | ${metricLabel(journey.source_unique)} | ${metricLabel(journey.complete_unique)} |`;
    }),
    '',
    '## Heuristic review prompts',
    '',
    'These labels are calibration prompts, not defects or correctness claims.',
    '',
    `- Prose-enrichment candidates: ${listOrNone(review.prose_enrichment)}`,
    `- Possible decomposition/dedup candidates: ${listOrNone(review.decomposition)}`,
    `- Possible source-anchor/range candidates: ${listOrNone(review.source_review)}`,
    `- Possible over-fragmented journeys: ${listOrNone(review.fragmented_journeys)}`,
    `- Healthy/no-action concepts: ${review.healthy_count}`,
    '',
    'The private snapshot contains only deterministic measurements and range identities. This report intentionally omits source contents, private telemetry detail, prompts, responses, transcripts, reasoning, environment data, secrets, and working-tree state.',
    '',
  ];
  return lines.join('\n');
}

export function writeKbCalibrationReport({ snapshot, outputRoot, version } = {}) {
  const body = renderKbCalibrationReport(snapshot, version);
  mkdirSync(outputRoot, { recursive: true });
  const file = join(outputRoot, `kb-context-calibration-v${String(version).padStart(3, '0')}.md`);
  try {
    writeFileSync(file, body, { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`refusing to overwrite existing calibration report ${file}`);
    throw error;
  }
  return file;
}

function nextVersion(outputRoot) {
  if (!existsSync(outputRoot)) return 1;
  const versions = readdirSync(outputRoot).flatMap(name => {
    const match = /^kb-context-calibration-v(\d{3,})\.md$/.exec(name);
    return match ? [Number(match[1])] : [];
  });
  return versions.length ? Math.max(...versions) + 1 : 1;
}

export function exportKbCalibrationReport({ root = '.', outputPath = KB_CALIBRATION_REPORT_PATH } = {}) {
  const repositoryRoot = resolve(root);
  const snapshot = readLatestKbCalibrationSnapshot({ root: repositoryRoot });
  const outputRoot = resolve(repositoryRoot, outputPath);
  if (outputRoot !== repositoryRoot && !outputRoot.startsWith(`${repositoryRoot}${sep}`)) throw new Error('calibration report path must stay inside the repository');
  const file = writeKbCalibrationReport({ snapshot, outputRoot, version: nextVersion(outputRoot) });
  return normalizedPath(relative(repositoryRoot, file));
}

function main() {
  try {
    const roots = process.argv.slice(2).filter(argument => !argument.startsWith('-'));
    if (roots.length > 1) throw new Error('supply at most one repository root');
    const file = exportKbCalibrationReport({ root: roots[0] || '.' });
    console.log(`PASS — wrote sanitized KB calibration report ${file}`);
  } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
