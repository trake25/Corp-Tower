# Player Colors

## Purpose
- Shared Godot color utility for player-owned UI elements.
- File: `src/Client/App/corp-tower/Cor/Scripts/PlayerColors.gd`.

## Runtime Classification
- Runtime client file.
- Required by the current Godot UI for consistent player colors.
- Used by [[Main UI Controller]] and [[Tower Stack]].

## Responsibilities
- Provide stable colors for player ids.
- Provide indexed fallback colors for player order.
- Provide fallback color for missing/invalid player identity.

## Dependencies
- [[Main UI Controller]]
- [[Tower Stack]]

## Notes
- Covered by [[Godot Client Tests]].
