# Networking

Scope: the WebSocket wire protocol end to end — message contracts, payload shapes,
and the two thin adapters that sit directly on the wire. Gameplay meaning →
[gameplay.md](./gameplay.md). What populates these payloads →
[backend.md](./backend.md).

## Connection

- **The endpoint is resolved at build time, not hardcoded.** `NetworkManager.gd`
  aliases generated `EndpointConfig.PRIMARY`/`FAILOVER`. EKS and Android builds
  ship an **empty** `FAILOVER`; the physical backup's two dev builds cross-fail
  over.
- Client: Godot `WebSocketPeer`. Server: the `ws` package.
- **The server is always authoritative.** NetworkManager updates UI state only
  after a server message arrives, never optimistically.

## Reconnect

- The client sends `reconnect` immediately after the socket opens, with stored
  `playerId`/`reconnectToken` persisted in Godot `user://`.
- A valid pair resumes the same room and slot (`room_resumed`); otherwise the
  server creates a new session and joins or creates a room (`room_created`).
- `reconnect` also carries `profileId`, `accessToken`, and `authProvider`.
  **The token is the identity; `profileId` is only the fallback** — a Supabase
  token supplies its `sub`; a native Facebook token is verified against Meta and
  deterministically mapped to a UUID, either overriding the claimed `profileId`.
  While
  `SUPABASE_AUTH_REQUIRED` is `false` an absent or expired token is not an error
  and the server drops to `profileId`; `true` closes the socket with `4401`.
- **Client auto-reconnect fires only after *unintended* disconnects**, and only
  when the last known room had 3 real players and no bots. Manual disconnect and
  app close never trigger it. Finite attempt count.

## Server → client

