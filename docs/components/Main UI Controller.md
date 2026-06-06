# Main UI Controller

## Purpose
- Godot UI controller for the main game screen.
- File: `src/Client/App/corp-tower/Cor/Scripts/Main.gd`.

## Responsibilities
- Wire buttons and sliders.
- Display connection, room, score, height, blocks, and refresh state.
- Send block and refresh actions.
- Render debug config and avoid config echo loops.
- Clear stale UI on `room_closed`.

## Key Logic
- Inventory buttons map to block indexes.
- Refresh button sends `refresh_blocks`.
- Debug controls call `update_config`.
- `update_debug_config(config)` uses no-signal setters to avoid resending server broadcasts.
- `update_room_closed(data)` resets stale room UI.

## Inputs/Outputs
- Input: signals from [[NetworkManager]].
- Output: player action calls to [[NetworkManager]].

## Dependencies
- [[NetworkManager]]
- [[Godot Client App]]

## Notes
- UI is still functional/prototype style.
- Debug menu is for QA/design tuning, not public production access.
