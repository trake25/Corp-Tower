#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_RESULTS,
  contextBundle,
  documentOutline,
  documentSection,
  mapSymbols,
  routeContext,
  scopeContext,
  searchContext,
} from './lib/context-query.mjs';

const ROOT = resolve(process.env.CONTEXT_ROOT || '.');

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function parseArgs(args) {
  const positionals = [];
  const options = new Map();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      positionals.push(arg);
      continue;
    }
    const key = arg.slice(2);
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

function optionsList(options, key) {
  return options.get(key) || [];
}

function checkOptions(options, allowed) {
  for (const key of options.keys()) if (!allowed.includes(key)) fail(`unknown option --${key}`);
}

function searchOptions(options) {
  return {
    domains: optionsList(options, 'domain'),
    kinds: optionsList(options, 'kind'),
    pathPrefix: option(options, 'path-prefix'),
    require: option(options, 'require'),
    maxResults: option(options, 'max-results', String(DEFAULT_MAX_RESULTS)),
    maxBytes: option(options, 'max-bytes', String(DEFAULT_MAX_BYTES)),
  };
}

function json(options, value) {
  if (options.has('json')) {
    console.log(JSON.stringify(value, null, 2));
    return true;
  }
  return false;
}

function lines(value) {
  return value.lines ? `:${value.lines[0]}-${value.lines[1]}` : '';
}

function safeBundlePath(input) {
  const file = resolve(ROOT, input || 'task/context-bundle.md');
  const taskRoot = resolve(ROOT, 'task');
  if (!file.startsWith(taskRoot + sep) || !file.endsWith('.md')) fail('--output must be a Markdown file under ignored task/');
  return file;
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv.shift();
  const { positionals, options } = parseArgs(argv);
  try {
    if (command === 'route') {
      checkOptions(options, ['json']);
      const input = positionals.join(' ').trim();
      if (!input) fail('usage: node scripts/context.mjs route <area-or-path>');
      const result = routeContext(input);
      if (!json(options, { schema_version: 1, query: { kind: 'route', text: input }, result })) {
        console.log(`skill: ${result.skill}`);
        console.log(`docs: ${result.docs.length ? result.docs.join(', ') : 'none'}`);
        console.log(`maps: ${result.maps.length ? result.maps.join(', ') : 'none'}`);
        if (result.read) console.log(`source-read: ${result.read}`);
        if (result.workspace) {
          console.log(`workspace: ${result.workspace.name}`);
          console.log(`purpose: ${result.workspace.purpose}`);
          console.log(`policy: ${result.workspace.policy}`);
        }
      }
      return;
    }
    if (command === 'outline') {
      checkOptions(options, ['json']);
      const input = positionals[0];
      if (!input) fail('usage: node scripts/context.mjs outline <doc>');
      const result = documentOutline(ROOT, input);
      if (!json(options, { schema_version: 1, query: { kind: 'outline', document: input }, result })) {
        console.log(`# ${result.path}`);
        result.sections.forEach(section => console.log(`${section.start}-${section.end}\t${'#'.repeat(section.level)} ${section.heading}`));
      }
      return;
    }
    if (command === 'section') {
      checkOptions(options, ['json', 'max-bytes']);
      const input = positionals.shift();
      const heading = positionals.join(' ').trim();
      if (!input || !heading) fail('usage: node scripts/context.mjs section <doc> <heading>');
      const result = documentSection(ROOT, input, heading, Number(option(options, 'max-bytes', String(12 * 1024))));
      if (!json(options, { schema_version: 1, query: { kind: 'section', document: input, heading }, result })) {
        console.log(`<!-- ${result.path}:${result.lines[0]}-${result.lines[1]} -->`);
        console.log(result.text);
      }
      return;
    }
    if (command === 'symbol') {
      checkOptions(options, ['json', 'max-results']);
      const input = positionals.shift();
      const query = positionals.join(' ').trim();
      if (!input || !query) fail('usage: node scripts/context.mjs symbol <map> <query>');
      const result = mapSymbols(ROOT, input, query, Number(option(options, 'max-results', String(DEFAULT_MAX_RESULTS))));
      if (!json(options, { schema_version: 1, query: { kind: 'symbol', map: input, text: query }, result })) {
        result.rows.forEach(row => console.log(row.text));
        if (result.overflow) fail(`${result.total} matches; showing ${result.rows.length}. Refine the query before reading source.`, 1);
      }
      return;
    }
    if (command === 'search' || command === 'filter') {
      checkOptions(options, ['json', 'domain', 'kind', 'path-prefix', 'require', 'max-results', 'max-bytes']);
      const query = positionals.join(' ').trim();
      if (!query) fail(`usage: node scripts/context.mjs ${command} <query> [--domain <area>] [--kind <route|section|symbol>]`);
      if (command === 'filter' && !['domain', 'kind', 'path-prefix', 'require'].some(key => options.has(key)))
        fail('filter needs --domain, --kind, --path-prefix, or --require');
      const result = searchContext(ROOT, query, searchOptions(options));
      result.query.kind = command;
      if (!json(options, result)) {
        result.results.forEach(item => console.log(`${item.score}\t${item.kind}\t${item.path}${lines(item)}\t${item.title}\t${item.reason}`));
        result.warnings.forEach(warning => console.log(`! ${warning}`));
      }
      return;
    }
    if (command === 'scope') {
      checkOptions(options, ['json']);
      if (!positionals.length) fail('usage: node scripts/context.mjs scope <task-owned-path>...');
      const result = scopeContext(positionals);
      if (!json(options, result)) {
        console.log(`paths: ${result.changed_paths.join(', ')}`);
        console.log(`docs: ${result.docs.length ? result.docs.join(', ') : 'none'}`);
        console.log(`maps: ${result.maps.length ? result.maps.join(', ') : 'none'}`);
        console.log(`qa: ${result.qa.applies ? 'runtime QA applies' : 'no runtime QA applies'}`);
        if (result.unmapped.length) console.log(`unmapped: ${result.unmapped.join(', ')}`);
      }
      return;
    }
    if (command === 'bundle') {
      checkOptions(options, ['json', 'domain', 'kind', 'path-prefix', 'require', 'max-results', 'max-bytes', 'output']);
      const task = positionals.join(' ').trim();
      if (!task) fail('usage: node scripts/context.mjs bundle <task> [search filters] [--output task/file.md]');
      const result = contextBundle(ROOT, task, searchOptions(options));
      const output = safeBundlePath(option(options, 'output'));
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, result.bundle);
      const response = {
        schema_version: 1,
        bundle: output.slice(ROOT.length + 1).replaceAll('\\', '/'),
        results: result.results,
        limits: result.limits,
        warnings: result.warnings,
      };
      if (!json(options, response)) console.log(`Created: ${response.bundle} (${result.results.length} evidence item(s), ${result.limits.returned_bytes} retrieval bytes)`);
      return;
    }
    fail('usage: node scripts/context.mjs <route|outline|section|symbol|search|filter|scope|bundle> ...');
  } catch (error) {
    fail(error.message, 1);
  }
}

main();
