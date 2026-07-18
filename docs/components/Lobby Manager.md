# Lobby Manager

## Purpose
Matchmaking, room lifecycle, and runtime debug-config coordinator. File:
`src/Server/Lobby_Manager.js`.

## Responsibilities
- Maintain waiting players and active rooms, through shared Redis state when
  `REDIS_URL` is enabled.
- Create 3-participant rooms, filling with debug bots when enabled.
- Validate and broadcast debug config updates.
- Let real players resume their room within the reconnect TTL.
- Destroy rooms when the reconnect TTL expires and no connected real players
  remain.
- Preserve hydrated room state (shape inventories, tower history) when a room
  is recovered from shared state.

## Public interface
- `addPlayer(player)` — resets session state, queues the player, attempts
  room creation.
- `tryCreateRoom()` — adds debug bots if allowed, creates a 3-participant
  room, starts [[Game Engine]].
- `closeRoom(room, reason, disconnectedPlayer)` — stops the engine, removes
  the room, resets scores/session state, sends `room_closed` to remaining
  connected real players, requeues them for a fresh room.
- `resumePlayer(player, roomId)` — reattaches a reconnecting player to their
  room/slot if the session token is valid; sends room metadata and inventory
  ahead of the engine's next full `game_state`.
- `handleRoomReconnectExpired(roomId)` — closes a room with reason
  `reconnect_ttl_expired` once every real player has missed the reconnect
  window.
- `updateDebugConfig(key, value)` — validates and applies one debug tuning
  change; only known keys are accepted, numeric values are clamped, see Notes
  for specifics. Broadcasts `debug_config` on success.
- `start()`, `createPlayer(ws, reconnectRequest)`, `broadcastDebugConfig()`,
  `removePlayer(player)` — the actual integration points [[Server Entry]]
  calls directly to drive the connection lifecycle.

## Depends on
- Internal: [[Game Engine]], [[Game Config]], [[Redis State]] (required and
  default-instantiated, not just optionally wired in by the caller).
  [[Bot Manager]] indirectly, through the engine it starts.
- External: none directly.

## Notes
- Reconnect TTL default is 60 seconds (`RECONNECT_TTL_SECONDS`) — a staging
  value, not necessarily final for production.
- `updateDebugConfig` clamps `placementScorePopupDurationMs` /
  `finishScorePopupDurationMs` to 500–10000 ms and `levelSummaryDelayMs` to
  1000–10000 ms; accepts `debugBotStrategy` only as `cooperative` or
  `mvp_greedy`; applies `debugStartLevel` immediately by restarting active
  debug rooms at that level; `resetDebugConfig` restores all exposed
  tunables to the [[Game Config]] startup defaults.
- Hydrated room snapshots include `towerBlocks` so non-owner workers and
  reconnecting clients can redraw the tower without the client recomputing
  it.
