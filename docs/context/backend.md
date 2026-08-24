# Backend

Scope: server-side game logic — matchmaking, room lifecycle, authoritative rules,
scoring, physics, config, shared state. Wire protocol →
[networking.md](./networking.md). Design meaning → [gameplay.md](./gameplay.md).
Deploy → [deployment.md](./deployment.md). Per-symbol file and line → grep
[map/backend.md](./map/backend.md).

All modules under `src/Server/app/`.

## Engine module delegation pattern

`Game_Engine.js` is the facade for one room. Placement, block supply, scoring and
Impact logic live in separate `engine/` modules, each the same shape:

- Every export is a **plain function whose first argument is the owning
  `GameEngine` instance** — `Scoring.addPlacementScore(engine, player, …)`.
- `GameEngine` re-exposes each as a same-named method that calls straight through.
- Callers — Lobby Manager, Bot Manager, Balance Simulator, tests — **always go
  through the facade**, never `require()` an `engine/` module directly.
- Cross-calls between a module's own functions also go through the facade, so the
  facade stays the single seam.

A new engine-owned system gets its own `engine/` module in this shape rather than
growing `Game_Engine.js`.

`engine/Block_Geometry.js` is the pure exception: cell transforms and measurements
take geometry only. `Block_Supply` imports it; production callers still use the
`GameEngine` facade.

## Lobby Manager

`Lobby_Manager.js` — matchmaking, room lifecycle and runtime debug coordination.
`Debug_Config.js` owns the exposed snapshot, startup defaults and clamp policy;
the lobby owns bot/room reconciliation and resulting broadcasts.

Maintains shared 3-participant rooms, filling with debug bots when allowed; real
players can resume within the reconnect TTL. Hydrated snapshots include tower and
pose state; only the lease owner recomputes stability or restores timers, while
non-owners relay the cached presentation state without evaluating gameplay.

The engine requests terminal close through an injected callback. The lease owner
publishes `room_closed` before deletion, sends same-pod sockets, clears real-player
session room ids, and unsubscribes. A remote subscriber forwards it once, discards
its frozen replica without deleting owner state, and unsubscribes. Teardown tells
the engine not to persist, preventing late callbacks from resurrecting a room.

`RECONNECT_TTL_SECONDS` is **not settled for production**; the deploy overrides
the code default.

### Player identity

`Auth_Verifier.js` uses `jose` to verify Supabase JWTs (JWKS, issuer and audience) and native
Facebook tokens through Meta `debug_token`, returning a verified credential or
`null` without throwing. `Account_Store` resolves that credential to the stable
`player_accounts.id` used as `profileId`, preventing a client from claiming
another player.

`player_accounts` optionally links a Supabase user; `player_identities` links
Facebook through a versioned HMAC-SHA-256 of its provider subject. Raw Meta IDs
and access tokens never reach the database. Native Facebook creates an account
without `auth.users`; browser Facebook asks Supabase for the same provider subject
(`provider_id`, or its compatible `id` response field) and binds its Supabase
user to that account. Google and guests receive an account through their verified
Supabase subject.

`Profile_Store` is memory-only without **`SUPABASE_SERVICE_ROLE_KEY`**. It reads,
inserts and stamps `public.player_profiles`; **the stored name wins once it
exists**. Missing or unavailable records use a deterministic `WORD_LIST` name;
`status` is carried, not enforced. Schema and RLS:
`src/Server/migrations/0002_player_accounts.sql`, applied by hand.

### `Debug_Config` — the authoritative validation

This module clamps every debug key. [gameplay.md](./gameplay.md) covers what each
variable *means*; the ranges live here.

- Unknown keys rejected; numeric values clamped to safe ranges.
- Popup durations clamp 500–10000 ms; `levelSummaryDelayMs` 1000–10000 ms.
- `debugBotStrategy` accepted only as `cooperative` or `mvp_greedy`;
  `towerStabilityFeedbackMode` only as `warnings_only` · `meter_only` ·
  `live_preview`. Both are allowlists: an unlisted value is **dropped silently**,
  leaving the old setting in place rather than erroring.
