#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AREA_ALIASES, MAP_AREAS, ROUTE_RULES } from './lib/context-routing.mjs';
import { skillMirrorDrift } from './sync-agent-skills.mjs';

const ROOT = resolve(process.argv[2] || '.');
const SKILLS = join(ROOT, '.agents/skills');
const errors = [];
const expected = ['client-engineer', 'compact-docs', 'docs-steward', 'editorial', 'fullstack-coordinator', 'infra-engineer', 'qa-engineer', 'server-engineer', 'update-docs', 'web-designer'];

const skillNames = existsSync(SKILLS) ? readdirSync(SKILLS, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort() : [];
if (skillNames.join('\n') !== expected.join('\n')) errors.push(`canonical skills differ: expected ${expected.join(', ')}; found ${skillNames.join(', ')}`);

for (const name of skillNames) {
  const file = join(SKILLS, name, 'SKILL.md');
  if (!existsSync(file)) { errors.push(`${name}: missing SKILL.md`); continue; }
  const body = readFileSync(file, 'utf8');
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(body)?.[1] || '';
  if (!new RegExp(`^name:\\s*["']?${name}["']?\\s*$`, 'm').test(frontmatter)) errors.push(`${name}: frontmatter name must match directory`);
  if (!/^description:\s*\S/m.test(frontmatter)) errors.push(`${name}: missing frontmatter description`);
  for (const forbidden of [/\bRead\s*\(/, /\bGrep\s*\(/, /docs\/context\/map\/ui\.md/, /\.claude\/commands\//])
    if (forbidden.test(body)) errors.push(`${name}: vendor-specific or stale instruction matches ${forbidden}`);
  for (const match of body.matchAll(/\[[^\]]+\]\(([^)#]+)(?:#[^)]+)?\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) errors.push(`${name}: broken reference ${target}`);
  }
}

for (const area of MAP_AREAS) if (!existsSync(join(ROOT, 'docs/context/map', area.out))) errors.push(`route target missing: docs/context/map/${area.out}`);
for (const route of ROUTE_RULES) {
  for (const doc of route.docs) {
    const target = doc.startsWith('site/') ? doc : `docs/context/${doc}`;
    if (!existsSync(join(ROOT, target))) errors.push(`route target missing: ${target}`);
  }
  if (!expected.includes(route.skill)) errors.push(`route names unknown skill: ${route.skill}`);
}
for (const alias of Object.values(AREA_ALIASES)) {
  if (!expected.includes(alias.skill)) errors.push(`alias names unknown skill: ${alias.skill}`);
  for (const target of [...alias.docs, ...alias.maps]) if (!existsSync(join(ROOT, target))) errors.push(`alias target missing: ${target}`);
}

const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf8');
if (/\bRead\s*\(|\bGrep\s*\(|docs\/context\/map\/ui\.md|\.claude\/commands\//.test(agents)) errors.push('AGENTS.md contains a vendor-specific or stale route');
const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
if (!claude.startsWith('@AGENTS.md')) errors.push('CLAUDE.md must import canonical AGENTS.md first');

const mirrorDrift = skillMirrorDrift(ROOT);
if (mirrorDrift.length) errors.push(`.claude/skills mirror is out of sync: ${mirrorDrift.join(', ')}`);

if (errors.length) {
  errors.forEach(error => console.error(`error: ${error}`));
  console.error(`FAIL — ${errors.length} error(s)`);
  process.exit(1);
}
console.log(`PASS — ${skillNames.length} canonical skills, mirror and route targets valid`);
