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
- Render a larger semi-transparent floating preview during inventory drag.
- Show unavailable/disabled preview state.
- Support array-style and dictionary-style cell coordinates.

## Preview Modes
- `INVENTORY`: compact card preview used by inventory slots and the draw pile.
- `FLOATING_DRAG`: larger pointer-following preview used while dragging a block toward the tower.

## Dependencies
- [[Main UI Controller]]
- [[Client UI Skins]]

## Notes
- This is visual-only; placement remains index-based and server-authoritative.
