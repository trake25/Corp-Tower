import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import test from 'node:test';
import {
  authoritativeTutorialDefaults,
  compareTutorialDefaults,
  formatTutorialDefaultMismatches,
  tutorialDefaultsParity,
} from '../lib/tutorial-defaults-parity.mjs';

const require = createRequire(import.meta.url);
const GameConfig = require(resolve('src/Server/app/Game_Config.js'));

test('tutorial defaults match current authoritative Level 1 behavior', () => {
  const result = tutorialDefaultsParity();
  assert.equal(result.mismatches.length, 0, formatTutorialDefaultMismatches(result.mismatches));
});

test('debugStartLevel does not alter canonical tutorial defaults', () => {
  const baseline = tutorialDefaultsParity();
  const changed = tutorialDefaultsParity({
    GameConfig: { ...GameConfig, debugStartLevel: Number(GameConfig.debugStartLevel) + 7 },
  });

  assert.deepEqual(changed.authoritative, baseline.authoritative);
  assert.deepEqual(changed.mismatches, []);
});

test('a server-side tuning fixture fails without changing a frozen expected number', () => {
  const result = tutorialDefaultsParity({
    GameConfig: { ...GameConfig, placementCooldown: Number(GameConfig.placementCooldown) + 1 },
  });
  assert.deepEqual(result.mismatches, [{
    tutorial_key: 'placement_cooldown_ms',
    authoritative_value: Number(GameConfig.placementCooldown) + 1,
    copied_value: result.copied.placement_cooldown_ms,
  }]);
});

test('a tutorial-side copied-value fixture fails against live authority', () => {
  const result = tutorialDefaultsParity();
  const copied = { ...result.copied, power_unlock_level: result.copied.power_unlock_level + 1 };
  assert.deepEqual(compareTutorialDefaults(copied, result.authoritative), [{
    tutorial_key: 'power_unlock_level',
    authoritative_value: result.authoritative.power_unlock_level,
    copied_value: copied.power_unlock_level,
  }]);
});

test('derived fields are obtained through authoritative engine behavior', () => {
  const calls = [];
  const room = {};
  const engine = {
    room,
    getConfiguredStartLevel: () => { throw new Error('debug start level is not tutorial authority'); },
    getTargetHeightForLevel: level => (calls.push(['target', level]), 44),
    getPlaceableColumnRange: () => (calls.push(['range', engine.room.targetHeight]), { min: 1, max: 6 }),
    getSiteWidthForHeight: height => (calls.push(['site', height]), 6),
    getBlocksPerPlayer: () => (calls.push(['slots', engine.room.level]), engine.room.level === 1 ? 2 : 5),
    getNextImpactLevel: () => (calls.push(['next-impact', engine.room.level]), 7),
    getImpactMinContributionShare: () => 0.4,
    getImpactBandScoreRequirement: level => (calls.push(['impact-requirement', level]), 777),
  };
  const authority = authoritativeTutorialDefaults({
    GameConfig: {
      debugStartLevel: 9,
      playersPerRoom: 3,
      towerGridWidth: 8,
      placementCooldown: 5,
      levelTimeLimitMs: 6,
      impactInterval: 3,
      powerUnlockLevel: 2,
    },
    createEngine: () => engine,
  });

  assert.equal(authority.level, 1);
  assert.equal(authority.target_height, 44);
  assert.equal(authority.site_width, 6);
  assert.deepEqual([authority.placeable_min, authority.placeable_max], [1, 6]);
  assert.deepEqual([authority.hand_slots_level_1, authority.hand_slots_level_3], [2, 5]);
  assert.equal(authority.impact_requirement_score, 777);
  assert.deepEqual(calls, [
    ['target', 1],
    ['range', 44],
    ['site', 44],
    ['slots', 1],
    ['slots', 3],
    ['next-impact', 1],
    ['impact-requirement', 7],
  ]);
});

test('parity failures identify the tutorial key and both values compactly', () => {
  assert.equal(formatTutorialDefaultMismatches([{
    tutorial_key: 'level_time_limit_ms',
    authoritative_value: 90000,
    copied_value: 60000,
  }]), 'level_time_limit_ms: authoritative=90000 copied=60000');
});
