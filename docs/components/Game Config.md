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
  - `targetHeightMultiplier`
  - `startDelayMs`
  - `levelTimeLimitMs`
- Block settings:
  - `blockUnlockLevels`
  - `blockWeights`
  - `blockShapeVariants`
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
- Block weights and unlock levels need recalibration now that shape height can be lower than cell count.
