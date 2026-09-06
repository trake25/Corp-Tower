#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { archivePlan, planBindingFor } from './lib/plan-archive.mjs';

export function main(argv = process.argv.slice(2), { root = '.' } = {}) {
  const { values, tokens } = parseArgs({
    args: argv,
    options: { plan: { type: 'string' }, json: { type: 'boolean' } },
    tokens: true,
    allowPositionals: false,
  });
  if (tokens.filter(token => token.kind === 'option' && token.name === 'plan').length !== 1 || !values.plan)
    throw new Error('usage: plan-archive --plan <active-phase-2-plan.md> [--json]');
  const result = archivePlan(planBindingFor(values.plan, root), root);
  if (result.status !== 'archived') throw new Error(`plan archive failed: ${result.diagnostic || result.status}`);
  if (values.json) console.log(JSON.stringify(result));
  else console.log(`PASS — archived plan: ${result.archive_path}`);
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}
