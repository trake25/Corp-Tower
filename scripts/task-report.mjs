#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, relative } from 'node:path';
import { atomicWrites, DEFAULT_RECORDS_FILE, DEFAULT_REPORT_FILE, DEFAULT_REVIEWS_FILE, DEFAULT_STATE_FILE, jsonl, readJson, readJsonl, rootPath, stateFromRecords, writeJson } from './lib/task-report-storage.mjs';
import { analyzeRecords, factualReview } from './lib/task-report-analysis.mjs';
import { isUnrecordedModel, parseEstimate, parseMeasurement, validateCycleReview, validateCycleState, validateTaskRecord } from './lib/task-report-schema.mjs';
import { renderReport } from './lib/task-report-render.mjs';

const ROOT = resolve(process.env.TASK_REPORT_ROOT || '.');
const argv = process.argv.slice(2);
const command = argv.shift() || 'validate';

function localOnlyReceipt(path) {
  return path.startsWith('task/') || path.startsWith('.agent-state/automation/');
}

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) result[key] = true;
    else {
      if (result[key] === undefined) result[key] = value;
      else if (Array.isArray(result[key])) result[key].push(value);
      else result[key] = [result[key], value];
      index++;
    }
  }
  return result;
}

function one(value, key, { required = false } = {}) {
  const found = value[key];
  if (Array.isArray(found)) fail(`--${key} may be supplied once`);
  if (required && (found === undefined || found === '')) fail(`--${key} is required`);
  return found;
}

function many(value, key) {
  const found = value[key];
  return found === undefined ? [] : Array.isArray(found) ? found : [found];
}

function fail(message, code = 1) {
  console.error(message);
  process.exit(code);
}

function file(value, key, defaultPath) {
  return rootPath(ROOT, one(value, key) || defaultPath);
}

function relativePath(path) {
  return relative(ROOT, path).replaceAll('\\', '/');
}

function recordsFile(value) { return file(value, 'records', DEFAULT_RECORDS_FILE); }
function reviewsFile(value) { return file(value, 'reviews', DEFAULT_REVIEWS_FILE); }
function stateFile(value) { return file(value, 'state', DEFAULT_STATE_FILE); }
function reportFile(value) { return file(value, 'report', DEFAULT_REPORT_FILE); }

function load(value) {
  const recordsPath = recordsFile(value);
  const reviewsPath = reviewsFile(value);
  const statePath = stateFile(value);
  const records = readJsonl(recordsPath);
  const reviews = readJsonl(reviewsPath);
  const state = readJson(statePath, stateFromRecords(records));
  return { recordsPath, reviewsPath, statePath, reportPath: reportFile(value), records, reviews, state };
}

function asInteger(value, key, { required = true, min = 0 } = {}) {
  if (value === undefined || value === '') {
    if (required) fail(`--${key} is required`);
    return null;
  }
  const number = Number(String(value).replaceAll(',', '').replace(/^~/, ''));
  if (!Number.isInteger(number) || number < min) fail(`--${key} must be an integer >= ${min}`);
  return number;
}

function normalizeHit(value) {
  const hits = { '✓': 'first-try', '~': 'second-document', '✗': 'repository-fallback', '!': 'doc-source-conflict' };
  const normalized = hits[value] || value;
  if (!['first-try', 'second-document', 'repository-fallback', 'doc-source-conflict', 'unavailable'].includes(normalized)) fail('--hit must be first-try, second-document, repository-fallback, doc-source-conflict, or unavailable');
  return normalized;
}

function parseSkills(value) {
  if (value === undefined || value === '' || value === '—' || value === '-') return [];
  return String(value).split(',').map(skill => skill.trim()).filter(Boolean);
}

function exactModel(value) {
  if (value === undefined || value === '' || isUnrecordedModel(value)) fail('--model must record the exact implementing model variant; placeholders such as "variant unrecorded" are not accepted');
  return String(value).trim();
}

function receiptFor(value, manifestPath) {
  const receiptPath = rootPath(ROOT, one(value, 'receipt', { required: true }));
  if (!existsSync(receiptPath)) fail(`receipt not found: ${relativePath(receiptPath)}`);
  let receipt;
  try { receipt = JSON.parse(readFileSync(receiptPath, 'utf8')); }
  catch (error) { fail(`receipt is not valid JSON: ${error.message}`); }
  if (receipt.status !== 'passed') fail('receipt must have status passed');
  if (receipt.manifest && receipt.manifest !== relativePath(manifestPath)) fail('receipt does not link to the supplied manifest');
  return { path: relativePath(receiptPath), value: receipt };
}

