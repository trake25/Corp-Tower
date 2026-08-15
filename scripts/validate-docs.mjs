#!/usr/bin/env node
// Validates the docs/context knowledge base. Zero dependencies (Node stdlib only).
//   node scripts/validate-docs.mjs [repoRoot] [--quiet]
// --quiet suppresses the per-doc table and status-marker list on a passing run (the
//   /update-docs receipt only needs pass/fail); a failing run always prints in full.
//
// Budgets are TOKENS, not lines. A 173-line ui.md passed the old line budget while
// costing ~31k tokens, because 43 of those lines were 400+ character table cells.
// Tokens are estimated as bytes/4 -- deliberately no tokenizer dependency, and
// deliberately conservative. MAX_LINE_CHARS closes the mega-line loophole
// structurally, so the budget cannot be met again by making lines longer.
//
// HARD errors (exit 1): broken relative doc links, dead #anchors, over-length
//   lines, unresolvable file citations, false counted claims, map coverage gaps,
//   plus over-budget and banned-phrase violations in docs that GREW in the working
//   tree. Growth is blocked; compaction never is, so a doc already over budget can
//   always be edited back down to size.
// Soft warnings (exit 0): the same budget/banned violations in docs that shrank or
//   weren't touched, orphan docs, stack drift, unverifiable claims.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { AREAS, firstPartyFiles, isExempt } from './build-file-map.mjs';

const argv = process.argv.slice(2);
const QUIET = argv.includes('--quiet');
const ROOT = resolve(argv.find(a => !a.startsWith('-')) || '.');
const CTX = join(ROOT, 'docs/context');
const MAP = join(CTX, 'map');
const errors = [];
const warnings = [];

const tok = s => Math.round(Buffer.byteLength(s, 'utf8') / 4);

// Per-doc TOKEN budgets. Exceeding one is a split-or-compact signal, not a style
// nit: the KB's whole value is being loadable for a task without crowding it out.
const DEFAULT_BUDGET = 3000;
// Set to just above measured size, so the next unjustified addition fails loudly.
// ui/backend/gameplay sit above the plan's flat 5000. That gap is a real debt, not
// a licence: what remains in them is mechanism -- how the system behaves now --
// after removing every rejected-alternative narrative and fixed-bug story. The
// plan expected per-symbol detail to migrate into map rows, and Phase 2 generates
// maps bare with `Does` authored on demand, so that destination is still empty.
// Authoring map prose is what brings these back to 5000; raising them again is not.
const BUDGETS = {
  'index.md': 1500,
  // backend.md 5700 -> 6000: first raise. It had sat at 5698/5700 for several
  // tasks, so every change was already compacting to fit, and Supabase token
  // verification added a genuinely new server subsystem (Auth_Verifier, the
  // identity override, the soft gate) rather than more prose about an old one.
  // The same change retired the dead matchmaking-queue text. Next time it goes
  // over, compact or split -- do not raise again.
  'backend.md': 6000, 'gameplay.md': 5300, 'deployment.md': 5000,
  // testing.md 3000 -> 3200: first raise, same reason as backend.md above. It
  // sat at exactly 3000 and auth landed two genuinely new suites
  // (Auth_Verifier.test.js, test_auth_manager.gd). The same change folded a
  // fixed-bug story back into plain description. Next time: compact or split.
  'networking.md': 4000, 'build.md': 3000, 'testing.md': 3200,
  // ui.md split by concept (screens / HUD / tutorial) once map/ui.md's single
  // 28,000-token ceiling stopped holding the client area -- see git history on
  // this file for the two prior MAP_BUDGET raises this replaced.
  'ui.md': 1400, 'ui-hud.md': 4700, 'ui-tutorial.md': 700,
};
// Map files are grep targets, not reads. Their cost model is per-hit (~150 tokens
// for one row), not per-load, so a load budget on them measures a thing that never
// happens -- the same category error as the line budget this rewrite replaces.
// What actually bounds a map's cost is MAX_LINE_CHARS, which is enforced on them
// like everything else. The ceiling below is a bloat alarm, not a load budget.
// Raised from 12000 once the `Does` column was actually authored. A map is
// grepped, never loaded, so its cost is per-hit (~150 tokens for one row) and does
// not scale with the file. The ceiling exists to catch a generator emitting junk
// rows -- which it did: `require()`/`preload()` imports were being listed as
// symbols and are now filtered. A fully authored map is the working state, not
// bloat; a map that grows without the symbol count growing is.
// Raised again to 28000 for self-sufficient rows. Every row now carries its own
// `path:line`, costing ~13 tokens of file growth per row and removing an entire
// second lookup per hit -- the solo probe's Q4 spent ~550 tokens re-grepping the
// heading list purely to learn which file a matched line belonged to. File size is
// the one cost a grep target does not pay, so this trade is close to free.
// map/ui.md hit this ceiling anyway (fully-authored, ~28.7k) -- not because the
// client area covers unusually many files, but because 3 of its ~49 source files
// are oversized multi-responsibility scripts with unusually dense per-symbol
// rows. Split into ui-tutorial/ui-debug/ui-hud/ui-screens rather than raised a
// third time; each lands well under this same shared ceiling.
const MAP_BUDGET = 28000;
// "Whole KB loadable in an emergency" is a claim about prose. Maps are excluded
// and reported separately.
const PROSE_TOTAL_BUDGET = 40000;
const MAX_LINE_CHARS = 300;
const NET_GROWTH_WARN = 30;

