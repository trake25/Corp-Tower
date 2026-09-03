#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import {
  DEFAULT_BUNDLE_BYTES,
  DEFAULT_CONCEPT_BYTES,
  DEFAULT_MAX_RESULTS,
  DEFAULT_SECTION_BYTES,
  conceptBundle,
  conceptRead,
  conceptRoute,
  conceptTextLines,
  contextBundle,
  documentOutline,
  documentSection,
  mapSymbols,
  measuredText,
  routeContext,
  routeTextLines,
  scopeContext,
  scopeTextLines,
  searchContext,
  searchTextLines,
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
    if (['anchor', 'include-excerpt', 'json'].includes(key)) {
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
    maxResults: option(options, 'max-results') || undefined,
    maxBytes: option(options, 'max-bytes') || undefined,
    anchor: options.has('anchor'),
    includeExcerpt: options.has('include-excerpt'),
  };
}

function json(options, value) {
  if (options.has('json')) {
    console.log(JSON.stringify(value, null, 2));
    return true;
  }
  return false;
}

function envelope(query, result) {
  const value = { schema_version: 2, query, result, limits: { returned_bytes: 0 } };
  let bytes = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    value.limits.returned_bytes = bytes;
    const next = Buffer.byteLength(JSON.stringify(value, null, 2)) + 1;
    if (next === bytes) break;
    bytes = next;
  }
  value.limits.returned_bytes = bytes;
  return value;
}

function printLines(lines) {
  process.stdout.write(measuredText(lines).output);
}

function lines(value) {
  return value.lines ? `:${value.lines[0]}-${value.lines[1]}` : '';
}

