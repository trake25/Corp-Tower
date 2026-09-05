import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { AREA_ALIASES, mapOwnerForPath, routeSourcePath } from './context-routing.mjs';
import {
  CONCEPT_SECTION_HARD_BYTES,
  DEFAULT_CONCEPT_BYTES,
  MAX_CONCEPT_BYTES,
  conceptForInput,
  loadConceptRegistry,
  readConceptMapSection,
  resolveConceptSource,
} from './concept-kb.mjs';
import { AUTOMATION_PROTOCOL_TESTS, selectQa } from '../qa-gate.mjs';

export { DEFAULT_CONCEPT_BYTES, MAX_CONCEPT_BYTES };

export const DEFAULT_MAX_RESULTS = 5;
export const MAX_RESULTS = 8;
export const DEFAULT_MAX_BYTES = 6 * 1024;
export const MAX_BYTES = 24 * 1024;
export const DEFAULT_SECTION_BYTES = 6 * 1024;
export const MAX_SECTION_BYTES = 12 * 1024;
export const DEFAULT_BUNDLE_BYTES = 12 * 1024;
const DIAGNOSTIC_MAX_BYTES = 2 * 1024;
const DIAGNOSTIC_MAX_RESULTS = 3;
const ANCHOR_STOP_WORDS = new Set(['add', 'agent', 'agentic', 'change', 'context', 'find', 'fix', 'from', 'help', 'into', 'make', 'need', 'needs', 'repo', 'repository', 'search', 'the', 'this', 'tool', 'use', 'with']);

const normalize = value => value.toLowerCase().replaceAll('\\', '/');
const tokens = value => [...new Set((normalize(value).match(/[a-z0-9_]+/g) || []).filter(token => token.length > 1))];
const relativePath = (root, file) => relative(root, file).replaceAll('\\', '/');

function command(argv) {
  return { argv, display: argv.map(part => /^[a-z0-9_./,:-]+$/i.test(part) ? part : JSON.stringify(part)).join(' ') };
}

const contextCommand = parts => command(['node', 'scripts/context.mjs', ...parts]);

function measured(value) {
  let bytes = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    value.limits.returned_bytes = bytes;
    const next = Buffer.byteLength(JSON.stringify(value, null, 2)) + 1;
    if (next === bytes) break;
    bytes = next;
  }
  value.limits.returned_bytes = bytes;
  return bytes;
}

export function measuredText(lines) {
  const body = lines.join('\n');
  let bytes = 0, output = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    output = `${body}\nbytes: ${bytes}\n`;
    const next = Buffer.byteLength(output);
    if (next === bytes) break;
    bytes = next;
  }
  return { output, bytes };
}

function parseMapRow(line) {
  const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
  const location = cells[0]?.replaceAll('`', '') || '';
  const match = /^(.*):(\d+)$/.exec(location);
  if (!match) return null;
  const sourceLine = Number(match[2]);
  const start = Math.max(1, sourceLine - 12);
  const end = sourceLine + 20;
  const symbol = cells[1] || '';
  const cleanSymbol = symbol.replace(/\s+·\s+.*$/, '');
  return { source_path: match[1], source_line: sourceLine, symbol: cleanSymbol, map_kind: cleanSymbol === '@file' ? 'file' : 'anchor', purpose: cells[2] || '',
    read: { path: match[1], lines: [start, end], command: command(['sed', '-n', `${start},${end}p`, match[1]]) } };
}

function inside(root, file) {
  return file === root || file.startsWith(root + sep);
}

function docRoots(root) {
  return [resolve(root, 'docs/context'), resolve(root, 'site/docs')];
}

