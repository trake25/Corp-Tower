#!/usr/bin/env node
// Validates the docs/context knowledge base. Zero dependencies (Node stdlib only).
//   node scripts/validate-docs.mjs [repoRoot] [--quiet]
// --quiet suppresses the per-doc table and status-marker list on a passing run (the
//   /update-docs receipt only needs pass/fail); a failing run always prints in full.
// HARD errors (exit 1): broken relative doc links, dead #anchors, plus over-budget
//   and banned-phrase violations in docs that GREW in the working tree. Growth is
//   blocked; compaction never is, so a doc already over budget can always be fixed.
// Soft warnings (exit 0): the same violations in docs that shrank or weren't touched,
//   orphan docs, module-index paths missing on disk, stack/dependency drift.
// Also prints metrics (lines vs budget, status markers) for token budgeting.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const ROOT = resolve(argv.find(a => !a.startsWith('-')) || '.');
const CTX = join(ROOT, 'docs/context');
const CLIENT = 'src/Client/App/corp-tower';
const errors = [];
const warnings = [];

// Per-doc line budgets. Exceeding one is a split-or-compact signal, not a style nit:
// the KB's whole value is being loadable in full for a task without crowding it out.
const DEFAULT_BUDGET = 110;
const BUDGETS = {
  'index.md': 80, 'coding-conventions.md': 80, 'testing.md': 90, 'glossary.md': 90,
  'module-index.md': 90, 'build.md': 100, 'architecture.md': 110, 'networking.md': 135,
  'ui.md': 175, 'deployment.md': 200, 'backend.md': 200, 'gameplay.md': 220,
  'decisions.md': 190, 'doc-maintenance.md': 80,
};
const TOTAL_BUDGET = 2400;
const NET_GROWTH_WARN = 30;

// Constructions that turn a description of the system into a story about it. Kept in
// sync with doc-maintenance.md's banned list; `Rejected:` lines are the sanctioned
// way to preserve a failed alternative, so they're exempt -- as is doc-maintenance.md
// itself, which has to quote the list in order to define it.
const BANNED = /\b(used to|previously|originally|the first attempt|was later|since removed|then deleted|reverted|earlier version|calibration passes|in this pass)\b/i;
const BANNED_EXEMPT = /Rejected:/;
const BANNED_SKIP_FILES = new Set(['doc-maintenance.md']);

// Unresolved commitments that rot silently unless something surfaces them each run.
const STATUS = /\b(not yet verified|known bug|not yet gated|planned future|TODO|TBD|FIXME)\b/i;

// GitHub heading -> anchor slug (each whitespace char becomes one hyphen; no collapsing).
function slug(h) {
  h = h.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '');
  return h.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
}

if (!existsSync(CTX)) { console.error(`no docs/context at ${CTX}`); process.exit(1); }
const files = readdirSync(CTX).filter(f => f.endsWith('.md'));

// Build per-file anchor sets (with GitHub-style duplicate suffixing).
const anchors = {};
for (const f of files) {
  const seen = new Map(), set = new Set();
  // Split on \r?\n: a lone \r left on the line is a JS line terminator, so `.`
  // in the heading regex below won't consume it and `$` never matches -- on a
  // CRLF checkout that silently yields zero anchors and every #link reads dead.
  for (const line of readFileSync(join(CTX, f), 'utf8').split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    let s = slug(m[1]);
    if (seen.has(s)) { const n = seen.get(s) + 1; seen.set(s, n); s = `${s}-${n}`; }
    else seen.set(s, 0);
    set.add(s);
  }
  anchors[f] = set;
}

// Link + anchor integrity, and collect referenced files for the orphan check.
const referenced = new Set();
let linkCount = 0;
for (const f of files) {
  const txt = readFileSync(join(CTX, f), 'utf8');
  const re = /\[[^\]]+\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(txt))) {
    const target = m[1].trim();
    if (/^(https?:|mailto:)/.test(target)) continue;
    linkCount++;
    const hash = target.indexOf('#');
    const pathPart = hash === -1 ? target : target.slice(0, hash);
    const anchor = hash === -1 ? '' : target.slice(hash + 1);
    let tgt = f;
    if (pathPart) {
      const abs = resolve(CTX, pathPart);
      // `resolve()` returns backslash paths on Windows, so both the separator
      // split and the prefix test must be platform-aware -- otherwise every
      // link with a path part falls through to the else branch and `continue`s,
      // skipping its anchor check and its orphan-tracking registration.
      const base = abs.split(/[\\/]/).pop();
      if (abs.startsWith(CTX + sep) && base.endsWith('.md')) {
        if (!files.includes(base)) { errors.push(`${f}: link to missing doc '${pathPart}'`); continue; }
        tgt = base; referenced.add(base);
      } else { if (!existsSync(abs)) errors.push(`${f}: link to missing file '${pathPart}'`); continue; }
    }
    if (anchor && !(anchors[tgt] && anchors[tgt].has(anchor)))
      errors.push(`${f}: dead anchor '#${anchor}' in ${tgt}`);
  }
}

// Orphans: every doc must be reachable; index.md + module-index.md are the roots.
const roots = new Set(['index.md', 'module-index.md']);
for (const f of files) if (!roots.has(f) && !referenced.has(f))
  warnings.push(`orphan doc (nothing links to it): ${f}`);

