# Game Engine

## Purpose
Authoritative gameplay rules and level lifecycle for one room. File:
`src/Server/app/Game_Engine.js`. Block supply, scoring, and Impact logic
are split into `src/Server/app/engine/` modules (see Notes) — this file is
now the facade plus room/level lifecycle, timers, and the Power system.

## Responsibilities
- Create room state; assign fixed-orientation shape blocks.
- Build and deal the shared draw pile.
- Maintain the authoritative placed-block tower history.
- Resolve grid settling and deterministic tower stability before level
  completion (via [[Tower Stability]]).
- Run start delay, level timer, and tick broadcasts.
- Validate block placement.
- Validate and broadcast transient quick-chat and Power messages.
- Run the Power side-quest and item-activation system, including the
  Refresh item's unconditional block reroll.
- Calculate scores and bonuses; emit transient score UI events.
- Detect success/failure; advance levels, preserve team carry-over blocks, or
  roll back Impacts.
- Stop timers and bots on room close.
- Notify [[Lobby Manager]] when room state changes so it can be persisted.

## Public interface
One class, `GameEngine`, one per room. Selected methods (grouped by area,
signature-level):

- **Lifecycle** — `createRoom(...)`, `hydrateRoom(...)`, `closeRoom(reason)`,
  `startLevel()`, `restartAtConfiguredStartLevel()`.
- **Placement** — `placeBlock(playerId, blockIndex)`.
- **Scoring** — `addPlacementScore(...)`, `awardCompletionBonuses(...)`,
  `addLevelScoreToLeaderboard()`, `getLevelMVP()`, `buildLevelSummary(...)`.
- **Impacts** — `saveImpactState()`, `restoreImpactScores()`,
  `restoreImpactPowers()`, `rollbackToImpact()`.
- **Power** — `setupSideQuest()`, `activatePower(playerId, slot,
  targetPlayerId)`, `consumePowerEvents()`, `clonePowerInventory(items)`,
  `anyPlayerCanRefresh()` (used by the not-enough-height fail check to defer
  failure while a player still holds a Refresh item).
- **Stability** — `recalculateTowerStability()` (delegates the actual math to
  [[Tower Stability]]).
- **Called by [[Lobby Manager]]** — `stopBots()`, `broadcastGameState()`,
  `getImpactScoreStatus()`, `getBlocksPerPlayer()`, `getNextDrawBlock()`
  (room metadata/inventory for `room_created`/`room_resumed`, plus lifecycle
  control).

## Depends on
- Internal: [[Game Config]], [[Tower Stability]], [[Bot Manager]],
  [[Lobby Manager]] (notified of room changes, not called into for gameplay
  logic), [[Block Supply]], [[Scoring]], [[Impacts]] (internal `engine/`
  modules delegated to — see Notes)
- External: none

## Notes
- **Internal module split**: block supply lives in [[Block Supply]], scoring
  in [[Scoring]], and Impacts in [[Impacts]] (all under
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
- **The refresh token economy is gone.** There is no `refresh_blocks`
  action, no per-player token count, and no per-level use cap. Refresh is now
  purely an effect of the `refresh` Power item: `activatePower()` calls
  `this.generateRefreshBlocks(target.blocks || [])` unconditionally when that
  item is activated — the actual block-shape generation is still
  [[Block Supply]]'s job. The `not_enough_height_remaining` fail check
  (`checkFailCondition()`) is deferred by `anyPlayerCanRefresh()`, which now
  scans every player's Power inventory for a held `refresh` item instead of
  checking a token count.
- `scoreEvents[]` (built in [[Scoring]]) and `quickChatEvents[]`/
  `powerEvents[]` (queued directly here) are transient, broadcast-only, and
  never persisted in room snapshots — clients shouldn't infer scoring UI
  from aggregate score diffs alone.
- Engine owns live timers and authoritative rule execution;
  [[Lobby Manager]] / [[Redis State]] persist shared room snapshots — this
  file never talks to Redis directly.
- No persistent leaderboard yet. Shape-block migration changed balance
  assumptions; progression/target tuning needs a future recalibration pass
  (see [[Balance Simulator]]).
- Formerly "Politics" (the item/quest system) and "Checkpoint" (the score
  gate/rollback system) — both were renamed to Power and Impact respectively
  ahead of the production UI design pass, including every wire-protocol
  field, config key, and Redis-persisted field name. Deploy client and
  server together: a room in flight during that deploy will not restore its
  Impact/Power state from an old-shaped Redis snapshot.