export function markdownSections(body) {
  const lines = body.split(/\r?\n/);
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

export function resolveDocument(root, input, mapOnly = false) {
  if (!input) throw new Error('a document or map is required');
  const candidates = [];
  const clean = input.replace(/^\.\//, '');
  if (clean.includes('/')) candidates.push(resolve(root, clean));
  else {
    const file = clean.endsWith('.md') ? clean : `${clean}.md`;
    candidates.push(resolve(root, mapOnly ? `docs/context/map/${file}` : `docs/context/${file}`));
    if (!mapOnly) candidates.push(resolve(root, `site/docs/${file}`));
  }
  const chosen = candidates.find(file => existsSync(file));
  if (!chosen || !docRoots(root).some(docRoot => inside(docRoot, chosen))) throw new Error(`no routed document: ${input}`);
  if (mapOnly && !inside(resolve(root, 'docs/context/map'), chosen)) throw new Error(`not a generated map: ${input}`);
  return chosen;
}

export function documentOutline(root, input) {
  const file = resolveDocument(root, input);
  return {
    path: relativePath(root, file),
    sections: markdownSections(readFileSync(file, 'utf8')).map(({ start, end, level, heading }) => ({ start, end, level, heading })),
  };
}

export function documentSection(root, input, query, maxBytes = DEFAULT_SECTION_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_SECTION_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${MAX_SECTION_BYTES}`);
  const file = resolveDocument(root, input);
  const requested = normalize(query);
  if (!requested) throw new Error('a heading is required');
  const sections = markdownSections(readFileSync(file, 'utf8'));
  const matches = sections.filter(item => normalize(item.heading) === requested || normalize(item.heading).includes(requested));
  if (matches.length !== 1) throw new Error(matches.length ? `heading is ambiguous (${matches.length} matches); use a longer query` : `heading not found: ${query}`);
  const match = matches[0];
  const text = readFileSync(file, 'utf8').split(/\r?\n/).slice(match.start - 1, match.end).join('\n');
  if (Buffer.byteLength(text) > maxBytes) throw new Error(`section exceeds ${maxBytes} byte limit; narrow the heading or raise --max-bytes up to ${MAX_SECTION_BYTES}`);
  return { path: relativePath(root, file), lines: [match.start, match.end], heading: match.heading, text };
}

export function mapSymbols(root, input, query, limit = DEFAULT_MAX_RESULTS) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS)
    throw new Error(`--max-results must be an integer from 1 to ${MAX_RESULTS}`);
  const file = resolveDocument(root, input, true);
  const requested = normalize(query);
  if (!requested) throw new Error('a symbol query is required');
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => ({ line, number: index + 1 }))
    .filter(item => /^\|\s*[^|]+:\d+\s*\|/.test(item.line) && normalize(item.line).includes(requested));
  if (!rows.length) throw new Error(`no symbol rows match "${query}" in ${basename(file)}`);
  return {
    path: relativePath(root, file),
    rows: rows.slice(0, limit).map(item => ({ line: item.number, text: item.line, source: parseMapRow(item.line) })),
    overflow: rows.length > limit,
    total: rows.length,
  };
}

export function routeContext(input) {
  const alias = AREA_ALIASES[normalize(input)];
  const routed = alias || routeSourcePath(input);
  if (!routed) throw new Error(`unmapped route: ${input}`);
  const docs = alias ? alias.docs : (routed.docs || []).map(doc => doc.startsWith('site/') ? doc : `docs/context/${doc}`);
  const maps = alias ? alias.maps : (routed.map ? [`docs/context/map/${routed.map}`] : []);
  return {
    input,
    skill: routed.skill,
    docs,
    maps,
    read: routed.read || null,
    ...(routed.purpose ? { workspace: { name: routed.name, purpose: routed.purpose, policy: routed.policy } } : {}),
  };
}

export function routeTextLines(result) {
  const output = [`skill: ${result.skill}`, `docs: ${result.docs.length ? result.docs.join(', ') : 'none'}`, `maps: ${result.maps.length ? result.maps.join(', ') : 'none'}`];
  if (result.read) output.push(`source-read: ${result.read}`);
  if (result.workspace) output.push(`workspace: ${result.workspace.name}`, `purpose: ${result.workspace.purpose}`, `policy: ${result.workspace.policy}`);
  return output;
}

function walkMarkdown(dir, root, files) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walkMarkdown(file, root, files);
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(relativePath(root, file));
  }
}

function searchableDocuments(root) {
  const files = [];
  walkMarkdown(resolve(root, 'docs/context'), root, files);
  walkMarkdown(resolve(root, 'site/docs'), root, files);
  return files.filter(path => !path.startsWith('docs/context/map/')).sort();
}

function searchableMaps(root) {
  const files = [];
  walkMarkdown(resolve(root, 'docs/context/map'), root, files);
  return files.sort();
}

export function retrievalAliases(root, queryTokens) {
  const file = resolve(root, 'docs/context/retrieval-aliases.json');
  if (!existsSync(file)) return [];
  let terms;
  try {
    terms = JSON.parse(readFileSync(file, 'utf8')).terms || {};
  } catch {
    throw new Error('docs/context/retrieval-aliases.json is not valid JSON');
  }
  return Object.entries(terms).flatMap(([term, definition]) => {
    const words = [term, ...(definition.aliases || [])].flatMap(tokens);
    return words.some(word => queryTokens.includes(word)) ? [{ term, ...definition }] : [];
  });
}

function phraseScore({ title, text, path, query, queryTokens, kind, relatedAliases }) {
  const titleText = normalize(title);
  const bodyText = normalize(text);
  const pathText = normalize(path);
  const joined = `${titleText}\n${bodyText}\n${pathText}`;
  const exact = joined.includes(query);
  const allWords = queryTokens.every(token => joined.includes(token));
  const aliasMatch = relatedAliases.some(alias => (alias.aliases || []).some(phrase => joined.includes(normalize(phrase))));
  if (!exact && !allWords && !aliasMatch) return null;
  let score = 0;
  const reasons = [];
  if (titleText.includes(query)) {
    score += kind === 'symbol' ? 120 : 160;
    reasons.push(kind === 'symbol' ? 'exact symbol phrase' : 'exact heading phrase');
  } else if (bodyText.includes(query)) {
    score += kind === 'symbol' ? 120 : 80;
    reasons.push(kind === 'symbol' ? 'exact map phrase' : 'exact section phrase');
  }
  if (allWords) {
    score += 80;
    reasons.push('all query terms');
  }
  if (queryTokens.some(token => pathText.includes(token))) {
    score += 35;
    reasons.push('path term');
  }
  const aliasHits = relatedAliases.filter(alias => (alias.aliases || []).some(phrase => joined.includes(normalize(phrase))));
  if (aliasHits.length) {
    score += aliasHits.length * 100;
    reasons.push('related alias');
  }
  return { score, reason: reasons.join(', ') };
}

function excerpt(text, queryTokens, limit = 720) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (Buffer.byteLength(clean) <= limit) return clean;
  const lower = normalize(clean);
  const index = queryTokens.map(token => lower.indexOf(token)).find(position => position >= 0) ?? 0;
  const start = Math.max(0, index - Math.floor(limit / 3));
  return `${start ? '…' : ''}${clean.slice(start, start + limit)}…`;
}

function areaPaths(area) {
  const route = AREA_ALIASES[area];
  if (!route) throw new Error(`unknown domain: ${area}`);
  return new Set([...(route.docs || []), ...(route.maps || [])]);
}

function constrained(results, options) {
  const required = tokens(options.require || '');
  const domains = options.domains || [];
  const allowed = domains.length ? new Set(domains.flatMap(area => [...areaPaths(area)])) : null;
  const kinds = options.kinds || [];
  if (kinds.some(kind => !['route', 'section', 'symbol'].includes(kind)))
    throw new Error('--kind must be route, section, or symbol');
  const prefix = normalize(options.pathPrefix || '');
  return results.filter(result => {
    if (allowed && !allowed.has(result.path)) return false;
    if (kinds.length && !kinds.includes(result.kind)) return false;
    if (prefix && !normalize(result.path).startsWith(prefix)) return false;
    if (required.length && !required.every(token => normalize(`${result.title}\n${result._search_text || result.excerpt || ''}\n${result.path}`).includes(token))) return false;
    return true;
  });
}

function bounded(results, maxResults, maxBytes) {
  const selected = [];
  let bytes = 0;
  for (const result of results) {
    if (selected.length === maxResults) break;
    const size = Buffer.byteLength(JSON.stringify(result));
    if (selected.length && bytes + size > maxBytes) break;
    if (!selected.length && size > maxBytes) continue;
    selected.push(result);
    bytes += size;
  }
  return { selected, bytes };
}

function limits(options) {
  const maxResults = Number(options.maxResults || DEFAULT_MAX_RESULTS);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > MAX_RESULTS)
    throw new Error(`--max-results must be an integer from 1 to ${MAX_RESULTS}`);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${MAX_BYTES}`);
  return { maxResults, maxBytes };
}

function searchEntries(root) {
  const entries = [];
  for (const path of searchableDocuments(root)) {
    const file = resolve(root, path);
    const body = readFileSync(file, 'utf8');
    for (const section of markdownSections(body)) {
      const text = body.split(/\r?\n/).slice(section.start - 1, section.end).join('\n');
      entries.push({ kind: 'section', path, lines: [section.start, section.end], title: section.heading, text });
    }
  }
  for (const path of searchableMaps(root)) {
    const file = resolve(root, path);
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (!/^\|\s*[^|]+:\d+\s*\|/.test(line)) return;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      entries.push({ kind: 'symbol', path, lines: [index + 1, index + 1], title: cells[1] || path, text: line, source: parseMapRow(line) });
    });
  }
  return entries;
}

