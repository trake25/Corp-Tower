#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.env.TASK_REPORT_ROOT || '.');
const FILE = resolve(ROOT, 'report/task-token-cost-effectivity.md');
const argv = process.argv.slice(2);
const command = argv.shift() || 'validate';
const body = readFileSync(FILE, 'utf8');
const sentinel = /<!-- next: row (\d+) -->/.exec(body);
const errors = [];

if (!sentinel) errors.push('missing next-row sentinel');
const next = Number(sentinel?.[1]);
if (next > 20) errors.push('an open cycle cannot advance beyond row 20');

function options(args) {
  const result = {};
  for (let index = 0; index < args.length; index++) {
    if (!args[index].startsWith('--')) continue;
    result[args[index].slice(2)] = args[index + 1];
    index++;
  }
  return result;
}

function validateFutureRows(markdown) {
  const cycleMatch = /## Cycle (\d+) \(open\)([\s\S]*?)<!-- next: row \d+ -->/.exec(markdown);
  const cycleNumber = Number(cycleMatch?.[1] || 0);
  const open = cycleMatch?.[2] || '';
  for (const line of open.split(/\r?\n/)) {
    const match = /^\|\s*(\d+)\s*\|/.exec(line);
    if (!match || (cycleNumber === 3 && Number(match[1]) < 20)) continue;
    const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
    if (cells.length !== 15) errors.push(`row ${match[1]} has ${cells.length} columns; expected 15`);
    if (/^(—|unrecorded|unknown|null)$/i.test(cells[6])) errors.push(`row ${match[1]} is missing its pre-read R-est`);
    if (/^GPT-5$/i.test(cells[12])) errors.push(`row ${match[1]} collapses a Codex model to GPT-5`);
  }
}

validateFutureRows(body);

if (command === 'validate') {
  if (errors.length) {
    errors.forEach(error => console.error(`error: ${error}`));
    process.exit(1);
  }
  console.log(`PASS — open cycle expects row ${next}`);
  process.exit(0);
}

if (command !== 'append') {
  console.error('usage: node scripts/task-report.mjs <validate|append> [--field value ...]');
  process.exit(2);
}
if (errors.length) {
  errors.forEach(error => console.error(`error: ${error}`));
  process.exit(1);
}

const value = options(argv);
const required = ['task', 'complexity', 'mode', 'domains', 'files', 'r-est', 'r-act', 'total', 'main', 'hit', 'verdict', 'model', 'effort', 'skills'];
for (const key of required) if (!value[key]) errors.push(`missing --${key}`);
if (/^(—|unrecorded|unknown|null)$/i.test(value['r-est'] || '')) errors.push('--r-est must be recorded before reads');
if (value.task?.length > 120) errors.push('--task must be at most 120 characters');
if (/^GPT-5$/i.test(value.model || '')) errors.push('--model must use the exact runtime id or say variant unrecorded');
if (next === 20) {
  if (!value.summary) errors.push('row 20 requires --summary to close the cycle');
  for (const word of ['improv', 'regress', 'flaw', 'recommend'])
    if (!value.summary?.toLowerCase().includes(word)) errors.push(`cycle summary must discuss ${word}... in plain English`);
}
if (errors.length) {
  errors.forEach(error => console.error(`error: ${error}`));
  process.exit(1);
}

const row = `| ${next} | ${value.task} | ${value.complexity} | ${value.mode} | ${value.domains} | ${value.files} | ${value['r-est']} | ${value['r-act']} | ${value.total} | ${value.main} | ${value.hit} | ${value.verdict} | ${value.model} | ${value.effort} | ${value.skills} |`;
let updated;
if (next < 20) {
  updated = body.replace(sentinel[0], `${row}\n<!-- next: row ${next + 1} -->`);
} else {
  const cycle = /## Cycle (\d+) \(open\)/.exec(body);
  const number = Number(cycle[1]);
  const closedBody = body.replace(cycle[0], `## Cycle ${number} (closed)\n\n${value.summary}`).replace(sentinel[0], row);
  const header = '| # | Task | Cx | Mode | Dom | F | R-est | R-act | Tot | Main | Hit | V | Model | Effort | Skills |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  updated = closedBody.replace(`## Cycle ${number} (closed)`, `## Cycle ${number + 1} (open)\n\n${header}\n<!-- next: row 1 -->\n\n## Cycle ${number} (closed)`);
}
writeFileSync(FILE, updated);
console.log(next === 20 ? `closed cycle and opened the next cycle` : `appended row ${next}`);
