# Game Config

## Purpose
Central runtime balance and debug tuning object — the single source of truth
for every numeric/rule constant the server uses. File: `src/Server/Game_Config.js`.

## Responsibilities
- Store game pacing values.
- Store block unlock/weight rules and fixed-orientation shape variants by cell count.
- Store inventory, draw-pile, and refresh-token limits.
- Store tower-stability tuning and thresholds.
- Store the politics side-quest catalog and its unlock/lifetime rules.
- Store debug bot and live-tuning configuration.

## Public interface
A single exported object, `GameConfig`, grouped as:

- **Game settings** — `maxLevel`, `debugStartLevel`, `placementCooldown`,
  `quickChatCooldownMs` / `quickChatTemplates`, `targetHeightCurve` /
  `targetHeightMultiplier`, `startDelayMs`, `levelTimeLimitMs`,
  `placementScorePopupDurationMs`, `finishScorePopupDurationMs`,
  `levelSummaryDelayMs`, `checkpointInterval`.
- **Tower stability settings** — `towerGridWidth`, `towerOverhangWeight`,
  `towerMaxTiltAngleDeg`, `towerCollapseTiltScore`,
  `towerStabilityWarningThreshold`, `towerStabilityCriticalThreshold`,
  `towerStabilityFeedbackMode`. Consumed by [[Tower Stability]]
  (`towerOverhangWeight`/`towerMaxTiltAngleDeg`/`towerCollapseTiltScore`) and
  [[Game Engine]] (the thresholds/feedback mode). See Notes for what each
  tuning knob actually does. `towerPlacementMode` is also defined here but is
  dead/unused — see Notes.
- **Politics settings** — `politicsUnlockLevel`, `politicsMaxSlots`,
  `politicsActivationCooldownMs`, `politicsLifetime`, and `politicsCatalog`
  (currently `score_cap`, `copy_score`, `free_refresh`, each with a
  `category` and `title`).
- **Block settings** — `blockUnlockLevels`, `blockWeights`,
  `blockShapeVariants` (shape id + cell coordinates per block size; e.g.
  `I4H`/`I4V` are 4-cell lines, `O`/`T`/`L`/`J`/`S`/`Z` are Tetris-style
  4-cell variants, `I5V`/`I6V` are late-game height-5/6 lines).
- **Inventory settings** — `inventoryScaling`, `maxActiveBlocks`.
- **Draw pile / opening hand / carry-over settings** — `maxTeamCarryOverBlocks`,
  `generatedDrawPileScaling`, `maxGeneratedDrawPileBlocks`,
  `levelSupplyMinSurplus`, `levelSupplyMaxSurplus`,
  `minPrecisionBlocksPerLevel`, `openingHandGenerationAttempts`.
- **Refresh settings** — `maxRefreshTokens`, `maxRefreshUsesPerLevel`,
  `refreshLockoutMs`, `refreshGenerationAttempts`, `refreshMinUsefulBlockHeight`.
- **Scoring settings** (`scoring` sub-object) — `placementScorePerHeight`,
  `finisherBonusPerLevel`, `precisionBonusPerLevel`, `teamExactBonusPerLevel`,
  `assistBonusPerLevel`, `assistContributionThreshold`, plus top-level
  `checkpointMinContributionShare` and legacy `checkpointScoreRequirement`
  (hidden flat floor).
- **Debug settings** — `debugBotsEnabled`, `debugBotCount`, `debugBotStrategy`,
  `debugBotDelayMin`, `debugBotDelayMax`, `botRefreshLowInventoryHeight`, plus
  the timing/balance/refresh/scoring fields above that are exposed through
  validated debug tuning.

## Depends on
- Internal: none.
- External: none.

## Notes
- Server validates debug changes ([[Lobby Manager]]) before mutating this
  object; production should restrict debug writes behind admin permissions
  later (not yet implemented).
- `towerPlacementMode`, `nextLevelDelayMs`, and `failRestartDelayMs` are
  unused/dead keys — nothing in `src/Server` reads them. The actual
  post-level transition delay is `getPostLevelTransitionDelayMs()` (score-
  popup duration + `levelSummaryDelayMs`), not `nextLevelDelayMs`/
  `failRestartDelayMs`.
- Balance and score distribution can be inspected with
  `npm run balance:simulate -- <levels> <runs>` from `src/Server` ([[Balance Simulator]]).
- Tower-stability tuning knob rationale (moved here from inline code comments,
  which are no longer the source of truth for this):
  - `towerOverhangWeight` — weight of a single unsupported cell in the
    just-placed block, relative to a full column-width of center-of-mass
    drift. Tune this before `towerCollapseTiltScore`; it's the main "does one
    bad piece feel bad" lever. See [[Tower Stability]] for how it's used.
  - `towerMaxTiltAngleDeg` — visual lean cap in degrees, reached when
    `tiltScore` hits ±1.0.
  - `towerCollapseTiltScore` — the `|tiltScore|` value at or above which the
    tower collapses. `1.0` is the physical "center of mass has left the base"
    point; raise it to make the tower more forgiving, lower it to make it
    hairier.