- `debugBotDelayMax` ≥ `debugBotDelayMin` enforced.
- `debugStartLevel` applies immediately, restarting active debug rooms there.
- Bot enablement/count changes reconcile every unstarted owned room, including a
  full lobby. A changed bot roster clears real-player readiness while retaining
  ready bots, then sends the resulting `lobby_update`.
- `towerSiteWidthMin`/`Max` clamp to **2–8**, matching the client viewport ceiling.
  Odd values stay safe: `getSiteWidthForHeight` re-evens the result so a debug-set
  odd bound cannot push the site off-centre.
- Impact keys (`impactInterval` 1–10, `impactMinContributionShare` 0–1,
  `impactScoreRequirement`), `powerReplenishPileShare` 0–1, and the
  stability/scoring keys route through the same clamp helpers.
  `reinforceScorePerSupportedCell`/`reinforceScoreCapShare` are **not** exposed.
- `towerStabilityDifficulty` clamps to **0–100** and is the only accepted stability
  key. The derived physics constants have no setters, so a stale client sending a
  raw constant is rejected as unknown rather than desyncing the dial.
- `visualHookImpactBeat`/`visualHookScreenShake` are flat booleans writing into the
  nested `visualHooks` group and are its **only** setters — the group's durations
  have none and reach the client through `game_state` alone.
- `resetDebugConfig` restores every exposed tunable to startup defaults, then
  rebroadcasts. `restartLevel` is an action key, not a tunable: it restarts every
  room at its **current** level preserving total score, unlike `debugStartLevel`.
- Debug settings are runtime tuning only, never player progression data.

### Cross-pod room handoff

When `createRoom()` assigns a player whose `ws` is `null` on this pod, it calls
`publishPlayerAssignment(playerId, roomId)` rather than sending directly. Every pod
subscribes at `start()`; the pod that owns that socket receives it via
`handlePlayerAssignment` and calls `resumePlayer()` — the same
`hydrateRoom`/subscribe path genuine reconnects use, so `room_created` and every
later broadcast reach the player whichever pod formed the room.

**That handed-off pod's `engine.room` is a frozen snapshot from that one
`hydrateRoom()` call — never refreshed by later broadcasts**, because
`subscribeRoom` relays messages straight to sockets, not back into local room
state. So gameplay actions never run against it: `dispatchRoomAction()` executes
`place_block`/`send_quick_chat`/`activate_power` locally **only when
`isRoomOwner(room)`**, otherwise republishing on `room:<id>:actions` for the
lease-owning pod. Remove that check and every pod executes the same action against
its own stale snapshot, producing divergent tower state.

**The owning pod must stay the sole writer.** Re-hydrating the local snapshot on
relayed broadcasts does not fix this — it still leaves two independently-mutable
copies of one room.

**Seating runs under `withMatchmakingLock`.** `joinOrCreateRoom` claims an open
room id atomically (`claimOpenRoomId` pops it), seats the player, or creates a
room when none is claimable. A pod that pops a room it does not own must
`markRoomOpen` it again before moving on, or the room leaks out of the open set
and no one can ever join it. `claimOpenRoom` retries at most
`MAX_OPEN_ROOM_CLAIM_ATTEMPTS` and re-opens a repeat id rather than looping.

## Game Engine

`Game_Engine.js` — authoritative room facade and level lifecycle for one room.

Creates room state and assigns blocks; builds and deals the draw pile; maintains
placed-block history; runs start-delay, timer and tick broadcasts; validates quick
chat and Power; advances or rolls back; and notifies Lobby Manager for persistence
and demo stats (bot-only rooms excluded). `engine/Placement.js` owns settling,
placement execution, stability evaluation and placement-driven win/fail checks
behind same-named facade methods. **The engine never talks to Redis.**

Level states: `waiting` · `starting` · `playing` · `finished` · `failed` ·
`game_over` · `game_completed` · `closed`. `game_over` is terminal: it accepts no
gameplay action and counts down only to its room-close request.

### Placement

