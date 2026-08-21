#!/usr/bin/env node
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

function files(root, dir = root) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(root, path) : [relative(root, path).replaceAll('\\', '/')];
  }).sort();
}

function compare(left, right) {
  const leftFiles = files(left);
  const rightFiles = files(right);
  const names = [...new Set([...leftFiles, ...rightFiles])].sort();
  return names.filter(name => !leftFiles.includes(name) || !rightFiles.includes(name) || readFileSync(join(left, name)).compare(readFileSync(join(right, name))) !== 0);
}

export function skillMirrorDrift(root) {
  return compare(join(root, '.agents/skills'), join(root, '.claude/skills'));
}

function main() {
  const root = resolve(process.argv.find((arg, index) => index > 1 && !arg.startsWith('-')) || '.');
  const check = process.argv.includes('--check');
  const source = join(root, '.agents/skills');
  const target = join(root, '.claude/skills');
  if (!existsSync(source)) {
    console.error('missing canonical .agents/skills tree');
    process.exit(1);
  }
  if (check) {
    const drift = skillMirrorDrift(root);
    if (drift.length) {
      console.error(`skill mirror drift (${drift.length}):`);
      drift.forEach(file => console.error(`  ${file}`));
      process.exit(1);
    }
    console.log('PASS — .claude/skills matches .agents/skills');
  } else {
    const temporary = mkdtempSync(join(tmpdir(), 'corp-tower-skills-'));
    cpSync(source, temporary, { recursive: true });
    rmSync(target, { recursive: true, force: true });
    cpSync(temporary, target, { recursive: true });
    rmSync(temporary, { recursive: true, force: true });
    console.log(`synced ${files(source).length} files to .claude/skills`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
