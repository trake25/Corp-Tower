# NetworkManager

## Purpose
Godot WebSocket adapter and signal bridge — the client's only connection to
the server. File: `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`,
registered as an autoload singleton.

## Responsibilities
- Open and close the WebSocket connection.
- Persist player id and reconnect token in `user://`.
- Send the reconnect handshake once the socket opens.
- Auto-reconnect after unintended disconnects, only for real-player-only
  rooms.
- Poll incoming packets and parse server JSON.
- Emit Godot signals for UI state; send client commands to the server.

## Public interface
- **Methods**: `connect_server(is_auto_reconnect := false)`,
  `disconnect_server()`, `toggle_connection()`, `place_block(block_index)`,
  `refresh_blocks()`, `send_quick_chat(slot)`,
  `activate_politics(slot, target_player_id)`,
  `update_config(key, value)`.
- **Signals**: `status_changed(text)`, `room_joined(data)`,
  `room_closed(data)`, `game_state_updated(data)`, `client_status(status)`,
  `debug_config_updated(config)`.

## Depends on
- Internal: none
- External: Godot's `WebSocketPeer`

## Notes
- Connects to `wss://ws.tod.galaxxigames.com`. Sends `reconnect` with the
  stored `playerId`/`reconnectToken` immediately after the socket opens.
- Tracks `game_state.players[].isBot` to only enable auto-reconnect when the
  last known room had no bots (bot-filled debug rooms aren't worth
  reconnecting into).
- Retries unintended disconnects with a short delay and a finite attempt
  count; suppresses auto-reconnect after a manual disconnect, app close, or
  server-sent `room_closed`.
- The server remains authoritative — this file only updates UI state after a
  server message arrives, never optimistically. It doesn't interpret block
  geometry; [[Main UI Controller]] and [[Tower Stack]] own shape previews and
  tower drawing.
- Carries no debug logging — every state transition is already observable
  through its signals, so there's nothing a duplicate `print()` would add.
