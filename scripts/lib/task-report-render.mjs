import { readFileSync } from 'node:fs';
import { analyzeRecords, factualReview } from './task-report-analysis.mjs';

const HEADER = `# Task reporting v2

<!-- GENERATED FILE. Source: report/v2/data/task-records.jsonl and report/v2/data/task-cycle-reviews.jsonl. Run node scripts/task-report.mjs render. -->

This report is generated from structured task records. Archived runs preserve
their original values; unavailable measurements are shown as unavailable.

## Definitions

`;

function display(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback;
  return String(value);
}

function formatTokens(value) {
  if (!Number.isFinite(value)) return 'unavailable';
  if (value >= 1e6) return `${(value / 1e6).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')}m`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1).replace(/\.0$/, '')}k`;
  return String(Math.round(value));
}

function model(record) {
  return record.runtime?.model || record.runtime?.model_label || '—';
}

function formatEstimate(estimate) {
  if (!Number.isFinite(estimate?.tokens)) return '—';
  if (estimate.timing === 'pre-change' && Number.isFinite(estimate.context_tokens) && Number.isFinite(estimate.modification_tokens))
    return `${formatTokens(estimate.context_tokens)} + ${formatTokens(estimate.modification_tokens)} = ${formatTokens(estimate.tokens)}`;
  const prefix = estimate.timing === 'late' ? 'late estimate ~' : estimate.timing === 'pre-read' ? 'legacy ~' : '';
  return `${prefix}${formatTokens(estimate.tokens)}`;
}

function formatMeasurement(measurement) {
  if (!Number.isFinite(measurement?.value)) return 'unavailable';
  const prefix = measurement.kind === 'estimated' ? '~' : '';
  return `${prefix}${measurement.value.toLocaleString('en-US')}`;
}

function row(record) {
  const context = Number.isFinite(record.estimate?.context_tokens) ? formatTokens(record.estimate.context_tokens) : formatMeasurement(record.observed?.source_read_tokens);
  return `| ${record.row} | ${record.task.replaceAll('|', '\\|')} | ${display(record.complexity)} | ${display(record.mode)} | ${display(record.scope?.domains)} | ${display(record.scope?.files)} | ${formatEstimate(record.estimate)} | ${context} | ${formatMeasurement(record.observed?.total_tokens)} | ${formatMeasurement(record.observed?.main_thread_tokens)} | ${display({ 'first-try': '✓', 'second-document': '~', 'repository-fallback': '✗', 'doc-source-conflict': '!', unavailable: '—' }[record.retrieval?.result])} | ${display(record.outcome?.verdict)} | ${model(record)} | ${display(record.runtime?.effort)} | ${record.skills?.length ? record.skills.join(', ') : '—'} |`;
}

function summary(rollup) {
  const retrieval = rollup.retrieval;
  const estimate = rollup.estimates.coverage;
  const total = rollup.measurements.total_tokens.estimated;
  return `Factual rollup: ${retrieval['first-try'].count}/${retrieval['first-try'].total} first-try retrievals, ${retrieval['doc-source-conflict'].count}/${retrieval['doc-source-conflict'].total} documentation conflicts, ${estimate.count}/${estimate.total} usage-pool estimates, and ${total.count ? `estimated usage-pool median ${total.median}` : 'no comparable usage-pool median'}.`;
}

function reviewText(review, rollup) {
  if (review?.assessment) return review.assessment;
  const factual = factualReview({ aggregate: rollup }, review?.finding, review?.recommendation);
  return `Improvement: ${factual.improvement} Regression: ${factual.regression} Flaw: ${factual.flaw}${factual.finding ? ` Finding: ${factual.finding}` : ''}${factual.recommendation ? ` Recommendation: ${factual.recommendation}` : ''}`;
}

export function renderReport({ records, reviews = [], state }) {
  const openCycle = state.open_cycle;
  const cycles = [...new Set(records.map(record => record.cycle).concat(openCycle))].sort((a, b) => b - a);
  const reviewMap = new Map(reviews.map(review => [review.cycle, review]));
  let output = `${HEADER}Estimated tokens are the context-plus-change budget recorded before edits. Context used is the provider usage consumed before the first edit. Actual tokens are the provider counter delta for the completed task; Main-thread tokens exclude delegated workers. A tilde marks an estimated measurement.

| Retrieval result | Definition |
|---|---|
| ✓ | first-try |
| ~ | second-document |
| ✗ | repository-fallback |
| ! | doc-source-conflict |

Model is the exact implementing runtime variant for standard records. Legacy rows show their preserved label and are excluded from exact-variant coverage.

`;
  for (const cycle of cycles) {
    const cycleRecords = records.filter(record => record.cycle === cycle).sort((a, b) => a.row - b.row);
    const isOpen = cycle === openCycle;
    const rollup = analyzeRecords(cycleRecords, { from: cycle, to: cycle, closedCycles: isOpen ? [] : [cycle] }).aggregate;
    output += `## Cycle ${cycle} (${isOpen ? 'open' : 'closed'})\n\n`;
    if (isOpen) output += `Current cycle: ${cycleRecords.length} recorded row(s); next row is ${state.next_row}.\n\n`;
    else output += `${reviewText(reviewMap.get(cycle), rollup)}\n\n${summary(rollup)}\n\n`;
    output += '| Row | Task | Complexity | Work mode | Domains | Files | Estimated tokens | Context used | Actual tokens | Main-thread tokens | Retrieval | Result | Model | Effort | Skills |\n|---:|---|---:|---|---:|---:|---:|---:|---:|---:|---|---|---|---|---|\n';
    output += cycleRecords.map(row).join('\n');
    if (isOpen) output += `\n<!-- next: row ${state.next_row} -->`;
    output += '\n\n';
  }
  return output.trimEnd() + '\n';
}

export function readGeneratedHeader(file) {
  return readFileSync(file, 'utf8').split(/\r?\n/).slice(0, 4).join('\n');
}
