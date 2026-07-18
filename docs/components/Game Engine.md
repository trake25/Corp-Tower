# Game Engine

## Purpose
Authoritative gameplay rules and level lifecycle for one room. File:
`src/Server/app/Game_Engine.js`. Block supply, scoring, and checkpoint logic
are split into `src/Server/app/engine/` modules (see Notes) — this file is
now the facade plus room/level lifecycle and timers.

## Responsibilities
- Create room state; assign fixed-orientation shape blocks.
- Build and deal the shared draw pile.
- Maintain the authoritative placed-block tower history.
- Resolve grid settling and deterministic tower stability before level
  completion (via [[Tower Stability]]).
- Run start delay, level timer, and tick broadcasts.
- Validate block placement and refresh-token use.
- Validate and broadcast transient quick-chat and politics messages.
- Calculate scores and bonuses; emit transient score UI events.
- Detect success/failure; advance levels, preserve team carry-over blocks, or
  roll back checkpoints.
- Stop timers and bots on room close.
- Notify [[Lobby Manager]] when room state changes so it can be persisted.

## Public interface
One class, `GameEngine`, one per room. Selected methods (grouped by area,
signature-level):

- **Lifecycle** — `createRoom(...)`, `hydrateRoom(...)`, `closeRoom(reason)`,
  `startLevel()`, `restartAtConfiguredStartLevel()`.
- **Placement** — `placeBlock(playerId, blockIndex)`, `refreshBlocks(playerId)`.
- **Scoring** — `addPlacementScore(...)`, `awardCompletionBonuses(...)`,
  `addLevelScoreToLeaderboard()`, `getLevelMVP()`, `buildLevelSummary(...)`.
- **Checkpoints** — `saveCheckpointState()`, `restoreCheckpointScores()`,
  `restoreCheckpointPolitics()`, `rollbackToCheckpoint()`.
- **Side features** — `setupSideQuest()`, `activatePolitics(...)`.
- **Stability** — `recalculateTowerStability()` (delegates the actual math to
  [[Tower Stability]]).
- **Called by [[Lobby Manager]]** — `stopBots()`, `broadcastGameState()`,
  `getCheckpointScoreStatus()`, `getBlocksPerPlayer()`, `getNextDrawBlock()`
  (room metadata/inventory for `room_created`/`room_resumed`, plus lifecycle
  control).

## Depends on
- Internal: [[Game Config]], [[Tower Stability]], [[Bot Manager]],
  [[Lobby Manager]] (notified of room changes, not called into for gameplay
  logic), [[Block Supply]], [[Scoring]], [[Checkpoints]] (internal `engine/`
  modules delegated to — see Notes)
- External: none

## Notes
- **Internal module split**: block supply lives in [[Block Supply]], scoring
  in [[Scoring]], and checkpoints in [[Checkpoints]] (all under
  `src/Server/app/engine/`). Each module exports plain functions taking the
  owning `GameEngine` instance as their first argument; `GameEngine`
  re-exposes every one as a same-named method (e.g. `placeBlock` still calls
  `this.addPlacementScore(...)`, which delegates to
  `Scoring.addPlacementScore(engine, ...)`). The class's public interface,
  method list, and every external caller ([[Lobby Manager]], [[Bot Manager]],
  [[Balance Simulator]], [[Server Score Events Tests]]) are unaffected by the
  split. Behavioral detail for each area now lives in that module's own doc.
- Level states: `waiting`, `starting`, `playing`, `finished`, `failed`,
  `game_completed`, `closed`.
- Refresh tokens: max count, per-level uses, and the final-lockout window are
  gated here in `refreshBlocks()`; the actual block generation is
  [[Block Supply]]'s job.
- `scoreEvents[]` (built in [[Scoring]]) and `quickChatEvents[]` (queued
  directly here) are transient, broadcast-only, and never persisted in room
  snapshots — clients shouldn't infer scoring UI from aggregate score diffs
  alone.
- Engine owns live timers and authoritative rule execution;
  [[Lobby Manager]] / [[Redis State]] persist shared room snapshots — this
  file never talks to Redis directly.
- No persistent leaderboard yet. Shape-block migration changed balance
  assumptions; progression/target tuning needs a future recalibration pass
  (see [[Balance Simulator]]).