function parseLegacyRows(markdown) {
  const cycles = [];
  const header = /## Cycle (\d+) \((open|closed)\)\n([\s\S]*?)(?=\n## Cycle \d+ \(|$)/g;
  let match;
  while ((match = header.exec(markdown))) {
    const cycle = Number(match[1]);
    const status = match[2];
    const body = match[3];
    const tableStart = body.search(/^\| # \| Task \|/m);
    const prose = tableStart === -1 ? body.trim() : body.slice(0, tableStart).trim();
    const rows = [];
    for (const line of body.split(/\r?\n/)) {
      if (!/^\|\s*\d+\s*\|/.test(line)) continue;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim().replaceAll('\\|', '|'));
      if (cells.length !== 13 && cells.length !== 15) continue;
      const full = cells.length === 15 ? cells : [...cells, '—', '—'];
      rows.push({ cycle, status, row: Number(full[0]), task: full[1], complexity: Number(full[2]), mode: full[3], domains: Number(full[4]), files: Number(full[5]), estimate: full[6], sourceRead: full[7], total: full[8], main: full[9], hit: full[10], verdict: full[11], model: full[12], effort: full[13], skills: full[14] });
    }
    cycles.push({ cycle, status, prose, rows });
  }
  return cycles;
}

function legacyRecord(row) {
  const estimate = parseEstimate(row.estimate);
  const model = row.model === '—' || row.model === '-' ? null : /(?:variant\s+unrecorded|unrecorded)/i.test(row.model) ? null : row.model;
  const warnings = [];
  if (estimate.timing !== 'pre-read') warnings.push(`legacy estimate timing preserved as ${estimate.timing}`);
  if (model === null && row.model !== '—' && row.model !== '-') warnings.push(`legacy model label preserved without an exact variant: ${row.model}`);
  return {
    schema_version: 1,
    source: 'legacy-markdown',
    task_id: `c${row.cycle}-r${row.row}`,
    cycle: row.cycle,
    row: row.row,
    task: row.task,
    complexity: Number.isFinite(row.complexity) ? row.complexity : null,
    mode: row.mode === '—' ? null : row.mode,
    scope: { domains: Number.isFinite(row.domains) ? row.domains : null, files: Number.isFinite(row.files) ? row.files : null, manifest: null },
    estimate,
    observed: { source_read_tokens: parseMeasurement(row.sourceRead), total_tokens: parseMeasurement(row.total), main_thread_tokens: parseMeasurement(row.main), context_bytes: null, tool_calls: null },
    retrieval: { result: normalizeHit(row.hit === '—' ? 'unavailable' : row.hit), conflict_paths: [] },
    outcome: { verdict: row.verdict || 'unavailable', summary: 'Imported from the legacy Markdown report.' },
    runtime: { model, model_label: row.model === '—' ? null : row.model, effort: row.effort === '—' ? null : row.effort },
    skills: parseSkills(row.skills),
    receipt: null,
    warnings,
  };
}

function importLegacy(value) {
  const sourcePath = rootPath(ROOT, one(value, 'from') || DEFAULT_REPORT_FILE);
  const destination = load(value);
  if (destination.records.length && !value.force) fail('structured records already exist; use --force only for an explicit legacy re-import');
  if (!existsSync(sourcePath)) fail(`legacy report not found: ${relativePath(sourcePath)}`);
  const markdown = readFileSync(sourcePath, 'utf8');
  const cycles = parseLegacyRows(markdown);
  const records = cycles.flatMap(cycle => cycle.rows.map(legacyRecord));
  const reviews = cycles.filter(cycle => cycle.status === 'closed' && cycle.prose).map(cycle => ({
    schema_version: 1,
    source: 'legacy-markdown',
    cycle: cycle.cycle,
    assessment: cycle.prose,
    warnings: cycle.cycle === 2 ? ['Cycle 2 prose says six pre-read estimates while the preserved table contains four; neither value is silently selected.'] : cycle.cycle === 1 ? ['Cycle 1 prose says 19 tasks while the preserved table contains 21; both facts remain in the imported source.'] : [],
  }));
  const open = cycles.find(cycle => cycle.status === 'open');
  const state = { schema_version: 1, status: 'open', open_cycle: open?.cycle || Math.max(...records.map(record => record.cycle), 0) + 1, next_row: (open?.rows.at(-1)?.row || 0) + 1, closed_cycles: cycles.filter(cycle => cycle.status === 'closed').map(cycle => cycle.cycle).sort((a, b) => a - b) };
  const report = renderReport({ records, reviews, state });
  atomicWrites([
    { file: destination.recordsPath, content: jsonl(records) },
    { file: destination.reviewsPath, content: jsonl(reviews) },
    { file: destination.statePath, content: `${JSON.stringify(state, null, 2)}\n` },
    { file: destination.reportPath, content: report },
  ]);
  console.log(`PASS — imported ${records.length} legacy records across ${cycles.length} cycles; warnings preserved`);
}

