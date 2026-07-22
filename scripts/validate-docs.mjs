#!/usr/bin/env node
// Validates the docs/context knowledge base. Zero dependencies (Node stdlib only).
//   node scripts/validate-docs.mjs [repoRoot]
// HARD errors (exit 1): broken relative doc links, dead #anchors.
// Soft warnings (exit 0): orphan docs, module-index paths missing on disk,
//                         stack/dependency drift, oversized docs.
// Also prints metrics (file count, lines per doc, links checked) for token budgeting.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] || '.');
const CTX = join(ROOT, 'docs/context');
const CLIENT = 'src/Client/App/corp-tower';
const errors = [];
const warnings = [];

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
  for (const line of readFileSync(join(CTX, f), 'utf8').split('\n')) {
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
      const base = abs.split('/').pop();
      if (abs.startsWith(CTX + '/') && base.endsWith('.md')) {
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

// Metrics + size threshold.
const counts = files.map(f => [f, readFileSync(join(CTX, f), 'utf8').split('\n').length]).sort((a, b) => b[1] - a[1]);
const total = counts.reduce((s, [, n]) => s + n, 0);
for (const [f, n] of counts) if (n > 250) warnings.push(`oversized doc (${n} lines > 250, split candidate): ${f}`);

console.log('=== docs/context validation ===');
console.log(`files: ${files.length}   total lines: ${total}   links checked: ${linkCount}`);
console.log('lines per doc:');
for (const [f, n] of counts) console.log(`  ${String(n).padStart(4)}  ${f}`);
if (warnings.length) { console.log(`\nWARNINGS (${warnings.length}):`); warnings.forEach(w => console.log('  ! ' + w)); }
if (errors.length) { console.log(`\nERRORS (${errors.length}):`); errors.forEach(e => console.log('  x ' + e)); }
console.log(errors.length ? '\nFAIL' : '\nPASS');
process.exit(errors.length ? 1 : 0);