`resolvePlacementOrigin(block, column, originY)` — an integer `originY ≥ 0` that
passes `isPlacementLegal` becomes the brick's **release row** and it falls from
there; absent or illegal, it is released above the tower. That is what lets a bot,
an unsnapped drag, or a row a teammate filled in flight still place rather than be
lost.

**Landmine: `Number(null)` is `0`.** "Absent" must be tested *before* the numeric
coercion, or every origin-less placement reads as "aim at row 0" and threads into
the lowest gap that fits.

`resolveColumnOriginX(block, column)` clamps the requested column into
`getPlaceableOriginRange(block)` — the sole placement-validation step, since a
full-footprint clamp already guarantees the brick stays inside the site.
`getSiteWidthForHeight(targetHeight)` derives the even, viewport-clamped site.

### Derived curves

`buildTargetHeightCurve()` is a growing-step recurrence with no useful closed
form, so it is built once and cached against a key of all five inputs — every one
is debug-tunable at runtime and `Impacts` calls it in a loop.
`getLevelTimeLimitMs()` is a derived clock floored at `levelTimeLimitMs`, with a
slack multiplier that itself lerps by level; `startLevel()` stamps the result on
`room.levelDurationMs` so `endsAt` and the fail timer cannot disagree.

`getRemainingMs()` is **state-dependent, not one `endsAt` clock**: it counts down
to `startsAt` during `starting`, to `freezeEndsAt` during `finished`/`failed`, to
`terminalCloseAt` during `game_over`, and to `endsAt` only during `playing`. That
keeps frozen states counting down their actual next transition rather than a stale
round clock.

### Stability config

`resolveStabilityConfig(level)` lerps `towerStabilityAnchors` by
`getStabilityPressure(level)`, injects a quadratic `towerStabilityRiskScaleApplied`
from the difficulty dial, and supplies the level's `towerSiteWidth`. **Every
`evaluate()` caller — engine, Bot Manager, Balance Simulator — must source its
config here**, or bots grade columns on different physics than the server scores
them with.

### Power

`activatePower()` takes **no target** — it loops every player for the per-item
effect, while `replenish` calls `generateReplenishBlocks()` once for the shared
pile and reports the count as `meta.blocksAdded`. No power has a token economy.
Every grant path names `replenish`: `grantDefaultPowers()` from `startLevel()`,
the side-quest reward hardcoded, and `awardImpactPower()` filtering the catalog to
`active: true`. `anyPlayerCanRescueSupply()` defers the not-enough-height fail
check while any player still holds one.

`scoreEvents[]`, `quickChatEvents[]` and `powerEvents[]` are transient and
broadcast-only, never persisted — do not infer scoring UI from score diffs.

## Block Supply

`engine/Block_Supply.js` — block creation, shared draw pile, opening hands and
refresh policy. Pure cell transforms, orientations, height and cell counts live in
`engine/Block_Geometry.js`.

Bricks are the **5 fixed 4-cell shapes** (`I`/`O`/`L`/`T`/`Z`), weighted, all
available from level 1. Each gets a **random orientation at creation**:
`getOrientations` is the 4 rotations of the shape plus the 4 of its mirror, deduped
by cell layout, so an asymmetric `L`/`Z` can also deal its J/S counterpart.
`getRotations` alone (no mirror) stays the basis for supply sizing, since a
reflection never changes vertical extent. Blocks are `{ id, shapeId, cells, height
}` with `height` derived from the rotated cells — it varies 1–4 by draw, and there
is **no per-block anchor field of any kind**.

### Supply sizing is packing-aware

```
effectiveWidth = siteWidth × supplyEffectiveWidthRatio + 0.5
efficiency     = avgBrickCellCount / (avgBrickHeight × effectiveWidth)
```

`getSuppliedBrickHeight` multiplies `ceil(targetHeight / efficiency)` by a coverage
share lerping from `levelSupplyCoverageStart` down to `levelSupplyCoverageEnd`;
the gap at the end value is what a Replenish closes. The upper surplus edge is a
flat amount **plus** a share of the requirement, because a fixed window is missed
on nearly every attempt once the pile and its draw variance grow.

