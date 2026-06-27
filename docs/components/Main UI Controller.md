# Main UI Controller

## Purpose
- Godot UI controller for the main game screen.
- File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect, block placement, and refresh buttons.
- Display connection, room, score, timer, tower height/progress, 3-slot block inventory, draw pile preview, and refresh state.
- Render shape-based block inventory cards from server-provided fixed-orientation cells.
- Render the visible `nextDrawBlock` and remaining `drawPileCount` in the former 4th inventory-card position.
- Render locked inactive inventory slots from `activeInventorySlots` so low levels start with fewer usable slots.
- Render placed blocks in the center tower area from server `towerBlocks` history.
- Send block and refresh actions.
- Load the selected UI skin and bind the shared skin node contract.
- Switch skins at runtime through a bottom-right overlay without changing gameplay/network logic.
- Reintroduce debug tuning through an overlay instead of embedding it in gameplay layout.
- Clear stale UI on `room_closed`.

## Key Logic
- Inventory buttons map to block indexes.
- Only the 3 active inventory slots are actionable.
- Locked slots remain visible but disabled until their unlock level.
- The draw-pile preview is not clickable; it shows the shared next refill block that whichever player places next will receive.
- The draw-pile preview can legitimately show `0 left`, especially on level 1 before any unused blocks have been saved.
- Inventory cards tolerate legacy numeric blocks and new `{ id, shapeId, cells, height }` block objects.
- `BlockPreview.gd` draws inventory shape cells.
- `TowerStack.gd` draws placed-block tower history; when connected to an old numeric-block server it falls back to a simple stack from `currentHeight`.
- Tower center display visualizes both current height against target height and the placed-block stack.
- Refresh button sends `refresh_blocks`.
- Skin selection reads `corp_tower/ui_skin`; default is `DefaultSkin`, with `Figma_SkinV1` available as a reskin.
- The skin picker button swaps the active skin scene under `SkinRoot`, rebinds required nodes, reconnects skin-local buttons, and replays the last room/game state.
- Debug overlay controls route changes through `NetworkManager.update_config` and use no-signal setters during server sync.
- Debug overlay includes a bot strategy dropdown for `cooperative` versus `mvp_greedy`.
- `update_room_closed(data)` resets stale room UI.

## Inputs/Outputs
- Input: signals from [[NetworkManager]].
- Output: player action calls to [[NetworkManager]].

## Dependencies
- [[NetworkManager]]
- [[Godot Client App]]

## Notes
- UI is an Android-first gameplay HUD with top status, center tower stage, and bottom touch controls.
- Bottom controls are laid out as 3 inventory card positions, 1 shared next-draw preview card, and the refresh button.
- Current working UI is preserved as `DefaultSkin`; Figma-inspired UI is `Figma_SkinV1`.
- Debug and skin menu UI are available as bottom-right floating buttons with overlay panels.
- The center tower is visual only; placement is still server-authoritative and index-based.
