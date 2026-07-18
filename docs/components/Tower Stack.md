# Tower Stack

## Purpose
Renders the placed-block tower history as the main gameplay visual in the
Godot HUD. File: `src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd`.

## Responsibilities
- Render authoritative `towerBlocks` entries from `game_state`, including
  resolved structural coordinates and visible gaps.
- Animate stability-driven tilt.
- Color placed blocks by player.
- Draw the target-height marker.
- Scroll the visible tower window when tall towers exceed the visible track.
- Fall back to an aggregate block-count stack for legacy payloads without
  structural entries.

## Public interface
- `set_tower(blocks, new_current_height, new_target_height, new_stability=100,
  diagnostics={})` — replaces the rendered tower. `diagnostics` supplies
  `tiltAngleDeg` / `collapsed` from the server's stability evaluation (see
  [[Tower Stability]]).
- `set_player_color_map(new_player_color_map: Dictionary)` — sets the
  id→Color map used to tint blocks.
- `clear_tower()` — resets to an empty tower.

## Depends on
- Internal: [[Player Colors]] (block-tint fallback)
- External: none

## Notes
- Visual-only; the server owns tower state, this component never mutates
  gameplay data.
- Tilt rendering is two layers: `tower_tilt_deg` is the *target* lean, taken
  directly from `diagnostics.tiltAngleDeg` (same sign convention as the
  server's `tiltScore`); `displayed_tilt_deg` is an eased value
  (`TILT_EASE_SPEED`) that glides toward the target instead of snapping on
  every placement. The easing is a rendering smoothing layer only — the
  underlying tilt is fully recalculated server-side on every placement, never
  animated there.
- Once `diagnostics.collapsed` is true, rendering exaggerates the lean to a
  fixed `COLLAPSE_TILT_DEG` (70°) in whichever direction it was already
  leaning — well past the live-play tilt cap (`towerMaxTiltAngleDeg`,
  typically 24°, see [[Game Config]]). This is a purely cosmetic "sell the
  collapse" flourish for a level that has already ended, not a physically
  meaningful angle.
- Drawing rotates around a pivot at the bottom-center of the tower (matching
  where it actually rests on the ground — equivalent to the CSS
  `transform-origin: 50% 100%` idea from the original web prototype).
  Visibility culling is done in pre-rotation space as a cheap approximation;
  fine at the shallow angles reached during live play and the larger but
  still-bounded post-collapse angle.
