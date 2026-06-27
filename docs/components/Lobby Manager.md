# Lobby Manager

## Purpose
- Matchmaking, room lifecycle, and runtime debug config coordinator.
- File: `src/Server/Lobby_Manager.js`.

## Responsibilities
- Maintain waiting players and active rooms through shared Redis state when `REDIS_URL` is enabled.
- Create 3-participant rooms.
- Fill rooms with debug bots when enabled.
- Validate and broadcast debug config updates.
- Allow real players to resume their room within reconnect TTL.
- Destroy rooms when reconnect TTL expires and no connected real players remain.
- Reset room-session state during testing phase.
- Preserve hydrated room state, including shape inventories and tower history, when rooms are recovered from shared state.

## Key Logic
- `addPlayer(player)`:
  - Resets participant session state.
  - Adds player to waiting queue.
  - Attempts room creation.
- `tryCreateRoom()`:
  - Adds debug bots when allowed.
  - Creates room with 3 participants.
  - Starts [[Game Engine]].
- `closeRoom(room, reason, disconnectedPlayer)`:
  - Calls [[Game Engine]] close.
  - Removes room from active list.
  - Resets player/bot scores and session state.
  - Sends `room_closed` to remaining connected real players.
  - Requeues remaining real players for a fresh test room.
- `resumePlayer(player, roomId)`:
  - Reattaches a reconnecting player to the same room/player slot when session token is valid.
  - Sends current room metadata and player block inventory before the engine broadcasts full `game_state`.
- `handleRoomReconnectExpired(roomId)`:
  - Closes rooms with reason `reconnect_ttl_expired` when all real players miss the reconnect window.
- `updateDebugConfig(key, value)`:
  - Allows only known keys.
  - Clamps numeric values.
  - Allows `debugBotStrategy` only as `cooperative` or `mvp_greedy`.
  - Broadcasts `debug_config`.

## Inputs/Outputs
- Input: player connections, disconnects, debug config requests.
- Output: rooms, debug config broadcasts, `room_created`/`room_resumed`, `room_closed` messages.

## Dependencies
- [[Game Engine]]
- [[Game Config]]
- [[Bot Manager]] indirectly through game engine.

## Notes
- Staging/debug reconnect TTL is currently 10 seconds through `RECONNECT_TTL_SECONDS`.
- Redis stores session/room lookup for the EC2 gateway/workers learning lab.
- Hydrated room snapshots include `towerBlocks` so non-owner workers and reconnecting clients can redraw the tower.
