# Balance Simulator

## Purpose
Offline balance-sampling tool for shape-block supply and scoring. File:
`src/Server/tools/Balance_Simulator.js`. Tooling only — not required by the
running game server or client, and not copied into the Docker image (see
[[Server Docker Image]]).

## Responsibilities
- Instantiate [[Game Engine]] directly (not through [[Lobby Manager]] — no
  Redis, no WebSocket, no room-of-real-players setup) at a chosen level.
- Deal opening hands and draw piles through that engine.
- Run simple smart-play placement logic to simulate a level.
- Print CSV metrics: completion rate, exact-finish rate, overbuild, placement
  count, and score spread.

## Public interface
Run from `src/Server`: `npm run balance:simulate -- <levels> <runs>`. Not
`require()`d by any other file — CI only syntax-checks it via `npm test`
(`node --check`); it never actually runs in CI.

## Depends on
- Internal: [[Game Engine]], [[Game Config]], [[Tower Stability]] (used
  directly for a standalone stability check on the simulated result, not just
  transitively through the engine)
- External: none

## Notes
- A tuning aid, not a gameplay authority — the real server's [[Game Engine]]
  is still the source of truth.
- Temporarily silences `console.log` (not `console.error`) for the duration
  of a simulation run, then restores it, so a large `<runs>` count doesn't
  flood the terminal with the engine's normal per-action logging.
- See [[Corp_Tower_GDD]] for design interpretation of the output.