function rankedEntries(entries, requested, relatedAliases, includeExcerpt = false) {
  const queryTokens = tokens(requested);
  return entries.flatMap(entry => {
    const match = phraseScore({ ...entry, query: requested, queryTokens, relatedAliases });
    if (!match) return [];
    return [{
      kind: entry.kind,
      path: entry.path,
      lines: entry.lines,
      title: entry.title,
      score: match.score,
      reason: match.reason,
      _search_text: entry.text,
      ...(entry.source ? { source: entry.source } : {}),
      ...(includeExcerpt ? { excerpt: excerpt(entry.text, queryTokens) } : {}),
    }];
  });
}

function optionArgs(options) {
  const args = [];
  for (const domain of options.domains || []) args.push('--domain', domain);
  for (const kind of options.kinds || []) args.push('--kind', kind);
  if (options.pathPrefix) args.push('--path-prefix', options.pathPrefix);
  if (options.require) args.push('--require', options.require);
  return args;
}

function boundedActions(actions) {
  const selected = [];
  let bytes = 0;
  for (const action of actions) {
    const size = Buffer.byteLength(JSON.stringify(action));
    if (selected.length === DIAGNOSTIC_MAX_RESULTS || bytes + size > DIAGNOSTIC_MAX_BYTES) break;
    selected.push(action);
    bytes += size;
  }
  return { actions: selected, bytes };
}

