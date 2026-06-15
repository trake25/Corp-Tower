# Game Engine

## Purpose
- Authoritative gameplay rules and level lifecycle.
- File: `src/Server/Game_Engine.js`.

## Responsibilities
- Create room state.
- Assign blocks.
- Run start delay, level timer, and tick broadcasts.
- Validate block placement and refresh token use.
- Calculate scores and bonuses.
- Detect success/failure.
- Advance levels or roll back checkpoints.
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
  - Placement points use block height, level, and effective height.
  - Bonuses: finisher, precision, team, assist.
  - MVP is highest level score.
- Refresh tokens:
  - Max token count and per-level uses are from [[Game Config]].
  - Locked out near level end.
- Room close:
  - Calls [[Bot Manager]] stop.
  - Clears all timers.
  - Marks state `closed`.

## Inputs/Outputs
- Input: players from [[Lobby Manager]], `place_block`, `refresh_blocks`.
- Output: `game_state` broadcasts, score updates, level transitions.
- `game_state.players[]` includes `isBot` so clients can distinguish real-player rooms from bot-filled debug rooms.

## Dependencies
- [[Game Config]]
- [[Bot Manager]]
- [[Lobby Manager]]

## Notes
- Engine owns live timers and authoritative rule execution; [[Lobby Manager]]/[[Redis State]] persist shared room snapshots.
- No persistent leaderboard yet.
- The engine should remain server authoritative.
