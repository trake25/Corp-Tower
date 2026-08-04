#!/usr/bin/env node
// Scopes a /update-docs run: which changed paths are doc-relevant, and which doc owns
// each one. Zero dependencies (Node stdlib only).
//   node scripts/docs-scope.mjs [repoRoot]
// Replaces the manual `git diff --stat` + module-index.md lookup that step 1 of
// docs/context/doc-maintenance.md used to require, so routing costs no context.
// Emits a worklist grouped by owning doc, plus an UNMAPPED list -- a path in a new
// area is reported loudly rather than silently dropped.
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = resolve(process.argv.slice(2).find(a => !a.startsWith('-')) || '.');
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

// Ignore map from docs/context/index.md, plus paths outside this KB's scope.
// site/ and site-root/ are separate Cloudflare Workers deploys with their own READMEs.
const IGNORE = [
  /\.(uid|import|tres|ttf|fnt|png|svg|jpg|jpeg|ico|otf|wav|ogg|mp3)$/i,
  /(^|\/)\.godot\//, /(^|\/)addons\//, /(^|\/)node_modules\//,
  /(^|\/)package-lock\.json$/, /(^|\/)\.terraform\//, /\.tfstate/, /\.terraform\.lock\.hcl$/,
  /^plan\//, /^task\//, /^reference\//, /^docs\/context\//,
  /^src\/Client\/App\/corp-tower\/Cor\/Art\//,
  /^site\//, /^site-root\//,
  /^TOD/,
];

// First match wins. `read` is the strategy docs-maintenance step 3 applies to the diff:
//   full  -- read the file in full (it encodes numbers/contracts a hunk can hide)
//   wide  -- git diff -U10, escalate to a full read only if a hunk stays ambiguous
//   hunk  -- git diff -U2 is enough
const ROUTES = [
  [/^src\/Server\/app\/Game_Config\.js$/,            ['backend.md', 'gameplay.md'], 'full'],
  [/^src\/Server\/app\/engine\//,                    ['backend.md'],                'wide'],
  [/^src\/Server\/app\/Tower_Stability\.js$/,        ['backend.md'],                'wide'],
  [/^src\/Server\/app\/(Server|Redis_State)\.js$/,   ['networking.md', 'backend.md'], 'hunk'],
  [/^src\/Server\/tests\//,                          ['testing.md'],                'hunk'],
  [/^src\/Server\/tools\//,                          ['testing.md'],                'hunk'],
  [/^src\/Server\/Dockerfile$/,                      ['build.md'],                  'hunk'],
  [/^src\/Server\/package\.json$/,                   ['backend.md', 'build.md'],    'hunk'],
  [/^src\/Server\/app\//,                            ['backend.md'],                'hunk'],
  [/^src\/Client\/App\/corp-tower\/Sys\/NetMan\//,   ['networking.md'],             'hunk'],
  [/^src\/Client\/App\/corp-tower\/Tests\//,         ['testing.md'],                'hunk'],
  [/^src\/Client\/App\/corp-tower\/(Cor|Sys)\//,     ['ui.md'],                     'hunk'],
  [/^src\/Client\/App\/corp-tower\/project\.godot$/, ['ui.md', 'build.md'],         'hunk'],
  [/^src\/Client\/App\/corp-tower\//,                ['ui.md'],                     'hunk'],
  [/^\.github\/workflows\/(EKS|K3s|Backup|Server)/,  ['deployment.md'],             'hunk'],
  [/^\.github\/workflows\//,                         ['build.md'],                  'hunk'],
  [/^\.github\/actions\//,                           ['build.md'],                  'hunk'],
  [/^infra\//,                                       ['deployment.md'],             'hunk'],
  [/^docker\//,                                      ['build.md'],                  'hunk'],
  [/^scripts\/art-|^scripts\/ADDING-ART/,            ['build.md'],                  'hunk'],
  [/^scripts\/write-endpoint-config/,                ['networking.md', 'build.md'], 'hunk'],
  [/^scripts\/(validate-docs|docs-scope)\.mjs$/,     ['doc-maintenance.md'],        'hunk'],
  [/^scripts\//,                                     ['testing.md'],                'hunk'],
];

// Collect changed paths: tracked edits vs HEAD, plus untracked files (a new module is
// the most doc-worthy change there is, and --numstat alone never reports it).
// --numstat, not --stat: --stat elides long paths to `.../TowerStack.gd`.
const changed = new Map();
const add = (path, adds, dels, status) => {
  if (!path || IGNORE.some(re => re.test(path))) return;
  changed.set(path, { adds, dels, status });
};
for (const line of git(['diff', '--numstat', '--ignore-all-space', 'HEAD']).split(/\r?\n/)) {
  const [a, d, p] = line.split('\t');
  if (!p) continue;
  add(p, a === '-' ? 'bin' : Number(a), d === '-' ? 'bin' : Number(d), 'M');
}
for (const line of git(['status', '--porcelain', '--untracked-files=all']).split(/\r?\n/)) {
  if (!line.startsWith('?? ')) continue;
  const p = line.slice(3).replace(/^"|"$/g, '');
  let n = 0;
  try { n = git(['--no-pager', 'diff', '--no-index', '--numstat', '/dev/null', p]).split('\t')[0]; } catch (e) {
    n = (e.stdout || '').split('\t')[0]; // --no-index exits 1 when files differ, which is always here
  }
  add(p, Number(n) || 0, 0, 'new');
}

const route = p => ROUTES.find(([re]) => re.test(p));
const byDoc = new Map();
const unmapped = [];
for (const [path, meta] of [...changed].sort()) {
  const r = route(path);
  if (!r) { unmapped.push(path); continue; }
  const [, docs, read] = r;
  for (const doc of docs) {
    if (!byDoc.has(doc)) byDoc.set(doc, []);
    byDoc.get(doc).push({ path, ...meta, read });
  }
}

if (!changed.size) {
  console.log('no doc-relevant changes vs HEAD — nothing to scope.');
  process.exit(0);
}

// Primary doc = the one owning the most changed paths. Step 4 of doc-maintenance.md
// reads that one in full and the rest sectionally, so name it here rather than making
// the caller infer it.
const order = [...byDoc].sort((a, b) => b[1].length - a[1].length);
console.log(`=== /update-docs scope: ${changed.size} changed path(s) → ${byDoc.size} candidate doc(s) ===`);
for (const [doc, items] of order) {
  console.log(`\n${doc}  (${items.length})`);
  for (const { path, adds, dels, status, read } of items)
    console.log(`  ${status === 'new' ? '+new ' : '  M  '} +${adds}/-${dels}  [${read}]  ${path}`);
}
if (unmapped.length) {
  console.log(`\nUNMAPPED (${unmapped.length}) — route by hand, then add a rule to ROUTES:`);
  unmapped.forEach(p => console.log('  ? ' + p));
}
if (order.length) {
  console.log(`\nprimary doc (read in full): ${order[0][0]}`);
  if (order.length > 1) console.log(`secondary (read sectionally): ${order.slice(1).map(([d]) => d).join(', ')}`);
}
console.log('\nNext: apply the doc-worthy gate BEFORE opening any of these.');
