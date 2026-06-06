# Server Entry

## Purpose
- WebSocket entry point for the authoritative Corp Tower server.
- File: `src/Server/Server.js`.

## Responsibilities
- Start WebSocket server on `PORT` or `3000`.
- Assign temporary player ids from `P1`, `P2`, `P3`.
- Add players to [[Lobby Manager]].
- Route client messages to game/config handlers.
- Return player ids to the pool on disconnect.

## Key Logic
- On connection:
  - Create player object with `id`, `ws`, `score`, `lastPlacementTime`.
  - Queue player through [[Lobby Manager]].
  - Broadcast current debug config.
- On message:
  - Parse JSON safely.
  - `update_config` -> [[Lobby Manager]].
  - `place_block` -> current room [[Game Engine]].
  - `refresh_blocks` -> current room [[Game Engine]].
- On close:
  - Remove player through [[Lobby Manager]].
  - Free player id.

## Inputs/Outputs
- Input: WebSocket JSON messages from [[NetworkManager]].
- Output: WebSocket JSON messages such as `room_created`, `game_state`, `debug_config`, `room_closed`.

## Dependencies
- `ws`
- [[Lobby Manager]]

## Notes
- Server is authoritative; client requests are never trusted as final state.
- Disconnect handling is delegated to [[Lobby Manager]] so rooms can close cleanly.
