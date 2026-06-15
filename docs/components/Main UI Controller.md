# Main UI Controller

## Purpose
- Godot UI controller for the main game screen.
- File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect, block placement, and refresh buttons.
- Display connection, room, score, timer, tower height/progress, block inventory, and refresh state.
- Render shape-based block inventory cards from server-provided fixed-orientation cells.
- Render placed blocks in the center tower area from server `towerBlocks` history.
- Send block and refresh actions.
- Clear stale UI on `room_closed`.

## Key Logic
- Inventory buttons map to block indexes.
- Inventory cards tolerate legacy numeric blocks and new `{ id, shapeId, cells, height }` block objects.
- `BlockPreview.gd` draws inventory shape cells.
- `TowerStack.gd` draws placed-block tower history; when connected to an old numeric-block server it falls back to a simple stack from `currentHeight`.
- Tower center display visualizes both current height against target height and the placed-block stack.
- Refresh button sends `refresh_blocks`.
- `update_room_closed(data)` resets stale room UI.

## Inputs/Outputs
- Input: signals from [[NetworkManager]].
- Output: player action calls to [[NetworkManager]].

## Dependencies
- [[NetworkManager]]
- [[Godot Client App]]

## Notes
- UI is an Android-first gameplay HUD with top status, center tower stage, and bottom touch controls.
- Debug menu UI is intentionally excluded from this design pass.
- The center tower is visual only; placement is still server-authoritative and index-based.