// Constructions that turn a description of the system into a story about it.
// No exemption. A failed alternative is not preserved as a narrative: if the
// constraint that killed it is still live, it is written as the constraint, in the
// present tense, and needs none of these words. If it is not live, it is deleted.
// `Rejected:` joins the list -- it was the loophole the other entries leaked through.
const BANNED = /\b(used to|previously|originally|the first attempt|was later|since removed|then deleted|reverted|earlier version|calibration passes|in this pass|Rejected:)\b/i;
const BANNED_EXEMPT = /$^/;

// Unresolved commitments that rot silently unless something surfaces them.
const STATUS = /\b(not yet verified|known bug|not yet gated|planned future|TODO|TBD|FIXME)\b/i;

// GitHub heading -> anchor slug (each whitespace char becomes one hyphen).
function slug(h) {
  h = h.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/`/g, '');
  return h.trim().toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');
}

if (!existsSync(CTX)) { console.error(`no docs/context at ${CTX}`); process.exit(1); }
const files = readdirSync(CTX).filter(f => f.endsWith('.md'));
const mapFiles = existsSync(MAP) ? readdirSync(MAP).filter(f => f.endsWith('.md')) : [];
const read = f => readFileSync(join(CTX, f), 'utf8');
const readMap = f => readFileSync(join(MAP, f), 'utf8');
const all = [...files.map(f => ({ f, dir: CTX, txt: read(f) })),
             ...mapFiles.map(f => ({ f: `map/${f}`, dir: MAP, txt: readMap(f) }))];

// --- anchors + link integrity -------------------------------------------------
const anchors = {};
for (const { f, txt } of all) {
  const seen = new Map(), set = new Set();
  // Split on \r?\n: a lone \r left on the line is a JS line terminator, so `.`
  // in the heading regex below won't consume it and `$` never matches -- on a
  // CRLF checkout that silently yields zero anchors and every #link reads dead.
  for (const line of txt.split(/\r?\n/)) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (!m) continue;
    let s = slug(m[1]);
    if (seen.has(s)) { const n = seen.get(s) + 1; seen.set(s, n); s = `${s}-${n}`; }
    else seen.set(s, 0);
    set.add(s);
  }
  anchors[f] = set;
}

const referenced = new Set();
let linkCount = 0;
for (const { f, dir, txt } of all) {
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
      const abs = resolve(dir, pathPart);
      // `resolve()` returns backslash paths on Windows, so both the separator
      // split and the prefix test must be platform-aware -- otherwise every
      // link with a path part falls through to the else branch and `continue`s,
      // skipping its anchor check and its orphan-tracking registration.
      const base = abs.split(/[\\/]/).pop();
      if (abs.startsWith(CTX + sep) && base.endsWith('.md')) {
        const key = abs.startsWith(MAP + sep) ? `map/${base}` : base;
        if (!anchors[key]) { errors.push(`${f}: link to missing doc '${pathPart}'`); continue; }
        tgt = key; referenced.add(key);
      } else { if (!existsSync(abs)) errors.push(`${f}: link to missing file '${pathPart}'`); continue; }
    }
    if (anchor && !(anchors[tgt] && anchors[tgt].has(anchor)))
      errors.push(`${f}: dead anchor '#${anchor}' in ${tgt}`);
  }
}

// Orphans: every doc must be reachable; index.md is the only root now.
for (const { f } of all) if (f !== 'index.md' && !referenced.has(f))
  warnings.push(`orphan doc (nothing links to it): ${f}`);

// --- map coverage -------------------------------------------------------------
// Every first-party source file must appear in exactly one map file. This is the
// check that would have caught DebugPanelController.gd -- 1,165 lines, the largest
// client file, absent from module-index.md entirely.
const source = firstPartyFiles(ROOT).filter(s => !isExempt(s.rel));
const mapText = new Map(mapFiles.map(f => [f, readMap(f)]));
if (!mapFiles.length) {
  errors.push('no docs/context/map/ — run: node scripts/build-file-map.mjs');
} else {
  const missing = [], dupes = [];
  for (const { rel } of source) {
    const hits = [...mapText].filter(([, t]) => t.includes(`### ${rel} `)).map(([f]) => f);
    if (!hits.length) missing.push(rel);
    else if (hits.length > 1) dupes.push(`${rel} (in ${hits.join(', ')})`);
  }
  for (const p of missing) errors.push(`map coverage: no section for first-party file ${p}`);
  for (const p of dupes) errors.push(`map coverage: file claimed by more than one map: ${p}`);
  // The reverse direction: a map section for a file that no longer exists.
  for (const [f, t] of mapText)
    for (const m of t.matchAll(/^###\s+(\S+)\s+—/gm))
      if (!existsSync(join(ROOT, m[1]))) errors.push(`map/${f}: section for missing file ${m[1]}`);
  for (const a of AREAS)
    if (!mapFiles.includes(a.out)) errors.push(`map coverage: missing docs/context/map/${a.out}`);
}

// --- file citations -----------------------------------------------------------
// Docs and first-party source comments that name a repo file must name one that
// exists. This is the check that catches the nine SAFETY EXCEPTION comments and
// the project entry instruction all citing a Summary.md that was never in the tree.
const FILEISH = /\b([A-Za-z][\w.-]*\.(?:md|js|mjs|gd|sh|yml|yaml|tf|json|godot|tscn|Dockerfile))\b/g;
// Names that legitimately resolve outside the walked tree, or are not files at all
// — `Node.js` is a runtime, and `.js` makes it look like one to any regex.
const CITATION_ALLOW = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json', 'action.yml', 'project.godot',
  'README.md', 'CLAUDE.md', 'index.md', 'Node.js', 'Vue.js', 'Next.js',
]);
// Files whose whole job is to quote names that do not resolve. Without this the
// checker reports its own error messages and its own route patterns as drift,
// which is the fastest way to train a reader to ignore the check.
const CITATION_SKIP_FILES = new Set(['scripts/validate-docs.mjs', 'scripts/docs-scope.mjs']);
// A backticked span holding a glob or brace expansion names a *set* of files, so
// no single basename in it is expected to resolve: `backup-{server,web}-up.sh`
// yields the fragment `up.sh`, and `*-status.sh` yields `status.sh`. Blank those
// spans before scanning rather than allow-listing the fragments, which would
// silence the real name too.
const GLOBBY_SPAN = /`[^`]*[{}*][^`]*`/g;
const maskGlobs = s => s.replace(GLOBBY_SPAN, m => ' '.repeat(m.length));
// A doc section that exists to name retired things. `## Aliases` maps a dead name
// to its live replacement, so the dead half not resolving is the entry's purpose.
const CITATION_SKIP_SECTIONS = new Set(['aliases']);
// Per-line escape for a one-off deliberate reference to something gone.
const CITES_OK = /cites-ok/;
const basenames = new Set();
(function indexTree(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (/^(node_modules|\.git|\.godot|addons|\.terraform)$/.test(e.name)) continue;
      indexTree(join(dir, e.name));
    } else basenames.add(e.name);
  }
})(ROOT);

