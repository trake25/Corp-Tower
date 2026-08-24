import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { AREA_ALIASES, mapOwnerForPath, routeSourcePath } from './context-routing.mjs';
import { selectQa } from '../qa-gate.mjs';

export const DEFAULT_MAX_RESULTS = 8;
export const DEFAULT_MAX_BYTES = 24 * 1024;
const MAX_SECTION_BYTES = 12 * 1024;

const normalize = value => value.toLowerCase().replaceAll('\\', '/');
const tokens = value => [...new Set((normalize(value).match(/[a-z0-9_]+/g) || []).filter(token => token.length > 1))];
const relativePath = (root, file) => relative(root, file).replaceAll('\\', '/');

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

export function documentSection(root, input, query, maxBytes = MAX_SECTION_BYTES) {
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > DEFAULT_MAX_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${DEFAULT_MAX_BYTES}`);
  const file = resolveDocument(root, input);
  const requested = normalize(query);
  if (!requested) throw new Error('a heading is required');
  const sections = markdownSections(readFileSync(file, 'utf8'));
  const matches = sections.filter(item => normalize(item.heading) === requested || normalize(item.heading).includes(requested));
  if (matches.length !== 1) throw new Error(matches.length ? `heading is ambiguous (${matches.length} matches); use a longer query` : `heading not found: ${query}`);
  const match = matches[0];
  const text = readFileSync(file, 'utf8').split(/\r?\n/).slice(match.start - 1, match.end).join('\n');
  if (Buffer.byteLength(text) > maxBytes) throw new Error(`section exceeds ${maxBytes} byte limit; narrow the heading or raise --max-bytes up to ${DEFAULT_MAX_BYTES}`);
  return { path: relativePath(root, file), lines: [match.start, match.end], heading: match.heading, text };
}

export function mapSymbols(root, input, query, limit = DEFAULT_MAX_RESULTS) {
  if (!Number.isInteger(limit) || limit < 1 || limit > DEFAULT_MAX_RESULTS)
    throw new Error(`--max-results must be an integer from 1 to ${DEFAULT_MAX_RESULTS}`);
  const file = resolveDocument(root, input, true);
  const requested = normalize(query);
  if (!requested) throw new Error('a symbol query is required');
  const rows = readFileSync(file, 'utf8').split(/\r?\n/).map((line, index) => ({ line, number: index + 1 }))
    .filter(item => /^\|\s*[^|]+:\d+\s*\|/.test(item.line) && normalize(item.line).includes(requested));
  if (!rows.length) throw new Error(`no symbol rows match "${query}" in ${basename(file)}`);
  return {
    path: relativePath(root, file),
    rows: rows.slice(0, limit).map(item => ({ line: item.number, text: item.line })),
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

function aliases(root, queryTokens) {
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
  if (!exact && !allWords) return null;
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
  const aliasHits = relatedAliases.filter(alias => [alias.term, ...(alias.aliases || [])].flatMap(tokens).some(word => joined.includes(word)));
  if (aliasHits.length) {
    score += aliasHits.length * 10;
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
    if (required.length && !required.every(token => normalize(`${result.title}\n${result.excerpt || ''}\n${result.path}`).includes(token))) return false;
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
  if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > DEFAULT_MAX_RESULTS)
    throw new Error(`--max-results must be an integer from 1 to ${DEFAULT_MAX_RESULTS}`);
  if (!Number.isInteger(maxBytes) || maxBytes < 1024 || maxBytes > DEFAULT_MAX_BYTES)
    throw new Error(`--max-bytes must be an integer from 1024 to ${DEFAULT_MAX_BYTES}`);
  return { maxResults, maxBytes };
}

export function searchContext(root, query, options = {}) {
  const requested = normalize(query).trim();
  const queryTokens = tokens(requested);
  if (!queryTokens.length) throw new Error('search query needs at least one two-character term');
  const relatedAliases = aliases(root, queryTokens);
  const results = [];
  const exactArea = AREA_ALIASES[requested];
  if (exactArea) {
    for (const path of [...exactArea.docs, ...exactArea.maps]) results.push({
      kind: 'route', path, lines: null, title: `${requested} route`, score: 200,
      reason: 'exact route or area alias',
    });
  }
  for (const path of searchableDocuments(root)) {
    const file = resolve(root, path);
    const body = readFileSync(file, 'utf8');
    for (const section of markdownSections(body)) {
      const text = body.split(/\r?\n/).slice(section.start - 1, section.end).join('\n');
      const match = phraseScore({ title: section.heading, text, path, query: requested, queryTokens, kind: 'section', relatedAliases });
      if (!match) continue;
      results.push({
        kind: 'section', path, lines: [section.start, section.end], title: section.heading,
        score: match.score, reason: match.reason, excerpt: excerpt(text, queryTokens),
      });
    }
  }
  for (const path of searchableMaps(root)) {
    const file = resolve(root, path);
    readFileSync(file, 'utf8').split(/\r?\n/).forEach((line, index) => {
      if (!/^\|\s*[^|]+:\d+\s*\|/.test(line)) return;
      const cells = line.split('|').slice(1, -1).map(cell => cell.trim());
      const match = phraseScore({ title: cells[1] || '', text: line, path, query: requested, queryTokens, kind: 'symbol', relatedAliases });
      if (!match) return;
      results.push({
        kind: 'symbol', path, lines: [index + 1, index + 1], title: cells[1] || path,
        score: match.score, reason: match.reason, excerpt: line,
      });
    });
  }
  const filtered = constrained(results, options).sort((left, right) => right.score - left.score || left.path.localeCompare(right.path) || (left.lines?.[0] || 0) - (right.lines?.[0] || 0));
  const { maxResults, maxBytes } = limits(options);
  const { selected, bytes } = bounded(filtered, maxResults, maxBytes);
  const warnings = [];
  if (!selected.length) warnings.push('no deterministic match; refine the query or repair the KB alias/route');
  if (filtered.length > selected.length) warnings.push(`refine query: ${filtered.length} matches exceed the selected result budget`);
  return {
    schema_version: 1,
    query: { kind: 'search', text: query },
    results: selected,
    limits: { max_results: maxResults, max_bytes: maxBytes, returned_bytes: bytes },
    warnings,
  };
}

export function scopeContext(paths) {
  if (!paths.length) throw new Error('scope needs one or more explicit task-owned paths');
  const changed = [...new Set(paths.map(path => path.replace(/^\.\//, '')))].sort();
  const routes = changed.map(path => ({ path, route: routeSourcePath(path) }));
  const docs = [...new Set(routes.flatMap(({ route }) => route?.docs || []).map(doc => doc.startsWith('site/') ? doc : `docs/context/${doc}`))].sort();
  const maps = [...new Set(changed.map(mapOwnerForPath).filter(Boolean).map(map => `docs/context/map/${map}`))].sort();
  return {
    schema_version: 1,
    changed_paths: changed,
    routes: routes.map(({ path, route }) => ({ path, skill: route?.skill || null, docs: route?.docs || [], map: route?.map || null, read: route?.read || null })),
    docs,
    maps,
    qa: selectQa(changed),
    unmapped: routes.filter(({ route }) => !route).map(({ path }) => path),
  };
}

function selectedText(root, result) {
  if (result.kind === 'section') {
    const section = documentSection(root, result.path, result.title, MAX_SECTION_BYTES);
    return section.text;
  }
  if (result.kind === 'symbol') return result.excerpt;
  return '';
}

export function contextBundle(root, task, options = {}) {
  const search = searchContext(root, task, options);
  const maxBytes = Number(options.maxBytes || DEFAULT_MAX_BYTES);
  const lines = ['# Context bundle', '', `## Task`, task, '', '## Selected evidence'];
  const included = [];
  const trailer = items => [
    '## Provenance',
    ...items.map(result => `- ${result.path}${result.lines ? `:${result.lines[0]}-${result.lines[1]}` : ''}`),
    '',
    '## Retrieval limits',
    `- Results: ${items.length}/${search.results.length}`,
    `- Bytes: pending/${maxBytes}`,
    ...(search.warnings.length ? ['', '## Warnings', ...search.warnings.map(warning => `- ${warning}`)] : []),
  ];
  for (const result of search.results) {
    const text = selectedText(root, result);
    const block = [`### ${result.title}`, `Source: ${result.path}${result.lines ? `:${result.lines[0]}-${result.lines[1]}` : ''}`, '', text || result.reason, ''].join('\n');
    if (Buffer.byteLength([...lines, block, ...trailer([...included, result])].join('\n')) > maxBytes) break;
    lines.push(block);
    included.push(result);
  }
  const assembled = [...lines, ...trailer(included)].join('\n').trimEnd() + '\n';
  const bytes = Buffer.byteLength(assembled);
  return { ...search, results: included, bundle: assembled.replace('Bytes: pending/', `Bytes: ${bytes}/`) };
}
