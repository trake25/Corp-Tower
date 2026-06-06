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

## Dependencies
- [[Game Config]]
- [[Bot Manager]]

## Notes
- All room state is in memory.
- No persistent leaderboard yet.
- The engine should remain server authoritative.
