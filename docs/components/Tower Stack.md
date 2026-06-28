# Tower Stack

## Purpose
- Draw the placed-block tower history in the Godot HUD.
- File: `src/Client/App/corp-tower/Cor/Scripts/TowerStack.gd`.

## Responsibilities
- Render authoritative `towerBlocks` entries from `game_state`.
- Color placed blocks by player.
- Draw the target-height marker.
- Scroll the visible tower window when high-level towers exceed the track.
- Fall back to aggregate `currentHeight` for legacy payloads.

## Dependencies
- [[Main UI Controller]]
- [[Player Colors]]

## Notes
- This is visual-only; the server owns tower state.
