#!/usr/bin/env node
// Generates docs/context/map/{backend,ui-tutorial,ui-debug,ui-hud,ui-screens,
// infra}.md -- one row per symbol, so retrieval can land on a section of a
// 1,200-line file instead of the file. Zero dependencies (Node stdlib only).
//   node scripts/build-file-map.mjs            # regenerate in place
//   node scripts/build-file-map.mjs --check    # exit 1 if the committed maps are stale
//   node scripts/build-file-map.mjs --quiet    # summary line only
//
// The `Does` column is hand-authored ONCE and carried forward on every later
// regeneration, keyed to `path#symbol`. Line numbers are regenerated from source
// every run, so a comment strip or a refactor costs one command and zero
// re-authoring. New symbols land as TODO -- already a status marker the validator
// surfaces -- and deleted symbols drop out silently.
//
// Area ownership comes from scripts/lib/context-routing.mjs, shared with docs
// scoping and agent-config validation so a route split cannot leave stale callers.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAP_AREAS } from './lib/context-routing.mjs';

const CLIENT = 'src/Client/App/corp-tower';

// A file is claimed by the first shared area whose roots or explicit files
// contain it; narrow client areas therefore precede the screens fallback.
export const AREAS = MAP_AREAS;

// Never walked. Third-party, generated, binary, or deployed separately.
// scripts/aws is a gitignored, untracked local AWS CLI v2 bundle (see
// .gitignore) — never part of the committed tree, so it must not be scanned.
const IGNORE_DIR = /(^|[\\/])(addons|node_modules|\.godot|\.terraform|\.git|scripts[\\/]aws)([\\/]|$)/;
const IGNORE_PATH = [
  new RegExp(`^${CLIENT}/Cor/Art/`),
  /^site\//, /^site-root\//,
];

// Tests are routed by testing.md, not by symbol map: a test file's useful unit is
// the case name, which greps fine from source and rots faster than anything else
// in the tree. Exempting them keeps the coverage check honest instead of forcing
// a map section nobody routes through.
export const COVERAGE_EXEMPT = [
  /^src\/Server\/tests\//,
  new RegExp(`^${CLIENT}/Tests/`),
];

const norm = p => p.split(/[\\/]/).join('/');

function walk(dir, root, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (IGNORE_DIR.test(abs)) continue;
      walk(abs, root, out);
    } else if (e.isFile()) {
      out.push(norm(relative(root, abs)));
    }
  }
}

// Every first-party source file, tagged with the area that owns it. Ordered by
// area, then path, so generation is deterministic and --check is meaningful.
export function firstPartyFiles(root) {
  const claimed = new Set();
  const result = [];
  for (const area of AREAS) {
    const found = [];
    for (const r of area.roots || []) {
      const abs = join(root, r);
      if (!existsSync(abs)) continue;
      if (statSync(abs).isFile()) { found.push(norm(r)); continue; }
      walk(abs, root, found);
    }
    for (const f of area.files || []) {
      if (existsSync(join(root, f))) found.push(norm(f));
    }
    for (const rel of [...new Set(found)].sort()) {
      if (claimed.has(rel)) continue;
      if (!area.exts.some(x => rel.endsWith(x))) continue;
      if (IGNORE_PATH.some(re => re.test(rel))) continue;
      claimed.add(rel);
      result.push({ area: area.name, rel });
    }
  }
  return result;
}

export const isExempt = rel => COVERAGE_EXEMPT.some(re => re.test(rel));

// --- symbol extraction --------------------------------------------------------
// Deliberately shallow. A parser would be more correct and would also be a
// dependency, a build step, and a thing that breaks on GDScript. The map's job is
// to get a grep to the right ~40 lines; a missed edge case costs one extra Read,
// not a wrong answer.

const JS_KEYWORD = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'do', 'else',
  'try', 'finally', 'typeof', 'await', 'new', 'delete', 'throw', 'constructor',
]);

