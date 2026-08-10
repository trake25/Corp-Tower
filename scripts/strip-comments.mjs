#!/usr/bin/env node
// Removes comments from first-party product source, per the CLAUDE.md rule that
// explanation belongs in docs/context/ (budgeted, validated) and not in comments.
// Zero dependencies (Node stdlib only).
//   node scripts/strip-comments.mjs --dry-run   # report only, touch nothing
//   node scripts/strip-comments.mjs             # rewrite in place
//   node scripts/strip-comments.mjs --quiet     # totals only
//
// Scope comes from build-file-map.mjs AREAS (backend + ui) rather than a second
// hand-maintained list. scripts/ and .github/ are deliberately NOT in scope: the
// tooling and workflow layer explains itself, product source does not, and all 9
// SAFETY EXCEPTION comments live there.
//
// This is a tokenizer, not a regex. `//` inside a string, a template literal or a
// regex literal is not a comment, and `#` inside a GDScript string is not a
// comment. A regex-based strip of this tree already deleted a live config line
// (`levelTimeLimitMs: 60000` in Game_Config.js, commit 58702d9) because it sat
// between two comment lines -- node --check and the test suite both stayed green
// and the round-clock floor silently defaulted for months. Hence the three gates
// in verify() below, which run on every file before anything is written.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { AREAS, firstPartyFiles, isExempt } from './build-file-map.mjs';

const STRIP_AREAS = new Set(['backend', 'ui']);

// Kept verbatim wherever they appear.
const SAFETY = /SAFETY EXCEPTION/;
const GD_REGION = /^\s*#\s*(?:end)?region\b/;

// --- JS scanner ---------------------------------------------------------------
// A `/` is a regex literal or a division depending on what precedes it. The rule
// is the standard one: after a value (identifier, number, `)`, `]`) it divides;
// after an operator or one of these keywords it opens a regex.
const REGEX_AFTER_WORD = new Set([
  'return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void',
  'throw', 'case', 'do', 'else', 'yield', 'await',
]);
const WORD_CHAR = /[A-Za-z0-9_$]/;

function regexAllowed(tail) {
  const t = tail.replace(/\s+$/, '');
  if (!t) return true;
  const last = t[t.length - 1];
  if (last === ')' || last === ']') return false;
  if (WORD_CHAR.test(last)) return REGEX_AFTER_WORD.has(/[A-Za-z0-9_$]+$/.exec(t)[0]);
  return true;
}

// Returns one record per line: the code with comments removed, and whether any
// part of the line was comment. Blank `code` + `hadComment` is a comment-only
// line; blank `code` alone is a genuine blank line and is preserved.
function scanJs(lines) {
  const res = lines.map(raw => ({ raw, code: '', hadComment: false }));
  let mode = 'code';
  const tmplStack = [];
  let braces = 0;
  let tail = '';
  const push = c => { tail = (tail + c).slice(-32); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const r = res[i];
    if (mode === 'block') r.hadComment = true;
    let j = 0;
    while (j < line.length) {
      const c = line[j], d = line[j + 1];

      if (mode === 'block') {
        if (c === '*' && d === '/') { mode = 'code'; j += 2; } else j++;
        continue;
      }
      if (mode === 'sq' || mode === 'dq') {
        if (c === '\\') { r.code += c + (d ?? ''); j += 2; continue; }
        r.code += c;
        // `x` stands for "a value just ended", so a following `/` reads as
        // division rather than opening a regex.
        if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')) { mode = 'code'; push('x'); }
        j++;
        continue;
      }
      if (mode === 'tmpl') {
        if (c === '\\') { r.code += c + (d ?? ''); j += 2; continue; }
        if (c === '$' && d === '{') { r.code += '${'; tmplStack.push(braces); braces = 0; mode = 'code'; push('{'); j += 2; continue; }
        r.code += c;
        if (c === '`') { mode = 'code'; push('x'); }
        j++;
        continue;
      }
      if (mode === 'regex' || mode === 'rgxClass') {
        if (c === '\\') { r.code += c + (d ?? ''); j += 2; continue; }
        r.code += c;
        if (mode === 'regex' && c === '[') mode = 'rgxClass';
        else if (mode === 'rgxClass' && c === ']') mode = 'regex';
        else if (mode === 'regex' && c === '/') { mode = 'code'; push('x'); }
        j++;
        continue;
      }

      if (c === '/' && d === '/') { r.hadComment = true; break; }
      if (c === '/' && d === '*') { r.hadComment = true; mode = 'block'; j += 2; continue; }
      if (c === '/' && regexAllowed(tail)) { r.code += c; mode = 'regex'; j++; continue; }
      if (c === "'") { r.code += c; mode = 'sq'; j++; continue; }
      if (c === '"') { r.code += c; mode = 'dq'; j++; continue; }
      if (c === '`') { r.code += c; mode = 'tmpl'; j++; continue; }
      if (c === '{') braces++;
      if (c === '}') {
        if (braces === 0 && tmplStack.length) { r.code += c; braces = tmplStack.pop(); mode = 'tmpl'; j++; continue; }
        braces--;
      }
      r.code += c;
      if (!/\s/.test(c)) push(c);
      j++;
    }
  }
  return res;
}

