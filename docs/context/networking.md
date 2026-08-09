# Networking

Scope: the WebSocket wire protocol end to end — message contracts, payload shapes,
and the two thin adapters that sit directly on the wire. Gameplay meaning →
[gameplay.md](./gameplay.md). What populates these payloads →
[backend.md](./backend.md).

## Connection

- **The endpoint is resolved at build time, not hardcoded.** `NetworkManager.gd`'s
  `SERVER_URL`/`FAILOVER_SERVER_URL` alias `EndpointConfig.PRIMARY`/`FAILOVER`,
  generated into `Sys/NetMan/Endpoint_Config.gd` by `write-endpoint-config.sh`
  before each build. Prod and test K3s builds ship an **empty** `FAILOVER`; the
  physical backup's two dev builds fail over to each other.
- Client: Godot `WebSocketPeer`. Server: the `ws` package.
- **The server is always authoritative.** NetworkManager updates UI state only
  after a server message arrives, never optimistically.

## Reconnect

- The client sends `reconnect` immediately after the socket opens, with stored
  `playerId`/`reconnectToken` persisted in Godot `user://`.
- A valid pair resumes the same room and slot (`room_resumed`); otherwise the
  server creates a new session and queues the player (`room_created`).
- **Client auto-reconnect fires only after *unintended* disconnects**, and only
  when the last known room had 3 real players and no bots. Manual disconnect and
  app close never trigger it. Finite attempt count.

## Server → client