function anchorSuggestions(root, entries, queryTokens, options) {
  const candidates = queryTokens
    .filter(token => token.length > 2 && !ANCHOR_STOP_WORDS.has(token))
    .flatMap(anchor => {
      const ranked = constrained(rankedEntries(entries, anchor, retrievalAliases(root, [anchor])), options)
        .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || (left.lines?.[0] || 0) - (right.lines?.[0] || 0));
      if (!ranked.length) return [];
      return [{
        type: 'retry-anchor',
        anchor,
        matches: ranked.length,
        top: { kind: ranked[0].kind, path: ranked[0].path, lines: ranked[0].lines, title: ranked[0].title },
        command: contextCommand(['search', anchor, '--anchor', ...optionArgs(options)]),
        score: ranked[0].score,
      }];
    })
    .sort((left, right) => left.matches - right.matches || right.score - left.score || right.anchor.length - left.anchor.length || left.anchor.localeCompare(right.anchor))
    .map(({ score, ...candidate }) => candidate);
  return boundedActions(candidates);
}

function filterSuggestions(results, query, options) {
  if (!results.length) return { actions: [], bytes: 0 };
  const top = results[0];
  const base = ['filter', query, ...optionArgs(options)];
  const actions = [];
  if (top.kind === 'section') actions.push({
    type: 'read-section',
    command: contextCommand(['section', top.path, top.title]),
  });
  if (top.kind === 'symbol' && top.source) actions.push({
    type: 'read-symbol',
    command: contextCommand(['symbol', top.path, top.source.symbol]),
  });
  if (!(options.kinds || []).length) actions.push({
    type: 'filter-kind',
    command: contextCommand([...base, '--kind', top.kind]),
  });
  if (!options.pathPrefix) actions.push({
    type: 'filter-path',
    command: contextCommand([...base, '--path-prefix', top.path]),
  });
  if (!options.require && top.title) actions.push({
    type: 'filter-required-term',
    command: contextCommand([...base, '--require', top.title.replace(/\s+·\s+.*$/, '')]),
  });
  return boundedActions(actions);
}

function fitPayload(payload, maxBytes) {
  while (measured(payload) > maxBytes) {
    if (payload.results.length > 1) payload.results.pop();
    else if (payload.next_actions.length > 1) payload.next_actions.pop();
    else if (payload.results[0]?.source?.read?.command?.argv) delete payload.results[0].source.read.command.argv;
    else if (payload.results[0]?.source?.purpose) delete payload.results[0].source.purpose;
    else if (payload.results[0]?.source?.map_kind) delete payload.results[0].source.map_kind;
    else if (payload.results[0]?.reason) delete payload.results[0].reason;
    else if (payload.results[0] && 'score' in payload.results[0]) delete payload.results[0].score;
    else throw new Error(`search response metadata exceeds ${maxBytes} byte limit`);
  }
  payload.limits.evidence_bytes = payload.results.reduce((total, result) => total + Buffer.byteLength(JSON.stringify(result)), 0);
  measured(payload);
  return payload;
}

