# Networking

Scope: the WebSocket wire protocol end to end — message contracts, payload shapes, and the two thin adapters that sit directly on the wire (Server Entry, NetworkManager). Gameplay meaning of the data → [gameplay.md](./gameplay.md). What populates these payloads → [backend.md](./backend.md).

## Connection

- Primary endpoint: `wss://ws.tod.galaxxigames.com` (K3s-on-EC2, Cloudflare-DNS-managed `A` record).
- Failover endpoint: `wss://devtod.galaxxigames.com` — a manually-operated physical backup machine, reached via Cloudflare Tunnel. Separate hostname, deliberately not a subdomain of `tod.` — rationale (cert-depth, DNS-ownership split) → [deployment.md § Backup server](./deployment.md#backup-server-manual-physical-machine) and [decisions.md](./decisions.md#backup-server-separate-hostname-and-out-of-repo-automation).
- Client: Godot `WebSocketPeer`, wrapped by [NetworkManager](#networkmanager), which tries the primary endpoint first and automatically falls over to the backup endpoint on connect failure/timeout — see [NetworkManager](#networkmanager) below.
- Server: `ws` package, entry point [Server Entry](#server-entry).
- Server is always authoritative — client requests are never trusted as final state; NetworkManager only updates UI state after a server message arrives, never optimistically.

## Reconnect

- Client sends `reconnect` immediately after the socket opens, with stored `playerId`/`reconnectToken` (persisted in Godot `user://`).
- Valid token/id resumes the same room/slot (`room_resumed`); otherwise the server creates a new session and queues the player (`room_created`).
- **Client auto-reconnect** (NetworkManager): only fires after *unintended* disconnects, and only when the last known room had 3 real players and no bots (tracked via `game_state.players[].isBot` + count). Manual disconnect and app close never trigger it. Retries a short delay with a finite attempt count.
- Design-level rule (TTL default, room-destroy-if-empty behavior) → [gameplay.md § Reconnect](./gameplay.md#reconnect-and-shared-room-continuity-design-rule). Server-side implementation → [backend.md § Lobby Manager](./backend.md#lobby-manager).

## Message contracts

### Server → Client

| Message | Contents |
|---|---|
| `room_created` | New assignment: `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, initial `blocks`, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, `nextDrawBlock` |
| `room_resumed` | Same shape as `room_created`, for an existing session |
| `game_state` | Authoritative live state — see [Block & tower payloads](#block--tower-payloads) and [Score UI payloads](#score-ui-payloads) below for the full field breakdown |
| `debug_config` | Authoritative debug state: bot enable/count/strategy, `debugStartLevel`, timing/target tuning, popup/summary durations, supply pressure, `impactMinContributionShare`, tower-stability tuning, Power tuning, scoring multipliers — full variable meanings in [gameplay.md](./gameplay.md#currently-exposed-variables) |
| `room_closed` | Teardown reason, sent to connected real players |

Every new connection triggers a `debug_config` broadcast to all connected real players on its first message (`broadcastDebugConfig()`), not only on config changes.

### Client → Server

| Message | Validation |
|---|---|
| `reconnect` | Token/player id may resume a room; otherwise server creates a new session and queues the player |
| `place_block` | Valid room, player, state, cooldown, inventory, block index; `lane` = `left`/`center`/`right` (defaults to `center` if absent/invalid). Server maps lane → grid `originX` via `resolveLaneOriginX` |
| `activate_power` | Valid room, player, held item at `slot`, shared activation cooldown. **No target field** — effect applies to every player in the room, caster included. There is no separate refresh message; refresh is `activate_power` with a `refresh` item, and rerolls every player's blocks unconditionally |
| `send_quick_chat` | Valid active room, template slot `0..2`, server-authoritative per-player cooldown |
| `update_config` | Key allowlist, value ranges, bot-delay min/max, bot-count clamp, bot-strategy allowlist, tower-stability feedback-mode allowlist, `resetDebugConfig` default-restore action — exact clamp ranges in [backend.md § Lobby Manager](./backend.md#lobby-manager) |

## Client Placement UI

Inventory cards use drag-and-drop, not tap-to-place:
- Drag starts only on active slots with blocks, while match state is `playing` and the local placement cooldown has elapsed. Locked/empty slots and blocked server states don't start a drag.
- Release inside `TowerDropZone` sends `place_block` with the brick's inventory index **and a `lane`**. The lane comes from the release x-position within the drop zone, split into thirds → `left`/`center`/`right` (`InventoryController.lane_for_global_pos`). Release elsewhere cancels locally with no server message.
- Only the x→lane bucket is meaningful; exact pointer y/geometry is visual only. The server still owns the final grid `originX`/`originY` (drop-to-contact).
- `game_state`/`debug_config` stay backward-compatible; drag behavior layers local cooldown timing (from `placementCooldown`) on top of existing authoritative fields.

## Block & tower payloads

| Field | Meaning |
|---|---|
| `blocks[]` (inventory) | Server-assigned fixed-orientation bricks `{ id, shapeId, cells, anchorX, height }` (5 shapes `I`/`O`/`L`/`T`/`Z`). `anchorX` = the local cell column aligned to the chosen placement lane |
| `activeInventorySlots` | Currently unlocked active hand slots |
| `maxActiveBlocks` | Max active hand slots the UI/rules support |
| `nextDrawBlock` | First block in the shared draw pile, or `null` when empty |
| `drawPileCount` | Remaining shared pile size, including `nextDrawBlock` |
| `cells` | `[x, y]` unit-coordinate array; used by the client for shape previews and tower rendering |
| `height` | Vertical footprint derived from `cells` — not necessarily equal to cell count |
| `towerBlocks[]` | Ordered placement history: `{ playerId, block, height, effectiveHeight, baseHeight }`, so clients can redraw the tower after a broadcast or reconnect |
| `originX` / `originY` | Resolved structural coordinates (lane-derived `originX`, drop-settled `originY`) on the 5-column grid |
| `towerStability` / `towerStabilityDiagnostics` | Stability score + diagnostics `{ comOffset, laneImbalance, overhangPenalty, tiltScore, tiltAngleDeg, leanDirection, collapsed }` (see [backend.md § Tower Stability](./backend.md#tower-stability)) |
| `impactScoreStatus` | Right-panel helper: next Impact level, ready-count inputs, per-player leaderboard score goals |

Legacy numeric block values are still tolerated by the Godot client as vertical fallback blocks. Redis persists structural fields (`originX`/`originY` etc.) so a recovered room reproduces the same tower structure.

## Score UI payloads

| Field | Meaning |
|---|---|
| `scoreEvents[]` | Transient, broadcast-only. Each: stable `id`, `type`, `level`, optional `playerId`/`points`/`label`/`displayOnly`/`meta`. Types: `placement`, `precision_bonus`, `team_exact_bonus`, `impact_fill_bonus`, `exact_finish`, `overbuild_finish`, `mvp` (plus `finisher_bonus`/`assist_bonus` only if those multipliers are re-enabled — both default 0, so no event) |
| `quickChatEvents[]` | Transient, broadcast-only: `id`, `playerId`, template `slot`, display `text`, `createdAt`. Never persisted or replayed after reconnect |
| `lastLevelSummary` | `result`, `reason`, `teamLevelScore`, `mvpId`, `mvpScore`, `exactFinish`, `overbuildHeight`, `finisherId`, `finishingBlock`, `carriedBlockCount`, `players[]` (per-player: id, bot flag, level score, previous/final total, contributed height, MVP flag, bonus breakdown). Impact failures also include `impactScoreStatus` |

- Clients track seen event ids per level and never infer scoring UI from aggregate score diffs.
- Placement events use `placementScorePopupDurationMs`; MVP/Perfect-Fit/Impact/bonus events use `finishScorePopupDurationMs` (both = total popup lifetime incl. fade-out).
- Level summaries queue until the current score-popup batch fades, then stay visible for `levelSummaryDelayMs`.
- Completed summaries bank level score into final totals; failed summaries keep previous == final totals.

## Persisted room gameplay state (Redis)

Room snapshots include `impactScores`, `impactPowers`, `drawPile`, `teamCarryOverBlocks`, `towerBlocks`, timers, level state, and serializable player inventory/score fields.

- `impactScores` restores leaderboard totals during rollback, so reconnect/multi-worker recovery can't reintroduce score farming.
- `impactPowers` restores Power inventory during rollback when `powerLifetime` is `impact` (default), for the same reason.
- `drawPile`/`nextDrawBlock` are persisted so a reconnecting client sees the same shared refill queue.
- Storage mechanics (Redis vs. in-memory fallback, lease ownership) → [backend.md § Redis State](./backend.md#redis-state).

---

## Server Entry

`src/Server/app/Server.js` — WebSocket entry point for the authoritative server. Not a module with exports; its interface *is* the message protocol above.

- Starts the WebSocket server on `PORT` (default `3000`).
- Accepts the initial `reconnect` handshake, creates/resumes the session, adds the player to [Lobby Manager](./backend.md#lobby-manager).
- Routes `update_config`, `place_block`, `send_quick_chat`, `activate_power` to the player's room's [Game Engine](./backend.md#game-engine).
- On socket close: removes the player through Lobby Manager (reconnect TTL handling continues there, so a brief disconnect doesn't end the room).
- JSON parse failures on incoming messages are logged and ignored, not treated as connection-fatal.

**Depends on:** Lobby Manager (internal); `ws` (external).

## NetworkManager

`src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd` — the client's only connection to the server, registered as an autoload singleton.

- **Methods:** `connect_server(is_auto_reconnect := false, is_failover_retry := false)`, `disconnect_server()`, `toggle_connection()`, `place_block(block_index)`, `send_quick_chat(slot)`, `activate_power(slot)`, `update_config(key, value)`.
- **Signals:** `status_changed(text)`, `room_joined(data)`, `room_closed(data)`, `game_state_updated(data)`, `client_status(status)`, `debug_config_updated(config)`.
- **State (read directly by [Main UI Controller](./ui.md#main-ui-controller) in places, not only via signals):** `is_conn_estab: bool`, `player_id: String`.
- **Primary/backup failover:** every fresh connect (`is_auto_reconnect` and `is_failover_retry` both false) starts at `SERVER_URL` (primary). `WebSocketPeer` has no built-in connect timeout, so a manual one is enforced: a connection stuck in `STATE_CONNECTING` past `CONNECT_TIMEOUT_SECONDS` (`5.0`) is force-closed via `ws.close()`, which flows into the normal `STATE_CLOSED` handling. If that closure happened before the socket ever reached `STATE_OPEN`, and the backup hasn't been tried yet this connect cycle (`tried_failover`), NetworkManager retries once against `FAILOVER_SERVER_URL` (`connect_server(false, true)`), emitting `"Primary server unreachable, trying backup..."`. Once failed over, in-game auto-reconnects (real `is_auto_reconnect` retries) keep targeting the backup rather than flipping back to primary — a fresh manual connect (`toggle_connection()`) is what resets to primary again.
- Doesn't interpret block geometry itself — [Main UI Controller](./ui.md#main-ui-controller) and [Tower Stack](./ui.md#leaf-components) own shape previews and tower drawing.
- Carries no debug logging by design — every state transition is already observable through its signals.

**Depends on:** Godot's `WebSocketPeer` (external only).
