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
  - `towerSiteWidthMin`/`towerSiteWidthMax` clamp to **2–8**, matching the client viewport ceiling. Odd values are still safe: `getSiteWidthForHeight` re-evens the result so a debug-set odd bound can't push the site off-centre.
  - Impact keys (`impactInterval` 1–10, `impactMinContributionShare` 0–1, `impactScoreRequirement`) and the stability/scoring keys added with the two-axis redesign all route through the same clamp helpers; `placementStabilityFloor` and the two `reinforceScorePer*` keys live under `GameConfig.scoring` and use the scoring setters.
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
- **Placement:** `placeBlock(playerId, blockIndex, column)` (unset column falls back to the site minimum), `getSiteWidthForHeight(targetHeight)` (derives the even, viewport-clamped site width), `getPlaceableColumnRange()` (that width centred on `towerGridWidth`; falls back to the `placeableColumnMin`/`Max` config pair when no target height is set yet), `getPlaceableOriginRange(block)` (the brick's valid origin-column range given its width and the level's site), `resolveColumnOriginX(block, column)` (clamps the requested column into that range — the sole placement-validation step, since a full-footprint clamp already guarantees the brick stays within the site)
- **Supply sizing:** `getSupplyPackingEfficiency()` — derived from brick geometry and the site width, not a constant; see [Block Supply](#block-supply)
- **Scoring:** `addPlacementScore(player, block, effectiveHeight, stabilityBefore)`, `addReinforceScore(player, before, after)`, `getPlacementStabilityMultiplier(stabilityBefore)`, `awardCompletionBonuses(...)`, `addLevelScoreToLeaderboard()`, `getLevelMVP()`, `buildLevelSummary(...)`
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

**Responsibilities:** create bricks from the **5 fixed shapes** (`brickShapes`, weighted by `brickWeights`, all available from level 1 — no size unlock), applying a **random rotation** to the shape's canonical `cells` (internal `getRotations`/`rotateCellsCW`, deduped by cell layout) at creation — each created block is `{ id, shapeId, cells, derived height }`, with no per-instance anchor field; build/shuffle/deal the draw pile (sized via Game Config's generated-pile scaling); generate a **solvable** opening hand (retries until hand+pile can exactly reach target height, with enough precision blocks and surplus within bounds — falls back to the last attempt if none qualifies); refill a hand slot after placement; trim an oversized hand to `maxActiveBlocks` (keeping tallest/largest); generate a useful refresh set; prepare team carry-over blocks on completion.

