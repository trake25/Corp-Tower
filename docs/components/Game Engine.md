# Game Engine

## Purpose
Authoritative gameplay rules and level lifecycle for one room. File:
`src/Server/Game_Engine.js`.

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
  logic)
- External: none

## Notes
- Level states: `waiting`, `starting`, `playing`, `finished`, `failed`,
  `game_completed`, `closed`.
- **Score banking is two-stage**: placement/bonus points accumulate in
  `player.levelScore` during a level; only `addLevelScoreToLeaderboard()`
  (called from `completeLevel()`/on level advance) moves that into
  `player.score`. This is why a failed level's score doesn't count toward the
  final total — see `Score_Events.test.js`'s "failed level summary does not
  bank level score into final totals".
- Bonuses (finisher, precision, team, optional assist) use multipliers from
  [[Game Config]]; disabled (zero-value) bonuses don't emit score events.
- Checkpoint score gates fail when any player contributed less than
  `checkpointMinContributionShare` of expected placement score for the
  checkpoint band; `checkpointScoreStatus` broadcasts the active gate, next
  checkpoint level, and per-player leaderboard goals for the right-side UI.
- Checkpoint rollback restores both score snapshots and politics snapshots
  (the latter only when `politicsLifetime` is `checkpoint`, removing items
  earned after the last completed checkpoint).
- `scoreEvents[]` and `quickChatEvents[]` are transient, broadcast-only, and
  never persisted in room snapshots — clients shouldn't infer scoring UI from
  aggregate score diffs alone.
- Blocks are objects `{ id, shapeId, cells, height }`; `height` is derived
  from the vertical span of `cells`. Legacy numeric blocks are still
  interpreted as plain height values by helper logic. Sizes unlock through
  [[Game Config]], so level 1 starts with height-1 `I1` blocks only.
- Inventory active-slot count scales through [[Game Config]] (1 slot at
  level 1, 2 at level 2, 3 at level 4 by default).
- Draw pile: built from unused team carry-over blocks plus generated reserve
  blocks unlocked by level. Level 1 starts with an empty pile and levels 1–3
  have no generated reserve. A placement refills the acting player's hand
  from the pile when possible; `game_state` includes `drawPileCount` and
  `nextDrawBlock`.
- Team carry-over: on level completion, unused hand + remaining pile blocks
  are collected; up to 3 small precision-friendly blocks are kept and
  shuffled into the next level's pile. Discarded entirely on level failure,
  before the checkpoint restart.
- Refresh tokens: max count and per-level uses come from [[Game Config]];
  locked out near level end. Refresh **replaces only the blocks currently in
  the player's hand** — it does not top up to the max. A player with 1 block
  left gets 1 new block back; using refresh on a full hand replaces all of
  them. Refresh upgrades size 1–2 blocks into unlocked size 3+ blocks when
  possible, reshapes size 3+ blocks without changing size, and tries to
  produce a useful remaining-height option — it never consumes or reorders
  the draw pile.
- Engine owns live timers and authoritative rule execution;
  [[Lobby Manager]] / [[Redis State]] persist shared room snapshots — this
  file never talks to Redis directly.
- No persistent leaderboard yet. Shape-block migration changed balance
  assumptions; progression/target tuning needs a future recalibration pass
  (see [[Balance Simulator]]).
