# Block Preview

## Purpose
Draws fixed-orientation block previews in the Godot HUD. File:
`src/Client/App/corp-tower/Cor/Scripts/BlockPreview.gd`. Visual-only — it
never decides placement legality or gameplay state.

## Responsibilities
- Render server-provided block `cells`.
- Center previews inside inventory and draw-pile cards.
- Render a larger, semi-transparent floating preview during inventory drag.
- Show a disabled/unavailable preview state.
- Support both array-style and dictionary-style cell coordinates from the
  server payload.

## Public interface
- Two display modes: `INVENTORY` (compact card preview for inventory slots
  and the draw pile) and `FLOATING_DRAG` (larger pointer-following preview
  used while dragging a block toward the tower).
- Set via the block-preview node's exposed properties/setter (cells, mode,
  enabled state) — driven entirely by [[Main UI Controller]]; this component
  holds no gameplay state of its own.

## Depends on
- Internal: none
- External: none

## Notes
- Placement stays index-based and server-authoritative; this component only
  ever draws what it's told, matching [[Client UI Skins]]' node contract.
