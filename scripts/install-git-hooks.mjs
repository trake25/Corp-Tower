#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const hooks = resolve(root, '.githooks');

if (!existsSync(resolve(hooks, 'pre-commit'))) {
  console.error('missing .githooks/pre-commit');
  process.exit(1);
}

execFileSync('git', ['-C', root, 'config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
console.log('enabled repository Git hooks from .githooks');
