# Game Config

## Purpose
- Central runtime balance and debug tuning object.
- File: `src/Server/Game_Config.js`.

## Responsibilities
- Store game pacing values.
- Store block unlock/weight rules.
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
- Debug settings:
  - `debugBotsEnabled`
  - `debugBotCount`
  - `debugBotDelayMin`
  - `debugBotDelayMax`

## Inputs/Outputs
- Input: debug menu updates via [[Lobby Manager]].
- Output: values consumed by [[Game Engine]], [[Bot Manager]], and matchmaking.

## Dependencies
- None.

## Notes
- Server validates debug changes before mutating this object.
- Production should restrict debug writes behind admin permissions later.
