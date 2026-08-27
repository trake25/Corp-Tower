import { createHash } from 'node:crypto';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { listTaskBundles, reportDirectory, writeAtomicText } from './state.mjs';
import { recurrenceState } from './flagging.mjs';

const REPORT_MAX_BYTES = 64 * 1024;
const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };
const CONFIDENCE_RANK = { low: 1, medium: 2, high: 3 };

export function isoWeek(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('invalid week timestamp');
  const current = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = current.getUTCDay() || 7;
  current.setUTCDate(current.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((current - yearStart) / 86400000) + 1) / 7);
  return `${current.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function formatTokens(value) {
  if (value === null || value === undefined) return '—';
  if (value < 1000) return String(value);
  if (value < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
  return `${(value / 1_000_000).toFixed(1)}M`;
}

function percentile(values, ratio) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)];
}

function escapeCell(value) {
  return String(value ?? '—')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ');
}

function shortId(prefix, value) {
  return `${prefix}-${createHash('sha256').update(value).digest('hex').slice(0, 6)}`;
}

function runtimeFor(bundle) {
  const event = [...bundle.events].sort((a, b) => Number(b.terminal) - Number(a.terminal) || b.occurred_at.localeCompare(a.occurred_at))[0];
  return event ? `${event.model_family}/${event.effort}` : 'unknown';
}

export function displayStageGroups(stageTotals = {}) {
  const sum = (...names) => names.reduce((total, name) => total + (stageTotals[name] || 0), 0);
  return {
    context: sum('intake', 'retrieval_context'),
    build: sum('planning', 'implementation'),
    verify: sum('verification', 'documentation'),
    other: sum('closeout', 'flagging', 'analytics', 'other'),
  };
}

function taskRow(bundle) {
  const final = bundle.final;
  const groups = displayStageGroups(final.stage_totals);
  const telemetry = final.telemetry;
  const total = final.status === 'exact'
    ? formatTokens(final.final_inclusive_provider_tokens)
    : `${formatTokens(final.known_provider_tokens)}?`;
  const obs = final.observability_provider_tokens === null
    ? '—'
    : `${final.observability_kind === 'estimated' ? '~' : ''}${formatTokens(final.observability_provider_tokens)}`;
  const retrieval = `${telemetry.retrieval.attempts}/${telemetry.retrieval.first_try ? 'first' : telemetry.retrieval.fallbacks ? 'fallback' : 'expanded'}`;
  const iterations = telemetry.iterations.implementation + telemetry.iterations.rework;
  const task = `${shortId('T', bundle.meta.task_id)} — ${bundle.meta.label}`;
  return [
    task,
    `${bundle.meta.task_type}/${bundle.meta.complexity}`,
    runtimeFor(bundle),
    total,
    obs,
    formatTokens(groups.context),
    formatTokens(groups.build),
    formatTokens(groups.verify),
    formatTokens(groups.other),
    retrieval,
    iterations,
    `${final.outcome}/${final.verification}`,
  ].map(escapeCell);
}

function groupedFlags(bundles) {
  const groups = new Map();
  for (const bundle of bundles) {
    for (const flag of bundle.flags.filter(item => /^(?:WF|C)-/.test(item.flag_id || ''))) {
      const group = groups.get(flag.fingerprint) || { flags: [], tasks: new Set() };
      group.flags.push(flag);
      group.tasks.add(bundle.meta.task_id);
      groups.set(flag.fingerprint, group);
    }
  }
  return [...groups.values()].map(group => {
    const formal = group.flags.filter(flag => flag.flag_id.startsWith('WF-')).sort((a, b) => (a.occurred_at || '').localeCompare(b.occurred_at || ''));
    const first = formal.at(-1) || group.flags[0];
    const severity = group.flags.reduce((best, flag) => SEVERITY_RANK[flag.severity] > SEVERITY_RANK[best] ? flag.severity : best, first.severity);
    const confidence = group.flags.reduce((best, flag) => (CONFIDENCE_RANK[flag.confidence] || 0) > (CONFIDENCE_RANK[best] || 0) ? flag.confidence : best, first.confidence);
    return {
      id: `${formal.length ? 'WF' : 'C'}-${first.fingerprint.slice(0, 6)}`,
      stage: first.stage,
      severity,
      confidence,
      occurrences: group.tasks.size,
      improvement: first.improvement,
      status: recurrenceState(group.tasks.size, group.flags),
      formal: formal.length > 0,
    };
  }).filter(group => group.formal || group.occurrences >= 2)
    .sort((a, b) => b.occurrences - a.occurrences || a.id.localeCompare(b.id));
}

function summaryLine(bundles, flags = groupedFlags(bundles)) {
  const exact = bundles.filter(bundle => bundle.final.status === 'exact');
  const totals = exact.map(bundle => bundle.final.final_inclusive_provider_tokens);
  const verified = bundles.filter(bundle => bundle.final.verification === 'passed').length;
  const firstTry = bundles.filter(bundle => bundle.final.telemetry.retrieval.first_try).length;
  return `Tasks ${bundles.length} | Verified ${verified}/${bundles.length} | Median ${formatTokens(percentile(totals, 0.5))} | P95 ${formatTokens(percentile(totals, 0.95))} | First-try ${bundles.length ? Math.round(firstTry * 100 / bundles.length) : 0}% | Flags ${flags.length}`;
}

function dataQualityLines(bundles) {
  const exact = bundles.filter(bundle => bundle.final.status === 'exact');
  const partial = bundles.filter(bundle => bundle.final.status !== 'exact');
  const reasons = new Map();
  for (const reason of partial.flatMap(bundle => bundle.final.reasons)) {
    const label = reason.split(':')[0].replaceAll('_', ' ');
    reasons.set(label, (reasons.get(label) || 0) + 1);
  }
  const summary = [...reasons.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `${reason} (${count})`).join(', ');
  const flags = new Map();
  for (const flag of bundles.flatMap(bundle => bundle.flags).filter(item => item.flag_id?.startsWith('DQ-')))
    flags.set(flag.cause_code, (flags.get(flag.cause_code) || 0) + 1);
  const flagged = [...flags.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([reason, count]) => `${reason.replaceAll('_', ' ')} (${count})`).join(', ');
  return [
    `- Exact: ${exact.length}`,
    `- Partial: ${partial.length}${summary ? ` — ${summary}` : ''}`,
    `- Flags: ${flags.size}${flagged ? ` — ${flagged}` : ''}`,
  ];
}

function flagTable(flags) {
  const rows = [
    '| Flag | Stage | Severity/Confidence | Occurrences | Suggested improvement | Status |',
    '|---|---|---|---:|---|---|',
  ];
  if (flags.length) rows.push(...flags.map(flag => `| ${[flag.id, flag.stage, `${flag.severity}/${flag.confidence}`, flag.occurrences, flag.improvement, flag.status].map(escapeCell).join(' | ')} |`));
  else rows.push('| — | — | — | 0 | none | observation |');
  return rows;
}

export function renderWeeklyReport(bundles, week, { part = null, includeFlags = true } = {}) {
  const flags = groupedFlags(bundles);
  const title = `# Workflow Observability — ${week}${part ? ` (part ${part})` : ''}`;
  const lines = [
    '<!-- PRIVATE GENERATED OBSERVABILITY VIEW — NEVER USE AS REPOSITORY CONTEXT -->',
    '',
    title,
    '',
    summaryLine(bundles, flags),
    '',
    '## Tasks',
    '',
    '| Task | Type/Cx | Runtime | Total | Obs | Context | Build | Verify | Other | Retrieval | Iter | Result |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---|---:|---|',
    ...bundles.map(bundle => `| ${taskRow(bundle).join(' | ')} |`),
  ];
  if (includeFlags) {
    lines.push('', '## Recurring Flags', '', ...flagTable(flags));
  }
  lines.push('', '## Data Quality', '', ...dataQualityLines(bundles), '');
  return lines.join('\n');
}

