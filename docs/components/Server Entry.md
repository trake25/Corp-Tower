# Server Entry

## Purpose
WebSocket entry point for the authoritative Corp Tower server. File:
`src/Server/app/Server.js`.

## Responsibilities
- Start the WebSocket server on `PORT` (default `3000`).
- Accept the initial reconnect handshake and create/resume server-issued
  player sessions.
- Add players to [[Lobby Manager]].
- Route client messages to the right game/config handler.
- Delegate disconnect handling to [[Lobby Manager]] so reconnect TTL can run.

## Public interface
Not a module with exports — this is the process entry point. Its interface is
the WebSocket message protocol:

- **Accepts** (client → server): `reconnect` (first message on a new
  connection; creates or resumes a session via [[Lobby Manager]]),
  `update_config`, `place_block`, `send_quick_chat`, `activate_power` (last
  three routed to the player's current room's [[Game Engine]]; `activate_power`
  is also how a block refresh happens now — there is no separate
  `refresh_blocks` message).
- **Emits** (server → client): `room_created`, `room_resumed`, `game_state`
  (produced by [[Game Engine]], may include shape inventory and
  `towerBlocks`), `debug_config`, `room_closed`.
- On socket close: removes the player through [[Lobby Manager]]; reconnect
  TTL handling continues there so a brief disconnect doesn't end the room.

## Depends on
- Internal: [[Lobby Manager]]
- External: `ws`

## Notes
- Server is authoritative; client requests are never trusted as final state.
- JSON parse failures on incoming messages are logged and ignored rather than
  crashing the connection.
- Every new connection triggers a `debug_config` broadcast to all connected
  real players (`lobbyManager.broadcastDebugConfig()` on first message), not
  just on config changes.