export function searchContext(root, query, options = {}) {
  const requested = normalize(query).trim();
  const queryTokens = tokens(requested);
  if (!queryTokens.length) throw new Error('search query needs at least one two-character term');
  const { maxResults, maxBytes } = limits(options);
  let entries;
  let relatedAliases;
  try {
    entries = searchEntries(root);
    relatedAliases = retrievalAliases(root, queryTokens);
  } catch (error) {
    return fitPayload({
      schema_version: 2,
      query: { kind: 'search', text: query, anchor: Boolean(options.anchor) },
      status: 'tool-error',
      results: [],
      next_actions: [],
      fallback: { allowed: true, reason: 'retrieval tool failure' },
      limits: { max_results: maxResults, max_bytes: maxBytes, evidence_bytes: 0, diagnostic_bytes: 0, returned_bytes: 0 },
      warnings: [error.message],
    }, maxBytes);
  }
  const results = rankedEntries(entries, requested, relatedAliases, Boolean(options.includeExcerpt));
  const exactArea = AREA_ALIASES[requested];
  if (exactArea) {
    for (const path of [...exactArea.docs, ...exactArea.maps]) results.push({
      kind: 'route', path, lines: null, title: `${requested} route`, score: 200,
      reason: 'exact route or area alias',
    });
  }
  const filtered = constrained(results, options)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || (left.lines?.[0] || 0) - (right.lines?.[0] || 0))
    .map(({ _search_text, ...result }) => result);
  const { selected, bytes } = bounded(filtered, maxResults, maxBytes);
  const weakNarrative = !options.anchor && queryTokens.length > 1 && filtered.length && filtered.every(result => result.score <= 80);
  const confidentTop = filtered.length > 1 && filtered[0].score - filtered[1].score >= 30 && /exact (?:heading|symbol) phrase/.test(filtered[0].reason);
  const needsFilter = filtered.length > selected.length && !confidentTop;
  const presented = confidentTop || needsFilter ? selected.slice(0, 1) : selected;
  const presentedBytes = presented.reduce((total, result) => total + Buffer.byteLength(JSON.stringify(result)), 0);
  let status = 'matched';
  let diagnostic = { actions: [], bytes: 0 };
  const warnings = [];
  if (weakNarrative) {
    status = 'needs-anchor';
    diagnostic = anchorSuggestions(root, entries, queryTokens, options);
    warnings.push('query matched only broad body text; retry one suggested stable anchor before reading evidence');
  } else if (!filtered.length && options.anchor) {
    status = 'retrieval-defect';
    warnings.push('confirmed anchor has no deterministic match; use the smallest routed source fallback and repair retrieval');
  } else if (!filtered.length) {
    status = 'needs-anchor';
    diagnostic = anchorSuggestions(root, entries, queryTokens, options);
    warnings.push(diagnostic.actions.length ? 'retry one suggested stable anchor; source fallback is not allowed' : 'retry one stable product anchor with --anchor; source fallback is not allowed');
  } else if (needsFilter) {
    status = 'needs-filter';
    diagnostic = filterSuggestions(filtered, query, options);
    warnings.push(`refine query: ${filtered.length} matches exceed the selected result budget`);
  }
  const payload = {
    schema_version: 2,
    query: { kind: 'search', text: query, anchor: Boolean(options.anchor) },
    status,
    results: weakNarrative ? [] : presented,
    next_actions: diagnostic.actions,
    fallback: {
      allowed: status === 'retrieval-defect',
      reason: status === 'retrieval-defect' ? 'confirmed retrieval defect' : null,
    },
    limits: { max_results: maxResults, max_bytes: maxBytes, evidence_bytes: weakNarrative ? 0 : presentedBytes || bytes, diagnostic_bytes: diagnostic.bytes, returned_bytes: 0 },
    warnings,
  };
  return fitPayload(payload, maxBytes);
}

export function searchTextLines(result) {
  const output = [`status: ${result.status}`];
  result.results.forEach(item => {
    if (item.source) output.push(`evidence: ${item.path}:${item.lines[0]} -> ${item.source.source_path}:${item.source.source_line} · ${item.source.symbol}`, `read: ${item.source.read.command.display}`);
    else output.push(`evidence: ${item.path}${item.lines ? `:${item.lines[0]}-${item.lines[1]}` : ''} · ${item.title}`);
  });
  result.next_actions.forEach(action => output.push(`next: ${action.command.display}`));
  result.warnings.forEach(warning => output.push(`! ${warning}`));
  output.push(`fallback: ${result.fallback.allowed ? result.fallback.reason : 'no'}`);
  return output;
}

