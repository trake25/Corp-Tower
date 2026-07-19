# Impact Bar

## Purpose
Per-player vertical fill bar showing progress toward the next Impact score
checkpoint. File: `src/Client/App/corp-tower/Cor/Scripts/ImpactBar.gd`,
scene `Cor/Scenes/ImpactBar.tscn`.

## Responsibilities
- Render a vertical gradient fill (seat color, lightened top / darkened
  bottom) whose height reflects a `0.0`-`1.0` progress ratio.

## Public interface
- `set_bar(seat_color: Color, ratio: float) -> void` — ratio is clamped
  internally; `anchor_top` is set to `1.0 - ratio` so the fill grows upward
  from the bottom.

## Depends on
- Internal: none
- External: none

## Notes
- Visual-only, purely reactive to the ratio it's given — it has no
  polling/timer of its own. [[Main UI Controller]]'s `update_impact_track()`
  computes the ratio once per `game_state` broadcast and calls `set_bar()`;
  see that doc's Notes for how the ratio itself is computed (and a
  double-counting bug that was fixed there).
- One instance per rail slot (up to `MAX_RAIL_PLAYERS`), instantiated on
  first appearance and kept in the `impact_bars` dictionary keyed by player
  id, freed when a player drops out of the current Impact status payload —
  same reuse/lifecycle pattern as `PlayerRailEntry`.
