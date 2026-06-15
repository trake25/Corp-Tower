# Main UI Controller

## Purpose
- Godot UI controller for the main game screen.
- File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire connect, block placement, and refresh buttons.
- Display connection, room, score, timer, tower height/progress, block inventory, and refresh state.
- Render shape-based block inventory cards from server-provided fixed-orientation cells.
- Send block and refresh actions.
- Clear stale UI on `room_closed`.

## Key Logic
- Inventory buttons map to block indexes.
- Inventory cards tolerate legacy numeric blocks and new `{ id, shapeId, cells, height }` block objects.
- Tower center display visualizes current height against target height.
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
