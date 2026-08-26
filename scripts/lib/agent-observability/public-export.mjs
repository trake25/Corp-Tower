import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildAnalytics, percentile } from './analytics.mjs';
import { isoWeek } from './report.mjs';
import { listTaskBundles, writeAtomicText } from './state.mjs';
import { assertAllowedKeys, cleanSlug, cleanText, nonNegativeInteger } from './schema.mjs';

const PROHIBITED = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(?:AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,})\b/,
  /\bBearer\s+[A-Za-z0-9._-]{16,}/i,
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  /(?:^|\s)(?:\/home\/|[A-Za-z]:\\Users\\)/,
  /https?:\/\//i,
  /\bT-[a-f0-9]{6,}\b/i,
];

function rounded(value) {
  return value === null ? '—' : String(Math.round(value / 100) * 100);
}

function escapeCell(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\\', '\\\\')
    .replaceAll('|', '\\|')
    .replace(/\s+/g, ' ');
}

function sanitizeImprovements(input = []) {
  if (!Array.isArray(input) || input.length > 10) throw new Error('improvements must contain at most 10 reviewed entries');
  return input.map((item, index) => {
    assertAllowedKeys(item, ['category', 'occurrences', 'change', 'outcome', 'reviewed'], `improvements[${index}]`);
    if (item.reviewed !== true) throw new Error('every public improvement must be human reviewed');
    return {
      category: cleanSlug(item.category, `improvements[${index}].category`),
      occurrences: nonNegativeInteger(item.occurrences, `improvements[${index}].occurrences`),
      change: cleanText(item.change, `improvements[${index}].change`, 120),
      outcome: cleanText(item.outcome, `improvements[${index}].outcome`, 120),
    };
  });
}

export function renderPublicReport(bundles, week, improvements = []) {
  if (!/^\d{4}-W\d{2}$/.test(week)) throw new Error('week must use YYYY-Www');
  const selected = bundles.filter(bundle => bundle.final?.status === 'exact' && isoWeek(bundle.final.finalized_at) === week);
  const totals = selected.map(bundle => bundle.final.final_inclusive_provider_tokens);
  const verified = selected.filter(bundle => bundle.final.verification === 'passed').length;
  const firstTry = selected.filter(bundle => bundle.final.telemetry.retrieval.first_try).length;
  const fallback = selected.filter(bundle => bundle.final.telemetry.retrieval.fallbacks > 0).length;
  const analytics = buildAnalytics(selected, { week, minSize: 5 });
  const cohorts = analytics.cohorts.filter(cohort => cohort.sample_size >= 5);
  const reviewed = sanitizeImprovements(improvements);
  const lines = [
    '<!-- GENERATED PUBLIC OBSERVABILITY SUMMARY — NON-CONTEXT DATA -->',
    '',
    `# Workflow Observability — ${week}`,
    '',
    'Methodology: schema 2; UTC weeks; exact settled tasks only; token values rounded to 100.',
    '',
    `Tasks ${selected.length} | Verified ${verified}/${selected.length} | Median ${rounded(percentile(totals, 0.5))} | P95 ${rounded(percentile(totals, 0.95))} | First-try ${selected.length ? Math.round(firstTry * 100 / selected.length) : 0}% | Fallback ${selected.length ? Math.round(fallback * 100 / selected.length) : 0}%`,
    '',
    '## Comparable Cohorts',
    '',
    '| Type/Cx | Domain | N | Median | P95 | Verified | First-try |',
    '|---|---|---:|---:|---:|---:|---:|',
    ...(cohorts.length ? cohorts.map(cohort => `| ${[`${cohort.task_type}/${cohort.complexity}`, cohort.domain, cohort.sample_size, rounded(cohort.median_tokens), rounded(cohort.p95_tokens), `${Math.round(cohort.verification_rate * 100)}%`, `${Math.round(cohort.retrieval_first_try_rate * 100)}%`].map(escapeCell).join(' | ')} |`) : ['| — | — | 0 | — | — | — | — |']),
    '',
    '## Reviewed Improvements',
    '',
    '| Category | Occurrences | Change | Outcome |',
    '|---|---:|---|---|',
    ...(reviewed.length ? reviewed.map(item => `| ${[item.category, item.occurrences, item.change, item.outcome].map(escapeCell).join(' | ')} |`) : ['| — | 0 | none published | — |']),
    '',
  ];
  const body = lines.join('\n');
  if (Buffer.byteLength(body) > 64 * 1024) throw new Error('public report exceeds 64 KiB');
  if (PROHIBITED.some(pattern => pattern.test(body))) throw new Error('public report failed prohibited-content scan');
  return body;
}

export function exportPublicReport({ root = '.', stateDir, week, approve = false, improvements = [] }) {
  if (!approve) throw new Error('public export requires explicit --approve');
  const body = renderPublicReport(listTaskBundles(stateDir), week, improvements);
  const directory = resolve(root, 'report/observability');
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${week}.md`);
  writeAtomicText(path, body, { mode: 0o644 });
  return { path, bytes: Buffer.byteLength(body) };
}
