import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const TUTORIAL_DEFAULT_KEYS = Object.freeze([
  'level',
  'target_height',
  'grid_width',
  'site_width',
  'placeable_min',
  'placeable_max',
  'hand_slots_level_1',
  'hand_slots_level_3',
  'placement_cooldown_ms',
  'level_time_limit_ms',
  'impact_min_contribution_share',
  'impact_requirement_score',
  'impact_interval',
  'power_unlock_level',
]);

function scalar(value, key) {
  const normalized = value.trim().replace(/,$/, '').trim();
  if (/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return Number(normalized);
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  if (normalized === 'null') return null;
  if (/^"(?:[^"\\]|\\.)*"$/.test(normalized)) return JSON.parse(normalized);
  throw new Error(`Tutorial DEFAULTS.${key} must remain a scalar literal`);
}

export function parseTutorialDefaults(source) {
  const match = source.match(/^const DEFAULTS := \{\n([\s\S]*?)^\}/m);
  if (!match) throw new Error('TutorialLessons.DEFAULTS literal map was not found');
  const values = {};

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim()) continue;
    const entry = line.match(/^\s*"([^"]+)":\s*(.+)$/);
    if (!entry) throw new Error(`TutorialLessons.DEFAULTS contains an unsupported entry: ${line.trim()}`);
    values[entry[1]] = scalar(entry[2], entry[1]);
  }

  return values;
}

export function authoritativeTutorialDefaults({ GameConfig, createEngine }) {
  const engine = createEngine();
  const openingLevel = engine.getConfiguredStartLevel();
  const targetHeight = engine.getTargetHeightForLevel(openingLevel);
  const playerCount = Math.max(1, Number(GameConfig.playersPerRoom) || 1);
  engine.room = {
    level: openingLevel,
    impactLevel: openingLevel,
    targetHeight,
    players: Array.from({ length: playerCount }, (_, index) => ({ id: `tutorial-parity-${index}` })),
  };
  const placeable = engine.getPlaceableColumnRange();
  const siteWidth = engine.getSiteWidthForHeight(targetHeight);
  engine.room.level = 1;
  const levelOneSlots = engine.getBlocksPerPlayer();
  engine.room.level = 3;
  const levelThreeSlots = engine.getBlocksPerPlayer();
  engine.room.level = openingLevel;
  const firstImpactLevel = engine.getNextImpactLevel();

  return {
    level: openingLevel,
    target_height: targetHeight,
    grid_width: Math.max(1, Number(GameConfig.towerGridWidth) || 1),
    site_width: siteWidth,
    placeable_min: placeable.min,
    placeable_max: placeable.max,
    hand_slots_level_1: levelOneSlots,
    hand_slots_level_3: levelThreeSlots,
    placement_cooldown_ms: GameConfig.placementCooldown,
    level_time_limit_ms: GameConfig.levelTimeLimitMs,
    impact_min_contribution_share: engine.getImpactMinContributionShare(),
    impact_requirement_score: engine.getImpactBandScoreRequirement(firstImpactLevel),
    impact_interval: Math.max(1, Math.floor(Number(GameConfig.impactInterval) || 1)),
    power_unlock_level: GameConfig.powerUnlockLevel,
  };
}

export function compareTutorialDefaults(copied, authoritative) {
  return TUTORIAL_DEFAULT_KEYS.flatMap(key => copied[key] === authoritative[key] ? [] : [{
    tutorial_key: key,
    authoritative_value: authoritative[key],
    copied_value: copied[key],
  }]);
}

export function formatTutorialDefaultMismatches(mismatches) {
  return mismatches.map(item =>
    `${item.tutorial_key}: authoritative=${JSON.stringify(item.authoritative_value)} copied=${JSON.stringify(item.copied_value)}`
  ).join('; ');
}

export function tutorialDefaultsParity({ root = REPOSITORY_ROOT, GameConfig = null, createEngine = null } = {}) {
  const config = GameConfig || require(resolve(root, 'src/Server/app/Game_Config.js'));
  const Engine = createEngine ? null : require(resolve(root, 'src/Server/app/Game_Engine.js'));
  const copied = parseTutorialDefaults(readFileSync(
    resolve(root, 'src/Client/App/corp-tower/Cor/Scripts/GameUi/Tutorial/TutorialLessons.gd'),
    'utf8',
  ));
  const authoritative = authoritativeTutorialDefaults({
    GameConfig: config,
    createEngine: createEngine || (() => new Engine()),
  });
  return { copied, authoritative, mismatches: compareTutorialDefaults(copied, authoritative) };
}