// module-index paths should exist on disk (skip globs/dirs).
const mi = existsSync(join(CTX, 'module-index.md')) ? readFileSync(join(CTX, 'module-index.md'), 'utf8') : '';
const seenTok = new Set(); let m2; const codeRe = /`([^`]+)`/g;
while ((m2 = codeRe.exec(mi))) {
  const tok = m2[1].trim();
  if (tok.includes('*') || tok.includes(' ') || !tok.includes('/')) continue;
  if (!/\.(js|gd|yml|yaml|tf|sh|json)$|Dockerfile$/.test(tok)) continue;
  if (seenTok.has(tok)) continue; seenTok.add(tok);
  if (![join(ROOT, tok), join(ROOT, CLIENT, tok)].some(existsSync))
    warnings.push(`module-index: path not found on disk: ${tok}`);
}

// Stack drift: documented server deps + entry vs package.json reality.
const pkgPath = join(ROOT, 'src/Server/package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const all = files.map(f => readFileSync(join(CTX, f), 'utf8')).join('\n');
  for (const dep of Object.keys(pkg.dependencies || {}))
    if (!new RegExp(`\\b${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(all))
      warnings.push(`drift: server dependency '${dep}' not mentioned in any context doc`);
  const mainBase = (pkg.main || '').split('/').pop();
  if (mainBase && !all.includes(mainBase))
    warnings.push(`drift: server entry '${mainBase}' (package.json main) not mentioned in docs`);
}

// Net line change per doc vs HEAD. A doc that grew is held to its budget and the
// banned-phrase list as a hard error; one that shrank or is untouched only warns --
// otherwise a doc already over budget could never be edited back down to size.
// Outside a git repo (or on a fresh repo with no HEAD) everything degrades to warnings.
const growth = {};
const addedLines = {};
let gitOk = false;
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
try {
  for (const line of git(['diff', '--numstat', 'HEAD', '--', 'docs/context']).split(/\r?\n/)) {
    const [add, del, path] = line.split('\t');
    if (!path || add === '-') continue;
    growth[path.split('/').pop()] = Number(add) - Number(del);
  }
  // Added lines, so a banned construction in prose written *this run* is an error while
  // the same construction in legacy prose is only the /compact-docs worklist. Without
  // this split the legacy backlog would hard-fail every run and the gate would be
  // turned off rather than obeyed.
  let cur = null;
  for (const line of git(['diff', '--unified=0', 'HEAD', '--', 'docs/context']).split(/\r?\n/)) {
    const h = /^\+\+\+ b\/(.+)$/.exec(line);
    if (h) { cur = h[1].split('/').pop(); addedLines[cur] ??= new Set(); continue; }
    if (cur && line.startsWith('+') && !line.startsWith('+++')) addedLines[cur].add(line.slice(1).trim());
  }
  gitOk = true;
} catch { /* not a git repo, or no HEAD yet -- warnings only */ }

const grew = f => (growth[f] || 0) > 0;
const flag = (f, msg) => (gitOk && grew(f) ? errors : warnings).push(msg);
const isNew = (f, line) => gitOk && addedLines[f]?.has(line.trim());

// Budgets, banned constructions, and unresolved status markers.
const statusMarkers = [];
const counts = [];
for (const f of files) {
  const lines = readFileSync(join(CTX, f), 'utf8').split(/\r?\n/);
  counts.push([f, lines.length]);
  const budget = BUDGETS[f] ?? DEFAULT_BUDGET;
  if (lines.length > budget)
    flag(f, `over budget: ${f} ${lines.length} lines > ${budget}${grew(f) ? ` (and grew +${growth[f]} this run)` : ' — compact it'}`);
  if ((growth[f] || 0) > NET_GROWTH_WARN)
    warnings.push(`net growth: ${f} +${growth[f]} lines this run (> ${NET_GROWTH_WARN}) — transcribing, not documenting?`);
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    if (!BANNED_SKIP_FILES.has(f) && BANNED.test(line) && !BANNED_EXEMPT.test(line)) {
      const msg = `banned construction: ${f}:${i + 1} — "${line.trim().slice(0, 60)}…" (state the current rule; use \`Rejected:\` for a failed option)`;
      (isNew(f, line) ? errors : warnings).push(msg);
    }
    if (STATUS.test(line)) statusMarkers.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
counts.sort((a, b) => b[1] - a[1]);
const total = counts.reduce((s, [, n]) => s + n, 0);
if (total > TOTAL_BUDGET) warnings.push(`KB total ${total} lines > ${TOTAL_BUDGET} — run /compact-docs`);

// A passing --quiet run prints only the summary line; anything that failed still gets
// the full report, since that is when the detail is what the reader needs.
const terse = QUIET && !errors.length;
console.log('=== docs/context validation ===');
console.log(`files: ${files.length}   total lines: ${total} / ${TOTAL_BUDGET}   links checked: ${linkCount}`);
if (!terse) {
  console.log('lines per doc (budget, net change):');
  for (const [f, n] of counts) {
    const b = BUDGETS[f] ?? DEFAULT_BUDGET, d = growth[f] || 0;
    console.log(`  ${String(n).padStart(4)} / ${String(b).padEnd(4)} ${n > b ? '!' : ' '} ${d ? (d > 0 ? `+${d}` : d).toString().padStart(5) : '     '}  ${f}`);
  }
}
if (statusMarkers.length && !terse) {
  console.log(`\nUNRESOLVED STATUS MARKERS (${statusMarkers.length}) — keep, resolve, or delete each:`);
  statusMarkers.forEach(s => console.log('  · ' + s));
}
if (terse) {
  if (warnings.length || statusMarkers.length)
    console.log(`warnings: ${warnings.length}   status markers: ${statusMarkers.length}   (re-run without --quiet for detail)`);
} else if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach(w => console.log('  ! ' + w)); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach(e => console.log('  x ' + e)); }
console.log(errors.length ? '\nFAIL' : '\nPASS');
process.exit(errors.length ? 1 : 0);