**Interface (grouped):**
- Block creation — `pickWeightedShape(excludedShapeId)`, `createBlock(shapeId, excludedShapeId)` (`shapeId` null = weighted-random pick, optionally excluding one shape), `getRandomBlock()`, `createBlockId()`, `cloneCells(cells)`, `getBlockHeight(block)`, `getBlockCellCount(block)`, `getAverageBrickHeight()` / `getAverageBrickCellCount()` (weighted across every shape's unique rotations — the basis for both supply sizing and packing efficiency)
- Draw pile — `getNextDrawBlock()`, `buildDrawPile()`, `getGeneratedDrawPileBlockCount()`, `generateDrawPileBlocks(count)`, `drawBlockFromPile()`, `shuffleBlocks(blocks)`, `getTotalBlockHeight(blocks)`
- Opening hand — `getBlocksPerPlayer()`, `dealOpeningHands()`, `generateSolvableOpeningHandBlocks()`, `isLevelBlockSupplyValid(blocks, minimumOpeningBlocks)`, `countPrecisionBlocks(blocks)`, `hasExactHeightCombination(blocks, targetHeight)`, `refillPlayerBlock(player)`, `trimInventory(blocks)`
- Refresh — `generateRefreshBlocks(currentBlocks)`, `createRefreshBlock(currentBlock)`, `isRefreshBlockSetUseful(blocks)`, `scoreRefreshBlockSet(blocks)`
- Carry-over — `prepareTeamCarryOverBlocks()`

**Depends on:** Game Config (direct `require`); Game Engine for room state and cross-calls between its own functions.

**Supply sizing is packing-aware.** `isLevelBlockSupplyValid` accepts a level when total brick height falls in `ceil(targetHeight / packingEfficiency) + [levelSupplyMinSurplus, levelSupplyMaxSurplus]`. The efficiency is *derived*, not a constant:

```
effectiveWidth = siteWidth × supplyEffectiveWidthRatio + 0.5
efficiency     = avgBrickCellCount / (avgBrickHeight × effectiveWidth)
```

Sizing against raw target height instead assumed bricks stack perfectly vertically, which made every level past ~10 unwinnable — see [decisions.md](./decisions.md#supply-was-sized-for-vertical-stacking-and-made-high-levels-unwinnable). `getGeneratedDrawPileBlockCount` derives the reserve from the resulting shortfall rather than the removed `generatedDrawPileScaling` table.

**`checkFailCondition` deliberately does *not* apply the efficiency factor** — it exists to detect genuinely impossible states, so it needs the true upper bound (a brick *can* contribute its full height if stacked). Applying efficiency there failed levels while a winning move still existed.

**Notes:** blocks are `{ id, shapeId, cells, height }` objects (`height` derived from the rotated `cells`' vertical span, so it varies 1–4 by draw — not a fixed per-shape number); no per-block anchor field of any kind exists ([decisions.md](./decisions.md#placement-design-lineage-superseded)); legacy numeric blocks are still read as plain height values. All 5 bricks are available from level 1 (no size unlock). `createRefreshBlock` rerolls a brick to a **different random shape** (excludes the current `shapeId`); since every brick is 4 cells, refresh no longer changes cell-count. Team carry-over: precision-first (height ≤ 2 kept), discarded entirely on level failure — Game Engine never calls `prepareTeamCarryOverBlocks` on the failure path. Refresh generation never touches the draw pile; there's no cooldown/lockout gating *when* a refresh can happen anymore beyond the shared Power activation cooldown.

## Scoring

`engine/Scoring.js` — score events, placement/bonus scoring, leaderboard banking, MVP, level summaries. Follows the [engine module delegation pattern](./coding-conventions.md#server-engine-module-delegation-pattern).

**Interface (grouped):**
- Score events — `createScoreEvent(type, options)`, `queueScoreEvent(type, options)`, `consumeScoreEvents()`
- Placement/bonus — `recordScoreBreakdown(player, key, points)`, `addPlacementScore(player, block, effectiveHeight, stabilityBefore)`, `getPlacementStabilityMultiplier(stabilityBefore)`, `addReinforceScore(player, before, after)`, `awardCompletionBonuses(finisher, exactFinish)`, `addBonusScore(player, points, label)`, `getBonusScoreEventType(label)`, `getBonusScoreEventLabel(label)`
- Leaderboard — `addLevelScoreToLeaderboard()`
- Summary/MVP — `getPlayerScoreMap()`, `getTeamLevelScore()`, `getPlayerBonusBreakdown(player)`, `buildLevelSummary(options)`, `getLevelMVP()`

**Depends on:** Game Config (direct `require`); Block Supply via the engine facade (`addPlacementScore` reads `engine.getBlockHeight(block)` for event `meta`).

**Notes:**
- **Score banking is two-stage:** placement/bonus points accumulate in `player.levelScore` during a level; only `addLevelScoreToLeaderboard()` moves that into `player.score`. This is why a failed level's score doesn't count toward the final total — **and why anything reading live Impact standing mid-level must add `levelScore` to the banked band score itself** (both the client's Impact bar and [Bot Manager](#bot-manager)'s yield check do exactly that).
- **`addPlacementScore` takes the stability the placer inherited**, captured in `placeBlock` *before* settling; `addReinforceScore` takes the diagnostics from before and after `recalculateTowerStability()`. Formulas → [gameplay.md § Scoring system](./gameplay.md#scoring-system).
- An empty tower has no `integrity` field, so `addReinforceScore` defaults a missing before/after integrity to **100**, not 0 — otherwise the first brick of every level would pay a full phantom Reinforce.
- `getPlayerBonusBreakdown` gained a `reinforce` key. The server sends it inside `lastLevelSummary.players[].bonusBreakdown`; no client currently renders that payload.
- Bonuses use multipliers from Game Config; a zero-value bonus emits no score event.

## Impacts

`engine/Impacts.js` — Impact score snapshots, restore/rollback, and the Impact score gate for one room. Follows the [engine module delegation pattern](./coding-conventions.md#server-engine-module-delegation-pattern). Formerly `Checkpoints.js` — see [decisions.md](./decisions.md#politics--power-checkpoint--impact-rename).

**Responsibilities:** snapshot score + Power inventory at the start of an Impact band; restore on rollback; award a Power item to the Impact-band leader when an Impact opens; decide whether each player met the band's minimum contribution share; build the per-player Impact-status payload broadcast every tick; fail the room to `failed` (with a summary) when the gate isn't met, then roll back to the last Impact level.

**Interface (grouped):**
- Snapshots — `saveImpactScores()`, `saveImpactPowers()`, `saveImpactState()`, `ensureImpactScores()`, `ensureImpactPowers()`, `ensureImpactState()`, `restoreImpactScores()`, `restoreImpactPowers()`
- Score gate — `isImpactLevel(level)`, `getImpactScoreRequirement()`, `getImpactMinContributionShare()`, `getExpectedPlacementScoreForLevel(level)`, `getExpectedPlacementScoreForImpactBand(blockedLevel)`, `getImpactBandScoreRequirement(blockedLevel)`, `getImpactScoreFailures(blockedLevel)`, `getNextImpactLevel()`, `getImpactScoreStatus(blockedLevel)`, `hasMetImpactScoreRequirement(blockedLevel)`
- Rewards/rollback — `awardImpactPower()`, `failImpactScoreRequirement(blockedLevel)`, `rollbackToImpact()`

**Depends on:** Game Config (direct `require`); Game Engine via facade for lifecycle calls; Scoring via facade for score-event/summary calls.

**Notes:** `rollbackToImpact()` calls `engine.startLevel()` directly at the end — the room re-enters `starting` for the Impact level in the same call, not on a separate timer tick. `startLevel()` **preserves** any already-queued `pendingScoreEvents` (`= pendingScoreEvents || []`) instead of clearing them, so events queued before an Impact transition (e.g. `awardImpactPower`'s power events) still reach the Impact level's first broadcast. `clonePowerInventory` lives on the Game Engine facade, not here (pure Power data, no Impact semantics).

## Tower Stability

`Tower_Stability.js` — pure, deterministic grid physics: settles a newly placed block and scores the resulting tower's stability. **Zero dependencies, internal or external.**

**Interface:**
- `settleBlock(entries, block, originX) -> { originX, originY }` — drops `block` into `entries` at the caller-provided **column-derived `originX`** (rounded) and returns where it lands (drop-to-first-contact per column, no auto-centering). The column→`originX` clamp lives in [Game Engine](#game-engine)'s `resolveColumnOriginX()`, not here.
- `evaluate(entries, config) -> { stability, diagnostics }` — `diagnostics = { comOffset, laneImbalance, overhangPenalty, tiltScore, tiltAngleDeg, leanDirection, integrity, slenderness, supportRatio, collapsed }`. Reads `towerOverhangWeight`, `towerLaneImbalanceWeight`, `towerMaxTiltAngleDeg`, `towerCollapseTiltScore`, `towerSlendernessSafe`, `towerSlendernessMax`, `towerStabilityMinHeight`, `towerBaseHalfWidthFloor`, `towerSupportDeficitMax` off `config`
- `cellsFor(entry)` / `cellsForEntries(entries)` — absolute grid cells for one or many entries
- `topHeight(entries)` — current highest occupied row

**Notes:**
- **Must stay pure — see [decisions.md](./decisions.md#tower-stability-must-stay-a-pure-function).** Both axes are recomputed from `entries` on every call — nothing is accumulated across calls, which is what lets a persistent-feeling Integrity score stay a pure function.
- **Two axes; `stability = min(leanStability, integrity)`, and `collapsed` when either fails.** Design meaning and formulas → [gameplay.md § Tower stability](./gameplay.md#tower-stability-design-view).
  - **Lean** (signed) = `comOffset` (whole-tower cell-count lean — horizontal CoM vs. ground footprint) + `laneImbalance` (signed, height-weighted column centroid vs. base center × `towerLaneImbalanceWeight`) + `overhangPenalty` (reaction to only the just-placed entry, so a bad placement reads as bad immediately without re-penalizing old, already-settled overhangs every later turn). Normalised by `baseHalfWidth`, floored at `towerBaseHalfWidthFloor`.
  - **Integrity** (0–100) = 100 minus the clamped sum of a **slenderness** penalty (height ÷ ground-footprint width, ramped between `towerSlendernessSafe` and `towerSlendernessMax`) and a **support deficit** penalty (unsupported cells ÷ all cells across the whole tower, over `towerSupportDeficitMax`).
- **Every penalty is scaled by a maturity ramp** (`min(1, height / towerStabilityMinHeight)`). Without it the ratios are degenerate at small tower sizes — a single `T` on its stem is literally 50% unsupported and collapsed the level on the opening brick.
- This module takes only already-resolved `originX`/cells and numeric config weights — it has no built-in assumption of lane count, grid width, or site width, so both the lane→column redesign and the later per-level site-width work needed **zero changes to the settle path**.
- Called from Game Engine: `settleBlock()` at placement time, `evaluate()` inside `recalculateTowerStability()` after every placement. Game Engine (not this file) compares the result against the warning/critical thresholds.
- Tuning-knob rationale lives in [Game Config](#game-config) only — never restated here, in `Game_Config.js`, or in `Lobby_Manager.js`.
- Guards against dividing by an empty base (no cells at `y === 0`), even though the first block placed should always settle on the floor.

## Bot Manager

`Bot_Manager.js` — QA/testing bot action scheduler. Bots are not production AI; they exist for testing rooms without three human players. Strategy behavior (cooperative vs. mvp-greedy) is the canonical design content in [gameplay.md § Bot behavior](./gameplay.md#bot-behavior) — this section covers only the scheduling mechanism.

**Interface:** `startBots(engine)` (stops existing timers, starts one loop per bot), `stopBots(engine)` (the method Game Engine calls on close/restart/stop — internally calls `stopBot(bot)` per bot). Internal-only: `stopBot(bot)`, `runBotLoop`, `chooseBotAction(bot, engine, strategy)`, `chooseBotColumn(engine, block, strategy)`, `hasClearedShareWhileTeammateShort(bot, engine)`.

**Depends on:** Game Config, Game Engine.

**Notes:** bots place through `Game Engine`'s `placeBlock()` by inventory index **plus a column** — the same authoritative path real players use. `chooseBotColumn` tries every column in the brick's valid range (`engine.getPlaceableOriginRange(block)`), settles + `evaluate`s via Tower Stability, then picks by strategy — see [gameplay.md § Bot behavior](./gameplay.md#bot-behavior) for the two policies. Both `chooseBotAction` and `chooseBotColumn` take an explicit `strategy` argument defaulting to `GameConfig.debugBotStrategy`, so the [Balance Simulator](./testing.md#balance-simulator) can drive either policy without mutating global config.

`chooseBotAction` may return **`{ type: "wait" }`** as well as a `place` action; `runBotLoop` reschedules without placing when it does. Any new caller must handle that shape. Timer tracking (`bot.botTimer`, `botLoopLevel`) exists specifically so a disconnected/closed room's bots don't keep running in the background. Bots never hold or activate Power items — no bot refresh behavior (`canBotRefresh` and related branches were removed with the refresh token economy).

## Game Config

`Game_Config.js` — single exported `GameConfig` object; the source of truth for every numeric/rule constant the server uses. **No dependencies, internal or external.**

**Grouped contents:** game settings (pacing, cooldowns, popup/summary durations, `impactInterval`), tower/placement settings (`towerGridWidth`; `placeableColumnMin`/`placeableColumnMax` now only a pre-level fallback, since the live site is derived per level; `towerSiteSlendernessTarget`, `towerSiteWidthMin`/`Max`), tower-stability settings (the lean group incl. `towerLaneImbalanceWeight` and `towerBaseHalfWidthFloor`, plus the integrity group `towerSlendernessSafe`/`towerSlendernessMax`/`towerSupportDeficitMax` and the shared `towerStabilityMinHeight` maturity ramp — see [Tower Stability](#tower-stability)), Power settings (incl. the `powerGuaranteedBaseline`/`powerImpactMvpReward` grant-path flags), brick settings (`brickShapes` — the 5 fixed tetrominoes `I`/`O`/`L`/`T`/`Z`, each with only its canonical (unrotated) `cells`, no anchor field of any kind; `brickWeights`), inventory settings, draw-pile/opening-hand/carry-over settings incl. `supplyEffectiveWidthRatio`, refresh block-generation settings, scoring settings (`scoring` sub-object: `placementScorePerHeight`, `placementStabilityFloor`, `reinforceScorePerIntegrity`, `reinforceScorePerLean`, `precisionBonusPerLevel`, `teamExactBonusPerLevel`; `finisherBonusPerLevel`/`assistBonusPerLevel` = 0), debug settings incl. `debugBotStabilityTolerance`. Debug-exposed tunables → [gameplay.md § Currently exposed variables](./gameplay.md#currently-exposed-variables); scoring defaults → [gameplay.md § Scoring system](./gameplay.md#scoring-system).

**Notes:**
- Lobby Manager validates debug changes before mutating this object; production should restrict debug writes behind admin permissions later (not yet implemented — see [decisions.md](./decisions.md#debug-menu--debug-config-not-yet-gated)).
- **Dead/unused keys:** `towerPlacementMode`, `nextLevelDelayMs`, `failRestartDelayMs` — nothing in `src/Server` reads them. The real post-level transition delay is `getPostLevelTransitionDelayMs()` (score-popup duration + `levelSummaryDelayMs`), not those keys. `generatedDrawPileScaling` was **removed**, not deprecated in place — the reserve count is derived now.
- **`Game_Config.js` currently holds hand-tuned playtest values** that intentionally differ from the design reference (a forgiving stability set, a long `levelTimeLimitMs`, short cooldowns). [gameplay.md](./gameplay.md) documents what each knob *means*; this file is the current *value*.
- Tower-stability knob rationale (moved here from inline code comments, no longer the source of truth): `towerOverhangWeight` is the main "does one bad piece feel bad" lever — tune before `towerCollapseTiltScore`. `towerMaxTiltAngleDeg` is the visual lean cap at tilt score ±1.0. `towerCollapseTiltScore` is the collapse threshold (`1.0` = physical "CoM left the base"; raise for more forgiving, lower for hairier). `towerStabilityWarningThreshold`/`towerStabilityCriticalThreshold` gate the `tower_warning`/`tower_critical` display-only events; critical is clamped to never exceed warning.
- `powerCatalog` entries each carry an `active: boolean` flag — only `active: true` entries are eligible for [Impacts](#impacts)' `awardImpactPower()` random draw. Currently only `refresh` is active; `score_cap`/`copy_score` are `active: false` (kept fully defined, including their `activatePower()` effect branch, for a one-line re-enable later). See [gameplay.md § Effects catalog](./gameplay.md#activation-and-effects) and [decisions.md](./decisions.md#score-cap--copy-score-disabled-via-powercatalog-active-flag).
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
