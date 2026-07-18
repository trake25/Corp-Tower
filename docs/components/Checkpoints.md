# Checkpoints

## Purpose
Checkpoint score/politics snapshots, restore/rollback, and the checkpoint
score gate for one room. File: `src/Server/app/engine/Checkpoints.js`. Every
export is a plain function taking the owning [[Game Engine]] instance as its
first argument; `GameEngine` re-exposes each one as a same-named method.

## Responsibilities
- Snapshot each player's score and politics inventory at the start of a
  checkpoint band; restore those snapshots on rollback.
- Award a politics item to the checkpoint-band leader when a checkpoint
  opens.
- Decide whether each player met the band's minimum score contribution share
  before letting the room advance past a checkpoint level.
- Build the per-player checkpoint-status payload (`requiredScore`,
  `bandScore`, `remainingScore`, `met`) broadcast every tick.
- Fail the room back to `failed` state (with a level summary) when the
  checkpoint gate isn't met, and roll the room back to its last checkpoint
  level afterward.

## Public interface
Grouped by area:
- **Snapshots** — `clonePoliticsInventory(items)`, `saveCheckpointScores()`,
  `saveCheckpointPolitics()`, `saveCheckpointState()`,
  `ensureCheckpointScores()`, `ensureCheckpointPolitics()`,
  `ensureCheckpointState()`, `restoreCheckpointScores()`,
  `restoreCheckpointPolitics()`.
- **Score gate** — `isCheckpointLevel(level)`,
  `getCheckpointScoreRequirement()`, `getCheckpointMinContributionShare()`,
  `getExpectedPlacementScoreForLevel(level)`,
  `getExpectedPlacementScoreForCheckpointBand(blockedLevel)`,
  `getCheckpointBandScoreRequirement(blockedLevel)`,
  `getCheckpointScoreFailures(blockedLevel)`, `getNextCheckpointLevel()`,
  `getCheckpointScoreStatus(blockedLevel)`,
  `hasMetCheckpointScoreRequirement(blockedLevel)`.
- **Rewards/rollback** — `awardCheckpointPolitics()`,
  `failCheckpointScoreRequirement(blockedLevel)`, `rollbackToCheckpoint()`.

## Depends on
- Internal: [[Game Config]] (direct `require`); [[Game Engine]] via the
  engine facade for lifecycle calls (`clearTimers`, `persistRoom`,
  `broadcastGameState`, `startLevel`, `clampLevel`,
  `getTargetHeightForLevel`); [[Scoring]] via the engine facade for
  score-event/summary calls (`queueScoreEvent`, `buildLevelSummary`,
  `getLevelMVP`, `getPlayerScoreMap`).
- External: none.

## Notes
- Called from [[Game Engine]]'s `createRoom()`/`restartAtLevel()`
  (`saveCheckpointState`), `hydrateRoom()` (`ensureCheckpointState`),
  `nextLevel()` (`hasMetCheckpointScoreRequirement`,
  `failCheckpointScoreRequirement`, `awardCheckpointPolitics`,
  `saveCheckpointState`), and `failLevel()`/`restoreTimersFromState()`
  (`rollbackToCheckpoint`); its own `getCheckpointScoreStatus()` is also
  called every `broadcastGameState()` tick.
- Checkpoint score gates fail when any player contributed less than
  `checkpointMinContributionShare` of expected placement score for the
  checkpoint band; `checkpointScoreStatus` broadcasts the active gate, next
  checkpoint level, and per-player leaderboard goals for the right-side UI.
- Checkpoint rollback restores both score snapshots and politics snapshots
  (the latter only when `politicsLifetime` is `checkpoint`, removing items
  earned after the last completed checkpoint).
- `rollbackToCheckpoint()` ends by calling `engine.startLevel()` directly —
  the room re-enters `starting` for the checkpoint level in the same call,
  not on a separate timer tick.
