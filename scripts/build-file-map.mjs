#!/usr/bin/env node
// Generates docs/context/map/{backend,ui-tutorial,ui-debug,ui-hud,ui-screens,
// infra}.md -- one purpose row per file plus stable navigation anchors, so
// retrieval finds the owning file without narrating its implementation.
//   node scripts/build-file-map.mjs            # regenerate in place
//   node scripts/build-file-map.mjs --check    # exit 1 if the committed maps are stale
//   node scripts/build-file-map.mjs --quiet    # summary line only
//
// File purposes are carried forward under `path#@file`. Anchor names and line
// numbers are generated from source and carry no prose of their own.
//
// Area ownership comes from scripts/lib/context-routing.mjs, shared with docs
// scoping and agent-config validation so a route split cannot leave stale callers.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { basename, join, resolve, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MAP_AREAS, isNormalContextExcludedPath } from './lib/context-routing.mjs';

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
      if (IGNORE_PATH.some(re => re.test(rel)) || isNormalContextExcludedPath(rel)) continue;
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
    // @export var / @export_range(...) var -- the tuning surface and therefore
    // a retrieval target. Plain `var` and `@onready var` are skipped: node
    // plumbing, hundreds of them, nothing ever routes to one.
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

const GENERIC_ANCHORS = new Set(['main', 'run', 'start', 'stop', 'setup', 'reset', 'update', 'connect', 'close', 'load', 'save']);

function referencedOutside(rel, name, files) {
  if (!name || name.startsWith('_') || GENERIC_ANCHORS.has(name)) return false;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = name.startsWith('%') ? new RegExp(escaped) : new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`);
  return files.some(file => file.rel !== rel && pattern.test(file.text));
}

function intrinsicAnchor(rel, symbol) {
  if (symbol.kind === 'stable') return true;
  if (rel.endsWith('.tscn')) return symbol.kind === 'scene root';
  if (rel.endsWith('.tf')) return ['module', 'variable', 'output'].includes(symbol.kind);
  if (rel.endsWith('.yml') || rel.endsWith('.yaml')) return symbol.kind === 'job';
  if (rel.endsWith('.gd')) return ['class_name', 'signal'].includes(symbol.kind);
  return ['class', 'export'].includes(symbol.kind);
}

export function selectAnchors(rel, symbols, files) {
  return symbols.filter(symbol => intrinsicAnchor(rel, symbol) || referencedOutside(rel, symbol.name, files));
}

function fallbackPurpose(rel) {
  const stem = basename(rel).replace(/\.[^.]+$/, '').replaceAll(/[_-]+/g, ' ');
  if (/\/migrations\//.test(rel)) return `database migration for ${stem}`;
  if (/\/(?:tests?|Tests)\//.test(rel) || /\.test\./.test(rel)) return `permanent regression coverage for ${stem.replace(/\.test$/, '')}`;
  if (rel.endsWith('.tscn')) return `${stem} scene composition and controller bindings`;
  if (rel.endsWith('.tf')) return `Terraform ${stem} resources and interface`;
  if (/\.github\/actions\//.test(rel)) return `reusable GitHub action for ${rel.split('/').at(-2).replaceAll('-', ' ')}`;
  if (/\.github\/workflows\//.test(rel)) return `CI workflow for ${stem}`;
  if (rel.endsWith('.yml') || rel.endsWith('.yaml')) return `Kubernetes or workflow configuration for ${stem}`;
  if (rel.endsWith('.gd')) return `${stem} client behavior`;
  if (rel.endsWith('.sh')) return `${stem} operator script`;
  if (rel.endsWith('.mjs')) return `${stem} repository workflow`;
  if (rel.startsWith('src/Server/')) return `${stem} server behavior`;
  return `${stem} first-party source`;
}

function lowQualityPurpose(purpose) {
  return /(?: module| workflow| scene structure| infrastructure interface| host operation)$/.test(purpose)
    || ['setting flipped', 'hidden by default', 'synthetic roster', 'connection status text', 'this client player id', 'discard all pose state'].includes(purpose);
}

function filePurpose(rel, symbols, authored) {
  const carried = authored.does.get(`${rel}#@file`) || authored.blurb.get(rel);
  if (carried && !lowQualityPurpose(carried)) return carried;
  const boilerplate = new Set(['root of this reusable Godot scene', 'scene node exposed for name-based controller binding']);
  const preferredKinds = ['class', 'class_name', 'export', 'job', 'module', 'output', 'signal', 'fn', 'func', 'method'];
  for (const kind of preferredKinds) {
    for (const symbol of symbols.filter(item => item.kind === kind)) {
      const purpose = authored.does.get(`${rel}#${symbol.name}`);
      if (purpose && !boilerplate.has(purpose)) return purpose;
    }
  }
  return fallbackPurpose(rel);
}