function renderFlagReport(flags, week, part) {
  return [
    '<!-- PRIVATE GENERATED OBSERVABILITY VIEW — NEVER USE AS REPOSITORY CONTEXT -->',
    '',
    `# Workflow Observability — ${week} (part ${part})`,
    '',
    '## Recurring Flags',
    '',
    ...flagTable(flags),
    '',
  ].join('\n');
}

function boundedChunks(items, render) {
  const chunks = [];
  const pending = items.length ? [items] : [];
  while (pending.length) {
    const candidate = pending.shift();
    if (Buffer.byteLength(render(candidate)) <= REPORT_MAX_BYTES) {
      chunks.push(candidate);
      continue;
    }
    if (candidate.length === 1) throw new Error('one weekly report row exceeds 64 KiB');
    const middle = Math.ceil(candidate.length / 2);
    pending.unshift(candidate.slice(middle));
    pending.unshift(candidate.slice(0, middle));
  }
  return chunks;
}

export function buildWeeklyReportParts(bundles, week) {
  const complete = renderWeeklyReport(bundles, week);
  if (Buffer.byteLength(complete) <= REPORT_MAX_BYTES) return [{ kind: 'complete', body: complete }];
  const taskChunks = boundedChunks(bundles, chunk => renderWeeklyReport(chunk, week, { part: '999999', includeFlags: false }));
  const flagChunks = boundedChunks(groupedFlags(bundles), chunk => renderFlagReport(chunk, week, '999999'));
  const descriptors = [
    ...taskChunks.map(items => ({ kind: 'tasks', items })),
    ...flagChunks.map(items => ({ kind: 'flags', items })),
  ];
  return descriptors.map((descriptor, index) => {
    const part = index + 1;
    const body = descriptor.kind === 'tasks'
      ? renderWeeklyReport(descriptor.items, week, { part, includeFlags: false })
      : renderFlagReport(descriptor.items, week, part);
    if (Buffer.byteLength(body) > REPORT_MAX_BYTES) throw new Error('weekly report part exceeds 64 KiB');
    return { kind: descriptor.kind, body };
  });
}

