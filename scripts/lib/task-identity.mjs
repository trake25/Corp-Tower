import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const IGNORED_WORDS = new Set([
  'a', 'an', 'and', 'as', 'add', 'build', 'by', 'change', 'create', 'enable',
  'fix', 'for', 'from', 'implement', 'improve', 'in', 'into', 'make', 'of',
  'on', 'or', 'refactor', 'remove', 'the', 'to', 'update', 'use', 'with',
]);

function escaped(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function versionUnits(value) {
  const match = /^(\d+)\.(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error(`invalid task identity version: ${value}`);
  const units = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(units)) throw new Error(`task identity version is too large: ${value}`);
  return units;
}

function formattedVersion(units) {
  if (!Number.isSafeInteger(units) || units < 1) throw new Error('task identity version must be a positive integer hundredth');
  return `${Math.floor(units / 100)}.${String(units % 100).padStart(2, '0')}`;
}

function wordsFor(task) {
  const words = String(task || '').match(/[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*/g) || [];
  const selected = words.filter(word => !IGNORED_WORDS.has(word.toLowerCase())).slice(0, 3);
  if (!selected.length) throw new Error('task title does not provide identity keywords');
  return selected.map(word => `${word[0].toUpperCase()}${word.slice(1)}`);
}

export function taskIdentityBase(task) {
  const keywords = wordsFor(task);
  const keywordLabel = keywords.join(' ');
  const slug = keywords.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) throw new Error('task title does not provide an identity slug');
  return { keywords, keyword_label: keywordLabel, slug };
}

export function validateTaskIdentity(identity, task = null) {
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw new Error('task identity must be an object');
  const keywords = Array.isArray(identity.keywords) ? identity.keywords : [];
  if (!keywords.length || keywords.length > 3 || keywords.some(word => typeof word !== 'string' || !/^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/.test(word)))
    throw new Error('task identity keywords must contain one to three safe words');
  const keywordLabel = keywords.join(' ');
  const slug = keywords.join('-').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const version = formattedVersion(versionUnits(identity.version));
  const expected = {
    keywords,
    keyword_label: keywordLabel,
    slug,
    version,
    label: `${keywordLabel} v${version}`,
  };
  for (const [key, value] of Object.entries(expected)) {
    const actual = identity[key];
    if (Array.isArray(value) ? JSON.stringify(actual) !== JSON.stringify(value) : actual !== value)
      throw new Error(`task identity ${key} is inconsistent`);
  }
  if (task) {
    const base = taskIdentityBase(task);
    if (base.keyword_label !== keywordLabel || base.slug !== slug)
      throw new Error('task identity does not match the manifest task');
  }
  return expected;
}

function receiptVersionUnits(root, slug) {
  const directory = join(resolve(root), 'report', 'qa-receipts');
  if (!existsSync(directory)) return [];
  const pattern = new RegExp(`^qa-receipt-${escaped(slug)}-v(\\d+\\.\\d{2})\\.md$`);
  return readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => pattern.exec(entry.name)?.[1])
    .filter(Boolean)
    .map(versionUnits);
}

function subjectVersionUnits(subjects, keywordLabel) {
  const pattern = new RegExp(`^${escaped(keywordLabel)} v(\\d+\\.\\d{2})$`);
  return subjects.map(subject => pattern.exec(subject)?.[1]).filter(Boolean).map(versionUnits);
}

export function gitSubjects(root) {
  const output = execFileSync('git', ['-C', resolve(root), 'log', '--all', '--format=%s'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.split(/\r?\n/).filter(Boolean);
}

export function createTaskIdentity(task, { root = process.cwd(), subjects = null } = {}) {
  const base = taskIdentityBase(task);
  const history = subjects === null ? gitSubjects(root) : [...subjects];
  const highest = Math.max(0, ...receiptVersionUnits(root, base.slug), ...subjectVersionUnits(history, base.keyword_label));
  const version = formattedVersion(highest + 1);
  return {
    ...base,
    version,
    label: `${base.keyword_label} v${version}`,
  };
}

export function taskIdentityForManifest(manifest, options = {}) {
  if (!manifest?.task) throw new Error('manifest must contain a task');
  if (manifest.task_identity) return validateTaskIdentity(manifest.task_identity, manifest.task);
  return createTaskIdentity(manifest.task, options);
}
