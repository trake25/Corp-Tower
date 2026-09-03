import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import test from 'node:test';
import { applyPinnedAnchors, extract, firstPartyFiles, isPrimaryAnchorReferencePath, selectAnchors } from '../build-file-map.mjs';

test('scene maps index the root and unique-name nodes only', () => {
  const scene = [
    '[gd_scene format=3]',
    '',
    '[node name="GameUI" type="Control"]',
    '',
    '[node name="PlayField" type="Control" parent="."]',
    'unique_name_in_owner = true',
    '',
    '[node name="OrdinaryChild" type="Control" parent="PlayField"]',
    '',
  ].join('\n');

  assert.deepEqual(extract('GameUI.tscn', scene).syms, [
    { ln: 3, name: 'GameUI', kind: 'scene root' },
    { ln: 5, name: '%PlayField', kind: 'unique node' },
  ]);
});

test('instanced unique nodes are indexed without requiring a type field', () => {
  const scene = [
    '[gd_scene format=3]',
    '[node name="HudFeature" parent="." instance=ExtResource("1_feature")]',
    'unique_name_in_owner = true',
  ].join('\n');

  assert.deepEqual(extract('Feature.tscn', scene).syms, [
    { ln: 2, name: 'HudFeature', kind: 'scene root' },
    { ln: 2, name: '%HudFeature', kind: 'unique node' },
  ]);
});

test('stable anchors keep public surfaces and cross-file references only', () => {
  const source = [
    'export class SummaryController {',
    '  showSummary() {',
    '  }',
    '  formatLabel() {',
    '  }',
    '}',
    'const LOCAL_DEFAULT = 3;',
  ].join('\n');
  const symbols = extract('SummaryController.js', source).syms;
  const files = [
    { rel: 'SummaryController.js', text: source },
    { rel: 'Screen.js', text: 'controller.showSummary();' },
  ];

  assert.deepEqual(selectAnchors('SummaryController.js', symbols, files), [
    { ln: 1, name: 'SummaryController', kind: 'class' },
    { ln: 2, name: 'showSummary', kind: 'method' },
  ]);
});

test('cross-file payload keys remain stable anchors', () => {
  const source = 'var status: Variant = summary.get("failureStatus", {})';
  const symbols = applyPinnedAnchors(
    'SummaryController.gd',
    source,
    extract('SummaryController.gd', source).syms,
    new Set(['SummaryController.gd#failureStatus']),
  );
  const files = [
    { rel: 'SummaryController.gd', text: source },
  ];

  assert.deepEqual(selectAnchors('SummaryController.gd', symbols, files), [
    { ln: 1, name: 'failureStatus', kind: 'stable' },
  ]);
});

test('an authored pin promotes an extracted internal helper to a stable anchor', () => {
  const source = 'function retrievalAliases() {}';
  const symbols = applyPinnedAnchors(
    'context-query.mjs',
    source,
    extract('context-query.mjs', source).syms,
    new Set(['context-query.mjs#retrievalAliases']),
  );

  assert.deepEqual(selectAnchors('context-query.mjs', symbols, [{ rel: 'context-query.mjs', text: source }]), [
    { ln: 1, name: 'retrievalAliases', kind: 'stable' },
  ]);
});

test('scene anchors omit unique nodes with no external binding', () => {
  const scene = [
    '[node name="LevelSummary" type="Control"]',
    '[node name="RequiredLabel" type="Label" parent="."]',
    'unique_name_in_owner = true',
    '[node name="DecorativeLabel" type="Label" parent="."]',
    'unique_name_in_owner = true',
  ].join('\n');
  const symbols = extract('LevelSummary.tscn', scene).syms;
  const files = [
    { rel: 'LevelSummary.tscn', text: scene },
    { rel: 'LevelSummaryController.gd', text: 'get_node("%RequiredLabel")' },
  ];

  assert.deepEqual(selectAnchors('LevelSummary.tscn', symbols, files), [
    { ln: 1, name: 'LevelSummary', kind: 'scene root' },
    { ln: 2, name: '%RequiredLabel', kind: 'unique node' },
  ]);
});

test('experimental data cannot promote primary anchors while ordinary first-party source can', () => {
  const source = [
    'export class StabilityPreview {',
    '  previewOnlyAnchor() {',
    '  }',
    '}',
  ].join('\n');
  const symbols = extract('src/Server/app/StabilityPreview.js', source).syms;
  const experimentalOnly = [
    { rel: 'src/Server/app/StabilityPreview.js', text: source },
    { rel: 'KB/docs/context/gameplay.md', text: 'previewOnlyAnchor' },
    { rel: 'scripts/fixtures/concept-retrieval.json', text: 'previewOnlyAnchor' },
    { rel: 'scripts/tests/concept-kb.test.mjs', text: 'previewOnlyAnchor' },
    { rel: '.agent-state/automation/rag-benchmark/kb-context/latest.json', text: 'previewOnlyAnchor' },
    { rel: 'report/benchmarks/kb-context/kb-context-calibration-v001.md', text: 'previewOnlyAnchor' },
  ];

  assert.deepEqual(selectAnchors('src/Server/app/StabilityPreview.js', symbols, experimentalOnly), [
    { ln: 1, name: 'StabilityPreview', kind: 'class' },
  ]);
  assert.deepEqual(selectAnchors('src/Server/app/StabilityPreview.js', symbols, [
    ...experimentalOnly,
    { rel: 'scripts/ordinary-primary-tool.mjs', text: 'engine.previewOnlyAnchor();' },
  ]), [
    { ln: 1, name: 'StabilityPreview', kind: 'class' },
    { ln: 2, name: 'previewOnlyAnchor', kind: 'method' },
  ]);
  assert.equal(isPrimaryAnchorReferencePath('scripts/lib/kb-calibration.mjs'), false);
  assert.equal(isPrimaryAnchorReferencePath('scripts/tests/kb-calibration.test.mjs'), false);
  assert.equal(isPrimaryAnchorReferencePath('KB/docs/context/gameplay.md'), false);
  assert.equal(isPrimaryAnchorReferencePath('report/benchmarks/kb-context/example.md'), false);
  assert.ok(firstPartyFiles(resolve('.')).some(file => file.rel === 'scripts/lib/kb-calibration.mjs'));
});
