#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicQaReceiptPath, writePublicQaReceipt } from './lib/qa-receipt.mjs';
import { repositoryRelativePath } from './lib/task-ownership.mjs';

const CLASSIFICATIONS = new Set([
  'test-expectation',
  'tooling-environment',
  'validator-maintenance',
  'retrieval-map-maintenance',
  'qa-infrastructure',
  'architecture-decomposition',
]);

function requiredText(value, label, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maximum || /[\x00-\x1f\x7f]/.test(value))
    throw new Error(`${label} must be 1-${maximum} printable characters`);
  return value.trim().replace(/\s+/g, ' ');
}

function structuredSteps(value, verification) {
  if (!Array.isArray(value) || value.length > 32) throw new Error('verification evidence must be an array with at most 32 entries');
  const steps = value.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw new Error(`verification evidence ${index} must be an object`);
    const allowed = new Set(['name', 'status', 'summary', 'classification']);
    const unknown = Object.keys(entry).filter(key => !allowed.has(key));
    if (unknown.length) throw new Error(`verification evidence ${index} contains unsupported fields: ${unknown.join(', ')}`);
    const status = entry.status === 'passed' ? 0 : entry.status === 'maintenance-blocked' ? 1 : null;
    if (status === null) throw new Error(`verification evidence ${index} status must be passed or maintenance-blocked`);
    const classification = status === 0 ? null : entry.classification;
    if (status !== 0 && !CLASSIFICATIONS.has(classification))
      throw new Error(`verification evidence ${index} needs a maintenance classification`);
    if (status === 0 && entry.classification !== undefined)
      throw new Error(`passed verification evidence ${index} cannot have a classification`);
    return {
      name: requiredText(entry.name, `verification evidence ${index} name`, 120),
      status,
      summary: requiredText(entry.summary, `verification evidence ${index} summary`, 280),
      classification,
    };
  });
  if (verification === 'passed' && steps.some(step => step.status !== 0))
    throw new Error('passed receipt cannot contain maintenance-blocked evidence');
  if (verification === 'maintenance-blocked' && !steps.some(step => step.status !== 0))
    throw new Error('maintenance-blocked receipt requires maintenance-blocked evidence');
  return steps;
}

export function writeStandaloneTaskReceipt({
  root = '.',
  task,
  identity,
  scopePaths,
  verificationStatus,
  evidence,
  qa = { executable_status: 'skipped-by-process-control' },
  coverage = { status: 'none' },
}) {
  const label = requiredText(task, 'task', 120);
  if (!['passed', 'maintenance-blocked'].includes(verificationStatus))
    throw new Error('verification must be passed or maintenance-blocked');
  const changedPaths = [...new Set((scopePaths || []).map(path => repositoryRelativePath(root, path, 'receipt scope')))].sort();
  if (!changedPaths.length) throw new Error('one or more explicit receipt scope paths are required');
  const steps = structuredSteps(evidence, verificationStatus);
  const receiptPath = publicQaReceiptPath(identity);
  const path = writePublicQaReceipt(root, {
    identity,
    task: label,
    verificationStatus,
    lifecycle: { status: 'closed' },
    plan: { status: 'not-applicable', source_path: null, archive_path: null },
    changedPaths,
    publishPaths: [...new Set([...changedPaths, receiptPath])].sort(),
    steps,
    coverage,
    qa,
    maintenanceItems: [],
  });
  return { receipt: path, task: label, scope_paths: changedPaths, verification: verificationStatus };
}

export function main(argv = process.argv.slice(2), { root = '.' } = {}) {
  const { values, tokens } = parseArgs({
    args: argv,
    options: {
      task: { type: 'string' },
      identity: { type: 'string' },
      path: { type: 'string', multiple: true },
      verification: { type: 'string' },
      evidence: { type: 'string' },
      qa: { type: 'string' },
      json: { type: 'boolean' },
    },
    tokens: true,
    allowPositionals: false,
  });
  for (const name of ['task', 'identity', 'verification', 'evidence', 'qa']) {
    if (tokens.filter(token => token.kind === 'option' && token.name === name).length !== 1 && name !== 'qa')
      throw new Error(`--${name} is required once`);
    if (tokens.filter(token => token.kind === 'option' && token.name === name).length > 1)
      throw new Error(`--${name} may be supplied once`);
  }
  if (!values.path?.length) throw new Error('one or more --path values are required');
  let identity;
  let evidence;
  try {
    identity = JSON.parse(values.identity);
    evidence = JSON.parse(values.evidence);
  } catch {
    throw new Error('--identity and --evidence must be valid JSON');
  }
  const qa = values.qa === undefined
    ? { executable_status: 'skipped-by-process-control' }
    : values.qa === 'executed'
      ? { executable_status: 'passed' }
      : values.qa === 'skipped'
        ? { executable_status: 'skipped-by-process-control' }
        : (() => { throw new Error('--qa must be executed or skipped'); })();
  const result = writeStandaloneTaskReceipt({
    root,
    task: values.task,
    identity,
    scopePaths: values.path,
    verificationStatus: values.verification,
    evidence,
    qa,
  });
  if (values.json) console.log(JSON.stringify(result));
  else console.log(`PASS — public receipt: ${result.receipt}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}