| Message | Contents |
|---|---|
| `room_created` | `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, initial `blocks`, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, `nextDrawBlock` |
| `room_resumed` | Same shape, for an existing session |
| `game_state` | Authoritative live state — fields below |
| `debug_config` | Authoritative debug state; meanings → [gameplay.md](./gameplay.md#debug-menu-and-live-tuning) |
| `room_closed` | Teardown reason, sent to connected real players |

**Every new connection triggers a `debug_config` broadcast to all connected real
players on its first message**, not only on config changes.

## Client → server

| Message | Validation |
|---|---|
| `reconnect` | Token and id may resume a room; otherwise a new session is created and queued |
| `place_block` | Valid room, player, state, cooldown, inventory, block index. See below |
| `activate_power` | Valid room, player, held item at `slot`, shared cooldown. **No target field** — the effect is room-wide, caster included |
| `send_quick_chat` | Valid active room, template slot `0..2`, server-authoritative per-player cooldown |
| `update_config` | Key allowlist and value ranges — the exact clamps live in [backend.md](./backend.md#updatedebugconfig--the-authoritative-validation) |

### `place_block` carries two placement fields

`column` is the integer target origin column; an absent or invalid one falls back
to the level's site minimum. The server maps column → grid `originX` via
`resolveColumnOriginX`, clamped to the brick's valid range for **that level's
site**.

`originY` is **optional and does cross the wire.** It is the integer row the
client aimed at; when legal it becomes the brick's **release row** and the brick
falls from there. Omitted — bots, unsnapped drags — or illegal by arrival, the
brick is released above the tower instead, never rejected.

**A server that ignores `originY` silently reverts every client to top-of-tower
placement.** Wire, both settle mirrors and the ghost preview move together.

**Landmine — `Number(null)` is `0`.** "Absent" must be tested before the numeric
coercion on the server, or every origin-less placement threads into the lowest gap
that fits.

The client sends `originY` **only when the resolution was `exact`** — a
beyond-snap-radius aim leaves the row to the server. `target_point` and
`matched_vertex` are client-side presentation only and never cross the wire.

The server still owns the final `originX`/`originY` and re-clamps the client's
column authoritatively, so a stale client preview can never corrupt placement.

## Block and tower payloads

| Field | Meaning |
|---|---|
| `blocks[]` | Server-assigned bricks `{ id, shapeId, cells, height }`, each dealt with a random rotation baked into `cells`/`height`. **No per-block anchor cell** |
| `activeInventorySlots` / `maxActiveBlocks` | Currently unlocked, and the maximum the rules support |
| `nextDrawBlock` / `drawPileCount` | First block in the shared pile (`null` when empty), and the remaining size including it |
| `cells` | `[x, y]` unit-coordinate array |
| `height` | Vertical footprint derived from `cells` — **not necessarily equal to cell count** |
| `towerBlocks[]` | Ordered placement history: `{ playerId, block, height, effectiveHeight, baseHeight, balanceDelta }`, so clients redraw after a broadcast or reconnect |
| `balanceDelta` | Per-brick, stamped once at placement and never recomputed. The client maps it to a face; **an entry without the field draws no face at all**, which is how a pre-feature server or snapshot is meant to look |
| `originX` / `originY` | Resolved structural coordinates on the grid, confined to the level's site |
| `accessibility` | The room's input-mode defaults. Sent every tick; a player's local override wins |
| `visualHooks` | The toggles **and every Impact Beat duration**. Sent every tick, and **the only route the durations take** — they are not `debug_config` keys |
| `towerGridWidth` | Authoritative grid width. **The client derives its render centre from this** — a hardcoded centre draws the whole tower off-centre the moment the grid is retuned |
| `placeableColumnMin` / `Max` | The level's buildable site, derived server-side from target height. Sent every tick; the client feeds them to `SnapGrid.set_placeable_range` so snap points, origin ranges and the placeable band all follow |
| `towerStability` / `towerStabilityDiagnostics` | Score plus the diagnostics object |
| `impactScoreStatus` | Next Impact level, ready-count inputs, per-player score goals |

Legacy numeric block values are still tolerated by the client as vertical fallback
blocks. Redis persists the structural fields, so a recovered room reproduces the
same tower.

## Score UI payloads

| Field | Meaning |
|---|---|
| `scoreEvents[]` | Transient, broadcast-only. Each carries a stable `id`, `type`, `level`, and optional `playerId`/`points`/`label`/`displayOnly`/`meta` |
| `quickChatEvents[]` | Transient: `id`, `playerId`, `slot`, `text`, `createdAt`. **Never persisted or replayed after reconnect** |
| `lastLevelSummary` | `result`, `reason`, `teamLevelScore`, `mvpId`, `mvpScore`, `exactFinish`, `overbuildHeight`, `finisherId`, `finishingBlock`, `carriedBlockCount`, `sideQuest`, and `players[]`. Impact failures also include `impactScoreStatus` |

Event types: `placement`, `reinforce`, `precision_bonus`, `team_exact_bonus`,
`exact_finish`, `overbuild_finish`, `mvp`, `tower_warning`, `tower_critical`. The
`finisher_bonus`/`assist_bonus` types exist but both multipliers default to 0, so
no event is emitted.

**`exact_finish` and `overbuild_finish` are sent but never rendered** —
`ScorePopupController` drops them before building a popup, since the Top Indicator
already shows that state live during play.

- **Clients track seen event ids per level and never infer scoring UI from
  aggregate score diffs.**
- Placement **and `reinforce`** use the placement popup duration, since reinforce
  fires alongside a placement; MVP, Impact and bonus events use the finish
  duration. Both are total popup lifetime including fade-out.
- Level summaries queue until the current popup batch fades. Completed summaries
  bank level score into final totals; **failed summaries keep previous == final.**

## Persisted room state (Redis)

Snapshots include `impactScores`, `impactPowers`, `drawPile`,
`teamCarryOverBlocks`, `towerBlocks`, timers, level state, and serializable player
fields.

- `impactScores` restores leaderboard totals during rollback, so reconnect and
  multi-worker recovery **cannot reintroduce score farming**. `impactPowers` does
  the same for Power inventory.
- `drawPile` is persisted so a reconnecting client sees the same refill queue — but
  **only the first 16 bricks**, plus a hidden count the engine regenerates. Only
  the next draw is client-visible, so the regenerated tail is invisible.

## Server Entry

`src/Server/app/Server.js` — the WebSocket entry point. **Not a module with
exports; its interface *is* the message protocol above.**

- Starts on `PORT` (default `3000`).
- Accepts the initial `reconnect` handshake, creates or resumes the session, adds
  the player to Lobby Manager.
- Routes `update_config` to the debug-config coordinator, and
  `place_block`/`send_quick_chat`/`activate_power` through `dispatchRoomAction`,
  which runs the room's engine locally **if this pod owns the room**, or forwards
  to whichever pod does.
- On socket close, removes the player through Lobby Manager — reconnect TTL
  handling continues there, so a brief disconnect doesn't end the room.
- **JSON parse failures are logged and ignored, not treated as connection-fatal.**

## NetworkManager

`Sys/NetMan/NetworkManager.gd` — the client's only connection to the server,
registered as an autoload singleton.

- **Methods:** `connect_server(is_auto_reconnect, is_failover_retry)`,
  `disconnect_server()`, `toggle_connection()`,
  `place_block(block_index, column, origin_y)` (**sends `originY` only when
  `origin_y >= 0`**), `send_quick_chat(slot)`, `activate_power(slot)`,
  `update_config(key, value)`.
- **Signals:** `status_changed`, `room_joined`, `room_closed`,
  `game_state_updated`, `client_status`, `debug_config_updated`.
- **State read directly** by Main UI Controller in places, not only via signals:
  `is_conn_estab`, `player_id`.

**Primary/backup failover.** `WebSocketPeer` has **no built-in connect timeout**,
so a manual one is enforced: a connection stuck in `STATE_CONNECTING` past
`CONNECT_TIMEOUT_SECONDS` (5.0) is force-closed, which flows into normal
`STATE_CLOSED` handling. If that closure happened before the socket ever reached
`STATE_OPEN`, the backup hasn't been tried this cycle, and `FAILOVER_SERVER_URL`
is non-empty, it retries once against the backup.

A build with an empty `FAILOVER_SERVER_URL` never takes that branch — it just
reports disconnected. **Once failed over, in-game auto-reconnects keep targeting
the backup**; only a fresh manual connect resets to primary.

It does not interpret block geometry itself, and **carries no debug logging by
design** — every state transition is already observable through its signals.
