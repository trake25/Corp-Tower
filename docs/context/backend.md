# Backend

Scope: server-side game logic — matchmaking, room lifecycle, authoritative gameplay rules, scoring, physics, config, shared state. Wire protocol → [networking.md](./networking.md). Game design meaning → [gameplay.md](./gameplay.md). Deploy/infra → [deployment.md](./deployment.md).

All modules live under `src/Server/app/`. `Game_Engine.js` is the facade; `Block_Supply.js`, `Scoring.js`, `Impacts.js` (under `engine/`) follow the **engine module delegation pattern** — see [coding-conventions.md](./coding-conventions.md) — so their functions are only ever called through the `GameEngine` instance, never `require()`d directly by outside callers.

## Lobby Manager

`Lobby_Manager.js` — matchmaking, room lifecycle, runtime debug-config coordinator.

- Maintains waiting players and active rooms, through shared Redis state when `REDIS_URL` is enabled.
- Creates 3-participant rooms, filling with debug bots when allowed.
- Validates/broadcasts debug-config updates; lets real players resume within the reconnect TTL; destroys rooms when the TTL expires with no connected real players.
- Preserves hydrated room state (shape inventories, tower history) when a room is recovered from shared state.
- Hands a player off to whichever pod owns their live WebSocket when that pod isn't the one that formed their room — see the cross-pod room handoff note below.

**Interface:** `addPlayer(player)`, `tryCreateRoom()`, `closeRoom(room, reason, disconnectedPlayer)`, `resumePlayer(player, roomId)`, `handleRoomReconnectExpired(roomId)`, `handlePlayerAssignment({playerId, roomId, sourcePodId})`, `updateDebugConfig(key, value)`, `start()`, `createPlayer(ws, reconnectRequest)`, `broadcastDebugConfig()`, `removePlayer(player)`.

**Depends on:** Game Engine, Game Config, Redis State (required, default-instantiated — not just optionally wired in), Bot Manager (indirectly, via the engine it starts).

