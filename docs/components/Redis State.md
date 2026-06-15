# Redis State

## Purpose
- Shared state adapter for horizontally scaled Corp Tower server workers.
- File: `src/Server/Redis_State.js`.

## Responsibilities
- Connect to Redis when `REDIS_URL` is configured.
- Generate global player and room ids.
- Store reconnect sessions and reconnect TTL.
- Store shared matchmaking queue and room snapshots, including tower placement history.
- Publish room events across workers.
- Fall back to in-memory maps when `REDIS_URL` is not configured.

## Key Logic
- `RECONNECT_TTL_SECONDS` controls session expiry; staging deploy currently sets `10`.
- Session records map reconnect token/player id to room id and connection state.
- Room snapshots remove live WebSocket references before storing.
- Room snapshots preserve serializable gameplay state such as shape inventory, `currentHeight`, and `towerBlocks`.
- Matchmaking lock prevents multiple workers from creating the same room.
- Room publish events include source pod/worker id so workers ignore their own echo.

## Inputs/Outputs
- Input: [[Lobby Manager]] state operations and Redis endpoint from deploy env.
- Output: Redis keys/channels for sessions, matchmaking, rooms, room leases, and room events.

## Dependencies
- `redis` npm package.
- [[Lobby Manager]]

## Notes
- Redis in staging runs as Docker `redis:7-alpine` on EC2-1 gateway.
- This is active-session state, not long-term player/leaderboard persistence.
- `towerBlocks` persistence lets resumed rooms redraw the visible tower without recomputing it client-side.