Sizing must stay packing-aware: raw target height assumes one unit of brick height
becomes one unit of *tower* height, which holds only for a single-column stack
while stability demands spread.

**`checkFailCondition` deliberately does *not* use the efficiency factor.** It
tests *impossibility*, so it needs the true optimistic upper bound — one height-3
brick genuinely can add 3 height if stacked. Applying the factor there fails
levels that still have a winning move.

**`maxGeneratedDrawPileBlocks` is a sanity ceiling against a bad config, not a
balance knob** — target height is uncapped, so a value that binds starves the
level outright.

**`hasExactHeightCombination` returns on the first hit.** It is an
O(blocks × targetHeight) subset-sum inside the opening-hand retry loop and the pile
scales with target height, so a full scan at a 700-brick pile is ~480k set
operations per attempt — seconds of blocked event loop per level start. Early
return keeps level start at ~15 ms at target 690.

Team carry-over is precision-first and **discarded entirely on level failure** —
the engine never calls it on the failure path. Refresh generation never touches the
draw pile.

## Scoring

`engine/Scoring.js` — score events, placement and bonus scoring, leaderboard
banking, MVP, level summaries.

**Score banking is two-stage.** Points accumulate in `player.levelScore` during a
level; only `addLevelScoreToLeaderboard()` moves that into `player.score`. That is
why a failed level's score does not count. Impact eligibility is separate:
`levelImpactContribution` receives only the capped useful placement transaction,
then becomes `impactContribution` when the level banks. Consumers read the server
status rather than reconstructing it from either score field.

Each placement produces one server-authoritative transaction after settling and
evaluating stability. Useful-height points are reduced only by risk the new entry
adds. `TowerStability.comparePlacement(before, after, entry)` performs a pure
matched-interface comparison; a direct repair earns structural value from the
improved interface's risk, load share and support path. It cannot pay from an
indirect improvement or inherited instability.

The transaction caps combined normal rewards in average-action units without
reducing useful-height points. A qualifying direct repair of a mature critical
interface can add a Critical Save component; interface claims and the per-level
limit make that reward single-use. `previewPlacementScore` and
`addPlacementScore` share the same calculation, so bot ranking, tuning tools and
the award path cannot quote different rewards.

**Repair must stay a paid action.** If only height gained pays, widening the base
or correcting a lean earns nothing and collapse is a flat team-wide loss — the
game's defining tension loses its mechanical surface. A *personal* collapse stake
is not the alternative: it needs per-player blame attribution the pure stability
function cannot produce.

Both contribution fields and Critical Save claims are room state so reconnect and
rollback preserve the scoring contract.

## Impacts

`engine/Impacts.js` owns checkpoint snapshots, personal contribution status, and
the unified rollback lifecycle. It never evaluates support geometry or invents a
second score: its eligible input is Scoring's capped useful-height, reinforcement,
and Critical Save placement points.

At a secured checkpoint it snapshots each player's leaderboard score, eligible
contribution, and Power inventory. The next checkpoint requirement is the optional
flat floor or each player's configurable share of Scoring's summed normal useful
pool for the levels in the band, whichever is greater. Completion bonuses do not
enter that pool or a player's contribution.

`impactScoreStatus` is authoritative. Its canonical player values are
`checkpointContribution`, `bankedBandContribution`, `liveLevelContribution`,
`bandContribution`, `requiredContribution`, `remainingContribution`, and `met`.
It also carries retry state. Score-named aliases remain only for mixed-version
wire compatibility; new logic must use the contribution-named values.
When a level completes, its eligible live contribution moves to the banked band
in the same state update, keeping `bandContribution` stable across the level
transition.

