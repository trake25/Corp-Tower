#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CONCEPT_MAP_MARKER,
  CONCEPT_MAX_LINE_CHARS,
  CONCEPT_PROSE_CAPACITY,
  CONCEPT_SECTION_HARD_BYTES,
  conceptProseCapacity,
  expectedConceptOutputs,
  loadConceptRegistry,
} from './lib/concept-kb.mjs';

function parseArgs(argv) {
  const quiet = argv.includes('--quiet');
  const kbAt = argv.indexOf('--kb-root');
  if (kbAt >= 0 && (!argv[kbAt + 1] || argv[kbAt + 1].startsWith('--')))
    throw new Error('--kb-root needs a repository-relative directory');
  const kbRoot = kbAt >= 0 ? argv[kbAt + 1] : 'KB';
  const positionals = argv.filter((value, index) => !value.startsWith('--') && index !== kbAt + 1);
  if (positionals.length > 1) throw new Error('supply at most one repository root');
  return { root: resolve(positionals[0] || '.'), kbRoot, quiet };
}

export function validateConceptKb({ root = '.', kbRoot = 'KB' } = {}) {
  const registry = loadConceptRegistry({ root, kbRoot });
  const expected = expectedConceptOutputs(registry);
  const errors = [...expected.errors];
  const warnings = [];
  for (const concept of expected.concepts) {
    const bytes = Buffer.byteLength(concept.section);
    const capacity = conceptProseCapacity(bytes);
    if (capacity.status === 'hard-overage')
      errors.push({
        status: 'budget-exceeded',
        message: `${concept.id} section is ~${capacity.estimated_tokens} tokens/${bytes} bytes; KB Tree hard ceiling is ${CONCEPT_PROSE_CAPACITY.hard_tokens} tokens/${CONCEPT_SECTION_HARD_BYTES} bytes`,
        concept_id: concept.id,
      });
    else if (capacity.status !== 'ordinary')
      warnings.push({
        status: capacity.status,
        message: `${concept.id} section is ~${capacity.estimated_tokens} tokens/${bytes} bytes; KB Tree ${capacity.status} capacity signal`,
        concept_id: concept.id,
      });
  }
  const proseRoot = join(expected.kb_root, 'docs/context');
  if (existsSync(proseRoot)) {
    const documents = readdirSync(proseRoot, { withFileTypes: true })
      .filter(entry => entry.isFile() && entry.name.endsWith('.md'))
      .map(entry => join(proseRoot, entry.name));
    const mapsRoot = join(proseRoot, 'map/concept');
    const maps = existsSync(mapsRoot) ? readdirSync(mapsRoot).filter(name => name.endsWith('.md')).map(name => join(mapsRoot, name)) : [];
    for (const file of [...documents, ...maps]) {
      readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (line.length > CONCEPT_MAX_LINE_CHARS)
          errors.push({ status: 'budget-exceeded', message: `${relative(expected.root, file)}:${index + 1} is ${line.length} chars > ${CONCEPT_MAX_LINE_CHARS}` });
      });
    }
  }
  for (const [file, body] of expected.outputs) {
    const path = relative(expected.root, file).replaceAll('\\', '/');
    if (!existsSync(file)) {
      errors.push({ status: 'map-stale', message: `generated output is missing: ${path}` });
      continue;
    }
    const current = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
    if (current !== body) errors.push({ status: 'map-stale', message: `generated output is stale: ${path}` });
  }
  const expectedMaps = new Set([...expected.outputs.keys()].filter(file => file.replaceAll('\\', '/').includes('/map/concept/')));
  const mapRoot = join(expected.kb_root, 'docs/context/map/concept');
  if (existsSync(mapRoot)) {
    for (const name of readdirSync(mapRoot).filter(name => name.endsWith('.md'))) {
      const file = join(mapRoot, name);
      if (!expectedMaps.has(file)) errors.push({ status: 'map-stale', message: `stale generated concept map: ${relative(expected.root, file)}` });
      else if (!readFileSync(file, 'utf8').includes(CONCEPT_MAP_MARKER))
        errors.push({ status: 'map-stale', message: `concept map lacks generated marker: ${relative(expected.root, file)}` });
    }
  }
  const mappedIds = new Set();
  for (const file of expectedMaps) {
    if (!existsSync(file)) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(/^##\s+([a-z0-9.-]+)\s*$/gm)) {
      if (mappedIds.has(match[1])) errors.push({ status: 'section-duplicate', message: `generated maps repeat concept '${match[1]}'` });
      mappedIds.add(match[1]);
    }
  }
  for (const concept of expected.concepts)
    if (!mappedIds.has(concept.id)) errors.push({ status: 'section-missing', message: `generated maps omit concept '${concept.id}'` });
  return { status: errors.length ? 'failed' : 'passed', concepts: expected.concepts.length, sources: expected.concepts.reduce((sum, concept) => sum + concept.sources.length, 0), errors, warnings };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = validateConceptKb(options);
    console.log(`=== KB Tree validation ===`);
    console.log(`concepts: ${result.concepts}  sources: ${result.sources}  warnings: ${result.warnings.length}  errors: ${result.errors.length}`);
    if (!options.quiet) result.errors.forEach(error => console.error(`x ${error.status}: ${error.message}`));
    if (!options.quiet) result.warnings.forEach(warning => console.warn(`! ${warning.status}: ${warning.message}`));
    else if (result.errors.length) console.error(`x ${result.errors[0].status}: ${result.errors[0].message}`);
    console.log(result.errors.length ? 'FAIL' : 'PASS');
    if (result.errors.length) process.exitCode = 1;
  } catch (error) {
    console.error(`FAIL — ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
