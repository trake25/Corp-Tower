import assert from 'node:assert/strict';
import test from 'node:test';
import { extract } from '../build-file-map.mjs';

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
