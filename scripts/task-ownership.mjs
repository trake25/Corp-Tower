#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  acquireTaskOwnership,
  amendTaskOwnership,
  releaseTaskOwnership,
  taskOwnershipStatus,
} from './lib/task-ownership.mjs';

function main(argv) {
  const [action, ...args] = argv;
  const handlers = {
    acquire: values => acquireTaskOwnership({
      task: values.task,
      paths: values.path,
      runId: values['run-id'] || null,
    }),
    amend: values => amendTaskOwnership({
      ownership: values.ownership,
      paths: values.path,
      reason: values.reason,
    }),
    release: values => releaseTaskOwnership({ ownership: values.ownership }),
    status: values => taskOwnershipStatus({ ownership: values.ownership }),
  };
  if (!Object.hasOwn(handlers, action))
    throw new Error('usage: task-ownership <acquire|amend|release|status> ...');
  const options = {
    ownership: { type: 'string' },
    path: { type: 'string', multiple: true },
    task: { type: 'string' },
    'run-id': { type: 'string' },
    reason: { type: 'string' },
  };
  const { values, tokens } = parseArgs({ args, options, tokens: true, allowPositionals: false });
  for (const name of ['ownership', 'task', 'run-id', 'reason']) {
    if (tokens.filter(token => token.kind === 'option' && token.name === name).length > 1)
      throw new Error(`--${name} may be supplied once`);
  }
  if (action === 'acquire') {
    if (!values.task || !values.path?.length || values.ownership || values.reason)
      throw new Error('acquire requires --task and one or more --path values');
  } else if (action === 'amend') {
    if (!values.ownership || !values.path?.length || !values.reason || values.task || values['run-id'])
      throw new Error('amend requires --ownership, one or more --path values, and --reason');
  } else if (!values.ownership || values.path?.length || values.task || values['run-id'] || values.reason) {
    throw new Error(`${action} requires only --ownership`);
  }
  console.log(JSON.stringify(handlers[action](values)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}
