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
- `set_block(block: Dictionary)` — sets the cells to draw.
- `clear_block()` — clears the current preview.
- `set_preview_mode(mode: PreviewMode)` — `PreviewMode` enum:
  `{INVENTORY, FLOATING_DRAG}`. `INVENTORY` is the compact card preview for
  inventory slots and the draw pile; `FLOATING_DRAG` is the larger
  pointer-following preview shown while dragging a block toward the tower.
- `cell_color: Color` — public var set directly by callers.
- Driven entirely by [[Main UI Controller]]; this component holds no
  gameplay state of its own.

## Depends on
- Internal: none
- External: none

## Notes
- Placement stays index-based and server-authoritative; this component only
  ever draws what it's told, matching [[Client UI Skins]]' node contract.
