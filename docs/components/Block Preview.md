# Block Preview

## Purpose
- Draw fixed-orientation block previews in the Godot HUD.
- File: `src/Client/App/corp-tower/Cor/Scripts/BlockPreview.gd`.

## Runtime Classification
- Runtime client file.
- Required by the current UI to draw inventory and next-draw block previews.
- Visual-only; it does not decide placement legality or gameplay state.

## Responsibilities
- Render server-provided block `cells`.
- Center previews inside inventory and draw-pile cards.
- Show unavailable/disabled preview state.
- Support array-style and dictionary-style cell coordinates.

## Dependencies
- [[Main UI Controller]]
- [[Client UI Skins]]

## Notes
- This is visual-only; placement remains index-based and server-authoritative.
