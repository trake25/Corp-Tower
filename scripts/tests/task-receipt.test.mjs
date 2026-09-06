import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { writeStandaloneTaskReceipt } from '../task-receipt.mjs';

const IDENTITY = {
  keywords: ['Standalone', 'Receipt'],
  keyword_label: 'Standalone Receipt',
  slug: 'standalone-receipt',
  version: '0.01',
  label: 'Standalone Receipt v0.01',
};

test('standalone receipt writes only explicit sanitized scope and states skipped QA', t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-receipt-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts/example.mjs'), 'export const example = true;\n');
  const result = writeStandaloneTaskReceipt({
    root,
    task: 'Standalone receipt',
    identity: IDENTITY,
    scopePaths: ['scripts/example.mjs'],
    verificationStatus: 'passed',
    evidence: [{ name: 'Focused test', status: 'passed', summary: 'PASS — focused proof.' }],
  });
  const receipt = readFileSync(join(root, result.receipt), 'utf8');
  assert.match(receipt, /scripts\/example\.mjs/);
  assert.match(receipt, /Executable QA: NOT RUN — disabled by task process control/);
  assert.doesNotMatch(receipt, /task-close\.mjs/);
});

test('standalone receipt rejects raw or non-maintenance blocked evidence', t => {
  const root = mkdtempSync(join(tmpdir(), 'corp-task-receipt-invalid-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  writeFileSync(join(root, 'scripts/example.mjs'), 'export const example = true;\n');
  assert.throws(() => writeStandaloneTaskReceipt({
    root,
    task: 'Standalone receipt',
    identity: IDENTITY,
    scopePaths: ['scripts/example.mjs'],
    verificationStatus: 'maintenance-blocked',
    evidence: [{ name: 'Focused test', status: 'maintenance-blocked', summary: 'blocked' }],
  }), /maintenance classification/);
});