// --- GDScript scanner ---------------------------------------------------------
// No block comments in GDScript. `#` opens a comment unless it is inside a string,
// and strings come in single, double and both triple forms.
function scanGd(lines) {
  const res = lines.map(raw => ({ raw, code: '', hadComment: false }));
  let mode = 'code';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const r = res[i];
    let j = 0;
    while (j < line.length) {
      const c = line[j];
      if (mode === 'tsq' || mode === 'tdq') {
        const q = mode === 'tsq' ? "'''" : '"""';
        if (line.startsWith(q, j)) { r.code += q; mode = 'code'; j += 3; continue; }
        r.code += c;
        j++;
        continue;
      }
      if (mode === 'sq' || mode === 'dq') {
        if (c === '\\') { r.code += c + (line[j + 1] ?? ''); j += 2; continue; }
        r.code += c;
        if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')) mode = 'code';
        j++;
        continue;
      }
      if (c === '#') { r.hadComment = true; break; }
      if (line.startsWith('"""', j)) { r.code += '"""'; mode = 'tdq'; j += 3; continue; }
      if (line.startsWith("'''", j)) { r.code += "'''"; mode = 'tsq'; j += 3; continue; }
      if (c === '"') { r.code += c; mode = 'dq'; j++; continue; }
      if (c === "'") { r.code += c; mode = 'sq'; j++; continue; }
      r.code += c;
      j++;
    }
  }
  return res;
}

// --- emit ---------------------------------------------------------------------
export function strip(rel, text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const gd = rel.endsWith('.gd');
  const scan = gd ? scanGd(lines) : scanJs(lines);

  const out = [];
  const kept = new Set();
  let dropped = 0;
  let trailing = 0;
  let droppedSinceEmit = false;

  for (let i = 0; i < scan.length; i++) {
    const { raw, code, hadComment } = scan[i];
    const keepVerbatim =
      SAFETY.test(raw) ||
      (i === 0 && raw.startsWith('#!')) ||
      (gd && GD_REGION.test(raw));

    if (keepVerbatim) {
      out.push(raw);
      kept.add(i);
      droppedSinceEmit = false;
      continue;
    }
    const codeOnly = code.replace(/\s+$/, '');
    if (!codeOnly.trim()) {
      if (hadComment) { dropped++; droppedSinceEmit = true; continue; }
      // A blank line that now sits next to another blank only because a comment
      // between them was removed is collapsed. Blank pairs the author wrote are
      // left alone -- droppedSinceEmit is what distinguishes the two.
      if (droppedSinceEmit && out.length && out[out.length - 1] === '') continue;
      out.push('');
      kept.add(i);
      droppedSinceEmit = false;
      continue;
    }
    if (hadComment) trailing++;
    out.push(codeOnly);
    kept.add(i);
    droppedSinceEmit = false;
  }

  return { text: out.join(eol), scan, kept, dropped, trailing, eol, before: lines.length, after: out.length };
}

