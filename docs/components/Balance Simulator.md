# Balance Simulator

## Purpose
- Server-side balance sampling tool for shape-block supply and scoring.
- File: `src/Server/Balance_Simulator.js`.

## Runtime Classification
- Tooling-only file.
- Not required by the running game server or client.
- CI only syntax-checks this file through `npm test`; full simulation runs manually with `npm run balance:simulate -- <levels> <runs>`.
- Used by humans or Agent AIs during balance/tuning work.

## Responsibilities
- Create simulated rooms at selected levels.
- Deal opening hands and draw piles through [[Game Engine]].
- Run simple smart-play placement logic.
- Print CSV metrics for completion, exact finish, overbuild, placements, and score spread.

## Inputs/Outputs
- Input: level count and run count from `npm run balance:simulate -- <levels> <runs>`.
- Output: CSV rows for balance review.

## Dependencies
- [[Game Engine]]
- [[Game Config]]

## Notes
- This is a tuning aid, not a gameplay authority.
- Use [[Corp_Tower_GDD]] for design interpretation of the results.
