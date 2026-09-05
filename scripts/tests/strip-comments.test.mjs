import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { productSourceFiles } from '../lib/product-source-inventory.mjs';
import { strip } from '../strip-comments.mjs';

test('product source inventory is deterministic and independent of retrieval maps', () => {
  const root = resolve('.');
  const files = productSourceFiles(root);

  assert.deepEqual(files, [...files].sort());
  assert.ok(files.includes('src/Server/app/Game_Config.js'));
  assert.ok(files.some(path => path.endsWith('/Cor/Scripts/Main.gd')));
  assert.ok(files.every(path => !path.startsWith('scripts/')));
  assert.ok(files.every(path => !path.includes('/Tests/')));
  assert.ok(files.every(path => !path.includes('/Cor/Art/')));
});

test('comment stripping preserves code-like strings and safety exceptions', () => {
  const source = [
    'const url = "https://example.test/path";',
    '// ordinary explanation',
    '// SAFETY EXCEPTION: retained guard',
    'const rule = /https?:\\/\\//;',
    'const value = 4; // trailing explanation',
  ].join('\n');
  const result = strip('src/Server/app/example.js', source);

  assert.match(result.text, /https:\/\/example\.test/);
  assert.match(result.text, /SAFETY EXCEPTION: retained guard/);
  assert.match(result.text, /\/https\?:\\\/\\\//);
  assert.match(result.text, /const value = 4;/);
  assert.doesNotMatch(result.text, /ordinary explanation|trailing explanation/);
});
