import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  assetFilenames,
  collectAssetCandidates,
  createExportManifest,
  createPackageFiles,
  DEFAULT_PNG_SCALE,
  isPngScale,
  validateRootSelection,
} from '../figma-ui-exporter/dist/core.cjs';

const root = {
  id: '1:1',
  name: 'Private Lobby',
  type: 'FRAME',
  width: 1440,
  height: 900,
  children: [],
};

test('sanitizes filenames and resolves duplicate asset names with stable node-ID suffixes', () => {
  assert.deepEqual(assetFilenames([
    { id: '3:9', name: '../Logo' },
    { id: '1:2', name: 'Logo' },
    { id: '2:1', name: 'User avatar' },
  ]), [
    { id: '1:2', name: 'Logo', filename: 'assets/logo--node-00003100003a000032.png' },
    { id: '2:1', name: 'User avatar', filename: 'assets/user-avatar.png' },
    { id: '3:9', name: '../Logo', filename: 'assets/logo--node-00003300003a000039.png' },
  ]);
});

test('accepts only the Phase 1 PNG scales and defaults are represented by 4x', () => {
  assert.equal(DEFAULT_PNG_SCALE, 4);
  assert.equal(isPngScale(4), true);
  assert.deepEqual([1, 2, 3, 4].map(isPngScale), [true, true, true, true]);
  assert.equal(isPngScale(5), false);
  assert.equal(isPngScale('4'), false);
});

test('requires exactly one selected root FRAME', () => {
  assert.equal(validateRootSelection([]).ok, false);
  assert.equal(validateRootSelection([root, root]).ok, false);
  assert.equal(validateRootSelection([{ ...root, type: 'GROUP' }]).ok, false);
  assert.deepEqual(validateRootSelection([root]), { ok: true, node: root });
});

test('detects conservative asset candidates while excluding hidden and ordinary layout nodes', () => {
  const candidates = collectAssetCandidates({
    ...root,
    children: [
      { id: '1:2', name: 'Logo', type: 'VECTOR', width: 32, height: 32 },
      { id: '1:3', name: 'Hero', type: 'RECTANGLE', width: 100, height: 50, fills: [{ type: 'IMAGE' }] },
      { id: '1:4', name: '[asset] Bracket', type: 'FRAME', width: 12, height: 12 },
      { id: '1:5', name: 'Hidden vector', type: 'VECTOR', width: 12, height: 12, visible: false },
      { id: '1:6', name: 'Background', type: 'FRAME', width: 100, height: 100 },
      { id: '1:7', name: 'Hidden parent', type: 'FRAME', width: 100, height: 100, visible: false, children: [
        { id: '1:8', name: 'Nested vector', type: 'VECTOR', width: 12, height: 12 },
      ] },
    ],
  });
  assert.deepEqual(candidates.map(candidate => [candidate.node.id, candidate.reason]), [
    ['1:2', 'vector'],
    ['1:3', 'image_fill'],
    ['1:4', 'explicit_asset_tag'],
  ]);
});

test('constructs a stable manifest that preserves Figma IDs and sorted asset entries', () => {
  const manifest = createExportManifest({
    pluginVersion: '0.1.0',
    root,
    scale: 4,
    candidates: [
      { node: { id: '2:5', name: 'Logo', type: 'VECTOR', width: 60, height: 60 }, reason: 'vector' },
      { node: { id: '1:3', name: 'Logo', type: 'VECTOR', width: 30, height: 30 }, reason: 'vector' },
    ],
  });
  assert.equal(manifest.schema_version, 1);
  assert.equal(manifest.png_scale, 4);
  assert.equal(manifest.screen.node_id, '1:1');
  assert.deepEqual(manifest.assets.map(asset => asset.node_id), ['1:3', '2:5']);
  assert.deepEqual(manifest.assets.map(asset => asset.filename), [
    'assets/logo--node-00003100003a000033.png',
    'assets/logo--node-00003200003a000035.png',
  ]);
});

test('creates deterministic package file paths and rejects missing asset bytes', () => {
  const manifest = createExportManifest({
    pluginVersion: '0.1.0',
    root,
    scale: 4,
    candidates: [{ node: { id: '1:9', name: 'Logo', type: 'VECTOR', width: 30, height: 30 }, reason: 'vector' }],
  });
  const files = createPackageFiles({
    manifest,
    raw: { document: { id: '1:1' } },
    referencePng: Uint8Array.from([4]),
    assets: [{ node_id: '1:9', bytes: Uint8Array.from([9]) }],
  });
  assert.deepEqual(files.map(file => file.path), [
    'PrivateLobby/assets/logo.png',
    'PrivateLobby/export-manifest.json',
    'PrivateLobby/figma.raw.json',
    'PrivateLobby/reference.png',
  ]);
  assert.throws(() => createPackageFiles({ ...{
    manifest,
    raw: {},
    referencePng: Uint8Array.from([4]),
  }, assets: [] }), /Missing PNG bytes/);
});

test('keeps the development-plugin manifest dynamic-page and offline-only', async () => {
  const manifest = JSON.parse(await readFile(new URL('../figma-ui-exporter/manifest.template.json', import.meta.url), 'utf8'));
  assert.deepEqual(manifest.editorType, ['figma']);
  assert.equal(manifest.documentAccess, 'dynamic-page');
  assert.deepEqual(manifest.networkAccess.allowedDomains, ['none']);
});
