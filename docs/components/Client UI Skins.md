# Client UI Skins

## Purpose
- Godot UI skin scenes and themes used by the main gameplay controller.
- Files:
  - `src/Client/App/corp-tower/Cor/Scenes/Skins/DefaultSkin.tscn`
  - `src/Client/App/corp-tower/Cor/Scenes/Skins/Figma_SkinV1.tscn`
  - `src/Client/App/corp-tower/Cor/Themes/DefaultSkinTheme.tres`
  - `src/Client/App/corp-tower/Cor/Themes/Figma_SkinV1Theme.tres`

## Runtime Classification
- Runtime client files.
- Required for the current Godot game UI to load and render.
- [[Main UI Controller]] loads these skins and binds their required nodes.

## Responsibilities
- Provide the required node contract consumed by [[Main UI Controller]].
- Host HUD, inventory, draw-pile preview, tower, tower drop zone, drag preview, score, summary, skin picker, and debug overlay nodes.
- Allow runtime switching between `DefaultSkin` and `Figma_SkinV1`.

## Required Drag Nodes
- `TowerDropZone`: full-rect control over the tower track used to validate drag release.
- `DragPreview`: hidden `BlockPreview` instance shown while dragging an inventory block.

## Dependencies
- [[Main UI Controller]]
- [[Block Preview]]
- [[Tower Stack]]
- [[Debug Overlay]]

## Notes
- `DefaultSkin` is the stable default.
- `Figma_SkinV1` is the alternate Figma-inspired reskin.