// --- carry-forward ------------------------------------------------------------
// Parse an existing map so authored prose survives regeneration. Keyed on
// `path#symbol`, never on line number -- the line number is the thing that moves.
function readAuthored(file) {
  const does = new Map();
  const blurb = new Map();
  const pinned = new Set();
  if (!existsSync(file)) return { does, blurb, pinned };
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
      const parts = r[2].split('·');
      const name = parts[0].trim().replace(/`/g, '');
      const text = r[3].trim();
      if (text && text !== 'TODO') does.set(`${cur}#${name}`, text);
      if (parts[1]?.trim() === 'stable') pinned.add(`${cur}#${name}`);
    }
  }
  return { does, blurb, pinned };
}

// Same key space (`path#symbol`, and file-path for blurbs) across every map
// file, so authored prose survives an area being split or merged, not only a
// same-file regeneration: read every existing map file, not just the one an
// area is about to overwrite, and let later files win on a same-key collision
// (there shouldn't be one -- each source file is claimed by exactly one area).
function readAuthoredAll(mapDir) {
  const does = new Map();
  const blurb = new Map();
  const pinned = new Set();
  if (!existsSync(mapDir)) return { does, blurb, pinned };
  for (const f of readdirSync(mapDir).filter(f => f.endsWith('.md'))) {
    const one = readAuthored(join(mapDir, f));
    for (const [k, v] of one.does) does.set(k, v);
    for (const [k, v] of one.blurb) blurb.set(k, v);
    for (const key of one.pinned) pinned.add(key);
  }
  return { does, blurb, pinned };
}

export function applyPinnedAnchors(rel, text, symbols, pinned) {
  const result = [...symbols];
  for (const key of pinned) {
    const prefix = `${rel}#`;
    if (!key.startsWith(prefix)) continue;
    const name = key.slice(prefix.length);
    const existing = result.findIndex(symbol => symbol.name === name);
    if (existing >= 0) {
      result[existing] = { ...result[existing], kind: 'stable' };
      continue;
    }
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const line = text.split(/\r?\n/).findIndex(raw => new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`).test(raw));
    if (line >= 0) result.push({ ln: line + 1, name, kind: 'stable' });
  }
  return result;
}

function render(area, files, authored) {
  const L = [];
  L.push(`# Map — ${area.title}`);
  L.push('');
  L.push('GENERATED by `scripts/build-file-map.mjs` — do not hand-edit line numbers.');
  L.push('Each `@file` purpose is authored once and carried forward on regeneration.');
  L.push('');
  L.push('**Grep this file, do not load it.** One hit is self-sufficient — it carries');
  L.push('a file purpose or stable anchor and `path:line`, so it feeds straight into a');
  L.push('bounded source read. Local implementation detail stays in source.');
  L.push('');
  let rows = 0;
  for (const { rel, lines, syms, anchors } of files) {
    L.push(`### ${rel} — ${lines} ln`);
    L.push('');
    L.push('| File:Ln | Anchor | Purpose |');
    L.push('|---|---|---|');
    L.push(`| ${rel}:1 | @file · file | ${filePurpose(rel, syms, authored)} |`);
    rows++;
    for (const s of anchors) {
      rows++;
      const sym = s.kind === 'func' || s.kind === 'method' ? s.name : `${s.name} · ${s.kind}`;
      L.push(`| ${rel}:${s.ln} | ${sym} | |`);
    }
    L.push('');
  }
  L.push('---');
  L.push('');
  L.push(`${files.length} files · ${rows - files.length} stable anchors.`);
  L.push('');
  return { text: L.join('\n'), rows, anchors: rows - files.length };
}

function build(root) {
  const all = firstPartyFiles(root);
  const mapDir = join(root, 'docs/context/map');
  const authored = readAuthoredAll(mapDir);
  const sourceFiles = all.filter(file => !isExempt(file.rel)).map(file => {
    const text = readFileSync(join(root, file.rel), 'utf8');
    const extracted = extract(file.rel, text);
    return { ...file, text, ...extracted, syms: applyPinnedAnchors(file.rel, text, extracted.syms, authored.pinned) };
  });
  const filesWithAnchors = sourceFiles.map(file => ({
    ...file,
    anchors: selectAnchors(file.rel, file.syms, sourceFiles),
  }));
  const results = [];
  for (const area of AREAS) {
    const files = filesWithAnchors.filter(file => file.area === area.name);
    const out = join(mapDir, area.out);
    const { text, rows, anchors } = render(area, files, authored);
    results.push({ area, out, text, files: files.length, rows, anchors });
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
      console.log(`  ${r.area.out.padEnd(12)} ${String(r.files).padStart(3)} files  ${String(r.anchors).padStart(4)} anchors  ${Math.round(r.text.length / 4)} tok`);
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
