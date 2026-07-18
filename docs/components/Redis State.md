# Redis State

## Purpose
Shared-state adapter so multiple Corp Tower server workers can share
matchmaking/room state. File: `src/Server/app/Redis_State.js`.

## Responsibilities
- Connect to Redis when `REDIS_URL` is configured; otherwise operate as an
  in-memory fallback with the same interface.
- Generate global player and room ids.
- Store reconnect sessions and their TTL.
- Store the shared matchmaking queue and room snapshots, including tower
  placement history.
- Publish room events across workers.

## Public interface
- `nextPlayerId()` / room-id equivalents — global id generation (memory
  counters when Redis is disabled).
- Session methods — store/read reconnect token ↔ player/room mapping with
  TTL.
- Room snapshot methods — read/write serializable room state (strips live
  WebSocket references before storing). `saveRoom(room, renewLease)` takes an
  optional `renewLease` flag (see room-lease methods below).
- Matchmaking queue methods — shared waiting-player queue, with a lock to
  stop two workers creating the same room.
- Pub/sub methods — publish room events tagged with the source pod/worker id
  so a worker can ignore its own echo.
- Room lease methods — `claimRoomLease(roomId)` / `getRoomLeaseOwner(roomId)`,
  backed by `ROOM_LEASE_SECONDS`; decide which pod owns a hydrated room's
  timers. Used by [[Lobby Manager]]'s `hydrateRoom` (`canOwnTimers` check).
- `getPodId()` / `getReconnectTtlSeconds()` — accessors used by
  [[Lobby Manager]] for logging/TTL decisions.

## Depends on
- Internal: none (consumed by [[Lobby Manager]], doesn't depend back on it).
- External: `redis` npm package (lazily required only when a real connection
  is attempted, so this file loads fine even without the package present).

## Notes
- This is active-session state for matchmaking/reconnect, not long-term
  player/leaderboard persistence.
- Room snapshots preserve serializable gameplay state — shape inventory,
  `currentHeight`, `impactScores`, `impactPowers`, `drawPile`,
  `teamCarryOverBlocks`, `towerBlocks`, quick-chat cooldown timestamps —
  while excluding transient chat events. `impactScores` / `impactPowers`
  persistence is what keeps rollback behavior correct after a reconnect or
  worker recovery.
- The connection retry loop's final cleanup step wraps `client.disconnect()`
  in its own try/catch that intentionally swallows errors — this is
  best-effort cleanup after an already-failed connection attempt, not a bug;
  there's nothing meaningful left to do if the disconnect itself also fails.
- Falls back to in-memory maps when `REDIS_URL` is not configured, so the
  server (and [[Balance Simulator]], which never goes through this file)
  keeps working in single-worker/local setups.
- Only the pod holding a room's lease should run that room's timers — other
  pods may still read/hydrate the room's state without owning its clock.