function safeBundlePath(input, fallback = '.agent-state/automation/context-bundle.md') {
  const file = resolve(ROOT, input || fallback);
  const automationRoot = resolve(ROOT, '.agent-state/automation');
  if (!file.startsWith(automationRoot + sep) || !file.endsWith('.md')) fail('--output must be a Markdown file under ignored .agent-state/automation/');
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
      if (!json(options, envelope({ kind: 'route', text: input }, result))) {
        printLines(routeTextLines(result));
      }
      return;
    }
    if (command === 'outline') {
      checkOptions(options, ['json']);
      const input = positionals[0];
      if (!input) fail('usage: node scripts/context.mjs outline <doc>');
      const result = documentOutline(ROOT, input);
      if (!json(options, envelope({ kind: 'outline', document: input }, result))) {
        printLines([`# ${result.path}`, ...result.sections.map(section => `${section.start}-${section.end}\t${'#'.repeat(section.level)} ${section.heading}`)]);
      }
      return;
    }
    if (command === 'section') {
      checkOptions(options, ['json', 'max-bytes']);
      const input = positionals.shift();
      const heading = positionals.join(' ').trim();
      if (!input || !heading) fail('usage: node scripts/context.mjs section <doc> <heading>');
      const result = documentSection(ROOT, input, heading, Number(option(options, 'max-bytes', String(DEFAULT_SECTION_BYTES))));
      if (!json(options, envelope({ kind: 'section', document: input, heading }, result))) {
        printLines([`<!-- ${result.path}:${result.lines[0]}-${result.lines[1]} -->`, result.text]);
      }
      return;
    }
    if (command === 'symbol') {
      checkOptions(options, ['json', 'max-results']);
      const input = positionals.shift();
      const query = positionals.join(' ').trim();
      if (!input || !query) fail('usage: node scripts/context.mjs symbol <map> <query>');
      const result = mapSymbols(ROOT, input, query, Number(option(options, 'max-results', String(DEFAULT_MAX_RESULTS))));
      if (!json(options, envelope({ kind: 'symbol', map: input, text: query }, result))) {
        printLines(result.rows.map(row => row.text));
        if (result.overflow) fail(`${result.total} matches; showing ${result.rows.length}. Refine the query before reading source.`, 1);
      }
      return;
    }
    if (command === 'search' || command === 'filter') {
      checkOptions(options, ['json', 'anchor', 'include-excerpt', 'domain', 'kind', 'path-prefix', 'require', 'max-results', 'max-bytes']);
      const query = positionals.join(' ').trim();
      if (!query) fail(`usage: node scripts/context.mjs ${command} <query> [--domain <area>] [--kind <route|section|symbol>]`);
      if (command === 'filter' && !['domain', 'kind', 'path-prefix', 'require'].some(key => options.has(key)))
        fail('filter needs --domain, --kind, --path-prefix, or --require');
      const result = searchContext(ROOT, query, searchOptions(options));
      result.query.kind = command;
      if (!json(options, result)) {
        printLines(searchTextLines(result));
      }
      if (result.status === 'tool-error') process.exitCode = 1;
      return;
    }
    if (command === 'scope') {
      checkOptions(options, ['json']);
      if (!positionals.length) fail('usage: node scripts/context.mjs scope <task-owned-path>...');
      const result = scopeContext(positionals);
      if (!json(options, envelope({ kind: 'scope', paths: positionals }, result))) {
        printLines(scopeTextLines(result));
      }
      return;
    }
    if (command === 'concept-route' || command === 'concept-read') {
      checkOptions(options, ['json', 'max-bytes', 'kb-root']);
      const input = positionals.join(' ').trim();
      if (!input) fail(`usage: node scripts/context.mjs ${command} <concept-id-or-exact-alias> [--kb-root KB]`);
      const conceptOptions = {
        kbRoot: option(options, 'kb-root', 'KB'),
        maxBytes: Number(option(options, 'max-bytes', String(DEFAULT_CONCEPT_BYTES))),
      };
      const result = command === 'concept-route' ? conceptRoute(ROOT, input, conceptOptions) : conceptRead(ROOT, input, conceptOptions);
      if (!json(options, result)) printLines(conceptTextLines(result));
      if (result.status !== 'matched') process.exitCode = 1;
      return;
    }
    if (command === 'concept-bundle') {
      checkOptions(options, ['json', 'max-bytes', 'kb-root', 'output']);
      const input = positionals.join(' ').trim();
      if (!input) fail('usage: node scripts/context.mjs concept-bundle <concept-id-or-exact-alias> [--output .agent-state/automation/file.md]');
      const result = conceptBundle(ROOT, input, {
        kbRoot: option(options, 'kb-root', 'KB'),
        maxBytes: Number(option(options, 'max-bytes', String(DEFAULT_CONCEPT_BYTES))),
      });
      if (result.status !== 'matched') {
        if (!json(options, result)) printLines(conceptTextLines(result));
        process.exitCode = 1;
        return;
      }
      const output = safeBundlePath(option(options, 'output'), '.agent-state/automation/concept-bundle.md');
      mkdirSync(dirname(output), { recursive: true });
      writeFileSync(output, result.bundle);
      const response = {
        ...result,
        bundle: output.slice(ROOT.length + 1).replaceAll('\\', '/'),
      };
      if (!json(options, response)) printLines([
        `Created: ${response.bundle} (${result.concept.id}, ${result.limits.returned_bytes} retrieval bytes)`,
        ...result.adjacent.map(adjacent => `adjacent: ${adjacent.id} (not loaded)`),
      ]);
      return;
    }
    if (command === 'bundle') {
      checkOptions(options, ['json', 'domain', 'kind', 'path-prefix', 'require', 'max-results', 'max-bytes', 'output']);
      const task = positionals.join(' ').trim();
      if (!task) fail('usage: node scripts/context.mjs bundle <task> [search filters] [--output .agent-state/automation/file.md]');
      const bundleOptions = searchOptions(options);
      if (!bundleOptions.maxBytes) bundleOptions.maxBytes = DEFAULT_BUNDLE_BYTES;
      const result = contextBundle(ROOT, task, bundleOptions);
      if (result.status !== 'matched') {
        if (!json(options, result)) printLines(searchTextLines(result));
        process.exitCode = 1;
        return;
      }
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
      if (!json(options, envelope({ kind: 'bundle', task }, response))) printLines([`Created: ${response.bundle} (${result.results.length} evidence item(s), ${result.limits.returned_bytes} retrieval bytes)`]);
      return;
    }
    fail('usage: node scripts/context.mjs <route|outline|section|symbol|search|filter|scope|bundle|concept-route|concept-read|concept-bundle> ...');
  } catch (error) {
    fail(error.message, 1);
  }
}

main();
