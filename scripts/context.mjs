#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { AREA_ALIASES, routeSourcePath } from './lib/context-routing.mjs';

const ROOT = resolve(process.env.CONTEXT_ROOT || '.');
const DOC_ROOTS = [resolve(ROOT, 'docs/context'), resolve(ROOT, 'site/docs')];
const argv = process.argv.slice(2);
const command = argv.shift();

function fail(message, code = 2) {
  console.error(message);
  process.exit(code);
}

function safeDoc(input, mapOnly = false) {
  if (!input) fail('a document or map is required');
  const candidates = [];
  const clean = input.replace(/^\.\//, '');
  if (clean.includes('/')) candidates.push(resolve(ROOT, clean));
  else {
    const file = clean.endsWith('.md') ? clean : `${clean}.md`;
    candidates.push(resolve(ROOT, mapOnly ? `docs/context/map/${file}` : `docs/context/${file}`));
    if (!mapOnly) candidates.push(resolve(ROOT, `site/docs/${file}`));
  }
  const chosen = candidates.find(file => existsSync(file));
  if (!chosen || !DOC_ROOTS.some(root => chosen === root || chosen.startsWith(root + sep)))
    fail(`no routed document: ${input}`);
  if (mapOnly && !chosen.startsWith(resolve(ROOT, 'docs/context/map') + sep))
    fail(`not a generated map: ${input}`);
  return chosen;
}

function sections(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const heads = [];
  lines.forEach((line, index) => {
    const match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (match) heads.push({ level: match[1].length, heading: match[2], start: index + 1 });
  });
  return heads.map((head, index) => {
    const next = heads.slice(index + 1).find(item => item.level <= head.level);
    return { ...head, end: next ? next.start - 1 : lines.length };
  });
}

if (command === 'route') {
  const input = argv.join(' ').trim();
  if (!input) fail('usage: node scripts/context.mjs route <area-or-path>');
  const alias = AREA_ALIASES[input.toLowerCase()];
  const routed = alias || routeSourcePath(input);
  if (!routed) fail(`unmapped route: ${input}`, 1);
  const docs = alias ? alias.docs : routed.docs.map(doc => doc.startsWith('site/') ? doc : `docs/context/${doc}`);
  const maps = alias ? alias.maps : (routed.map ? [`docs/context/map/${routed.map}`] : []);
  console.log(`skill: ${routed.skill}`);
  console.log(`docs: ${docs.length ? docs.join(', ') : 'none'}`);
  console.log(`maps: ${maps.length ? maps.join(', ') : 'none'}`);
  if (routed.read) console.log(`source-read: ${routed.read}`);
} else if (command === 'outline') {
  const file = safeDoc(argv[0]);
  console.log(`# ${relative(ROOT, file)}`);
  for (const item of sections(file)) console.log(`${item.start}-${item.end}\t${'#'.repeat(item.level)} ${item.heading}`);
} else if (command === 'section') {
  const file = safeDoc(argv.shift());
  const query = argv.join(' ').trim().toLowerCase();
  if (!query) fail('usage: node scripts/context.mjs section <doc> <heading>');
  const matches = sections(file).filter(item => item.heading.toLowerCase() === query || item.heading.toLowerCase().includes(query));
  if (matches.length !== 1) fail(matches.length ? `heading is ambiguous (${matches.length} matches); use a longer query` : `heading not found: ${query}`, 1);
  const match = matches[0];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/).slice(match.start - 1, match.end);
  console.log(`<!-- ${relative(ROOT, file)}:${match.start}-${match.end} -->`);
  console.log(lines.join('\n'));
} else if (command === 'symbol') {
  const file = safeDoc(argv.shift(), true);
  const query = argv.join(' ').trim().toLowerCase();
  if (!query) fail('usage: node scripts/context.mjs symbol <map> <query>');
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /^\|\s*[^|]+:\d+\s*\|/.test(line) && line.toLowerCase().includes(query));
  if (!rows.length) fail(`no symbol rows match "${query}" in ${basename(file)}`, 1);
  rows.slice(0, 8).forEach(row => console.log(row));
  if (rows.length > 8) fail(`${rows.length} matches; showing 8. Refine the query before reading source.`, 1);
} else {
  fail('usage: node scripts/context.mjs <route|outline|section|symbol> ...');
}
