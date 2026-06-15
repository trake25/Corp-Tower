# NetworkManager

## Purpose
- Godot WebSocket adapter and signal bridge.
- File: `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`.

## Responsibilities
- Open and close WebSocket connection.
- Persist player id and reconnect token in `user://`.
- Send reconnect handshake after WebSocket opens.
- Auto-reconnect after unintended disconnects for real-player-only rooms.
- Poll incoming packets.
- Parse server JSON.
- Emit Godot signals for UI state.
- Send client commands to server.

## Key Logic
- Connects to configured `ws://<server>:3000`.
- Sends `reconnect` with stored `playerId`/`reconnectToken` after connection opens.
- Stores `playerId` and `reconnectToken` from `room_created` or `room_resumed`.
- Tracks `game_state.players[].isBot` to enable auto-reconnect only when the last known room had no bots.
- Retries unintended disconnects with a short delay and finite attempt count.
- Suppresses auto-reconnect after manual disconnect, app close, or server `room_closed`.
- Emits:
  - `status_changed`
  - `room_joined`
  - `room_closed`
  - `game_state_updated`
  - `client_status`
  - `debug_config_updated`
- Sends:
  - `reconnect`
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
- Auto-reconnect improves deploy/network recovery but still depends on server reconnect TTL and Redis room/session state.
