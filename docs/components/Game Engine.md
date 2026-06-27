# Game Engine

## Purpose
- Authoritative gameplay rules and level lifecycle.
- File: `src/Server/Game_Engine.js`.

## Responsibilities
- Create room state.
- Assign fixed-orientation shape blocks.
- Build and deal the shared draw pile.
- Maintain authoritative placed-block tower history.
- Run start delay, level timer, and tick broadcasts.
- Validate block placement and refresh token use.
- Calculate scores and bonuses.
- Detect success/failure.
- Advance levels, preserve team carry-over blocks, or roll back checkpoints.
- Stop timers and bots on room close.
- Notify [[Lobby Manager]] when room state changes so shared state can be persisted.

## Key Logic
- Level states:
  - `waiting`
  - `starting`
  - `playing`
  - `finished`
  - `failed`
  - `game_completed`
  - `closed`
- Scoring:
  - Placement points use effective height and level.
  - Bonuses: finisher, precision, team, assist, with multipliers from [[Game Config]].
  - MVP is highest level score.
  - Checkpoint score snapshots are restored on rollback.
- Target height:
  - Uses the authored target-height curve from [[Game Config]].
  - `targetHeightMultiplier` scales the curve for debug tuning.
- Blocks:
  - New blocks are objects `{ id, shapeId, cells, height }`.
  - `height` is derived from the vertical span of `cells`.
  - Legacy numeric blocks are still interpreted as vertical height values by helper logic.
  - Block sizes unlock through [[Game Config]] so level 1 starts with height-1 `I1` blocks only.
- Inventory:
  - Active slots scale through [[Game Config]].
  - Default unlocks are 1 slot at level 1, 2 slots at level 2, and 3 slots at level 4.
- Opening hands:
  - Active hand slots are filled by newly generated level blocks.
  - Opening hands are generated with minimum surplus, precision-block, and exact-combination constraints.
- Draw pile:
  - The shared pile is built from unused team carry-over blocks and generated reserve blocks unlocked by level.
  - Level 1 starts with an empty draw pile and levels 1-3 have no generated reserve.
  - A placement refills the acting player's hand from the pile when possible.
  - `game_state` includes `drawPileCount` and `nextDrawBlock`.
- Team carry-over:
  - On level completion, unused active hand blocks and remaining draw pile blocks are collected.
  - Up to 3 small precision-friendly blocks are kept and shuffled into the next level draw pile.
  - Team carry-over is discarded on level failure before checkpoint restart.
- Tower history:
  - `towerBlocks[]` records each placement with player id, block, height, effective height, and base height.
  - History resets at level start and is broadcast in `game_state`.
- Refresh tokens:
  - Max token count and per-level uses are from [[Game Config]].
  - Locked out near level end.
  - Refresh rerolls the player's current hand, tries to produce a useful remaining-height option, and does not consume or reorder the draw pile.
- Room close:
  - Calls [[Bot Manager]] stop.
  - Clears all timers.
  - Marks state `closed`.

## Inputs/Outputs
- Input: players from [[Lobby Manager]], `place_block`, `refresh_blocks`.
- Output: `game_state` broadcasts, `towerBlocks`, score updates, level transitions.
- `game_state.players[]` includes `isBot` so clients can distinguish real-player rooms from bot-filled debug rooms.

## Dependencies
- [[Game Config]]
- [[Bot Manager]]
- [[Lobby Manager]]

## Notes
- Engine owns live timers and authoritative rule execution; [[Lobby Manager]]/[[Redis State]] persist shared room snapshots.
- No persistent leaderboard yet.
- The engine should remain server authoritative.
- Shape-block migration changes balance assumptions; progression/target tuning needs a future recalibration pass.
