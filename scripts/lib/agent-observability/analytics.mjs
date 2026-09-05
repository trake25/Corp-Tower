import { isoWeek } from './report.mjs';
import { STAGES } from './schema.mjs';
import { stableJson } from './state.mjs';
import { candidateHandoffFields, selectCandidateForHandoff } from './flagging.mjs';

export function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function runtimeKey(bundle) {
  const event = bundle.events.find(item => item.terminal) || bundle.events[0];
  return event ? `${event.provider}|${event.model}|${event.effort}` : 'unknown|unknown|unknown';
}

function cohortKey(bundle) {
  return [bundle.meta.task_type, bundle.meta.complexity, bundle.meta.domains.join('+') || 'repository'].join('|');
}

function summarize(items, minSize) {
  const totals = items.map(bundle => bundle.final.final_inclusive_provider_tokens);
  const verified = items.filter(bundle => bundle.final.verification === 'passed').length;
  const firstTry = items.filter(bundle => bundle.final.telemetry.retrieval.first_try).length;
  const fallback = items.filter(bundle => bundle.final.telemetry.retrieval.fallbacks > 0).length;
  const runtimes = new Map();
  for (const bundle of items) runtimes.set(runtimeKey(bundle), [...(runtimes.get(runtimeKey(bundle)) || []), bundle]);
  const stageTotals = Object.fromEntries(STAGES.map(stage => [stage, 0]));
  for (const bundle of items)
    for (const stage of STAGES) stageTotals[stage] += bundle.final.stage_totals[stage] || 0;
  const inclusive = Object.values(stageTotals).reduce((total, value) => total + value, 0);
  const stageShares = Object.fromEntries(STAGES.map(stage => [stage, inclusive ? Number((stageTotals[stage] / inclusive).toFixed(4)) : 0]));
  const hotspotStage = [...STAGES].sort((a, b) => stageTotals[b] - stageTotals[a] || a.localeCompare(b))[0];
  const rework = items.map(bundle => bundle.final.telemetry.implementation.rework_cycles);
  const retries = items.filter(bundle => bundle.final.telemetry.tools.recoveries > 0).length;
  const flagTasks = new Map();
  for (const bundle of items)
    for (const flag of bundle.flags.filter(item => item.flag_id?.startsWith('WF-')))
      flagTasks.set(flag.fingerprint, new Set([...(flagTasks.get(flag.fingerprint) || []), bundle.meta.task_id]));
  return {
    sample_size: items.length,
    verified_sample_size: verified,
    decision_ready: verified >= minSize,
    median_tokens: percentile(totals, 0.5),
    p95_tokens: percentile(totals, 0.95),
    verification_rate: items.length ? verified / items.length : 0,
    retrieval_first_try_rate: items.length ? firstTry / items.length : 0,
    fallback_rate: items.length ? fallback / items.length : 0,
    median_rework: percentile(rework, 0.5),
    tool_retry_rate: items.length ? retries / items.length : 0,
    recurring_flag_count: [...flagTasks.values()].filter(tasks => tasks.size >= 2).length,
    hotspot_stage: hotspotStage,
    stage_shares: stageShares,
    runtimes: [...runtimes.entries()].map(([key, bundles]) => {
      const [provider, model, effort] = key.split('|');
      const runtimeTotals = bundles.map(bundle => bundle.final.final_inclusive_provider_tokens);
      return {
        provider,
        model,
        effort,
        sample_size: bundles.length,
        median_tokens: percentile(runtimeTotals, 0.5),
        p95_tokens: percentile(runtimeTotals, 0.95),
        comparison: 'same-provider only; cross-provider is directional',
      };
    }).sort((a, b) => a.provider.localeCompare(b.provider) || a.model.localeCompare(b.model) || a.effort.localeCompare(b.effort)),
  };
}

