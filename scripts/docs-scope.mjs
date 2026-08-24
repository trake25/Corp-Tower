#!/usr/bin/env node
// Scopes an update-docs run to ONE task. Zero dependencies (Node stdlib only).
//   node scripts/docs-scope.mjs <path> [<path>...]   # the task's files (required)
//   node scripts/docs-scope.mjs --range <sha>^..<sha> ...  # task already committed
//   node scripts/docs-scope.mjs --from-git           # fall back to the whole working tree
// The caller passes the paths it actually changed. Scoping from `git diff HEAD`
// instead would sweep in every other in-flight change in the tree -- concurrent
// agents, unrelated WIP -- and document work this task never did, so --from-git
// is opt-in and prints a warning rather than being the default.
// For each owning doc it also lists the sections that mention the changed files:
// those are the only places this diff can have falsified prose, so step 4 reads
// those ranges instead of the whole doc.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { execFileSync } from 'node:child_process';
import { routeSourcePath, mapOwnerForPath } from './lib/context-routing.mjs';

const argv = process.argv.slice(2);
const FROM_GIT = argv.includes('--from-git');
// Docs are often written after the task is committed, in which case there is no
// pending diff vs HEAD. --range takes any git range: `<sha>^..<sha>` is the diff
// that one commit introduced; the default `HEAD` is the pending working tree.
const rangeAt = argv.indexOf('--range');
const RANGE = rangeAt === -1 ? 'HEAD' : argv[rangeAt + 1];
if (rangeAt !== -1 && !RANGE) { console.error('--range needs a git range, e.g. --range HEAD~1..HEAD'); process.exit(2); }
const ROOT = resolve(process.env.DOCS_SCOPE_ROOT || '.');
const CTX = join(ROOT, 'docs/context');
const CLIENT = 'src/Client/App/corp-tower/';
const git = a => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Ignore map from docs/context/index.md, plus paths outside this KB's scope.
// site/ and site-root/ are separate Cloudflare Workers deploys. site/ has its own
// knowledge base at site/docs/; site-root/ has its own README.
const IGNORE = [
  /\.(uid|import|tres|ttf|fnt|png|svg|jpg|jpeg|ico|otf|wav|ogg|mp3)$/i,
  /(^|\/)\.godot\//, /(^|\/)addons\//, /(^|\/)node_modules\//,
  /(^|\/)package-lock\.json$/, /(^|\/)\.terraform\//, /\.tfstate/, /\.terraform\.lock\.hcl$/,
  /^plan\//, /^task\//, /^reference\//, /^docs\/context\//,
  /^src\/Client\/App\/corp-tower\/Cor\/Art\//,
  /^site\//, /^site-root\//, /^TOD/,
];

// --- collect the task's paths -------------------------------------------------
const given = argv.filter((a, i) => !a.startsWith('-') && !(rangeAt !== -1 && i === rangeAt + 1));
if (!given.length && !FROM_GIT) {
  console.error(`usage: node scripts/docs-scope.mjs <path> [<path>...]

Pass the paths this task changed -- the caller knows them; the working tree does
not (it also holds every other agent's in-flight work). Use --from-git only when
you are certain the whole tree belongs to this one task.`);
  process.exit(2);
}