Every ordinary failure and an Impact shortfall call `resolveCheckpointFailure()`.
The resolver increments once, freezes the failed attempt, restores the checkpoint
on a recoverable retry, and preserves the counter across rollback. A successful
checkpoint is the only in-run reset. Once the configured recovery budget is
exhausted, it restores checkpoint score, contribution, and Power, clears
provisional attempt state, broadcasts terminal `game_over`, and requests a Lobby
close with `failure_limit_reached` and destination `home` after the summary delay.
When a completed level would fail the next checkpoint, the engine resolves that
shortfall before broadcasting a completion summary, so players receive one failed
summary rather than a completed-then-failed pair.

`rollbackToImpact()` calls `startLevel()` directly at the end, so the room
re-enters `starting` in the same call. Hydration restores only the timer matching
the persisted state; only the lease owner can execute that timer.

## Tower Stability

`Tower_Stability.js` — pure, deterministic support-graph analysis. **Zero
dependencies, internal or external.** `evaluate()` builds one rigid node per
placed brick, contacts under its exposed lower cells, condenses support cycles, and
propagates cell mass and horizontal moment down every support path.

- `settleBlock(entries, block, originX, fromY)` — gravity, drop-to-first-contact,
  no auto-centering. `fromY` is the **release row**: omitted, the brick spawns
  above the tower and falls the whole way; given, it falls from there.
- `isPlacementLegal` — on or above the platform, not inside an occupied cell.
  Support is not a legality rule; an unsupported release falls.
- `supportedCellsGained` — a pre-placement topology estimate retained for the
  bot shortlist and geometry contracts; it does not award score.
- `evaluate(entries, config)` — returns Stability, public diagnostics, one compact
  presentation pose per block, and in-process graph analysis for bots/tools. Pose
  records retain per-block offsets and add a section id/origin shared by rigid members.
- `balanceDelta(before, after, config)` — directional Balance improvement only;
  Integrity does not affect brick faces.

`resolveStabilityConfig()` is mandatory for every production evaluator caller: it
injects level pressure, the quadratic difficulty risk scale, site width, target
height, and cosmetic pose limits. A raw `GameConfig` falls back to evaluator
defaults and grades a different rule.

### Two axes

`stability = min(balance, integrity)` and collapses when either interface risk is
`1`. Balance measures carried-load center against the contact span; Integrity
compares normalized carried-load demand to contact width, then rewards independent
paths through deterministic load-share concentration. A centered bottleneck can
lose Integrity without a false direction.

Difficulty `0` yields zero gameplay risk while retaining topology diagnostics. The
maturity and target-height ramps apply to both axes, so opening bricks survive
without shape exceptions. The critical interface is selected by combined risk,
carried-load share, then geometry key; `criticalSupport` exposes its pivot,
direction, risks, effective width, and path count.

`towerStructuralPose` is cosmetic: each record has a block id, unit offsets,
rotation, and failure weight. It never changes coordinates, gravity, placement, or
the collapse verdict. `tiltScore`, `tiltAngleDeg`, `leanDirection`, `integrity`,
`collapsed`, `balanceDelta`, and `supportedCellsGained` remain compatibility fields
for the scoring and fallback-client migrations.

## Bot Manager