| Message | Contents |
|---|---|
| `room_created` | `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, initial `blocks`, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, `nextDrawBlock`, `roster`, plus `matchStarted` and `lobby` below |
| `room_resumed` | Same shape, for an existing session |
| `match_started` | Same field set as `room_created`, minus the reconnect and lobby fields. Sent when the last player readies |
| `lobby_update` | `roomId`, `roster`, `readyPlayerIds`, `readySecondsRemaining`, `timerActive` — sent on every join, leave, or ready toggle |
| `game_state` | Authoritative live state — fields below |
| `debug_config` | Authoritative debug state; meanings → [gameplay.md](./gameplay.md#debug-menu-and-live-tuning) |
| `room_closed` | Teardown `reason`, sent to connected real players |

**Every new connection triggers a `debug_config` broadcast to all connected real
players on its first message**, not only on config changes.

## Rooms fill incrementally; there is no matchmaking queue

A connecting player takes a free seat in an open room or becomes seat one of a
new one (`joinOrCreateRoom`); `room_created`/`room_resumed` arrive as soon as a
seat is claimed, at 1, 2 or 3 occupants. Claiming a seat does not start the
match — `createRoom` leaves the engine room `state: "waiting"`, and `startLevel`
runs later in `startMatch`, once the room is **full and** every seat is ready.

- `matchStarted` is `false` for the whole ready-up window, `true` afterwards.
  `lobby` carries `readyPlayerIds`, `readySecondsRemaining`, and `timerActive`
  while it is `false`.
- **The ready countdown only exists once the room is full.** `timerActive` is
  `false` (and `readySecondsRemaining` is `0`) while a room waits on more seats;
  reaching `playersPerRoom` arms a fresh `lobbyReadyTimeoutMs` window. Dropping
  back under capacity cancels the timer outright — refilling later starts a full
  new window, it never resumes a partial one.
- `readySecondsRemaining` is an **integer recomputed at every send** from the
  room's deadline, never a wall-clock timestamp.
- **Bots are pre-readied at formation** — they cannot tap a button, so a debug
  room waits only on its real players.
- **`ready` toggles the seat**, both directions, via `toggleLobbyReady`. Tapping
  again before the match starts un-readies. All-full-and-all-ready is what starts
  the match; ignored once `matchStarted`.
- Seats per room is `playersPerRoom`; the ready window is `lobbyReadyTimeoutMs`.
  Both live in `Game_Config.js`.

**Any lobby-stage departure — a tapped `leave_lobby`, a dropped socket, or a
ready-timeout eviction — removes just that seat, via `evictLobbyPlayer`.** The
room keeps going for whoever is left as long as a real player remains: ready
state resets for the survivors (bots stay pre-readied) and the timer cancels
until the room refills. Only an empty-of-real-players room actually closes
(`closeRoom`), which is why `player_left_lobby` never reaches a client in the
ordinary case — the leaver navigates on their own tap, and the room they left
usually still has someone in it to keep going rather than to notify.

| `reason` | When | Who is told, and what the client does |
|---|---|---|
| `lobby_timeout` | The full-room window expired | Only the **not-ready** seats, each with their own `room_closed` → a 3s modal, then Home. Ready seats and bots stay in the persisted room |
| `player_left_lobby` | The room emptied of real players | Nobody in practice — the departing player already navigated locally |
| anything else | Existing teardown (started-match paths) | Join Screen (Home in demo mode) |

**During ready-up, `removePlayer` checks `!room.matchStarted` before the
reconnect-grace path**, so a dropped socket evicts immediately rather than
arming the reconnect timer. That grace window belongs to started matches only.

Lobby state **is** persisted (`matchStarted`, `readyPlayerIds`, `lobbyDeadlineAt`
in the room snapshot), and `hydrateRoom` restores all three and re-arms the
timeout from the stored deadline on reconnect.

**Cross-pod joins never mutate a room owned by another pod.** `claimOpenRoom`
checks the Redis-tracked `matchmaking:open_rooms` set, but only ever attaches a
new player directly when the local pod already owns that room (or the snapshot's
`ownerPodId` says it should). A room another live pod owns is left alone and put
back in the open set — the requesting pod creates its own room instead of racing
a mutation into memory it doesn't own. **Trade-off:** two players connecting to
different pods at the same instant aren't guaranteed the same room, only
guaranteed each lands in *some* room. Same-pod joins always share the open one.

## Client → server

| Message | Validation |
|---|---|
| `reconnect` | Token and id may resume a room; otherwise a new session joins/creates a room. `accessToken` and `authProvider` are verified; see Reconnect above |
| `ready` | Requires a room; ignored once `matchStarted`. Toggles the seat's ready state and may start the match |
| `leave_lobby` | Requires a room; ignored once `matchStarted`. Closes the room as `player_left_lobby` |
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
exports; its interface *is* the message protocol above.** Also serves one plain
HTTP route on the same port, `GET /api/stats/demo` (JSON demo-stat counts) — the
server's only non-WS surface, polled by the portfolio site's build step only,
never a browser.

- Starts on `PORT` (default `3000`).
- Accepts the initial `reconnect` handshake, **verifies its `accessToken` and
  `authProvider` first**, resolves the verified credential to a game-owned player
  account, then creates or resumes the session and adds the player to Lobby
  Manager.
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
  `origin_y >= 0`**), `send_ready()`, `leave_lobby()`,
  `send_quick_chat(slot)`, `activate_power(slot)`, `update_config(key, value)`.
- **Signals:** `status_changed`, `room_joined`, `match_started`, `lobby_updated`,
  `room_closed`, `game_state_updated`, `client_status`, `debug_config_updated`.
- `room_joined` fires for **both** `room_created` and `room_resumed` and means only
  "you have a seat", so listeners **must branch on `matchStarted`**. `ScreenManager`
  routes to lobby or game on that flag and swaps in on `match_started`; `Main.gd`
  primes the UI on `match_started` *and* on a `room_joined` already reporting
  `matchStarted`, which is what a mid-match reconnect delivers. ScreenManager builds
  the play instance on entering Find Match *or* the lobby, so Main's listeners exist
  before `match_started` arrives.
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

**Carries no debug logging by design** — every state transition is already
observable through its signals.
