# Cooldown Overlay

## Purpose
Draws a radial cooldown indicator over an inventory card while its
drag-to-place cooldown is active. File:
`src/Client/App/corp-tower/Cor/Scripts/CooldownOverlay.gd`.

## Responsibilities
- Render a filling radial arc representing remaining cooldown ratio.
- Hide itself automatically once the cooldown reaches zero.

## Public interface
- `set_remaining_ratio(value: float) -> void` — `0.0` (no cooldown, hidden)
  to `1.0` (just placed, full overlay). Clamped internally.

## Depends on
- Internal: none
- External: none

## Notes
- Visual-only, purely reactive to the ratio it's given — it has no timer of
  its own. [[Main UI Controller]] computes the remaining ratio (from local
  placement cooldown state) and calls `set_remaining_ratio()` once per frame
  via `update_placement_cooldown_overlays()`.
- One instance per inventory card, found via
  `button.get_node_or_null("CooldownOverlay")`, so it must exist under that
  exact node name in both [[Client UI Skins]] scenes.