`Bot_Manager.js` — QA bot scheduler. Not production AI. Strategy *design* lives in
[gameplay.md](./gameplay.md#bot-behaviour); this covers the mechanism.

Bots place through `placeBlock()` by inventory index **plus a column and a release
row** — the same authoritative path real players use. `chooseBotPlacement` crosses
every column in the brick's valid range with every release-row candidate
(drop-from-above plus up to `debugBotGapCandidates` void floors), dedupes on the
settled `(originX, originY)`, and ranks by strategy.

Candidates use `previewPlacementScore` with their own before/after structural
results, so the ranked transaction is the exact reward the authoritative
placement path will award.

Search cost is bounded two-stage: a cheap proxy pass narrows to the top 8, and only
survivors pay for a full `evaluate()`. Naive enumeration is 3 bricks × 8 columns ×
7 rows, `evaluate()` is O(tower cells), and towers run to hundreds of bricks.

**Landmine — ranking by `heightGain` makes gap-filling unreachable.** A brick
threaded into a void gains zero height, so it loses every comparison. Enumerating
release rows without also changing the objective function measurably does nothing.

`chooseBotAction` returns `{ type: "place", … }` or **`{ type: "wait" }`**, which
`runBotLoop` reschedules on without placing; any new caller must handle both
shapes.

Timer tracking exists specifically so a closed room's bots don't keep running.

## Game Config

`Game_Config.js` — the single exported object and source of truth for every
numeric constant. **No dependencies.** Lobby Manager validates every debug write
before mutating it.

**The docs own knob semantics; this file owns knob values.** It currently holds
hand-tuned playtest values that intentionally differ from the design reference.

- **Dead keys:** `towerPlacementMode`, `nextLevelDelayMs`, `failRestartDelayMs` —
  nothing in `src/Server` reads them. The real post-level delay is
  `getPostLevelTransitionDelayMs()`. `generatedDrawPileScaling` was **removed**,
  not deprecated in place; the reserve count is derived.
- Retune stability via `towerStabilityDifficulty` and its Balance/Integrity anchor
  sets, never by adding debug physics controls. The dial linearly blends thresholds
  but applies risk with `towerStabilityPressure.difficultyCurvePower`; pose rigidity
  and Integrity sway stay presentation-only and separate from collapse risk.
- Scoring configuration defines useful-height reward, dangerous-height retention,
  structural action value, transaction caps and Critical Save qualification. The
  debug surface exposes only the action-level controls required for playtesting.
- `powerCatalog` entries carry an `active: boolean`; only `active: true` entries
  are eligible for the Impact-MVP draw. Only `replenish` is active — supply, not
  hand quality, is what actually strands a team.
  The inactive entries and their effect branches **stay** — each is a one-line
  flip to re-enable, and deleting them means re-authoring from scratch.

## Redis State

`Redis_State.js` — shared-state adapter for multi-worker matchmaking and room
state. **Active-session state only**, never long-term player or leaderboard
persistence. Falls back to in-memory maps when `REDIS_URL` isn't configured, so
single-worker and local runs keep working. The `redis` package is lazily required
only when a real connection is attempted.

- Open rooms: `markRoomOpen`/`removeOpenRoom`, and `claimOpenRoomId` which **pops**
  an id so two pods cannot seat into the same free slot, plus `withMatchmakingLock`
  serialising the claim-or-create decision.
- Pub/sub: per-room event channels, a per-room action-routing channel for the
  non-owner case, and a global player-assignment channel for the cross-pod
  handoff. All tagged with source pod id so a worker ignores its own echo.
- Leases: `claimRoomLease`/`getRoomLeaseOwner`, backed by `ROOM_LEASE_SECONDS`.
  **Only the pod holding a room's lease runs that room's timers**; other pods may
  read and hydrate without owning the clock.
- Demo stats: `recordDemoOutcome`/`getDemoStats` — lifetime counters.

**Only the first `DRAW_PILE_SNAPSHOT_LIMIT` (16) pile bricks are persisted**, plus
a hidden count that `hydrateRoom` regenerates. The compact `towerStructuralPose`
is persisted with `towerBlocks`; full structural analysis is never serialized.
Critical Save claims, transaction contribution fields, checkpoint contribution
snapshots, retry transition fields, and terminal-close deadline are serializable
room state, so a recovered room retains accounting and lifecycle continuity. The
regenerated pile tail is fresh random bricks because only the next draw is
client-visible. `clearSessionRoom()` removes a terminal room assignment, and the
scoped room/action unsubscribe helpers let a non-owner discard its replica after a
remote close.

The connection retry loop's final `client.disconnect()` is wrapped in a try/catch
that intentionally swallows errors: best-effort cleanup after an already-failed
connection, not a bug.

## Known gaps

- **No leaderboard.** `profiles` is durable but holds no scores; Redis still keeps
  active-session state only. Ranking and structured logging are future work.
- **Reconnect and gateway routing across pods are untested at integration level**,
  beyond the room-seating regression tests.
- **Deploy client and server together.** Wire fields, config keys and
  Redis-persisted fields move as one, so a room in flight during a split deploy
  will not restore from an old-shaped snapshot.
