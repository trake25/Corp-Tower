# Game Config

## Purpose
- Central runtime balance and debug tuning object.
- File: `src/Server/Game_Config.js`.

## Responsibilities
- Store game pacing values.
- Store block unlock/weight rules.
- Store fixed-orientation shape variants by block cell count.
- Store inventory and refresh-token limits.
- Store debug bot configuration.

## Key Logic
- Game settings:
  - `maxLevel`
  - `placementCooldown`
  - `targetHeightCurve`
  - `targetHeightMultiplier`
  - `startDelayMs`
  - `levelTimeLimitMs`
- Block settings:
  - `blockUnlockLevels`
  - `blockWeights`
  - `blockShapeVariants`
- Inventory settings:
  - `inventoryScaling`
  - `maxActiveBlocks`
- Draw pile settings:
  - `maxTeamCarryOverBlocks`
  - `minDrawPileBlocksAfterDeal`
  - `drawPileReserveScaling`
  - `levelSupplyMinSurplus`
  - `levelSupplyMaxSurplus`
  - `minPrecisionBlocksPerLevel`
  - `drawPileGenerationAttempts`
  - `maxGeneratedBlocksPerLevel`
- Scoring settings:
  - `finisherBonusPerLevel`
  - `precisionBonusPerLevel`
  - `teamExactBonusPerLevel`
  - `assistBonusPerLevel`
  - `assistContributionThreshold`
- Shape variant examples:
  - `I4H`: 4-cell horizontal line, height 1.
  - `I4V`: 4-cell vertical line, height 4.
  - `O`, `T`, `L`, `J`, `S`, `Z`: Tetris-style 4-cell variants.
- Debug settings:
  - `debugBotsEnabled`
  - `debugBotCount`
  - `debugBotDelayMin`
  - `debugBotDelayMax`

## Inputs/Outputs
- Input: server-side/debug tuning updates via [[Lobby Manager]].
- Output: values consumed by [[Game Engine]], [[Bot Manager]], and matchmaking.

## Dependencies
- None.

## Notes
- Server validates debug changes before mutating this object.
- Production should restrict debug writes behind admin permissions later.
- Balance can be inspected with `npm run balance:simulate -- <levels> <runs>` from `src/Server`.