function checkCitations(label, text) {
  let fenced = false, section = '';
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    if (fenced) return;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h) { section = slug(h[1]); return; }
    if (CITATION_SKIP_SECTIONS.has(section) || CITES_OK.test(line)) return;
    for (const m of maskGlobs(line).matchAll(FILEISH)) {
      const name = m[1];
      if (CITATION_ALLOW.has(name) || basenames.has(name)) continue;
      errors.push(`${label}:${i + 1} cites '${name}' — no such file in the tree`);
    }
  });
}
for (const { f, txt } of all) checkCitations(f, txt);
const COMMENT = /(?:^|\s)(?:\/\/|#)\s*(.*)$/;
for (const { rel } of source) {
  if (CITATION_SKIP_FILES.has(rel)) continue;
  const txt = readFileSync(join(ROOT, rel), 'utf8');
  txt.split(/\r?\n/).forEach((line, i) => {
    const c = COMMENT.exec(line);
    if (!c || CITES_OK.test(line)) return;
    for (const m of maskGlobs(c[1]).matchAll(FILEISH)) {
      const name = m[1];
      if (CITATION_ALLOW.has(name) || basenames.has(name)) continue;
      errors.push(`${rel}:${i + 1} comment cites '${name}' — no such file in the tree`);
    }
  });
}

// --- counted claims -----------------------------------------------------------
// "Currently three: two in X, one in Y" is prose that silently goes false. If a
// doc states a count and names a greppable token, the count is verified against
// the tree. This is the check that would have caught SAFETY EXCEPTION at 3 when
// the real number was 9 across 5 files.
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const treeFiles = [];
(function collect(dir) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const abs = join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(node_modules|\.git|\.godot|addons|\.terraform|site|site-root)$/.test(e.name)) continue;
      collect(abs);
    } else if (/\.(js|mjs|gd|sh|yml|yaml|tf|json)$/.test(e.name) && statSync(abs).size < 400_000) {
      // Markdown is deliberately excluded. "Currently three SAFETY EXCEPTION
      // comments" is a claim about SOURCE; counting the prose that states the
      // claim, the report that analyses it and the checklist that tracks it makes
      // the number grow every time someone writes about it.
      treeFiles.push(abs);
    }
  }
})(ROOT);