function removeExistingWeekReports(directory, week) {
  if (!existsSync(directory)) return;
  const pattern = new RegExp(`^observability-${week}(?:-part-\\d+)?\\.md$`);
  for (const entry of readdirSync(directory, { withFileTypes: true }))
    if (entry.isFile() && pattern.test(entry.name)) unlinkSync(join(directory, entry.name));
}

function writeWeek(stateDir, bundles, week) {
  const directory = reportDirectory(stateDir);
  removeExistingWeekReports(directory, week);
  const parts = buildWeeklyReportParts(bundles, week);
  if (parts.length === 1 && parts[0].kind === 'complete') {
    const path = join(directory, `observability-${week}.md`);
    writeAtomicText(path, parts[0].body);
    return [path];
  }
  const paths = parts.map((part, index) => {
    const path = join(directory, `observability-${week}-part-${index + 1}.md`);
    writeAtomicText(path, part.body);
    return path;
  });
  const flags = groupedFlags(bundles);
  const index = [
    '<!-- PRIVATE GENERATED OBSERVABILITY VIEW — NEVER USE AS REPOSITORY CONTEXT -->',
    '',
    '# Workflow Observability — ' + week,
    '',
    summaryLine(bundles, flags),
    '',
    '## Parts',
    '',
    ...paths.map((path, index) => `- [${parts[index].kind} ${index + 1}](./${path.split('/').at(-1)})`),
    '',
    '## Data Quality',
    '',
    ...dataQualityLines(bundles),
    '',
  ].join('\n');
  if (Buffer.byteLength(index) > REPORT_MAX_BYTES) throw new Error('weekly report index exceeds 64 KiB');
  const indexPath = join(directory, `observability-${week}.md`);
  writeAtomicText(indexPath, index);
  return [indexPath, ...paths];
}

export function renderPrivateReports(stateDir, { week = null } = {}) {
  const bundles = listTaskBundles(stateDir).filter(bundle => bundle.final?.finalized_at);
  const byWeek = new Map();
  for (const bundle of bundles) {
    const key = isoWeek(bundle.final.finalized_at);
    if (!week || key === week) byWeek.set(key, [...(byWeek.get(key) || []), bundle]);
  }
  return [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).flatMap(([key, items]) => writeWeek(stateDir, items, key));
}
