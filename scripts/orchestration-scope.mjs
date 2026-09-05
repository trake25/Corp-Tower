#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimWorkerScope, releaseWorkerScope, orchestrationScopeStatus, finalizeOrchestrationScope,
} from './lib/orchestration-scope.mjs';

function main(argv) {
  const [action, ...args] = argv;
  const actions = { claim: claimWorkerScope, release: releaseWorkerScope, status: orchestrationScopeStatus, finalize: finalizeOrchestrationScope };
  if (!Object.hasOwn(actions, action)) throw new Error('usage: orchestration-scope <claim|release|status|finalize> --parent <manifest> ...');
  const options = { parent: { type: 'string' } };
  if (['claim', 'release'].includes(action)) options.worker = { type: 'string' };
  if (action === 'claim') options.path = { type: 'string', multiple: true };
  const { values, tokens } = parseArgs({ args, options, tokens: true, allowPositionals: false });
  for (const name of ['parent', 'worker']) {
    if (tokens.filter(token => token.kind === 'option' && token.name === name).length > 1)
      throw new Error(`--${name} may be supplied once`);
  }
  const result = actions[action]({ parent: values.parent, worker: values.worker, paths: values.path });
  console.log(JSON.stringify(result));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(process.argv.slice(2)); } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}
