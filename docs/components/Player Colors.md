# Player Colors

## Purpose
Shared Godot color utility for player-owned UI elements. File:
`src/Client/App/corp-tower/Cor/Scripts/PlayerColors.gd`.

## Responsibilities
- Provide a stable color for a given player id.
- Provide indexed fallback colors keyed by player order (seat position).
- Provide a fallback color for a missing/invalid player identity.

## Public interface
- `color_for_player_id(player_id: String) -> Color` — the color to render for
  that player, consistent across the session.
- `FALLBACK_COLOR: Color` — constant used whenever a player id can't be
  resolved.

## Depends on
- Internal: none
- External: none

## Notes
- Used by [[Main UI Controller]] and [[Tower Stack]] — both `preload()` this
  script directly rather than each keeping their own color logic, so there's
  one place color assignment can change.
- Covered by [[Godot Client Tests]].
