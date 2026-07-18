# Impacts

## Purpose
Impact score snapshots, restore/rollback, and the Impact score gate for one
room. File: `src/Server/app/engine/Impacts.js`. Every export is a plain
function taking the owning [[Game Engine]] instance as its first argument;
`GameEngine` re-exposes each one as a same-named method.

## Responsibilities
- Snapshot each player's score and Power inventory at the start of an Impact
  band; restore those snapshots on rollback.
- Award a Power item to the Impact-band leader when an Impact opens.
- Decide whether each player met the band's minimum score contribution share
  before letting the room advance past an Impact level.
- Build the per-player Impact-status payload (`requiredScore`, `bandScore`,
  `remainingScore`, `met`) broadcast every tick.
- Fail the room back to `failed` state (with a level summary) when the
  Impact gate isn't met, and roll the room back to its last Impact level
  afterward.

## Public interface
Grouped by area:
- **Snapshots** — `saveImpactScores()`, `saveImpactPowers()`,
  `saveImpactState()`, `ensureImpactScores()`, `ensureImpactPowers()`,
  `ensureImpactState()`, `restoreImpactScores()`, `restoreImpactPowers()`.
- **Score gate** — `isImpactLevel(level)`, `getImpactScoreRequirement()`,
  `getImpactMinContributionShare()`,
  `getExpectedPlacementScoreForLevel(level)`,
  `getExpectedPlacementScoreForImpactBand(blockedLevel)`,
  `getImpactBandScoreRequirement(blockedLevel)`,
  `getImpactScoreFailures(blockedLevel)`, `getNextImpactLevel()`,
  `getImpactScoreStatus(blockedLevel)`,
  `hasMetImpactScoreRequirement(blockedLevel)`.
- **Rewards/rollback** — `awardImpactPower()`,
  `failImpactScoreRequirement(blockedLevel)`, `rollbackToImpact()`.

## Depends on
- Internal: [[Game Config]] (direct `require`); [[Game Engine]] via the
  engine facade for lifecycle calls (`clearTimers`, `persistRoom`,
  `broadcastGameState`, `startLevel`, `clampLevel`,
  `getTargetHeightForLevel`, `clonePowerInventory`); [[Scoring]] via the
  engine facade for score-event/summary calls (`queueScoreEvent`,
  `buildLevelSummary`, `getLevelMVP`, `getPlayerScoreMap`).
- External: none.

## Notes
- Called from [[Game Engine]]'s `createRoom()`/`restartAtLevel()`
  (`saveImpactState`), `hydrateRoom()` (`ensureImpactState`), `nextLevel()`
  (`hasMetImpactScoreRequirement`, `failImpactScoreRequirement`,
  `awardImpactPower`, `saveImpactState`), and
  `failLevel()`/`restoreTimersFromState()` (`rollbackToImpact`); its own
  `getImpactScoreStatus()` is also called every `broadcastGameState()` tick.
- Impact score gates fail when any player contributed less than
  `impactMinContributionShare` of expected placement score for the Impact
  band; `impactScoreStatus` broadcasts the active gate, next Impact level,
  and per-player leaderboard goals for the right-side UI.
- Impact rollback restores both score snapshots and Power snapshots (the
  latter only when `powerLifetime` is `impact`, removing items earned after
  the last completed Impact).
- `rollbackToImpact()` ends by calling `engine.startLevel()` directly — the
  room re-enters `starting` for the Impact level in the same call, not on a
  separate timer tick.
- Formerly `Checkpoints.js` / the "Checkpoint" system; renamed alongside the
  Politics→Power rename so both gameplay systems match their production UI
  names. `clonePowerInventory` used to live in this file but has moved onto
  the [[Game Engine]] facade directly — it's pure Power data with no Impact
  semantics and always ignored the `engine` argument it took.
