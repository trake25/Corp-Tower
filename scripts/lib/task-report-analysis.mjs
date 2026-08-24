const RETRIEVAL_KEYS = ['first-try', 'second-document', 'repository-fallback', 'doc-source-conflict', 'unavailable'];

function percentage(count, total) {
  return { count, total, percentage: total ? Number(((count / total) * 100).toFixed(1)) : null };
}

function values(records, field, kind) {
  return records.map(record => record.observed?.[field]).filter(measurement => measurement?.kind === kind && Number.isFinite(measurement.value)).map(measurement => measurement.value);
}

function percentile(numbers, p) {
  if (!numbers.length) return null;
  const sorted = [...numbers].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  return lower === upper ? sorted[lower] : Math.round(sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower));
}

function statistics(numbers) {
  if (!numbers.length) return { count: 0, median: null, mean: null, p90: null };
  return {
    count: numbers.length,
    median: percentile(numbers, 0.5),
    mean: Math.round(numbers.reduce((sum, value) => sum + value, 0) / numbers.length),
    p90: percentile(numbers, 0.9),
  };
}

function groupedStatistics(records, field) {
  return Object.fromEntries(['exact', 'estimated'].map(kind => [kind, statistics(values(records, field, kind))]));
}

function countBy(records, getter) {
  const counts = {};
  records.forEach(record => {
    const value = getter(record) || 'unavailable';
    counts[value] = (counts[value] || 0) + 1;
  });
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => [key, percentage(count, records.length)]));
}

function errorStats(records) {
  const errors = records.map(record => {
    const estimate = record.estimate?.tokens;
    const actual = record.observed?.source_read_tokens;
    if (record.estimate?.timing !== 'pre-read' || !Number.isFinite(estimate) || !Number.isFinite(actual?.value)) return null;
    return actual.value - estimate;
  }).filter(value => value !== null);
  return { ...statistics(errors), comparable_records: errors.length };
}

function outliers(records) {
  const totals = records.map(record => record.observed?.total_tokens?.value).filter(Number.isFinite).sort((a, b) => a - b);
  if (!totals.length) return [];
  const threshold = Math.max(percentile(totals, 0.9) ?? 0, 1);
  return records.filter(record => Number.isFinite(record.observed?.total_tokens?.value) && record.observed.total_tokens.value >= threshold).sort((a, b) => b.observed.total_tokens.value - a.observed.total_tokens.value).slice(0, 8).map(record => ({ task_id: record.task_id, total_tokens: record.observed.total_tokens.value, threshold }));
}

function cycleRecords(records, from, to) {
  return records.filter(record => record.cycle >= from && record.cycle <= to);
}

function cycleRollup(records) {
  return {
    task_count: records.length,
    retrieval: Object.fromEntries(RETRIEVAL_KEYS.map(key => [key, percentage(records.filter(record => record.retrieval?.result === key).length, records.length)])),
    measurements: {
      source_read_tokens: groupedStatistics(records, 'source_read_tokens'),
      total_tokens: groupedStatistics(records, 'total_tokens'),
      main_thread_tokens: groupedStatistics(records, 'main_thread_tokens'),
    },
    estimates: {
      coverage: percentage(records.filter(record => record.estimate?.timing === 'pre-read' && Number.isFinite(record.estimate.tokens)).length, records.length),
      error: errorStats(records),
    },
    scope: {
      domains: statistics(records.map(record => record.scope?.domains).filter(Number.isFinite)),
      files: statistics(records.map(record => record.scope?.files).filter(Number.isFinite)),
    },
    models: countBy(records, record => record.runtime?.model || record.runtime?.model_label),
    efforts: countBy(records, record => record.runtime?.effort),
    verdicts: countBy(records, record => record.outcome?.verdict),
    outliers: outliers(records),
  };
}

function comparison(records, from, to) {
  if (from !== to) return { status: 'insufficient-data', reason: 'comparison is defined for one current cycle at a time' };
  const current = cycleRecords(records, to, to);
  const prior = cycleRecords(records, to - 1, to - 1);
  if (current.length < 2 || prior.length < 2) return { status: 'insufficient-data', reason: 'both cycles need at least two comparable records' };
  const currentStats = cycleRollup(current).measurements.total_tokens.estimated;
  const priorStats = cycleRollup(prior).measurements.total_tokens.estimated;
  if (!currentStats.count || !priorStats.count) return { status: 'insufficient-data', reason: 'total-token measurement provenance does not overlap' };
  return {
    status: 'comparable',
    current_cycle: to,
    prior_cycle: to - 1,
    total_tokens_median_delta: currentStats.median - priorStats.median,
    total_tokens_mean_delta: currentStats.mean - priorStats.mean,
    retrieval_first_try_delta: cycleRollup(current).retrieval['first-try'].percentage - cycleRollup(prior).retrieval['first-try'].percentage,
  };
}

export function analyzeRecords(records, { from = 1, to, closedCycles = [] } = {}) {
  const maxClosed = closedCycles.length ? Math.max(...closedCycles) : Math.max(0, ...records.map(record => record.cycle));
  const end = to === undefined ? maxClosed : to;
  const selected = cycleRecords(records, from, end);
  const byCycle = Object.fromEntries([...new Set(selected.map(record => record.cycle))].sort((a, b) => a - b).map(cycle => [cycle, cycleRollup(selected.filter(record => record.cycle === cycle))]));
  return {
    range: { from, to: end, closed_cycles_only: true },
    definitions: {
      first_try: 'retrieval.result=first-try',
      second_document: 'retrieval.result=second-document',
      repository_fallback: 'retrieval.result=repository-fallback',
      doc_source_conflict: 'retrieval.result=doc-source-conflict',
      statistics: 'median, mean and p90 are calculated separately for exact and estimated measurements; unavailable values are excluded',
      estimate_error: 'source_read_tokens.value minus estimate.tokens, only when estimate.timing=pre-read and source-read value is numeric',
      outlier_threshold: 'total-token values at or above the inclusive p90 threshold, maximum eight task ids',
    },
    aggregate: cycleRollup(selected),
    cycles: byCycle,
    comparison: comparison(records, from, end),
  };
}

export function factualReview(analysis, finding = null, recommendation = null) {
  const aggregate = analysis.aggregate;
  const firstTry = aggregate.retrieval['first-try'];
  const estimateCoverage = aggregate.estimates.coverage;
  const improvement = firstTry.count ? `Retrieval first-try coverage was ${firstTry.count}/${firstTry.total} (${firstTry.percentage}%).` : 'No retrieval result measurements were available.';
  const regression = aggregate.measurements.total_tokens.estimated.count ? `Estimated total-token measurements have a median of ${aggregate.measurements.total_tokens.estimated.median}.` : 'No comparable total-token measurements were available.';
  const flaw = estimateCoverage.count ? `Pre-read estimates cover ${estimateCoverage.count}/${estimateCoverage.total} records (${estimateCoverage.percentage}%).` : 'Pre-read estimate coverage is 0/0 because no comparable records were available.';
  return {
    improvement,
    regression,
    flaw,
    finding: finding || null,
    recommendation: recommendation || null,
  };
}