function conceptLimit(options) {
  const maxBytes = Number(options.maxBytes || DEFAULT_CONCEPT_BYTES);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_CONCEPT_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${MAX_CONCEPT_BYTES}`);
  return maxBytes;
}

function conceptFailure(kind, input, status, reason, maxBytes) {
  const result = {
    schema_version: 1,
    query: { kind, text: input },
    status,
    reason,
    concept: null,
    fallback: { allowed: false, reason: null },
    limits: { max_bytes: maxBytes, returned_bytes: 0 },
  };
  measured(result);
  return result;
}

function relevantConceptError(registry, concept) {
  return registry.errors.find(error => error.concept_id === concept.id
    || (error.path === concept.owner.path && error.line >= concept.owner.metadata_lines[0]
      && error.line <= concept.owner.lines[1]));
}

function conceptIdentity(concept) {
  return {
    id: concept.id,
    domain: concept.domain,
    owner: {
      path: concept.owner.path,
      heading: concept.owner.heading,
      lines: concept.owner.lines,
    },
    aliases: concept.aliases,
  };
}

function sourceGrant(source) {
  return {
    path: source.path,
    anchor: source.anchor,
    line: source.line,
    kind: source.kind,
    read: {
      lines: source.read.lines,
      command: command(source.read.argv),
    },
  };
}

function fitConceptResult(result, maxBytes, kind, input) {
  if (measured(result) <= maxBytes) return result;
  return conceptFailure(kind, input, 'budget-exceeded', `concept response exceeds the ${maxBytes} byte limit`, maxBytes);
}

export function conceptRoute(root, input, options = {}) {
  const maxBytes = conceptLimit(options);
  const kind = 'concept-route';
  try {
    const registry = loadConceptRegistry({ root, kbRoot: options.kbRoot || 'KB' });
    const fatal = registry.errors.find(error => ['access-denied', 'tool-error'].includes(error.status));
    if (fatal && !registry.concepts.length) return conceptFailure(kind, input, fatal.status, fatal.message, maxBytes);
    const match = conceptForInput(registry, input);
    if (match.status !== 'matched') return conceptFailure(kind, input, match.status, match.message, maxBytes);
    const conceptError = relevantConceptError(registry, match.concept);
    if (conceptError) return conceptFailure(kind, input, conceptError.status, conceptError.message, maxBytes);
    if (!match.concept.sources.length)
      return conceptFailure(kind, input, 'concept-unmapped', `concept '${match.concept.id}' has no source grant`, maxBytes);
    const sources = match.concept.sources.map(source => resolveConceptSource(registry.root, source));
    const sourceError = sources.find(source => source.status !== 'resolved');
    if (sourceError) return conceptFailure(kind, input, sourceError.status, sourceError.message, maxBytes);
    const map = readConceptMapSection(registry, match.concept);
    if (map.status !== 'matched') return conceptFailure(kind, input, map.status, map.message, maxBytes);
    const result = {
      schema_version: 1,
      query: { kind, text: input, resolution: match.resolution },
      status: 'matched',
      reason: null,
      concept: conceptIdentity(match.concept),
      map,
      sources: sources.map(sourceGrant),
      adjacent: match.concept.adjacent.map(id => ({
        id,
        loaded: false,
        command: contextCommand(['concept-route', id]),
      })),
      fallback: { allowed: false, reason: null },
      limits: { max_bytes: maxBytes, returned_bytes: 0 },
    };
    return fitConceptResult(result, maxBytes, kind, input);
  } catch (error) {
    return conceptFailure(kind, input, 'tool-error', error.message, maxBytes);
  }
}

export function conceptRead(root, input, options = {}) {
  const maxBytes = conceptLimit(options);
  const kind = 'concept-read';
  const route = conceptRoute(root, input, { ...options, maxBytes });
  if (route.status !== 'matched') return conceptFailure(kind, input, route.status, route.reason, maxBytes);
  try {
    const registry = loadConceptRegistry({ root, kbRoot: options.kbRoot || 'KB' });
    const concept = registry.by_id.get(route.concept.id)?.[0];
    if (!concept) return conceptFailure(kind, input, 'section-missing', `concept prose is missing for '${route.concept.id}'`, maxBytes);
    const proseBytes = Buffer.byteLength(concept.section);
    if (proseBytes > CONCEPT_SECTION_HARD_BYTES)
      return conceptFailure(kind, input, 'budget-exceeded', `concept prose exceeds the ${CONCEPT_SECTION_HARD_BYTES} byte section limit`, maxBytes);
    const result = {
      ...route,
      query: { ...route.query, kind },
      prose: {
        path: concept.owner.path,
        heading: concept.owner.heading,
        lines: concept.owner.lines,
        text: concept.section,
        bytes: proseBytes,
      },
    };
    return fitConceptResult(result, maxBytes, kind, input);
  } catch (error) {
    return conceptFailure(kind, input, 'tool-error', error.message, maxBytes);
  }
}

export function conceptTextLines(result) {
  const output = [`status: ${result.status}`];
  if (result.reason) output.push(`reason: ${result.reason}`);
  if (!result.concept) return [...output, 'fallback: no'];
  output.push(`concept: ${result.concept.id}`, `owner: ${result.concept.owner.path}:${result.concept.owner.lines[0]}-${result.concept.owner.lines[1]} · ${result.concept.owner.heading}`);
  if (result.prose) output.push(`prose: ${result.prose.path}:${result.prose.lines[0]}-${result.prose.lines[1]} (${result.prose.bytes} bytes)`);
  if (result.map) output.push(`map: ${result.map.path}:${result.map.lines[0]}-${result.map.lines[1]}`);
  for (const source of result.sources || []) output.push(`source: ${source.path}:${source.line} · ${source.anchor}`, `read: ${source.read.command.display}`);
  for (const adjacent of result.adjacent || []) output.push(`adjacent: ${adjacent.id} (not loaded)`, `next: ${adjacent.command.display}`);
  output.push('fallback: no');
  return output;
}

export function conceptBundle(root, input, options = {}) {
  const maxBytes = conceptLimit(options);
  const kind = 'concept-bundle';
  const read = conceptRead(root, input, { ...options, maxBytes: MAX_CONCEPT_BYTES });
  if (read.status !== 'matched') return conceptFailure(kind, input, read.status, read.reason, maxBytes);
  const provenance = [
    { kind: 'prose', path: read.prose.path, lines: read.prose.lines },
    { kind: 'concept-map', path: read.map.path, lines: read.map.lines },
    ...read.sources.map(source => ({ kind: 'source-grant', path: source.path, anchor: source.anchor, line: source.line, read: source.read.lines })),
  ];
  const lines = [
    '# Concept bundle',
    '',
    `Query: ${input}`,
    `Canonical concept: ${read.concept.id} (${read.query.resolution})`,
    '',
    '## Concept prose',
    '',
    `Source: ${read.prose.path}:${read.prose.lines[0]}-${read.prose.lines[1]}`,
    '',
    read.prose.text,
    '',
    '## Source grants',
    '',
    ...read.sources.flatMap(source => [
      `- ${source.path}#${source.anchor} (line ${source.line})`,
      `  Read: ${source.read.command.display}`,
    ]),
    '',
    '## Adjacent concepts (not loaded)',
    '',
    ...(read.adjacent.length ? read.adjacent.map(adjacent => `- ${adjacent.id} (not loaded) — ${adjacent.command.display}`) : ['- none']),
    '',
    '## Provenance',
    '',
    ...provenance.map(item => `- ${item.kind}: ${item.path}${item.lines ? `:${item.lines[0]}-${item.lines[1]}` : item.line ? `:${item.line}` : ''}${item.anchor ? `#${item.anchor}` : ''}`),
    '',
    '## Retrieval limits',
  ];
  let bundle = '';
  let bytes = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    bundle = [...lines, '', `- Bytes: ${bytes}/${maxBytes}`, '- Adjacent concepts loaded: 0'].join('\n').trimEnd() + '\n';
    const next = Buffer.byteLength(bundle);
    if (next === bytes) break;
    bytes = next;
  }
  if (bytes > maxBytes)
    return conceptFailure(kind, input, 'budget-exceeded', `concept bundle exceeds the ${maxBytes} byte limit`, maxBytes);
  return {
    schema_version: 1,
    query: { ...read.query, kind },
    status: 'matched',
    reason: null,
    concept: read.concept,
    bundle,
    provenance,
    adjacent: read.adjacent,
    fallback: { allowed: false, reason: null },
    limits: { max_bytes: maxBytes, returned_bytes: bytes },
  };
}

