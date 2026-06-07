# Server Entry

## Purpose
- WebSocket entry point for the authoritative Corp Tower server.
- File: `src/Server/Server.js`.

## Responsibilities
- Start WebSocket server on `PORT` or `3000`.
- Accept initial reconnect handshake and create/resume server-issued player sessions.
- Add players to [[Lobby Manager]].
- Route client messages to game/config handlers.
- Keep disconnect handling delegated to [[Lobby Manager]] so reconnect TTL can run.

## Key Logic
- On connection:
  - Wait for first client message.
  - `reconnect` -> [[Lobby Manager]] creates or resumes a player session.
  - Queue new players through [[Lobby Manager]].
  - Broadcast current debug config.
- On message:
  - Parse JSON safely.
  - `update_config` -> [[Lobby Manager]].
  - `place_block` -> current room [[Game Engine]].
  - `refresh_blocks` -> current room [[Game Engine]].
- On close:
  - Remove player through [[Lobby Manager]].
  - Reconnect TTL remains active through [[Lobby Manager]].

## Inputs/Outputs
- Input: WebSocket JSON messages from [[NetworkManager]].
- Output: WebSocket JSON messages such as `room_created`, `room_resumed`, `game_state`, `debug_config`, `room_closed`.

## Dependencies
- `ws`
- [[Lobby Manager]]

## Notes
- Server is authoritative; client requests are never trusted as final state.
- Disconnect handling is delegated to [[Lobby Manager]] so rooms can close cleanly.