function append(value) {
  if (value['r-est'] !== undefined) fail('--r-est is intake-only; task-close report must read the pre-read estimate from the manifest');
  if (value.model !== undefined || value['model-variant'] !== undefined) fail('model variant is intake-only; task-close prepare must record it in the manifest');
  const manifestPath = rootPath(ROOT, one(value, 'manifest', { required: true }));
  if (!existsSync(manifestPath)) fail(`manifest not found: ${relativePath(manifestPath)}`);
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const receipt = receiptFor(value, manifestPath);
  const data = load(value);
  const stateErrors = validateCycleState(data.state);
  if (stateErrors.length) fail(stateErrors.join('; '));
  const row = data.state.next_row;
  if (row > 20) fail('open cycle already has 20 rows; close the cycle before appending');
  const model = exactModel(manifest.runtime?.model);
  const estimate = manifest.estimate;
  if (!estimate || estimate.timing !== 'pre-read' || !Number.isInteger(estimate.tokens) || estimate.tokens < 0) fail('manifest must contain a valid pre-read estimate from task-close prepare');
  const record = {
    schema_version: 1,
    task_id: `c${data.state.open_cycle}-r${row}`,
    cycle: data.state.open_cycle,
    row,
    task: manifest.task || one(value, 'task', { required: true }),
    complexity: asInteger(one(value, 'complexity'), 'complexity', { min: 1 }),
    mode: one(value, 'mode', { required: true }),
    scope: { domains: asInteger(one(value, 'domains'), 'domains'), files: asInteger(one(value, 'files'), 'files'), manifest: relativePath(manifestPath) },
    estimate: { tokens: estimate.tokens, timing: estimate.timing, basis: estimate.basis, recorded_at: estimate.recorded_at, manifest_hash: estimate.manifest_hash, route_count: estimate.route_count },
    observed: {
      source_read_tokens: parseMeasurement(one(value, 'r-act')),
      total_tokens: parseMeasurement(one(value, 'total')),
      main_thread_tokens: parseMeasurement(one(value, 'main')),
      context_bytes: asInteger(one(value, 'context-bytes'), 'context-bytes', { required: false }),
      tool_calls: asInteger(one(value, 'tool-calls'), 'tool-calls', { required: false }),
    },
    retrieval: { result: normalizeHit(one(value, 'hit', { required: true })), conflict_paths: many(value, 'conflict-path') },
    outcome: { verdict: one(value, 'verdict', { required: true }), summary: one(value, 'summary') || 'Task completed with a passing task-close verification receipt.' },
    runtime: { model, effort: one(value, 'effort', { required: true }) },
    skills: parseSkills(one(value, 'skills', { required: true })),
    receipt: receipt.path,
  };
  const errors = validateTaskRecord(record);
  if (errors.length) fail(errors.join('; '));
  if (data.records.some(existing => existing.task_id === record.task_id || (existing.cycle === record.cycle && existing.row === record.row))) fail(`duplicate task record: ${record.task_id}`);
  const nextState = { ...data.state, next_row: row + 1 };
  const nextRecords = [...data.records, record];
  const report = renderReport({ records: nextRecords, reviews: data.reviews, state: nextState });
  atomicWrites([
    { file: data.recordsPath, content: jsonl(nextRecords) },
    { file: data.statePath, content: `${JSON.stringify(nextState, null, 2)}\n` },
    { file: data.reportPath, content: report },
  ]);
  console.log(row === 20 ? 'PASS — appended row 20; run close-cycle with the semantic review' : `PASS — appended ${record.task_id}`);
}

