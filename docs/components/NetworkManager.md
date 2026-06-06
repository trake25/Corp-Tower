# NetworkManager

## Purpose
- Godot WebSocket adapter and signal bridge.
- File: `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`.

## Responsibilities
- Open and close WebSocket connection.
- Poll incoming packets.
- Parse server JSON.
- Emit Godot signals for UI state.
- Send client commands to server.

## Key Logic
- Connects to configured `ws://<server>:3000`.
- Emits:
  - `status_changed`
  - `room_joined`
  - `room_closed`
  - `game_state_updated`
  - `client_status`
  - `debug_config_updated`
- Sends:
  - `place_block`
  - `refresh_blocks`
  - `update_config`

## Inputs/Outputs
- Input: server WebSocket JSON.
- Output: Godot signals and client WebSocket JSON.

## Dependencies
- Godot `WebSocketPeer`.
- [[Main UI Controller]]
- [[Server Entry]]

## Notes
- The server remains authoritative.
- Client only updates UI after server messages.