function symbolsJs(lines) {
  const out = [];
  lines.forEach((raw, i) => {
    const ln = i + 1;
    const line = raw.replace(/\/\/.*$/, '');
    let m;
    if ((m = /^(?:export\s+)?(?:default\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(line)))
      return out.push({ ln, name: m[1], kind: 'class' });
    if ((m = /^(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/.exec(line)))
      return out.push({ ln, name: m[1], kind: 'fn' });
    if ((m = /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/.exec(line)))
      return out.push({ ln, name: m[1], kind: 'export' });
    // A `const X = require('...')` binding is an import, not a symbol this file
    // defines. It can never answer "which file does X", which is the only question
    // the map exists for, so it is skipped rather than emitted as a TODO row that
    // someone has to read past. Every other top-level const is real.
    // The lookahead matters: this codebase wraps long imports onto the next line,
    // so `const X =` / `    require("...")` is the common shape, not the exception.
    if ((m = /^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/.exec(line))) {
      if (/\brequire\s*\(/.test(line + (lines[i + 1] || ''))) return;
      return out.push({ ln, name: m[1], kind: 'const' });
    }
    // Class-body member: indented, looks like a call signature, opens a block.
    if ((m = /^[ \t]{2,6}(?:static\s+)?(?:async\s+)?(?:\*\s*)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*\([^;]*\)\s*\{\s*$/.exec(raw))) {
      if (!JS_KEYWORD.has(m[1])) return out.push({ ln, name: m[1], kind: 'method' });
    }
  });
  return out;
}

function symbolsGd(lines) {
  const out = [];
  lines.forEach((raw, i) => {
    const ln = i + 1;
    let m;
    if ((m = /^class_name\s+([A-Za-z_]\w*)/.exec(raw))) return out.push({ ln, name: m[1], kind: 'class_name' });
    if ((m = /^signal\s+([A-Za-z_]\w*)/.exec(raw))) return out.push({ ln, name: m[1], kind: 'signal' });
    // `const X = preload(...)` is GDScript's import. Same reasoning as `require`
    // on the JS side: it names another file, it does not define anything here.
    if ((m = /^const\s+([A-Za-z_]\w*)/.exec(raw))) {
      if (/\b(?:pre)?load\s*\(/.test(raw + (lines[i + 1] || ''))) return;
      return out.push({ ln, name: m[1], kind: 'const' });
    }
    if ((m = /^static\s+var\s+([A-Za-z_]\w*)/.exec(raw))) return out.push({ ln, name: m[1], kind: 'static var' });
    // @export var / @export_range(...) var -- the tuning surface. P1 and P4 in
    // report/retrieval-probes.md both land on one of these, so they are not
    // optional. Plain `var` and `@onready var` are skipped: node plumbing,
    // hundreds of them, nothing ever routes to one.
    if ((m = /^@export(?:_\w+)?(?:\([^)]*\))?\s+var\s+([A-Za-z_]\w*)/.exec(raw)))
      return out.push({ ln, name: m[1], kind: 'export' });
    if ((m = /^(?:static\s+)?func\s+([A-Za-z_]\w*)/.exec(raw)))
      return out.push({ ln, name: m[1], kind: raw.startsWith('static') ? 'static func' : 'func' });
    // Inner-class methods, indented one level.
    if ((m = /^\t(?:static\s+)?func\s+([A-Za-z_]\w*)/.exec(raw)))
      return out.push({ ln, name: m[1], kind: 'func' });
  });
  return out;
}

function symbolsTf(lines) {
  const out = [];
  lines.forEach((raw, i) => {
    const m = /^(resource|module|variable|output|data|provider)\s+"([^"]+)"(?:\s+"([^"]+)")?/.exec(raw);
    if (m) out.push({ ln: i + 1, name: m[3] ? `${m[2]}.${m[3]}` : m[2], kind: m[1] });
  });
  return out;
}

function symbolsYml(lines) {
  const out = [];
  let inJobs = false;
  lines.forEach((raw, i) => {
    const ln = i + 1;
    let m;
    if ((m = /^([A-Za-z_][\w-]*):/.exec(raw))) {
      inJobs = m[1] === 'jobs';
      if (['jobs', 'on', 'runs', 'inputs', 'outputs'].includes(m[1])) out.push({ ln, name: m[1], kind: 'key' });
      return;
    }
    if (inJobs && (m = /^ {2}([A-Za-z_][\w-]*):/.exec(raw))) out.push({ ln, name: m[1], kind: 'job' });
  });
  return out;
}

function symbolsSh(lines) {
  const out = [];
  lines.forEach((raw, i) => {
    const m = /^(?:function\s+)?([A-Za-z_]\w*)\s*\(\)\s*\{/.exec(raw);
    if (m) out.push({ ln: i + 1, name: m[1], kind: 'fn' });
  });
  return out;
}

function symbolsTscn(lines) {
  const nodes = [];
  let current = null;

  lines.forEach((raw, i) => {
    const node = /^\[node\s+name="([^"]+)"/.exec(raw);
    if (node) {
      current = { ln: i + 1, name: node[1], unique: false };
      nodes.push(current);
      return;
    }

    if (current && /^unique_name_in_owner\s*=\s*true\s*$/.test(raw)) {
      current.unique = true;
    }
  });

  if (nodes.length === 0) return [];

  const out = [{ ln: nodes[0].ln, name: nodes[0].name, kind: 'scene root' }];
  nodes.forEach(node => {
    if (node.unique) out.push({ ln: node.ln, name: `%${node.name}`, kind: 'unique node' });
  });
  return out;
}

export function extract(rel, text) {
  const lines = text.split(/\r?\n/);
  let syms;
  if (rel.endsWith('.tscn')) syms = symbolsTscn(lines);
  else if (rel.endsWith('.gd')) syms = symbolsGd(lines);
  else if (rel.endsWith('.tf')) syms = symbolsTf(lines);
  else if (rel.endsWith('.yml') || rel.endsWith('.yaml')) syms = symbolsYml(lines);
  else if (rel.endsWith('.sh')) syms = symbolsSh(lines);
  else syms = symbolsJs(lines);
  // Same name twice in one file (an overload-ish pattern, or a job and a key):
  // keep both, the line number disambiguates.
  return { lines: lines.length, syms };
}

// --- carry-forward ------------------------------------------------------------
// Parse an existing map so authored prose survives regeneration. Keyed on
// `path#symbol`, never on line number -- the line number is the thing that moves.
function readAuthored(file) {
  const does = new Map();
  const blurb = new Map();
  if (!existsSync(file)) return { does, blurb };
  let cur = null;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const h = /^###\s+(\S+)\s+—\s+\d+\s+ln(?:\s+—\s+(.*))?\s*$/.exec(line);
    if (h) { cur = h[1].replace(/`/g, ''); if (h[2]?.trim()) blurb.set(cur, h[2].trim()); continue; }
    // The first cell was a bare line number before rows carried their own path and
    // is `path:line` after. Both are accepted, and must stay that way: the key is
    // `path#symbol` from the heading, so every authored row survives the format
    // change untouched. Matching on a trailing number also skips the header and
    // separator rows without needing to know what they say.
    const r = /^\|\s*([^|]*?)\s*\|\s*([^|]+?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (r && cur && /(?:^|:)\d+$/.test(r[1])) {
      const name = r[2].split('·')[0].trim().replace(/`/g, '');
      const text = r[3].trim();
      if (text && text !== 'TODO') does.set(`${cur}#${name}`, text);
    }
  }
  return { does, blurb };
}

// Same key space (`path#symbol`, and file-path for blurbs) across every map
// file, so authored prose survives an area being split or merged, not only a
// same-file regeneration: read every existing map file, not just the one an
// area is about to overwrite, and let later files win on a same-key collision
// (there shouldn't be one -- each source file is claimed by exactly one area).
function readAuthoredAll(mapDir) {
  const does = new Map();
  const blurb = new Map();
  if (!existsSync(mapDir)) return { does, blurb };
  for (const f of readdirSync(mapDir).filter(f => f.endsWith('.md'))) {
    const one = readAuthored(join(mapDir, f));
    for (const [k, v] of one.does) does.set(k, v);
    for (const [k, v] of one.blurb) blurb.set(k, v);
  }
  return { does, blurb };
}

function render(area, files, authored) {
  const L = [];
  L.push(`# Map — ${area.title}`);
  L.push('');
  L.push('GENERATED by `scripts/build-file-map.mjs` — do not hand-edit line numbers.');
  L.push('The `Does` column IS hand-authored and is carried forward on regeneration.');
  L.push('');
  L.push('**Grep this file, do not load it.** One hit is self-sufficient — it carries');
  L.push('`path:line` and purpose, so it feeds straight into a `Read` with no second');
  L.push('lookup. Loading the whole map costs thousands and gives you the same one row.');
  L.push('');
  let rows = 0, todo = 0;
  for (const { rel, lines, syms } of files) {
    const b = authored.blurb.get(rel);
    L.push(`### ${rel} — ${lines} ln${b ? ` — ${b}` : ''}`);
    L.push('');
    if (!syms.length) {
      L.push('_no extracted symbols_');
      L.push('');
      continue;
    }
    L.push('| File:Ln | Symbol | Does |');
    L.push('|---|---|---|');
    for (const s of syms) {
      const key = `${rel}#${s.name}`;
      const scenePurpose = s.kind === 'scene root'
        ? 'root of this reusable Godot scene'
        : s.kind === 'unique node'
          ? 'scene node exposed for name-based controller binding'
          : null;
      const d = authored.does.get(key) || scenePurpose || 'TODO';
      if (d === 'TODO') todo++;
      rows++;
      const sym = s.kind === 'func' || s.kind === 'method' ? s.name : `${s.name} · ${s.kind}`;
      L.push(`| ${rel}:${s.ln} | ${sym} | ${d} |`);
    }
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push(`${files.length} files · ${rows} symbols · ${todo} awaiting a \`Does\` line.`);
  L.push('');
  return { text: L.join('\n'), rows, todo };
}

function build(root) {
  const all = firstPartyFiles(root);
  const mapDir = join(root, 'docs/context/map');
  const authored = readAuthoredAll(mapDir);
  const results = [];
  for (const area of AREAS) {
    const mine = all.filter(f => f.area === area.name && !isExempt(f.rel));
    const files = mine.map(({ rel }) => {
      const text = readFileSync(join(root, rel), 'utf8');
      return { rel, ...extract(rel, text) };
    });
    const out = join(mapDir, area.out);
    const { text, rows, todo } = render(area, files, authored);
    results.push({ area, out, text, files: files.length, rows, todo });
  }
  return { results, mapDir };
}

function main() {
  const argv = process.argv.slice(2);
  const CHECK = argv.includes('--check');
  const QUIET = argv.includes('--quiet');
  const root = resolve(argv.find(a => !a.startsWith('-')) || '.');

  const { results, mapDir } = build(root);
  if (!CHECK) mkdirSync(mapDir, { recursive: true });

  const stale = [];
  for (const r of results) {
    const existing = existsSync(r.out) ? readFileSync(r.out, 'utf8').replace(/\r\n/g, '\n') : null;
    if (existing === r.text) continue;
    if (CHECK) stale.push(r.out);
    else writeFileSync(r.out, r.text, 'utf8');
  }

  if (!QUIET) {
    console.log('=== file map ===');
    for (const r of results)
      console.log(`  ${r.area.out.padEnd(12)} ${String(r.files).padStart(3)} files  ${String(r.rows).padStart(4)} symbols  ${String(r.todo).padStart(4)} TODO  ${Math.round(r.text.length / 4)} tok`);
  }
  if (CHECK && stale.length) {
    console.log(`\nSTALE (${stale.length}) — run: node scripts/build-file-map.mjs`);
    stale.forEach(s => console.log('  x ' + relative(root, s).split(/[\\/]/).join('/')));
    console.log('\nFAIL');
    process.exit(1);
  }
  console.log(CHECK ? '\nPASS (maps match source)' : '\nwritten');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