const paths = new Set();
if (given.length) {
  for (const p of given) paths.add(p.replace(/^\.\//, ''));
} else {
  console.log('! --from-git: scoping to the ENTIRE working tree, including any');
  console.log('! concurrent work. Pass explicit paths unless the tree is all one task.\n');
  for (const line of git(['diff', '--name-only', '--ignore-all-space', RANGE]).split(/\r?\n/))
    if (line) paths.add(line);
  for (const line of git(['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/))
    if (line.startsWith('?? ')) paths.add(line.slice(3).replace(/^"|"$/g, ''));
}

const dropped = [];
const scoped = [];
for (const p of [...paths].sort()) {
  if (IGNORE.some(re => re.test(p))) { dropped.push(p); continue; }
  scoped.push(p);
}

if (!scoped.length) {
  console.log('no doc-relevant paths in scope — nothing to document.');
  if (dropped.length) console.log(`(${dropped.length} ignored by the ignore map)`);
  process.exit(0);
}

// Per-path churn. A tracked path with no diff vs RANGE is not "new" -- it is
// unchanged, which usually means the task was already committed (retry with
// --range <sha>^..<sha>) or the caller passed a path it did not actually touch.
const churn = {};
try {
  for (const line of git(['diff', '--numstat', '--ignore-all-space', RANGE, '--', ...scoped]).split(/\r?\n/)) {
    const [a, d, p] = line.split('\t');
    if (p) churn[p] = `+${a}/-${d}`;
  }
} catch { /* every path may be untracked */ }
const tracked = p => { try { git(['ls-files', '--error-unmatch', p]); return true; } catch { return false; } };
let stale = 0;
for (const p of scoped) {
  if (churn[p]) continue;
  if (!existsSync(join(ROOT, p))) churn[p] = 'deleted';
  else if (!tracked(p)) churn[p] = 'new';
  else { churn[p] = `no diff vs ${RANGE}`; stale++; }
}

// --- route --------------------------------------------------------------------
const byDoc = new Map();
const unmapped = [];
for (const path of scoped) {
  const r = routeSourcePath(path);
  if (!r) { unmapped.push(path); continue; }
  const { docs, read } = r;
  for (const doc of docs) {
    if (!byDoc.has(doc)) byDoc.set(doc, []);
    byDoc.get(doc).push({ path, read });
  }
}

// --- falsification targets ----------------------------------------------------
// A doc section can only have been falsified by this diff if it mentions one of
// the changed files. Find those sections so step 4 reads ranges, not whole docs.
const needles = p => [basename(p), p, p.startsWith(CLIENT) ? p.slice(CLIENT.length) : null].filter(Boolean);
function targets(doc, paths) {
  const file = join(CTX, doc);
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const heads = [];
  lines.forEach((l, i) => { const m = /^(#{1,4})\s+(.*)$/.exec(l); if (m) heads.push({ line: i + 1, text: m[2] }); });
  const all = [...new Set(paths.flatMap(needles))];
  const hit = new Map();
  lines.forEach((l, i) => {
    const found = all.filter(n => l.includes(n));
    if (!found.length) return;
    const h = [...heads].reverse().find(x => x.line <= i + 1) || { line: 1, text: '(top of file)' };
    const next = heads.find(x => x.line > h.line);
    const end = next ? next.line - 1 : lines.length;
    const key = h.line;
    if (!hit.has(key)) hit.set(key, { ...h, end, why: new Set() });
    found.forEach(n => hit.get(key).why.add(n));
  });
  return [...hit.values()].sort((a, b) => a.line - b.line);
}

// Section outline, so a new entry can be placed without opening the doc.
function outline(doc) {
  const file = join(CTX, doc);
  if (!existsSync(file)) return [];
  const out = [];
  readFileSync(file, 'utf8').split(/\r?\n/).forEach((l, i) => {
    const m = /^(#{2})\s+(.*)$/.exec(l);
    if (m) out.push(`${i + 1}  ${m[2]}`);
  });
  return out;
}

// --- report -------------------------------------------------------------------
const order = [...byDoc].sort((a, b) => b[1].length - a[1].length);
console.log(`=== update-docs scope: ${scoped.length} path(s) → ${byDoc.size} candidate doc(s) ===`);
for (const [doc, items] of order) {
  console.log(`\n${doc}`);
  for (const { path, read } of items)
    console.log(`   changed  ${churn[path].padEnd(10)} [${read}]  ${path}`);
  const t = targets(doc, items.map(i => i.path));
  if (t.length) {
    console.log(`   read only these ranges (the only prose this diff can falsify):`);
    for (const s of t)
      console.log(`     ${doc}:${s.line}-${s.end}  ${s.text}  ← mentions ${[...s.why].join(', ')}`);
  } else {
    console.log(`   no section mentions these files — a new entry, not a rewrite.`);
    console.log(`   sections (pick an insertion point; do not read the doc):`);
    outline(doc).forEach(s => console.log(`     ${doc}:${s}`));
  }
}
if (unmapped.length) {
  console.log(`\nUNMAPPED (${unmapped.length}) — route by hand, then add a shared rule:`);
  unmapped.forEach(p => console.log('  ? ' + p));
}
const maps = [...new Set(scoped.map(p => mapOwnerForPath(p)).filter(Boolean))].map(f => `map/${f}`);
if (maps.length) {
  console.log(`\nMAPS TO REGENERATE (line numbers moved): ${maps.join(', ')}`);
  console.log('  node scripts/build-file-map.mjs');
}
if (dropped.length) console.log(`\nignored (${dropped.length}): ${dropped.join(', ')}`);
if (stale) console.log(`\n! ${stale} path(s) have no diff vs ${RANGE}. If the task is already
! committed, re-run with --range <sha>^..<sha> naming the commit it landed in
! (find it with: git log --oneline -- <path>).`);
console.log('\nNext: apply the doc-worthy gate BEFORE opening any of these.');
