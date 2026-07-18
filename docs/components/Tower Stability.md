# Tower Stability

## Purpose
Pure, deterministic grid physics: settles a newly placed block onto the
existing stack and scores how stable the resulting tower is. File:
`src/Server/app/Tower_Stability.js`.

## Responsibilities
- Compute where a newly placed block comes to rest on top of the existing
  stack (grid-based, gravity-down, horizontally centered).
- Score the stack's overall lean — is its center of mass still over its
  footprint?
- Score the just-placed block's own unsupported overhang, independently of
  overall lean.
- Combine both into a single tilt score, a visual tilt angle, a 0–100
  stability percentage, a lean direction, and a collapse flag.

## Public interface
- `settleBlock(entries, block, width) -> { originX, originY }` — drops
  `block` into the existing `entries` on a grid of `width` columns; returns
  where it lands.
- `evaluate(entries, config) -> { stability, diagnostics }` — scores the
  current stack. `diagnostics` is `{ comOffset, overhangPenalty, tiltScore,
  tiltAngleDeg, leanDirection, collapsed }`. Reads `towerOverhangWeight`,
  `towerMaxTiltAngleDeg`, `towerCollapseTiltScore` off `config` (see
  [[Game Config]]).
- `cellsFor(entry) -> Array<{x, y}>` / `cellsForEntries(entries)` — absolute
  grid cells occupied by one or many placed-block entries.
- `topHeight(entries) -> number` — current highest occupied row.

## Depends on
- Internal: none — pure grid math, no other module imports.
- External: none.

## Notes
- **Must stay a pure, deterministic function of `entries`** — no history,
  randomness, or hidden state. Re-running `evaluate()` on the same array
  always produces the same result. Two things depend on that: the balance
  simulator ([[Balance Simulator]]) re-runs it thousands of times and needs
  reproducible results, and the client re-derives the same tilt from a
  `game_state` snapshot after reconnecting rather than needing to replay
  placement history.
- The tilt score is two independent components added together:
  1. `comOffset` — whole-tower lean. Only the horizontal position of the
     center of mass relative to the footprint matters, not stack height —
     the same criterion that determines whether a physical stack of boxes
     tips over.
  2. `overhangPenalty` — reaction to the block that was *just* placed. Looks
     only at the most recently placed entry, so a bad placement reads as bad
     immediately without re-penalizing old, already-settled overhangs on
     every later turn.
- Called from [[Game Engine]]: `settleBlock()` at placement time, `evaluate()`
  inside `recalculateTowerStability()` after every placement. `Game Engine`
  then compares the result against `towerStabilityWarningThreshold` /
  `towerStabilityCriticalThreshold` (also [[Game Config]]) to decide when to
  react to a stability drop — that comparison is Game Engine's job, not this
  file's.
- Tuning-knob rationale (`towerOverhangWeight`, `towerMaxTiltAngleDeg`,
  `towerCollapseTiltScore`) lives in [[Game Config]] to keep one home for it;
  it used to be duplicated across this file, `Game_Config.js`, and
  `Lobby_Manager.js`.
- `evaluate()` guards against dividing by an empty base (no cells at `y === 0`)
  even though that shouldn't happen in normal play, since the first block
  placed always settles onto the floor.