export function scopeContext(paths, options = {}) {
  if (!paths.length) throw new Error('scope needs one or more explicit task-owned paths');
  const changed = [...new Set(paths.map(path => path.replace(/^\.\//, '')))].sort();
  const routes = changed.map(path => ({ path, route: routeSourcePath(path) }));
  const docs = [...new Set(routes.flatMap(({ route }) => route?.docs || []).map(doc => doc.startsWith('site/') ? doc : `docs/context/${doc}`))].sort();
  const maps = [...new Set(changed.map(mapOwnerForPath).filter(Boolean).map(map => `docs/context/map/${map}`))].sort();
  const qa = selectQa(changed);
  const tools = [{ name: 'QA', command: command(['node', 'scripts/qa-gate.mjs', '--changed', ...changed]) }];
  if (qa.concept_kb) {
    tools.push({ name: 'concept map', command: command(['node', 'scripts/build-concept-map.mjs', '--quiet']) });
    tools.push({ name: 'concept KB', command: command(['node', 'scripts/validate-concept-kb.mjs', '--quiet']) });
    tools.push({ name: 'concept benchmark', command: command(['node', 'scripts/benchmark-rag.mjs', '--concept-check']) });
  }
  if (qa.tooling_tests.length) {
    tools.push({ name: 'automation protocol', command: command(['node', '--test', ...AUTOMATION_PROTOCOL_TESTS]) });
    tools.push({ name: 'retrieval benchmark', command: command(['node', 'scripts/benchmark-rag.mjs', '--check']) });
  }
  if (maps.length) tools.push({ name: 'file map', command: command(['node', 'scripts/build-file-map.mjs']) });
  if (maps.length || docs.some(path => path.startsWith('docs/context/')) || changed.some(path => path.startsWith('docs/context/')))
    tools.push({ name: 'game KB', command: command(['node', 'scripts/validate-docs.mjs']) });
  if (docs.some(path => path.startsWith('site/docs/')) || changed.some(path => path.startsWith('site/')))
    tools.push({ name: 'site KB', command: command(['npm', 'run', 'docs:check', '--prefix', 'site']) });
  const maxBytes = options.artifact ? MAX_BYTES : 8 * 1024;
  const result = {
    schema_version: 2,
    task_paths: changed,
    routes: routes.map(({ path, route }) => ({ path, skill: route?.skill || null,
      docs: (route?.docs || []).map(doc => doc.startsWith('site/') ? doc : `docs/context/${doc}`),
      map: route?.map ? `docs/context/map/${route.map}` : null, read: route?.read || null })),
    docs, maps, qa, tools,
    unmapped: routes.filter(({ route }) => !route).map(({ path }) => path),
    limits: { max_bytes: maxBytes, returned_bytes: 0 },
  };
  if (measured(result) > result.limits.max_bytes) throw new Error(`scope response exceeds ${result.limits.max_bytes} bytes; split the explicit path set`);
  return result;
}

export function scopeTextLines(result) {
  const qaSummary = result.qa.runtime_applies ? 'runtime QA applies'
    : result.qa.tooling_tests.length ? 'tooling QA applies'
      : result.qa.contract_tests.length ? 'contract QA applies'
      : 'no runtime QA applies';
  const output = [`paths: ${result.task_paths.join(', ')}`,
    `docs: ${result.docs.length ? result.docs.join(', ') : 'none'}`,
    `maps: ${result.maps.length ? result.maps.join(', ') : 'none'}`,
    `qa: ${qaSummary}`,
    ...result.tools.map(tool => `tool: ${tool.name} — ${tool.command.display}`)];
  if (result.unmapped.length) output.push(`unmapped: ${result.unmapped.join(', ')}`);
  return output;
}

function selectedText(root, result) {
  if (result.kind === 'section') {
    const section = documentSection(root, result.path, result.title, MAX_SECTION_BYTES);
    return section.text;
  }
  if (result.kind === 'symbol') {
    const file = resolveDocument(root, result.path, true);
    return readFileSync(file, 'utf8').split(/\r?\n/)[result.lines[0] - 1] || '';
  }
  return '';
}

export function contextBundle(root, task, options = {}) {
  const maxBytes = Number(options.maxBytes || DEFAULT_BUNDLE_BYTES);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > MAX_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${MAX_BYTES}`);
  const search = searchContext(root, task, { ...options, maxBytes: Math.max(maxBytes, DEFAULT_MAX_BYTES) });
  const lines = ['# Context bundle', '', `## Task`, task, '', '## Selected evidence'];
  const included = [];
  const trailer = (items, reportedBytes = 'pending') => [
    '## Provenance',
    ...items.map(result => `- ${result.path}${result.lines ? `:${result.lines[0]}-${result.lines[1]}` : ''}`),
    '',
    '## Retrieval limits',
    `- Results: ${items.length}/${search.results.length}`,
    `- Bytes: ${reportedBytes}/${maxBytes}`,
    ...(search.warnings.length ? ['', '## Warnings', ...search.warnings.map(warning => `- ${warning}`)] : []),
  ];
  for (const result of search.results) {
    const text = selectedText(root, result);
    const block = [`### ${result.title}`, `Source: ${result.path}${result.lines ? `:${result.lines[0]}-${result.lines[1]}` : ''}`, '', text || result.reason, ''].join('\n');
    if (Buffer.byteLength([...lines, block, ...trailer([...included, result])].join('\n')) > maxBytes) break;
    lines.push(block);
    included.push(result);
  }
  let assembled = '';
  let bytes = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    assembled = [...lines, ...trailer(included, bytes)].join('\n').trimEnd() + '\n';
    const next = Buffer.byteLength(assembled);
    if (next === bytes) break;
    bytes = next;
  }
  return {
    ...search,
    results: included,
    limits: { ...search.limits, returned_bytes: bytes },
    bundle: assembled,
  };
}
