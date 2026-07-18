# Game UI Scene

## Purpose
The single Godot scene hosting every HUD/debug node the main gameplay
controller binds against. File:
`src/Client/App/corp-tower/Cor/Scenes/GameUI.tscn`, themed by
`Cor/Themes/GameUITheme.tres`. Required at runtime — [[Main UI Controller]]
statically instances it under `Main.tscn`'s `UIRoot` and binds its required
nodes to function at all.

## Responsibilities
- Provide the required node contract [[Main UI Controller]] binds against.
- Host HUD, inventory, radial cooldown overlays, quick-chat controls, Power
  target/inventory and quest-label nodes, draw-pile preview, tower, tower
  drop zone, drag preview, score, summary, and tabbed debug overlay nodes.

## Public interface
Not code — the "interface" is the node-name contract [[Main UI Controller]]
expects to find and bind when it loads. The two required drag nodes:

- `TowerDropZone` — full-rect control over the tower track, used to validate
  a drag release position.
- `DragPreview` — hidden [[Block Preview]] instance shown while dragging an
  inventory block.

## Depends on
- Internal: [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]],
  [[Debug Overlay]] (all instanced as nodes within this scene)
- External: none

## Notes
- This scene used to be one of two swappable "skins" (`DefaultSkin.tscn` /
  `Figma_SkinV1.tscn`), picked at runtime through a skin-picker overlay. Both
  were UI prototypes; the runtime skin system, the picker overlay, and the
  Figma variant were removed ahead of the production UI design pass, leaving
  this one scene as the only UI. `Main.tscn` now instances it statically —
  there is no more runtime scene swap, `ProjectSettings` skin preference, or
  skin-picker node group to keep in sync.
- The `.tres` theme resource is currently an empty placeholder (zero
  properties) — all real styling is inline `theme_override_*` properties on
  individual scene nodes, not the shared Theme resource.