// --- gates --------------------------------------------------------------------
// Three independent checks. Any failure aborts the whole run before a byte is
// written, because a partial strip is worse than none.
const keyBag = s => {
  const m = new Map();
  for (const [, k] of s.matchAll(/(^|[\s{,;(])([A-Za-z_$][\w$]*)\s*:/g)) m.set(k, (m.get(k) ?? 0) + 1);
  return m;
};

function verify(rel, original, result) {
  const errs = [];

  // 1. No line holding code may be dropped. This is the exact failure mode of
  //    commit 58702d9: a real line vanishing between two comment lines.
  for (let i = 0; i < result.scan.length; i++) {
    const c = result.scan[i].code.trim();
    if (c && !result.kept.has(i)) errs.push(`line ${i + 1} holds code but was dropped: ${c.slice(0, 60)}`);
  }

  // 2. Non-whitespace code content is byte-identical before and after.
  const a = result.scan.map(s => s.code).join('').replace(/\s+/g, '');
  const b = result.text.replace(/\s+/g, '');
  if (a !== b) errs.push('code content changed (whitespace-insensitive compare failed)');

  // 3. Object-literal keys are counted on the RAW text, before and after -- this
  //    one does not trust the scanner at all, which is the point. A key that only
  //    ever appeared inside a comment is expected to go and is not an error.
  const before = keyBag(original), after = keyBag(result.text);
  const commentText = result.scan
    .map(s => (s.hadComment ? (s.raw.startsWith(s.code) ? s.raw.slice(s.code.length) : s.raw) : ''))
    .join('\n');
  const inComments = keyBag(commentText);
  for (const [k, n] of before) {
    const lost = n - (after.get(k) ?? 0);
    if (lost > 0 && lost > (inComments.get(k) ?? 0)) errs.push(`key \`${k}\` lost ${lost}x (only ${inComments.get(k) ?? 0} were in comments)`);
  }

  return errs;
}

// --- main ---------------------------------------------------------------------
function main() {
  const argv = process.argv.slice(2);
  const DRY = argv.includes('--dry-run');
  const QUIET = argv.includes('--quiet');
  const root = resolve(argv.find(a => !a.startsWith('-')) || '.');

  const files = firstPartyFiles(root)
    .filter(f => STRIP_AREAS.has(f.area) && !isExempt(f.rel));

  const results = [];
  const failures = [];
  let totalDropped = 0, totalTrailing = 0, safetyKept = 0;

  for (const { rel } of files) {
    const original = readFileSync(join(root, rel), 'utf8');
    const result = strip(rel, original);
    const errs = verify(rel, original, result);
    if (errs.length) failures.push({ rel, errs });
    totalDropped += result.dropped;
    totalTrailing += result.trailing;
    safetyKept += result.scan.filter(s => SAFETY.test(s.raw)).length;
    if (result.text !== original.replace(/\r?\n/g, result.eol)) results.push({ rel, ...result });
  }

  if (failures.length) {
    console.log('=== GATE FAILURE — nothing written ===');
    for (const f of failures) {
      console.log(`  x ${f.rel}`);
      f.errs.slice(0, 8).forEach(e => console.log(`      ${e}`));
    }
    console.log('\nFAIL');
    process.exit(1);
  }

  if (!QUIET) {
    console.log('=== comment strip ===   whole-line / trailing');
    for (const r of [...results].sort((a, b) => (b.dropped + b.trailing) - (a.dropped + a.trailing)))
      console.log(`  ${String(r.dropped).padStart(4)} ${String(r.trailing).padStart(4)}  ${r.rel}`);
  }
  console.log(`\n${files.length} files in scope · ${results.length} touched · ${totalDropped} whole comment lines removed · ${totalTrailing} trailing comments stripped · ${safetyKept} SAFETY EXCEPTION kept`);

  if (DRY) { console.log('\nDRY RUN — nothing written'); return; }
  for (const r of results) writeFileSync(join(root, r.rel), r.text, 'utf8');
  console.log('\nwritten');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