function start(value) {
  const manifestPath = rootPath(ROOT, one(value, 'manifest', { required: true }));
  const tokens = asInteger(one(value, 'r-est', { required: true }), 'r-est');
  const basis = one(value, 'r-est-basis', { required: true });
  if (!basis.trim()) fail('--r-est-basis must explain the estimate');
  const model = one(value, 'model-variant') || one(value, 'model', { required: true });
  exactModel(model);
  const existing = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const estimate = { tokens, timing: 'pre-read', basis: basis.trim(), recorded_at: new Date().toISOString(), route_count: asInteger(one(value, 'route-count'), 'route-count', { required: false }) ?? existing.routes?.length ?? null, manifest_hash: null };
  const manifest = { ...existing, estimate, runtime: { ...(existing.runtime || {}), model: String(model).trim(), recorded_at: new Date().toISOString() } };
  const fingerprint = JSON.parse(JSON.stringify(manifest));
  fingerprint.estimate.manifest_hash = null;
  manifest.estimate.manifest_hash = createHash('sha256').update(JSON.stringify(fingerprint)).digest('hex');
  writeJson(manifestPath, manifest);
  console.log(`PASS — recorded pre-read estimate ${tokens} in ${relativePath(manifestPath)}`);
}

function validate(value) {
  const data = load(value);
  const errors = [];
  data.records.forEach((record, index) => validateTaskRecord(record).forEach(error => errors.push(`record ${index + 1}: ${error}`)));
  data.reviews.forEach((review, index) => validateCycleReview(review).forEach(error => errors.push(`review ${index + 1}: ${error}`)));
  validateCycleState(data.state).forEach(error => errors.push(error));
  const ids = new Set();
  const rows = new Set();
  const byCycle = new Map();
  data.records.forEach(record => {
    if (ids.has(record.task_id)) errors.push(`duplicate task_id ${record.task_id}`);
    if (rows.has(`${record.cycle}:${record.row}`)) errors.push(`duplicate cycle/row c${record.cycle}-r${record.row}`);
    ids.add(record.task_id);
    rows.add(`${record.cycle}:${record.row}`);
    if (!byCycle.has(record.cycle)) byCycle.set(record.cycle, []);
    byCycle.get(record.cycle).push(record.row);
    if (record.source !== 'legacy-markdown' && record.receipt) {
      const receiptPath = rootPath(ROOT, record.receipt);
      if (!existsSync(receiptPath)) {
        if (!localOnlyReceipt(record.receipt)) errors.push(`${record.task_id} receipt not found: ${record.receipt}`);
      } else {
        try {
          const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
          if (receipt.status !== 'passed') errors.push(`${record.task_id} receipt is not passed`);
        } catch (error) { errors.push(`${record.task_id} receipt is invalid: ${error.message}`); }
      }
    }
  });
  byCycle.forEach((cycleRows, cycle) => {
    const sorted = [...cycleRows].sort((a, b) => a - b);
    sorted.forEach((row, index) => { if (row !== index + 1) errors.push(`cycle ${cycle} rows must be contiguous from 1`); });
    if (cycle !== data.state.open_cycle && data.state.closed_cycles.includes(cycle) && sorted.length !== 20 && data.records.filter(record => record.cycle === cycle && record.source !== 'legacy-markdown').length === sorted.length)
      errors.push(`standard closed cycle ${cycle} must contain exactly 20 rows`);
  });
  const expected = renderReport({ records: data.records, reviews: data.reviews, state: data.state });
  if (!existsSync(data.reportPath)) errors.push(`generated report not found: ${relativePath(data.reportPath)}`);
  else if (readFileSync(data.reportPath, 'utf8') !== expected) errors.push('generated report is stale; run task-report render');
  const warningDetails = [];
  data.records.filter(record => record.source === 'legacy-markdown').forEach(record => {
    (record.warnings || []).forEach(warning => warningDetails.push(`${record.task_id}: ${warning}`));
    for (const field of ['source_read_tokens', 'total_tokens', 'main_thread_tokens']) {
      if (record.observed?.[field]?.kind === 'unavailable') warningDetails.push(`${record.task_id}: legacy ${field} is unavailable; null preserved`);
    }
    if (record.estimate?.timing === 'unavailable') warningDetails.push(`${record.task_id}: legacy estimate is unavailable; null preserved`);
  });
  data.reviews.forEach(review => (review.warnings || []).forEach(warning => warningDetails.push(`cycle ${review.cycle}: ${warning}`)));
  const legacyWarnings = warningDetails.length;
  if (errors.length) {
    errors.forEach(error => console.error(`error: ${error}`));
    process.exit(1);
  }
  if (!value.quiet) warningDetails.forEach(warning => console.log(`warning: ${warning}`));
  console.log(`PASS — ${data.records.length} records, ${data.reviews.length} reviews, open cycle ${data.state.open_cycle} row ${data.state.next_row}; legacy warnings preserved: ${legacyWarnings}`);
}