**Notes:**
- Reconnect TTL default is 60s (`RECONNECT_TTL_SECONDS`) — a **staging value, not necessarily final for production**.
- `updateDebugConfig` validation (the authoritative version of these rules — [gameplay.md](./gameplay.md#debug-menu-and-live-tuning) covers what each variable *means*):
  - Unknown keys rejected; numeric values clamped to safe ranges.
  - `placementScorePopupDurationMs` / `finishScorePopupDurationMs` clamp to 500–10000 ms; `levelSummaryDelayMs` clamps to 1000–10000 ms.
  - `debugBotStrategy` accepted only as `cooperative` or `mvp_greedy`.
  - `debugBotDelayMax` ≥ `debugBotDelayMin` enforced.
  - `debugStartLevel` applies immediately by restarting active debug rooms at that level.
  - `resetDebugConfig` restores all exposed tunables to the Game Config startup defaults, then rebroadcasts `debug_config`.
  - `restartLevel` is a boolean action key (same shape as `resetDebugConfig`, not a real tunable): restarts every active room at its **current** level via `restartAtLevel(room.level, { resetScores: false })` — level state (blocks/tower/timer) resets but total player score is preserved, unlike `debugStartLevel`'s full reset. Triggered by the Debug Overlay's Restart button ([ui.md](./ui.md#main-ui-controller)), which also closes the overlay on press.
  - Debug settings are runtime tuning only, never player progression data.
- Hydrated room snapshots include `towerBlocks`, so non-owner workers and reconnecting clients can redraw the tower without recomputing it client-side.
- **Matchmaking queue draining is atomic, not read-modify-write:** `tryCreateRoom()` calls Redis State's `dequeueRealPlayers(3)` (atomic pop) instead of reading the full queue and rewriting it — see [decisions.md](./decisions.md#matchmaking-queue-lost-update-and-cross-pod-room-delivery-gap) for why.
- **Cross-pod room handoff:** when `createRoom()` assigns a player who isn't locally connected on this pod (their `ws` is `null` here), it calls Redis State's `publishPlayerAssignment(playerId, roomId)` instead of sending directly. Every pod subscribes to this at `start()`; the pod that actually owns that player's socket receives the event via `handlePlayerAssignment` and calls `resumePlayer(player, roomId)` — the same `hydrateRoom`/subscribe path already used for genuine reconnects, so `room_created`/`room_resumed` and all subsequent `game_state` broadcasts reach the player correctly regardless of which pod formed the room.

## Game Engine

`Game_Engine.js` — authoritative gameplay rules and level lifecycle for one room; the facade over the `engine/` modules plus room/level lifecycle, timers, and the Power system.

**Responsibilities:** create room state and assign blocks; build/deal the draw pile; maintain placed-block tower history; resolve settling/stability before completion (via Tower Stability); run start-delay/timer/tick broadcasts; validate placement; validate/broadcast quick-chat and Power messages; run the Power side-quest and item-activation system; calculate scores; detect success/failure and advance/roll back levels; stop timers/bots on close; notify Lobby Manager of state changes for persistence.

**Interface** (one `GameEngine` class per room):
- **Lifecycle:** `createRoom(...)`, `hydrateRoom(...)`, `closeRoom(reason)`, `startLevel()`, `restartAtConfiguredStartLevel()`, `restartAtLevel(level, options)` (shared restart primitive; `restartAtConfiguredStartLevel()` calls it with `{ resetScores: true }` at `debugStartLevel` — Lobby Manager's `restartRoomsAtCurrentLevel()` calls it directly with the room's current level and `{ resetScores: false }`)
- **Placement:** `placeBlock(playerId, blockIndex)`
- **Scoring:** `addPlacementScore(...)`, `awardCompletionBonuses(...)`, `addLevelScoreToLeaderboard()`, `getLevelMVP()`, `buildLevelSummary(...)`
- **Impacts:** `saveImpactState()`, `restoreImpactScores()`, `restoreImpactPowers()`, `rollbackToImpact()`
- **Power:** `setupSideQuest()`, `grantDefaultPowers()`, `activatePower(playerId, slot)`, `consumePowerEvents()`, `clonePowerInventory(items)`, `anyPlayerCanRefresh()` (defers the not-enough-height fail check while a player still holds Refresh)
- **Stability:** `recalculateTowerStability()` (delegates the math to Tower Stability)
- **Called by Lobby Manager:** `stopBots()`, `broadcastGameState()`, `getImpactScoreStatus()`, `getBlocksPerPlayer()`, `getNextDrawBlock()`

**Depends on:** Game Config, Tower Stability, Bot Manager, Lobby Manager (notify-only, never called into for gameplay logic), Block Supply, Scoring, Impacts.

**Notes:**
- Level states: `waiting`, `starting`, `playing`, `finished`, `failed`, `game_completed`, `closed`.
- **Refresh has no token economy** (see [decisions.md](./decisions.md)): `activatePower()` takes no target — it loops every player in `room.players` and calls `generateRefreshBlocks(target.blocks || [])` for each when a `refresh` item is activated (`score_cap`/`copy_score` loop the same way). `anyPlayerCanRefresh()` scans every player's Power inventory for a held `refresh` item instead of checking a token count.
- **Guaranteed Refresh grant:** `grantDefaultPowers()` runs from `startLevel()` (every start/restart/rollback), giving each player one `{ id: "refresh" }` item if they don't already hold one and have space — independent of the quest/Impact-MVP paths. `setupSideQuest()`'s reward is hardcoded to `"refresh"` for now; `score_cap`/`copy_score` stay defined in `GameConfig.powerCatalog` but aren't awarded by the quest path. `Impacts.js`'s `awardImpactPower()` filters `Object.keys(GameConfig.powerCatalog)` down to entries with `active: true` before picking randomly — currently only `refresh` qualifies, since `score_cap`/`copy_score` are `active: false`. See [Game Config](#game-config) and [decisions.md](./decisions.md#score-cap--copy-score-disabled-via-powercatalog-active-flag).
- `scoreEvents[]` (built in Scoring) and `quickChatEvents[]`/`powerEvents[]` (queued directly here) are transient, broadcast-only, never persisted — don't infer scoring UI from aggregate score diffs.
- Engine owns live timers and rule execution; Lobby Manager/Redis State persist shared snapshots. This file never talks to Redis directly.
- `getRemainingMs()` (backs broadcast `secondsRemaining`) is state-dependent, not a single `endsAt` clock: counts down to `room.startsAt` during `starting`, to `room.freezeEndsAt` during `finished`/`failed` (set by `completeLevel()`/`failLevel()` to `now + getPostLevelTransitionDelayMs() + GameConfig.startDelayMs`), and to `room.endsAt` only during `playing`. Keeps the client's frozen-timer display counting down real time-to-resume instead of a stale round clock.
- No persistent leaderboard yet; see [decisions.md](./decisions.md#no-persistent-leaderboard-yet).
- Renamed from "Politics"/"Checkpoint" to "Power"/"Impact" — see [decisions.md](./decisions.md#politics--power-checkpoint--impact-rename) for the deploy-ordering consequence.

## Block Supply

`engine/Block_Supply.js` — block creation, shared draw pile, opening hands, refresh-block generation for one room. Follows the [engine module delegation pattern](./coding-conventions.md#server-engine-module-delegation-pattern).

**Responsibilities:** create blocks (id, shape variant, cells, derived height; level-weighted random size); build/shuffle/deal the draw pile (sized via Game Config's generated-pile scaling); generate a **solvable** opening hand (retries until hand+pile can exactly reach target height, with enough precision blocks and surplus within bounds — falls back to the last attempt if none qualifies); refill a hand slot after placement; trim an oversized hand to `maxActiveBlocks` (keeping tallest/largest); generate a useful refresh set; prepare team carry-over blocks on completion.

**Interface (grouped):**
- Block creation — `createBlock(blockSize, excludedShapeId)`, `getRandomBlock()`, `createRandomUnlockedBlock(minBlockSize)`, `isBlockSizeUnlocked(blockSize)`, `getWeightedUnlockedBlockSize(minBlockSize)`, `createBlockId()`, `cloneCells(cells)`, `getBlockHeight(block)`, `getBlockCellCount(block)`
- Draw pile — `getNextDrawBlock()`, `buildDrawPile()`, `getGeneratedDrawPileBlockCount()`, `generateDrawPileBlocks(count)`, `drawBlockFromPile()`, `shuffleBlocks(blocks)`, `getTotalBlockHeight(blocks)`
- Opening hand — `getBlocksPerPlayer()`, `dealOpeningHands()`, `generateSolvableOpeningHandBlocks()`, `isLevelBlockSupplyValid(blocks, minimumOpeningBlocks)`, `countPrecisionBlocks(blocks)`, `hasExactHeightCombination(blocks, targetHeight)`, `refillPlayerBlock(player)`, `trimInventory(blocks)`
- Refresh — `generateRefreshBlocks(currentBlocks)`, `createRefreshBlock(currentBlock)`, `isRefreshBlockSetUseful(blocks)`, `scoreRefreshBlockSet(blocks)`
- Carry-over — `prepareTeamCarryOverBlocks()`

**Depends on:** Game Config (direct `require`); Game Engine for room state and cross-calls between its own functions.

**Notes:** blocks are `{ id, shapeId, cells, height }` objects (`height` derived from `cells`' vertical span); legacy numeric blocks are still read as plain height values. Sizes unlock through Game Config. Team carry-over: discarded entirely on level failure — Game Engine never calls `prepareTeamCarryOverBlocks` on the failure path. Refresh generation never touches the draw pile; there's no cooldown/lockout gating *when* a refresh can happen anymore beyond the shared Power activation cooldown.

## Scoring

`engine/Scoring.js` — score events, placement/bonus scoring, leaderboard banking, MVP, level summaries. Follows the [engine module delegation pattern](./coding-conventions.md#server-engine-module-delegation-pattern).

**Interface (grouped):**
- Score events — `createScoreEvent(type, options)`, `queueScoreEvent(type, options)`, `consumeScoreEvents()`
- Placement/bonus — `recordScoreBreakdown(player, key, points)`, `addPlacementScore(player, block, effectiveHeight)`, `awardCompletionBonuses(finisher, exactFinish)`, `addBonusScore(player, points, label)`, `getBonusScoreEventType(label)`, `getBonusScoreEventLabel(label)`
- Leaderboard — `addLevelScoreToLeaderboard()`
- Summary/MVP — `getPlayerScoreMap()`, `getTeamLevelScore()`, `getPlayerBonusBreakdown(player)`, `buildLevelSummary(options)`, `getLevelMVP()`

**Depends on:** Game Config (direct `require`); Block Supply via the engine facade (`addPlacementScore` reads `engine.getBlockHeight(block)` for event `meta`).

**Notes:**
- **Score banking is two-stage:** placement/bonus points accumulate in `player.levelScore` during a level; only `addLevelScoreToLeaderboard()` moves that into `player.score`. This is why a failed level's score doesn't count toward the final total.
- Bonuses use multipliers from Game Config; a zero-value bonus emits no score event.
- `awardRefreshToken` (used to grant MVP/exact-finish token rewards from `completeLevel()`) is gone along with the refresh token economy.

## Impacts

`engine/Impacts.js` — Impact score snapshots, restore/rollback, and the Impact score gate for one room. Follows the [engine module delegation pattern](./coding-conventions.md#server-engine-module-delegation-pattern). Formerly `Checkpoints.js` — see [decisions.md](./decisions.md#politics--power-checkpoint--impact-rename).

**Responsibilities:** snapshot score + Power inventory at the start of an Impact band; restore on rollback; award a Power item to the Impact-band leader when an Impact opens; decide whether each player met the band's minimum contribution share; build the per-player Impact-status payload broadcast every tick; fail the room to `failed` (with a summary) when the gate isn't met, then roll back to the last Impact level.

**Interface (grouped):**
- Snapshots — `saveImpactScores()`, `saveImpactPowers()`, `saveImpactState()`, `ensureImpactScores()`, `ensureImpactPowers()`, `ensureImpactState()`, `restoreImpactScores()`, `restoreImpactPowers()`
- Score gate — `isImpactLevel(level)`, `getImpactScoreRequirement()`, `getImpactMinContributionShare()`, `getExpectedPlacementScoreForLevel(level)`, `getExpectedPlacementScoreForImpactBand(blockedLevel)`, `getImpactBandScoreRequirement(blockedLevel)`, `getImpactScoreFailures(blockedLevel)`, `getNextImpactLevel()`, `getImpactScoreStatus(blockedLevel)`, `hasMetImpactScoreRequirement(blockedLevel)`
- Rewards/rollback — `awardImpactPower()`, `failImpactScoreRequirement(blockedLevel)`, `rollbackToImpact()`

**Depends on:** Game Config (direct `require`); Game Engine via facade for lifecycle calls; Scoring via facade for score-event/summary calls.

**Notes:** `rollbackToImpact()` calls `engine.startLevel()` directly at the end — the room re-enters `starting` for the Impact level in the same call, not on a separate timer tick. `clonePowerInventory` used to live here but moved onto the Game Engine facade directly (pure Power data, no Impact semantics; it always ignored the `engine` argument it took).

## Tower Stability

`Tower_Stability.js` — pure, deterministic grid physics: settles a newly placed block and scores the resulting tower's stability. **Zero dependencies, internal or external.**

**Interface:**
- `settleBlock(entries, block, width) -> { originX, originY }` — drops `block` into `entries` on a grid of `width` columns; returns where it lands
- `evaluate(entries, config) -> { stability, diagnostics }` — `diagnostics = { comOffset, overhangPenalty, tiltScore, tiltAngleDeg, leanDirection, collapsed }`. Reads `towerOverhangWeight`, `towerMaxTiltAngleDeg`, `towerCollapseTiltScore` off `config`
- `cellsFor(entry)` / `cellsForEntries(entries)` — absolute grid cells for one or many entries
- `topHeight(entries)` — current highest occupied row

**Notes:**
- **Must stay pure — see [decisions.md](./decisions.md#tower-stability-must-stay-a-pure-function).**
- Tilt score = two independent components summed: `comOffset` (whole-tower lean — only horizontal CoM position vs. footprint matters, not height) + `overhangPenalty` (reaction to only the just-placed entry, so a bad placement reads as bad immediately without re-penalizing old, already-settled overhangs every later turn).
- Called from Game Engine: `settleBlock()` at placement time, `evaluate()` inside `recalculateTowerStability()` after every placement. Game Engine (not this file) compares the result against the warning/critical thresholds.
- Tuning-knob rationale lives in [Game Config](#game-config) — previously duplicated across this file, `Game_Config.js`, and `Lobby_Manager.js`.
- Guards against dividing by an empty base (no cells at `y === 0`), even though the first block placed should always settle on the floor.

## Bot Manager

`Bot_Manager.js` — QA/testing bot action scheduler. Bots are not production AI; they exist for testing rooms without three human players. Strategy behavior (cooperative vs. mvp-greedy) is the canonical design content in [gameplay.md § Bot behavior](./gameplay.md#bot-behavior) — this section covers only the scheduling mechanism.

**Interface:** `startBots(engine)` (stops existing timers, starts one loop per bot), `stopBots(engine)` (the method Game Engine calls on close/restart/stop — internally calls `stopBot(bot)` per bot). Internal-only: `stopBot(bot)`, `runBotLoop`, `chooseBotAction`.

**Depends on:** Game Config, Game Engine.

**Notes:** bots place through `Game Engine`'s `placeBlock()` by inventory index — the same authoritative path real players use. Timer tracking (`bot.botTimer`, `botLoopLevel`) exists specifically so a disconnected/closed room's bots don't keep running in the background. Bots never hold or activate Power items and always dispatch to `placeBlock` — no bot refresh behavior (`canBotRefresh` and related branches were removed with the refresh token economy).

## Game Config

`Game_Config.js` — single exported `GameConfig` object; the source of truth for every numeric/rule constant the server uses. **No dependencies, internal or external.**

**Grouped contents:** game settings (pacing, cooldowns, popup/summary durations, `impactInterval`), tower-stability settings, Power settings, block settings (`blockUnlockLevels`, `blockWeights`, `blockShapeVariants`), inventory settings, draw-pile/opening-hand/carry-over settings, refresh block-generation settings, scoring settings (`scoring` sub-object), debug settings. Full field-by-field table with current values/defaults → [gameplay.md § Currently exposed variables](./gameplay.md#currently-exposed-variables).

**Notes:**
- Lobby Manager validates debug changes before mutating this object; production should restrict debug writes behind admin permissions later (not yet implemented — see [decisions.md](./decisions.md#debug-menu--debug-config-not-yet-gated)).
- **Dead/unused keys:** `towerPlacementMode`, `nextLevelDelayMs`, `failRestartDelayMs` — nothing in `src/Server` reads them. The real post-level transition delay is `getPostLevelTransitionDelayMs()` (score-popup duration + `levelSummaryDelayMs`), not those keys.
- Tower-stability knob rationale (moved here from inline code comments, no longer the source of truth): `towerOverhangWeight` is the main "does one bad piece feel bad" lever — tune before `towerCollapseTiltScore`. `towerMaxTiltAngleDeg` is the visual lean cap at tilt score ±1.0. `towerCollapseTiltScore` is the collapse threshold (`1.0` = physical "CoM left the base"; raise for more forgiving, lower for hairier). `towerStabilityWarningThreshold`/`towerStabilityCriticalThreshold` gate the `tower_warning`/`tower_critical` display-only events; critical is clamped to never exceed warning.
- `powerCatalog` entries each carry an `active: boolean` flag — only `active: true` entries are eligible for [Impacts](#impacts)' `awardImpactPower()` random draw. Currently only `refresh` is active; `score_cap`/`copy_score` are `active: false` (kept fully defined, including their `activatePower()` effect branch, for a one-line re-enable later). See [gameplay.md § Effects catalog](./gameplay.md#effects-catalog) and [decisions.md](./decisions.md#score-cap--copy-score-disabled-via-powercatalog-active-flag).
- Inspect balance/score distribution with the [Balance Simulator](./testing.md#balance-simulator).

## Redis State

`Redis_State.js` — shared-state adapter so multiple server workers can share matchmaking/room state. Active-session state only (matchmaking/reconnect), **not** long-term player/leaderboard persistence.

**Interface:** `nextPlayerId()`/room-id equivalents (memory counters when Redis is disabled); session methods (reconnect token ↔ player/room mapping + TTL); room snapshot methods (`saveRoom(room, renewLease)`, strips live WebSocket refs before storing); matchmaking queue methods — `enqueuePlayer(player)` (unlocked `lPush`), `dequeueRealPlayers(maxCount)` (atomic `RPOP ... maxCount`, oldest-first), `requeuePlayers(players)` (atomic `RPUSH`, puts real players back without touching anything another pod concurrently enqueued), `getQueuedPlayers()` (read-only inspection), plus a lock (`withMatchmakingLock`) serializing the take-3-or-requeue decision across workers; pub/sub methods — per-room event channels plus a global `publishPlayerAssignment(playerId, roomId)`/`subscribeToPlayerAssignments(handler)` channel used for the cross-pod room handoff (all tagged with source pod/worker id so a worker can ignore its own echo); room lease methods (`claimRoomLease(roomId)`/`getRoomLeaseOwner(roomId)`, backed by `ROOM_LEASE_SECONDS` — decide which pod owns a hydrated room's timers, used by Lobby Manager's `hydrateRoom` `canOwnTimers` check); `getPodId()`/`getReconnectTtlSeconds()` accessors.

**Depends on:** `redis` npm package (lazily required only when a real connection is attempted, so this file loads fine without the package present).

**Notes:**
- Falls back to in-memory maps when `REDIS_URL` isn't configured — the server (and the Balance Simulator, which never goes through this file) keeps working single-worker/local.
- Room snapshots preserve serializable gameplay state (shape inventory, `currentHeight`, `impactScores`, `impactPowers`, `drawPile`, `teamCarryOverBlocks`, `towerBlocks`, quick-chat cooldown timestamps) while excluding transient chat events.
- The connection retry loop's final cleanup wraps `client.disconnect()` in its own try/catch that intentionally swallows errors — best-effort cleanup after an already-failed connection, not a bug.
- Only the pod holding a room's lease runs that room's timers; other pods may still read/hydrate the room without owning its clock.
- `dequeueRealPlayers`/`requeuePlayers` replaced a prior `replaceQueue(players)` (read-then-full-overwrite) — removed, not deprecated-in-place, because its read/write gap was the source of a real lost-update bug. See [decisions.md](./decisions.md#matchmaking-queue-lost-update-and-cross-pod-room-delivery-gap).

## Tooling & tests (pointers)

- **Balance Simulator** (`src/Server/tools/Balance_Simulator.js`) — instantiates Game Engine directly, bypassing Lobby Manager/Redis/WebSocket. Full detail → [testing.md](./testing.md#balance-simulator).
- **Server Score Events Tests** (`src/Server/tests/Score_Events.test.js`) — contract coverage for scoring/summaries. Full detail → [testing.md](./testing.md#server-score-events-tests).
- **Server Container Image** (`src/Server/Dockerfile`) — packages this directory for deploy. Full detail → [build.md](./build.md#server-container-image).
