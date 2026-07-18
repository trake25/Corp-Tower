# Client UI Skins

## Purpose
Godot UI skin scenes and themes used by the main gameplay controller. Files:
`src/Client/App/corp-tower/Cor/Scenes/Skins/DefaultSkin.tscn`,
`Figma_SkinV1.tscn`, and their matching `.tres` themes under `Cor/Themes/`.
Required at runtime — [[Main UI Controller]] loads one of these skins and
binds their required nodes to function at all.

## Responsibilities
- Provide the required node contract [[Main UI Controller]] binds against.
- Host HUD, inventory, radial cooldown overlays, quick-chat controls,
  politics target/inventory and quest-label nodes, draw-pile preview, tower,
  tower drop zone, drag preview, score, summary, skin picker, and debug
  overlay nodes.
- Allow runtime switching between `DefaultSkin` and `Figma_SkinV1`.

## Public interface
Not code — the "interface" is the node-name contract [[Main UI Controller]]
expects to find and bind when it loads a skin. The two required drag nodes:

- `TowerDropZone` — full-rect control over the tower track, used to validate
  a drag release position.
- `DragPreview` — hidden [[Block Preview]] instance shown while dragging an
  inventory block.

## Depends on
- Internal: [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]],
  [[Debug Overlay]] (all instanced as nodes within these scenes)
- External: none

## Notes
- `DefaultSkin` is the stable default; `Figma_SkinV1` is an alternate
  Figma-inspired reskin. Both must expose the same node contract so
  [[Main UI Controller]] can switch between them at runtime without special
  cases.
- The `.tres` theme resources are currently empty placeholders (zero
  properties) — all real styling is inline `theme_override_*` properties on
  individual scene nodes, not the shared Theme resource.
