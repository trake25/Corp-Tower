import {
  CONCEPT_SECTION_HARD_BYTES,
  DEFAULT_CONCEPT_BYTES,
  MAX_CONCEPT_BYTES,
  conceptForInput,
  loadConceptRegistry,
  readConceptMapSection,
  resolveConceptSource,
} from './concept-kb.mjs';

export { DEFAULT_CONCEPT_BYTES, MAX_CONCEPT_BYTES };

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
  let bytes = 0;
  let output = '';
  for (let attempt = 0; attempt < 4; attempt++) {
    output = `${body}\nbytes: ${bytes}\n`;
    const next = Buffer.byteLength(output);
    if (next === bytes) break;
    bytes = next;
  }
  return { output, bytes };
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
  if (result.prose) output.push('', result.prose.text.trimEnd(), '');
  if (result.map && !result.prose) output.push(`map: ${result.map.path}:${result.map.lines[0]}-${result.map.lines[1]}`);
  for (const source of result.sources || []) output.push(`source: ${source.path}#${source.anchor} [${source.read.lines[0]}-${source.read.lines[1]}]`);
  for (const adjacent of result.adjacent || []) output.push(`adjacent: ${adjacent.id} (not loaded)`);
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
