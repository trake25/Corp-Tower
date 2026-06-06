# Lobby Manager

## Purpose
- Matchmaking, room lifecycle, and runtime debug config coordinator.
- File: `src/Server/Lobby_Manager.js`.

## Responsibilities
- Maintain waiting players and active rooms.
- Create 3-participant rooms.
- Fill rooms with debug bots when enabled.
- Validate and broadcast debug config updates.
- Close rooms when a real player disconnects.
- Reset room-session state during testing phase.

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
- `updateDebugConfig(key, value)`:
  - Allows only known keys.
  - Clamps numeric values.
  - Broadcasts `debug_config`.

## Inputs/Outputs
- Input: player connections, disconnects, debug config requests.
- Output: rooms, debug config broadcasts, `room_closed` messages.

## Dependencies
- [[Game Engine]]
- [[Game Config]]
- [[Bot Manager]] indirectly through game engine.

## Notes
- Reconnect and persistence are intentionally deferred.
- Current disconnect policy closes the full room to prevent bot loops from running without real players.
