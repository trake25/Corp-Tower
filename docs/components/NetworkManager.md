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
- Connects to configured `wss://corp-tower.duckdns.org`.
- Sends `reconnect` with stored `playerId`/`reconnectToken` after connection opens.
- Stores `playerId` and `reconnectToken` from `room_created` or `room_resumed`.
- Tracks `game_state.players[].isBot` to enable auto-reconnect only when the last known room had no bots.
- Passes authoritative `game_state`, including shape inventory and `towerBlocks`, through to [[Main UI Controller]].
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
  - `send_quick_chat`
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
- It does not interpret block geometry; UI rendering owns shape previews and tower drawing.
