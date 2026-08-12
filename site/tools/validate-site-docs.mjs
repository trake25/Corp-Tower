#!/usr/bin/env node
// Validates site/docs -- the portfolio's knowledge base. Zero dependencies.
//   node tools/validate-site-docs.mjs           # full report
//   node tools/validate-site-docs.mjs --quiet   # errors only
//
// The game KB has its own validator (scripts/validate-docs.mjs) with its own
// budgets, areas and generated symbol maps. This one is deliberately separate
// and much smaller: 4 docs and ~25 first-party files do not need a generator,
// and one shared script serving two KBs would couple the site's cadence to the
// game's. What both enforce is the same idea -- a doc nobody can afford to load
// is not a knowledge base.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(SITE, 'docs');

const errors = [];
const warnings = [];
const tok = s => Math.round(Buffer.byteLength(s, 'utf8') / 4);

// Per-doc TOKEN budgets, set just above measured size so the next unjustified
// addition fails loudly. Raise one only when a doc is all current behaviour and
// live constraint and still does not fit -- and say why in the same change.
//
// Raised for the contact endpoint: the site gained a server route, and with it
// three secrets, three guardrails, a token-scope caveat and a second dev
// command. deploy.md carries almost all of that and was budgeted for a site
// with no server side at all; index.md gained two map rows and the one
// exception to the build-time rule, design.md the modal that is not a fifth
// disclosure level. None of it is narrative -- every line is a live constraint
// someone changing this code has to know.
const BUDGETS = {
  'index.md': 1950, 'design.md': 2050, 'content.md': 1950, 'deploy.md': 1900,
};
const DEFAULT_BUDGET = 1500;
const TOTAL_BUDGET = 7800;
const MAX_LINE_CHARS = 300;

// Constructions that turn a description of the system into a story about it.
const BANNED = /\b(used to|previously|originally|the first attempt|was later|since removed|then deleted|reverted|earlier version|in this pass|Rejected:)\b/i;
// Unresolved commitments that rot silently unless something surfaces them.
const STATUS = /\b(not yet verified|known bug|planned future|TODO|TBD|FIXME)\b/i;

// What the map in index.md has to account for. A row may name a file or a
// directory (trailing slash), so a collection of six cards is one row.
const COVER_DIRS = ['src', 'tools'];
const COVER_FILES = ['astro.config.mjs', 'wrangler.jsonc', 'package.json', 'maintenance/index.html'];
// env.d.ts is Astro's generated type reference; public/ is assets, not source.
const COVER_EXEMPT = [/^src\/env\.d\.ts$/];
const SKIP_DIR = /(^|\/)(node_modules|dist|\.astro|\.git)(\/|$)/;

// GitHub heading -> anchor slug (each whitespace char becomes one hyphen).
const slug = h =>
  h.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '')
    .trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');

if (!existsSync(DOCS)) {
  console.error(`no site/docs at ${DOCS}`);
  process.exit(1);
}

const files = readdirSync(DOCS).filter(f => f.endsWith('.md')).sort();
const text = new Map(files.map(f => [f, readFileSync(join(DOCS, f), 'utf8')]));

// --- budgets, line length, banned constructions, status markers --------------

let total = 0;
for (const f of files) {
  const body = text.get(f);
  const size = tok(body);
  total += size;
  const budget = BUDGETS[f] ?? DEFAULT_BUDGET;
  if (size > budget) errors.push(`budget: ${f} ~${size} tok > ${budget}`);

  body.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    if (line.length > MAX_LINE_CHARS) errors.push(`long line: ${f}:${n} is ${line.length} chars > ${MAX_LINE_CHARS}`);
    const banned = BANNED.exec(line);
    if (banned) errors.push(`banned phrase: ${f}:${n} "${banned[1]}"`);
    const status = STATUS.exec(line);
    if (status) warnings.push(`status marker: ${f}:${n} "${status[1]}"`);
  });
}
if (total > TOTAL_BUDGET) errors.push(`KB total ~${total} tok > ${TOTAL_BUDGET}`);

// --- internal links resolve, heading anchors included ------------------------

const headings = new Map(
  files.map(f => [f, new Set(
    text.get(f).split(/\r?\n/)
      .filter(l => /^#{1,6}\s/.test(l))
      .map(l => slug(l.replace(/^#{1,6}\s+/, '')))
  )])
);

let links = 0;
for (const f of files) {
  text.get(f).split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/\[[^\]]*\]\((\.\/[^)\s#]*\.md)?(#[^)\s]+)?\)/g)) {
      const [, file, hash] = m;
      if (!file && !hash) continue;
      links++;
      const target = file ? file.replace(/^\.\//, '') : f;
      if (!text.has(target)) {
        errors.push(`broken link: ${f}:${i + 1} -> ${target}`);
        continue;
      }
      if (hash && !headings.get(target).has(hash.slice(1))) {
        errors.push(`broken anchor: ${f}:${i + 1} -> ${target}${hash}`);
      }
    }
  });
}

// --- the map in index.md covers every first-party file, and only real ones ---

function walk(rel, out) {
  const abs = join(SITE, rel);
  if (!existsSync(abs)) return out;
  for (const e of readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = `${rel}/${e.name}`;
    if (SKIP_DIR.test(child)) continue;
    if (e.isDirectory()) walk(child, out);
    else out.push(child);
  }
  return out;
}

const firstParty = [
  ...COVER_DIRS.flatMap(d => walk(d, [])),
  ...COVER_FILES.filter(f => existsSync(join(SITE, f))),
].filter(f => !COVER_EXEMPT.some(re => re.test(f)));

const index = text.get('index.md') ?? '';
const mapRows = [];
let inMap = false;
index.split(/\r?\n/).forEach((line, i) => {
  if (/^##\s/.test(line)) inMap = /^##\s+File map\s*$/.test(line);
  if (!inMap) return;
  const row = /^\|\s*([^|]+?)\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
  if (!row || /^-+$/.test(row[1].replace(/[\s|:]/g, '-'))) return;
  for (const cell of row[1].split('·')) {
    const path = cell.trim().replace(/`/g, '');
    if (!path || path === 'Path') continue;
    mapRows.push({ path, line: i + 1, does: row[2] });
  }
});

if (mapRows.length === 0) errors.push('map: no "## File map" table found in index.md');

for (const { path, line, does } of mapRows) {
  if (!existsSync(join(SITE, path))) errors.push(`map: index.md:${line} row points at missing ${path}`);
  if (does.trim().length < 12) errors.push(`map: index.md:${line} row for ${path} has no usable Does`);
}

const covered = f => mapRows.some(({ path }) =>
  path === f || (path.endsWith('/') && f.startsWith(path)) || f.startsWith(`${path}/`));
for (const f of firstParty) {
  if (!covered(f)) errors.push(`map: ${f} is not in the index.md file map`);
}

// --- report ------------------------------------------------------------------

if (!QUIET) {
  console.log('=== site/docs validation ===');
  console.log(`docs: ${files.length}   prose: ~${total} / ${TOTAL_BUDGET} tok   links: ${links}   mapped: ${firstParty.length} files / ${mapRows.length} rows`);
  for (const f of files) console.log(`  ${f.padEnd(12)} ~${String(tok(text.get(f))).padStart(5)} / ${BUDGETS[f] ?? DEFAULT_BUDGET} tok`);
  for (const w of warnings) console.log(`  warn: ${w}`);
}

for (const e of errors) console.error(`error: ${e}`);
console.log(errors.length === 0 ? 'PASS' : `FAIL — ${errors.length} error(s)`);
process.exit(errors.length === 0 ? 0 : 1);