export function buildAnalytics(bundles, { week = null, minSize = 5 } = {}) {
  const finalized = bundles.filter(bundle => bundle.final?.status === 'exact'
    && (!week || isoWeek(bundle.final.finalized_at) === week));
  const groups = new Map();
  for (const bundle of finalized) groups.set(cohortKey(bundle), [...(groups.get(cohortKey(bundle)) || []), bundle]);
  const cohorts = [...groups.entries()].map(([key, items]) => {
    const [task_type, complexity, domain] = key.split('|');
    return { task_type, complexity, domain, ...summarize(items, minSize) };
  }).sort((a, b) => a.task_type.localeCompare(b.task_type) || a.complexity.localeCompare(b.complexity) || a.domain.localeCompare(b.domain));
  return {
    schema_version: 3,
    week,
    exact_tasks: finalized.length,
    minimum_sample: minSize,
    optional_flagging_overhead: optionalFlaggingOverhead(bundles),
    cohorts,
  };
}

export function optionalFlaggingOverhead(bundles) {
  const formal = bundles.flatMap(bundle => bundle.flags.filter(flag => flag.flag_id?.startsWith('WF-')));
  const candidateHandoffBytes = bundles.reduce((total, bundle) => {
    const selected = selectCandidateForHandoff(bundle.flags);
    return total + (selected ? Buffer.byteLength(JSON.stringify(candidateHandoffFields(selected))) : 0);
  }, 0);
  return {
    candidate_handoff_bytes: candidateHandoffBytes,
    formal_material_bytes: formal.reduce((total, flag) => total + (flag.provider_visible_bytes || 0), 0),
    optional_reasoning_count: formal.length,
    attributable_token_delta: null,
  };
}

export function boundedAnalyticsAggregate(analytics, maxBytes = 8 * 1024) {
  let candidate = analytics;
  if (Buffer.byteLength(stableJson(candidate)) <= maxBytes) return candidate;
  candidate = { ...analytics, cohorts: analytics.cohorts.map(({ runtimes, ...cohort }) => cohort) };
  if (Buffer.byteLength(stableJson(candidate)) <= maxBytes) return candidate;
  const compact = { ...candidate, cohorts: [] };
  for (const cohort of candidate.cohorts) {
    const next = { ...compact, cohorts: [...compact.cohorts, cohort] };
    if (Buffer.byteLength(stableJson(next)) > maxBytes) break;
    compact.cohorts.push(cohort);
  }
  return { ...compact, truncated: compact.cohorts.length < candidate.cohorts.length };
}

export function compareWindows(before, after, { minimum = 5 } = {}) {
  if (before.length < minimum || after.length < minimum)
    return { status: 'insufficient_sample', before: before.length, after: after.length };
  if ([...before, ...after].some(bundle => bundle.final?.status !== 'exact'))
    return { status: 'inexact_usage' };
  const cohorts = new Set([...before, ...after].map(cohortKey));
  if (cohorts.size !== 1) return { status: 'incomparable_cohort' };
  const providers = new Set([...before, ...after].flatMap(bundle => bundle.events.map(event => event.provider)));
  if (providers.size !== 1) {
    return {
      status: 'directional_only',
      reason: 'cross_provider_tokens',
      median_before: percentile(before.map(bundle => bundle.final.final_inclusive_provider_tokens), 0.5),
      median_after: percentile(after.map(bundle => bundle.final.final_inclusive_provider_tokens), 0.5),
    };
  }
  const verifiedBefore = before.filter(bundle => bundle.final.verification === 'passed').length / before.length;
  const verifiedAfter = after.filter(bundle => bundle.final.verification === 'passed').length / after.length;
  if (verifiedAfter < verifiedBefore)
    return { status: 'verification_regressed', verification_before: verifiedBefore, verification_after: verifiedAfter };
  return {
    status: 'comparable',
    comparison: 'same_provider',
    median_before: percentile(before.map(bundle => bundle.final.final_inclusive_provider_tokens), 0.5),
    median_after: percentile(after.map(bundle => bundle.final.final_inclusive_provider_tokens), 0.5),
    verification_before: verifiedBefore,
    verification_after: verifiedAfter,
  };
}
