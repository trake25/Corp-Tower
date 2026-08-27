import assert from 'node:assert/strict';
import test from 'node:test';
import { applyPinnedAnchors, extract, selectAnchors } from '../build-file-map.mjs';

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