function countToken(token) {
  let n = 0;
  const needle = token.toLowerCase();
  for (const f of treeFiles) {
    const rel = f.slice(ROOT.length + 1).split(/[\\/]/).join('/');
    if (CITATION_SKIP_FILES.has(rel)) continue;
    let txt;
    try { txt = readFileSync(f, 'utf8').toLowerCase(); } catch { continue; }
    let idx = 0;
    for (;;) {
      idx = txt.indexOf(needle, idx);
      if (idx === -1) break;
      n++; idx += needle.length;
    }
  }
  return n;
}

for (const { f, txt } of all) {
  const lines = txt.split(/\r?\n/);
  lines.forEach((line, i) => {
    const m = /\bcurrently\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/i.exec(line);
    if (!m) return;
    const claimed = /^\d+$/.test(m[1]) ? Number(m[1]) : WORD_NUM[m[1].toLowerCase()];
    // The countable token is the nearest backticked identifier-ish phrase on this
    // line or the three above it.
    const scope = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
    const cands = [...scope.matchAll(/`([A-Z][A-Z_ ]{2,}|[A-Za-z_][\w.]{2,})`/g)].map(c => c[1]).reverse();
    const token = cands.find(c => !/\.(md|js|gd|mjs|sh|yml|yaml|tf)$/.test(c) && !c.includes('/'));
    if (!token) {
      warnings.push(`${f}:${i + 1} states "currently ${m[1]}" but names no greppable token — unverifiable`);
      return;
    }
    const actual = countToken(token);
    if (actual !== claimed)
      errors.push(`${f}:${i + 1} claims "currently ${m[1]}" of \`${token}\` — source has ${actual}`);
  });
}

