# Game Config

## Purpose
- Central runtime balance and debug tuning object.
- File: `src/Server/Game_Config.js`.

## Responsibilities
- Store game pacing values.
- Store block unlock/weight rules.
- Store fixed-orientation shape variants by block cell count.
- Store inventory, draw-pile, and refresh-token limits.
- Store debug bot and live-tuning configuration.

## Key Logic
- Game settings:
  - `maxLevel`
  - `debugStartLevel`
  - `placementCooldown`
  - `quickChatCooldownMs` and `quickChatTemplates`
  - `targetHeightCurve`
  - `targetHeightMultiplier`
  - `startDelayMs`
  - `levelTimeLimitMs`
  - `placementScorePopupDurationMs`
  - `finishScorePopupDurationMs`
  - `levelSummaryDelayMs`
- Block settings:
  - `blockUnlockLevels`
  - `blockWeights`
  - `blockShapeVariants`
- Inventory settings:
  - `inventoryScaling`
  - `maxActiveBlocks`
- Draw pile, opening hand, and carry-over settings:
  - `maxTeamCarryOverBlocks`
  - `generatedDrawPileScaling`
  - `maxGeneratedDrawPileBlocks`
  - `levelSupplyMinSurplus`
  - `levelSupplyMaxSurplus`
  - `minPrecisionBlocksPerLevel`
  - `openingHandGenerationAttempts`
- Refresh settings:
  - `maxRefreshTokens`
  - `maxRefreshUsesPerLevel`
  - `refreshLockoutMs`
  - `refreshGenerationAttempts`
  - `refreshMinUsefulBlockHeight`
- Scoring settings:
  - `checkpointMinContributionShare`
  - `checkpointScoreRequirement` hidden legacy flat floor
  - `placementScorePerHeight`
  - `finisherBonusPerLevel`
  - `precisionBonusPerLevel`
  - `teamExactBonusPerLevel`
  - `assistBonusPerLevel`
  - `assistContributionThreshold`
- Shape variant examples:
  - `I4H`: 4-cell horizontal line, height 1.
  - `I4V`: 4-cell vertical line, height 4.
  - `I5V` and `I6V`: late-game true vertical height-5 and height-6 line blocks.
  - `O`, `T`, `L`, `J`, `S`, `Z`: Tetris-style 4-cell variants.
- Debug settings:
  - `debugBotsEnabled`
  - `debugBotCount`
  - `debugBotStrategy`
  - `debugBotDelayMin`
  - `debugBotDelayMax`
  - `botRefreshLowInventoryHeight`
  - timing, balance, refresh, and scoring fields exposed through validated debug tuning

## Inputs/Outputs
- Input: server-side/debug tuning updates via [[Lobby Manager]].
- Output: values consumed by [[Game Engine]], [[Bot Manager]], and matchmaking.

## Dependencies
- None.

## Notes
- Server validates debug changes before mutating this object.
- Production should restrict debug writes behind admin permissions later.
- Balance and score distribution can be inspected with `npm run balance:simulate -- <levels> <runs>` from `src/Server`.
