#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONCEPT_MAP_MARKER,
  expectedConceptOutputs,
  loadConceptRegistry,
} from './lib/concept-kb.mjs';

function parseArgs(argv) {
  let check = false;
  let quiet = false;
  let kbRoot = 'KB';
  const mapPaths = [];
  const positionals = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--check') check = true;
    else if (argument === '--quiet') quiet = true;
    else if (argument === '--kb-root' || argument === '--map') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error(`${argument} needs a repository-relative path`);
      if (argument === '--kb-root') kbRoot = value;
      else mapPaths.push(value);
    } else if (argument.startsWith('--')) throw new Error(`unknown option ${argument}`);
    else positionals.push(argument);
  }
  if (positionals.length > 1) throw new Error('supply at most one repository root');
  return { root: resolve(positionals[0] || '.'), kbRoot, check, quiet, mapPaths };
}

function selectedMapFiles(root, kbRoot, mapPaths) {
  if (!mapPaths.length) return null;
  const mapRoot = resolve(root, kbRoot, 'docs/context/map/concept');
  const selected = new Set(mapPaths.map(path => resolve(root, path)));
  for (const path of selected) {
    if (!path.startsWith(mapRoot + sep) || !path.endsWith('.md'))
      throw new Error('--map must select a Markdown file under the active concept-map directory');
  }
  return selected;
}

export function buildConceptMaps({ root = '.', kbRoot = 'KB', check = false, mapPaths = [] } = {}) {
  const registry = loadConceptRegistry({ root, kbRoot });
  const expected = expectedConceptOutputs(registry);
  if (expected.errors.length) return { status: 'failed', registry: expected, stale: [], removed: [] };
  const selected = selectedMapFiles(root, kbRoot, mapPaths);
  const stale = [];
  for (const [file, body] of expected.outputs) {
    if (selected && !selected.has(file)) continue;
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current === body) continue;
    stale.push(relative(expected.root, file).replaceAll('\\', '/'));
    if (!check) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, body);
    }
  }
  const expectedFiles = new Set([...expected.outputs.keys()].filter(file => file.replaceAll('\\', '/').includes('/map/concept/')));
  const mapRoot = join(expected.kb_root, 'docs/context/map/concept');
  const removed = [];
  if (existsSync(mapRoot)) {
    for (const name of readdirSync(mapRoot).filter(name => name.endsWith('.md')).sort()) {
      const file = join(mapRoot, name);
      if (selected && !selected.has(file)) continue;
      if (expectedFiles.has(file)) continue;
      const body = readFileSync(file, 'utf8');
      if (!body.includes(CONCEPT_MAP_MARKER)) {
        expected.errors.push({ status: 'map-stale', message: `refusing to remove unmarked concept map ${relative(expected.root, file)}` });
        continue;
      }
      removed.push(relative(expected.root, file).replaceAll('\\', '/'));
      if (!check) unlinkSync(file);
    }
  }
  return {
    status: expected.errors.length ? 'failed' : check && (stale.length || removed.length) ? 'stale' : 'passed',
    registry: expected,
    stale,
    removed,
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
    const result = buildConceptMaps(options);
    if (result.registry.errors.length) {
      if (!options.quiet) result.registry.errors.forEach(error => console.error(`x ${error.status}: ${error.message}`));
      console.error(`FAIL — concept map blocked by ${result.registry.errors.length} registry/source error(s)`);
      process.exitCode = 1;
      return;
    }
    if (options.check && (result.stale.length || result.removed.length)) {
      if (!options.quiet) [...result.stale, ...result.removed].forEach(path => console.error(`x stale: ${path}`));
      console.error(`FAIL — ${result.stale.length + result.removed.length} concept output(s) are stale`);
      process.exitCode = 1;
      return;
    }
    const action = options.check ? 'match' : 'written';
    console.log(`PASS — ${result.registry.concepts.length} concepts; ${result.registry.outputs.size} generated outputs ${action}`);
  } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