// --- stack drift --------------------------------------------------------------
const pkgPath = join(ROOT, 'src/Server/package.json');
if (existsSync(pkgPath)) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const joined = all.map(d => d.txt).join('\n');
  for (const dep of Object.keys(pkg.dependencies || {}))
    if (!new RegExp(`\\b${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(joined))
      warnings.push(`drift: server dependency '${dep}' not mentioned in any context doc`);
  const mainBase = (pkg.main || '').split('/').pop();
  if (mainBase && !joined.includes(mainBase))
    warnings.push(`drift: server entry '${mainBase}' (package.json main) not mentioned in docs`);
}

// --- growth split -------------------------------------------------------------
// A doc that grew is held to its budget and the banned-phrase list as a hard
// error; one that shrank or is untouched only warns -- otherwise a doc already
// over budget could never be edited back down to size.
const growth = {};
const addedLines = {};
let gitOk = false;
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
try {
  for (const line of git(['diff', '--numstat', 'HEAD', '--', 'docs/context']).split(/\r?\n/)) {
    const [add, del, path] = line.split('\t');
    if (!path || add === '-') continue;
    const parts = path.split('/');
    const key = parts.includes('map') ? `map/${parts.pop()}` : parts.pop();
    growth[key] = Number(add) - Number(del);
  }
  let cur = null;
  for (const line of git(['diff', '--unified=0', 'HEAD', '--', 'docs/context']).split(/\r?\n/)) {
    const h = /^\+\+\+ b\/(.+)$/.exec(line);
    if (h) {
      const parts = h[1].split('/');
      cur = parts.includes('map') ? `map/${parts.pop()}` : parts.pop();
      addedLines[cur] ??= new Set();
      continue;
    }
    if (cur && line.startsWith('+') && !line.startsWith('+++')) addedLines[cur].add(line.slice(1).trim());
  }
  gitOk = true;
} catch { /* not a git repo, or no HEAD yet -- warnings only */ }

const grew = f => (growth[f] || 0) > 0;
const flag = (f, msg) => (gitOk && grew(f) ? errors : warnings).push(msg);
const isNew = (f, line) => gitOk && addedLines[f]?.has(line.trim());

// --- budgets, line length, banned constructions, status markers ---------------
const statusMarkers = [];
const counts = [];
// A bare `TODO` in a map row is the generator saying "this symbol has no authored
// Does line yet" -- by design, and there are hundreds. Listing each one buries the
// handful of real unresolved commitments in the prose docs, so they are counted.
let mapTodos = 0;
for (const { f, txt } of all) {
  const lines = txt.split(/\r?\n/);
  const t = tok(txt);
  const isMap = f.startsWith('map/');
  const budget = isMap ? MAP_BUDGET : (BUDGETS[f] ?? DEFAULT_BUDGET);
  counts.push([f, t, budget, lines.length, isMap]);
  if (t > budget)
    flag(f, `over budget: ${f} ~${t} tok > ${budget}${grew(f) ? ` (and grew +${growth[f]} this run)` : ' — compact it'}`);
  if ((growth[f] || 0) > NET_GROWTH_WARN)
    warnings.push(`net growth: ${f} +${growth[f]} lines this run (> ${NET_GROWTH_WARN}) — transcribing, not documenting?`);
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^\s*```/.test(line)) { fenced = !fenced; return; }
    // Over-length lines are a HARD error everywhere, always. This is the rule that
    // structurally closes the loophole: without it a doc can meet any budget by
    // folding an essay into one table cell, which is how ui.md reached ~31k tokens
    // while passing validation.
    if (!fenced && line.length > MAX_LINE_CHARS)
      errors.push(`long line: ${f}:${i + 1} is ${line.length} chars > ${MAX_LINE_CHARS} — split the cell or the sentence`);
    if (fenced) return;
    if (BANNED.test(line) && !BANNED_EXEMPT.test(line)) {
      const msg = `banned construction: ${f}:${i + 1} — "${line.trim().slice(0, 60)}…" (state the current rule; use \`Rejected:\` for a failed option)`;
      (isNew(f, line) ? errors : warnings).push(msg);
    }
    if (!STATUS.test(line)) return;
    if (isMap && /^\|.*\|\s*TODO\s*\|$/.test(line)) { mapTodos++; return; }
    statusMarkers.push(`${f}:${i + 1}  ${line.trim().slice(0, 90)}`);
  });
}
counts.sort((a, b) => b[1] - a[1]);
const proseTotal = counts.filter(c => !c[4]).reduce((s, c) => s + c[1], 0);
const mapTotal = counts.filter(c => c[4]).reduce((s, c) => s + c[1], 0);
if (proseTotal > PROSE_TOTAL_BUDGET)
  warnings.push(`KB prose total ~${proseTotal} tok > ${PROSE_TOTAL_BUDGET} — run /compact-docs`);

// --- map freshness ------------------------------------------------------------
let mapFresh = 'skipped';
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/build-file-map.mjs'), ROOT, '--check', '--quiet'],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  mapFresh = 'fresh';
} catch (e) {
  mapFresh = 'STALE';
  errors.push('map is stale vs source — run: node scripts/build-file-map.mjs');
  void e;
}

// --- report -------------------------------------------------------------------
const terse = QUIET && !errors.length;
console.log('=== docs/context validation ===');
console.log(`docs: ${files.length} + ${mapFiles.length} map   prose: ~${proseTotal} / ${PROSE_TOTAL_BUDGET} tok   maps: ~${mapTotal} tok   links: ${linkCount}   map: ${mapFresh}`);
if (mapTodos) console.log(`map rows awaiting a Does line: ${mapTodos} (expected — author on demand, per Phase 2)`);
if (!terse) {
  console.log('tokens per doc (budget, net line change):');
  for (const [f, t, b, ln, isMap] of counts) {
    const d = growth[f] || 0;
    console.log(`  ${String(t).padStart(6)} / ${String(b).padEnd(6)} ${t > b ? '!' : ' '} ${String(ln).padStart(4)}ln ${d ? (d > 0 ? `+${d}` : d).toString().padStart(5) : '     '}  ${f}${isMap ? '  (grep target)' : ''}`);
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