function render(value) {
  const data = load(value);
  const output = renderReport({ records: data.records, reviews: data.reviews, state: data.state });
  atomicWrites([{ file: data.reportPath, content: output }]);
  console.log(`PASS — rendered ${relativePath(data.reportPath)}`);
}

function analyze(value) {
  const data = load(value);
  const from = asInteger(one(value, 'from'), 'from', { required: false, min: 1 }) || 1;
  const requestedTo = one(value, 'to');
  const to = requestedTo === undefined || requestedTo === 'last-closed' ? Math.max(0, ...data.state.closed_cycles) : asInteger(requestedTo, 'to', { min: from });
  const result = analyzeRecords(data.records, { from, to, closedCycles: data.state.closed_cycles });
  if (value.json) console.log(JSON.stringify(result, null, 2));
  else console.log(`PASS — cycles ${from}-${to}: ${result.aggregate.task_count} records; first-try ${result.aggregate.retrieval['first-try'].count}/${result.aggregate.retrieval['first-try'].total}`);
}

function closeCycle(value) {
  const data = load(value);
  const cycle = data.state.open_cycle;
  const current = data.records.filter(record => record.cycle === cycle).sort((a, b) => a.row - b.row);
  if (current.length !== 20 || current.some(record => record.source === 'legacy-markdown' || record.receipt === null)) fail(`cycle ${cycle} must contain exactly 20 receipt-linked standard records before close-cycle`);
  const recordErrors = current.flatMap(record => validateTaskRecord(record).map(error => `${record.task_id}: ${error}`));
  if (recordErrors.length) fail(recordErrors.join('; '));
  for (const record of current) {
    const receiptPath = rootPath(ROOT, record.receipt);
    if (!existsSync(receiptPath)) {
      if (!localOnlyReceipt(record.receipt)) fail(`${record.task_id} receipt not found: ${record.receipt}`);
    } else {
      try {
        if (JSON.parse(readFileSync(receiptPath, 'utf8')).status !== 'passed') fail(`${record.task_id} receipt must have status passed`);
      } catch (error) { fail(`${record.task_id} receipt is invalid: ${error.message}`); }
    }
  }
  const finding = one(value, 'finding') || null;
  const recommendation = one(value, 'recommendation') || null;
  if (!value['accept-factual'] && (!finding || !recommendation)) fail('close-cycle requires --finding and --recommendation, or --accept-factual');
  const analysis = analyzeRecords(current, { from: cycle, to: cycle, closedCycles: [cycle] });
  const factual = factualReview(analysis, finding, recommendation);
  const review = { schema_version: 1, source: 'agent', cycle, finding, recommendation, factual, warnings: [] };
  const reviewErrors = validateCycleReview(review);
  if (reviewErrors.length) fail(reviewErrors.join('; '));
  const nextState = { schema_version: 1, status: 'open', open_cycle: cycle + 1, next_row: 1, closed_cycles: [...data.state.closed_cycles, cycle].sort((a, b) => a - b) };
  const reviews = [...data.reviews, review].sort((a, b) => a.cycle - b.cycle);
  const report = renderReport({ records: data.records, reviews, state: nextState });
  atomicWrites([
    { file: data.reviewsPath, content: jsonl(reviews) },
    { file: data.statePath, content: `${JSON.stringify(nextState, null, 2)}\n` },
    { file: data.reportPath, content: report },
  ]);
  console.log(`PASS — closed cycle ${cycle}, opened cycle ${cycle + 1}; first-try ${analysis.aggregate.retrieval['first-try'].count}/${analysis.aggregate.retrieval['first-try'].total}`);
}

function main() {
  const value = options(argv);
  if (command === 'import' || command === 'legacy-import') return importLegacy(value);
  if (command === 'start') return start(value);
  if (command === 'append') return append(value);
  if (command === 'validate') return validate(value);
  if (command === 'render') return render(value);
  if (command === 'analyze') return analyze(value);
  if (command === 'close-cycle') return closeCycle(value);
  fail('usage: node scripts/task-report.mjs <start|append|analyze|close-cycle|validate|render|import> [--field value ...]', 2);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) main();

export { append, analyze, closeCycle, importLegacy, parseLegacyRows, start, validate };
