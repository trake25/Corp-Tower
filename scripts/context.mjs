#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  DEFAULT_CONCEPT_BYTES,
  conceptBundle,
  conceptRead,
  conceptRoute,
  conceptTextLines,
  measuredText,
} from './lib/context-query.mjs';

const ROOT = resolve(process.env.CONTEXT_ROOT || '.');
const COMMANDS = Object.freeze(['concept-route', 'concept-read', 'concept-bundle']);

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function parseArgs(args) {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (!argument.startsWith('--')) {
      positionals.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (key === 'json') {
      options.set(key, ['true']);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) fail(`--${key} needs a value`);
    if (!options.has(key)) options.set(key, []);
    options.get(key).push(value);
    index++;
  }
  return { positionals, options };
}

function option(options, key, fallback = '') {
  const values = options.get(key) || [];
  if (values.length > 1) fail(`--${key} may be supplied once`);
  return values[0] || fallback;
}

function checkOptions(options, allowed) {
  for (const key of options.keys()) if (!allowed.includes(key)) fail(`unknown option --${key}`);
}

function printResult(options, result) {
  if (options.has('json')) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(measuredText(conceptTextLines(result)).output);
}

function safeBundlePath(input) {
  const file = resolve(ROOT, input || '.agent-state/automation/concept-bundle.md');
  const automationRoot = resolve(ROOT, '.agent-state/automation');
  if (!file.startsWith(automationRoot + sep) || !file.endsWith('.md'))
    fail('--output must be a Markdown file under ignored .agent-state/automation/');
  return file;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  if (!COMMANDS.includes(command))
    fail(`unsupported context command '${command || ''}'; available commands: ${COMMANDS.join(', ')}`);
  const { positionals, options } = parseArgs(argv);
  const input = positionals.join(' ').trim();
  if (!input) fail(`usage: node scripts/context.mjs ${command} <concept-id-or-exact-alias>`);
  try {
    if (command === 'concept-route' || command === 'concept-read') {
      checkOptions(options, ['json', 'max-bytes', 'kb-root']);
      const queryOptions = {
        kbRoot: option(options, 'kb-root', 'KB'),
        maxBytes: Number(option(options, 'max-bytes', String(DEFAULT_CONCEPT_BYTES))),
      };
      const result = command === 'concept-route'
        ? conceptRoute(ROOT, input, queryOptions)
        : conceptRead(ROOT, input, queryOptions);
      printResult(options, result);
      if (result.status !== 'matched') process.exitCode = 1;
      return;
    }

    checkOptions(options, ['json', 'max-bytes', 'kb-root', 'output']);
    const result = conceptBundle(ROOT, input, {
      kbRoot: option(options, 'kb-root', 'KB'),
      maxBytes: Number(option(options, 'max-bytes', String(DEFAULT_CONCEPT_BYTES))),
    });
    if (result.status !== 'matched') {
      printResult(options, result);
      process.exitCode = 1;
      return;
    }
    const output = safeBundlePath(option(options, 'output'));
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, result.bundle);
    const response = {
      ...result,
      bundle: output.slice(ROOT.length + 1).replaceAll('\\', '/'),
    };
    if (options.has('json')) console.log(JSON.stringify(response, null, 2));
    else process.stdout.write(measuredText([
      `Created: ${response.bundle} (${result.concept.id}, ${result.limits.returned_bytes} retrieval bytes)`,
      ...result.adjacent.map(adjacent => `adjacent: ${adjacent.id} (not loaded)`),
    ]).output);
  } catch (error) {
    fail(error.message, 1);
  }
}

main();
