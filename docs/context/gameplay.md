# Gameplay

Source of truth for game design: rules, scoring, balance, progression. Technical implementation of these systems → [backend.md](./backend.md). Wire contract → [networking.md](./networking.md). Doc ownership: update this file for design/rules/scoring/balance/progression/debug-tuning-semantics/bot-behavior changes; see [coding-conventions.md](./coding-conventions.md) for the full doc-ownership map.

> ⚠️ The 5-brick / 3-lane overhaul is implemented but **balance tuning is ongoing** — high-level completion is still low in the greedy simulator. Verify stability weights, the target-height curve, and scoring rates against current values before trusting them (see [decisions.md](./decisions.md#five-fixed-bricks--3-lane-placement-replace-the-size-ramp)).

## Core concept

3-player real-time **selfish-cooperation** puzzle game. Players build one shared tower from server-assigned, fixed-orientation blocks while competing individually for level score / MVP. Team must reach target height together; individuals are scored separately.

## Core game loop

1. Queue 3 players into a room.
2. Assign blocks; start level after a configurable delay (default `startDelayMs` = 2s).
3. Players place blocks in real time; placement order = input timing (first to act goes first).
4. Placing a block refills that player's hand from the shared draw pile, if one is available.
5. Per-player anti-spam cooldown after each placement (default `placementCooldown` = 2s).
6. Level ends on target height reached or a failure condition.
7. Score, save unused blocks into next draw pile, advance level.

Placement: players drag a brick from an inventory card onto the shared tower and release over one of **three lanes — left / center / right** (see [Placement lanes](#placement-lanes)); the release x-position picks the lane (client UX detail → [networking.md § Client Placement UI](./networking.md#client-placement-ui)).

## Reconnect and shared room continuity (design rule)

- Each player gets a persistent server-issued player id + reconnect token.
- Reconnecting within the TTL (**default 60s**, `RECONNECT_TTL_SECONDS`) resumes the same player slot in the same room — routing is transparent; any healthy worker can recover the session from shared Redis state.
- If the TTL expires while no real players remain connected, the room is destroyed (not continued with bots).

Wire-level reconnect contract → [networking.md](./networking.md#reconnect). Server implementation → [backend.md § Lobby Manager](./backend.md#lobby-manager).

## Block system

- **Five fixed brick types only:** `I`, `O`, `L`, `T`, `Z` — all 4-cell tetrominoes, **fixed orientation, cannot be rotated**, and **all available from level 1** (no size-unlock ramp). Defined in `Game_Config.brickShapes`; drawn by weight (`brickWeights`). Shapes/heights: `I` (1×4, h4), `O` (2×2, h2), `L` (2×3, h3), `T` (3×2, h2, stem-down), `Z` (3×2, h2). Shape-id naming → [glossary.md](./glossary.md).
- **Effective height** = the brick's fixed vertical footprint, not cell count. `I`=4, `L`=3, `O`/`T`/`Z`=2. Precision blocks = height ≤ 2 (`O`/`T`/`Z`).
- Server sends each block as `{ id, shapeId, cells, anchorX, height }`. `anchorX` is the local cell column that aligns to the chosen placement lane (see [Placement lanes](#placement-lanes)).

> **In progress (not yet implemented):** a design change to assign each brick a **random rotation** at generation (still not player-rotatable once dealt). Until shipped, bricks are the single fixed orientations above. See [decisions.md](./decisions.md#five-fixed-bricks--3-lane-placement-replace-the-size-ramp).

### Inventory rules

| Level | Active hand slots |
|---|---|
| 1 | 1 |
| 2 | 2 |
| 4+ | 3 (max) |

- Max 3 active blocks per player (`maxActiveBlocks`). The old 4th carry-over slot has been removed.
- Empty slots refill from the shared draw pile after placement, while the pile has blocks.
- The next shared draw block is visible to all players; whoever places next receives it.

### Draw pile & team carry-over

- Each level gets a fresh, server-owned shared draw pile = unused **team carry-over** blocks + level-scaled **generated reserve** blocks, shuffled before the level starts.
- Level 1 starts with an empty pile; levels 1–3 get no generated reserve.

| Level range | Generated reserve blocks |
|---|---|
| 1–3 | 0 |
| 4–6 | 1 |
| 7–9 | 2 |
| 10–12 | 3 |
| … (+1 every 3 levels) | … |
| 97 | 32 (cap) |

- Newly generated **opening-hand** blocks fill active slots directly (they don't pass through the draw pile).
- On level completion: unused hand blocks + remaining pile blocks become the next team carry-over pool. Up to 3 kept, smaller/precision blocks prioritized. **On level failure, carry-over is discarded** during Impact rollback.

## Power system

- Unlocks at level 4 by default (`powerUnlockLevel`). Up to 3 Power inventory slots per player (`powerMaxSlots`).
- One shared side quest per eligible level. Currently fixed to "first to make the exact-finishing placement" (`setupSideQuest()`). The block-size starter variant ("first to place a 4/5/6-cell block") is disabled — its completion check (`tryCompleteSideQuest()`) still exists but is unreachable, since no quest of that type is generated right now.
- Unused items persist across levels within a match (up to slot cap); cleared when the match closes.
- Snapshotted at each completed Impact. On rollback, items earned after that snapshot are removed and inventory is restored to the snapshot — this prevents farming items via repeated failed Impact-band attempts. `powerLifetime`: `impact` = restore on rollback (default); `match` = keep earned items across rollback (debug/legacy only).

### Acquisition paths

| Path | When | Grants | Condition |
|---|---|---|---|
| Guaranteed baseline | Start of any level, incl. restarts/rollback | Refresh | Only if not already held and a slot is free — no quest/luck required |
| Side quest completion | First eligible player to complete the level's side quest | Refresh (hardcoded) | Slot free |
| Impact-MVP reward | After a completed Impact | Random from the catalog's **active** entries only (currently just Refresh — see Effects catalog) | Highest total scorer; slot free |

### Activation

Tap the Power icon → tap a held item. Instant, **no target selection** — every activation affects **all players in the room, caster included**. Cooldown `powerActivationCooldownMs` = 3s; cannot activate in the final 3 seconds of a level. Feedback is a toast naming the effect (e.g. "All players inventory refreshed") — this is the *only* activation feedback; a legacy 4-second caster-color rail-tint cue has been removed.

### Effects catalog

Each catalog entry (`GameConfig.powerCatalog`) carries an `active` flag gating whether `awardImpactPower()` can ever grant it. Only **Refresh** is currently active — Score Cap and Copy Score stay fully defined (title/category/activation effect all intact in `Game_Engine.js`'s `activatePower()`) but `active: false`, so they're never granted and never appear in a player's Power list. Re-enabling either is a one-line flip of its `active` flag in [Game Config](./backend.md#game-config); see [decisions.md](./decisions.md#score-cap--copy-score-disabled-via-powercatalog-active-flag).

| Effect | Category | Effect | Obtainable via | Active |
|---|---|---|---|---|
| **Score Cap** | Offensive | Sets every player's total score exactly to their own next Impact score requirement, whether previously above or below it | Impact-MVP reward only | No — disabled for now |
| **Copy Score** | Defensive | Sets every player's total score to the caster's; updates their Impact snapshot/baseline to the copied score | Impact-MVP reward only | No — disabled for now |
| **Refresh** | Utility | Immediately rerolls every player's hand. No token/use-count economy — activation *is* the effect | All three paths above | Yes |

**Refresh reroll rules:** blocks below size 3 reroll into an unlocked size-3+ block when possible; blocks size 3+ keep their size but reroll shape/orientation; generation is aware of each player's own remaining height and tries to include at least one block useful for it.

## Tower system

- Target height follows a level-band curve, scaled by `targetHeightMultiplier` (debug tuning; default 3 = unchanged curve).

| Levels | Target height curve |
|---|---|
| 1 | 3 |
| 2 | 6 |
| 3 | 8 |
| 4–12 | ramps quickly |
| 13–31 | ~+3 height every 4 levels |
| 32+ | ~+1 height every 2 levels |

- Overbuilding is allowed; excess height is wasted. Exact height triggers precision-bonus rewards.
- Client renders the tower from authoritative server placement history (`towerBlocks`) when available.

### Placement lanes

- The shared tower is a **5-column authoritative grid** (`towerGridWidth` = 5). Players can aim at **three lanes** — left / center / right = columns 1 / 2 / 3 (`placeableLanes`). Columns 0 and 4 are **outer overflow only**, never directly selectable.
- The chosen lane places the brick's `anchorX` cell on that column: `originX = laneColumn − anchorX`, clamped so the brick stays within columns 0–4. Consequence: 1-wide `I` has all three lane options; 2-wide `O`/`L` have two effective positions; 3-wide `T`/`Z` spill one cell into an outer column on the left/right lanes. Server-side resolution: `Game_Engine.resolveLaneOriginX()` → [backend.md § Game Engine](./backend.md#game-engine).
- The brick then **falls to first contact per column** and may cantilever/overhang (e.g. a `T` placed centered balances on its single stem — the intended stability hook).

### Tower stability (design view)

- Fixed-orientation bricks fall to ground or first contact on the 5-column grid.
- Center-of-mass drift, **lane-height imbalance** (an uneven spread across the columns leans the tower toward the taller side), overhangs, and off-center supports reduce deterministic stability 100 → 0.
- Warning/critical wobble feedback fires at tuned thresholds; stability hitting 0 collapses the tower and fails the level **before** a target-height completion can count.
- Algorithm detail (pure grid physics) → [backend.md § Tower Stability](./backend.md#tower-stability).

## Timer

Default level time limit: 30s, tunable via `levelTimeLimitMs`. Public gameplay UI does not expose debug controls.

## Quick chat

3 fixed slots per player: `Place Block!`, `Sorry!`, `Hello!`. Visible to all room participants; server-authoritative per-player cooldown, default 6s. Templates/cooldown are config-driven so future text/emoticons can replace defaults without changing gameplay contracts.

## Failure conditions

- Time runs out before target height reached.
- All hand blocks + shared draw pile exhausted before target reached.
- Remaining possible height can't reach target **and** no player holds a Refresh item that could still rescue the level.
- At an Impact boundary: any player whose score gained since the last Impact is below the band-relative requirement fails the Impact and rolls the team back.

## Scoring system

Overhauled to reward **helping fill the Impact** and **reaching target height, especially exact finish**. Overbuild finishing earns no finish bonus at all.

| Component | Formula |
|---|---|
| Contribution Score (per placement) | `effective_height × level × placementScorePerHeight` (default `10`) — the core "helped reach target / fill the Impact" earning; also what the Impact contribution gate measures |
| Precision Bonus (exact finish only, finisher) | `level × precisionBonusPerLevel` (default `20`) |
| Team Exact Bonus (exact finish, all players) | `level × teamExactBonusPerLevel` (default `15`) |
| Impact-Fill Bonus (at each passed Impact) | `round(band_overshoot × impactFillBonusRate)` (default rate `0.5`), where `band_overshoot = max(0, player band score − required band score)` — rewards carrying the band. Only when the gate requirement > 0. Added to leaderboard total and baked into the Impact snapshot |
| Finisher Bonus | Removed (`finisherBonusPerLevel = 0`) — overbuild finish earns nothing beyond banked contribution |
| Assist Bonus | Disabled by default (`assistBonusPerLevel = 0`) |

- MVP = highest level score for that level.
- Leaderboard score is snapshotted at each Impact and restored on rollback (prevents farming via repeated failed attempts).
- `impactMinContributionShare`: required per-player share of expected placement score for the Impact band. Default `30%`; `0` disables the gate. `impactScoreRequirement` is a hidden legacy flat floor, set only by old tooling.

### Scoring feedback UX

- Placement score: `+points` popup in the placing player's color, duration `placementScorePopupDurationMs`.
- Exact finish: distinct "PERFECT FIT" callout, then precision/team bonus feedback.
- Overbuild finish: target-reached message + wasted-height amount; no exact-finish celebration.
- MVP callout is display-only (no extra score); team total isn't shown to players.
- Level summary appears after the score-popup batch fades: result, team level score, MVP, finisher (if any), per-player level score, final total, contributed height, bonus breakdown.
- Failed summaries show level score but don't bank it to the leaderboard.

## Progression

| System | Curve |
|---|---|
| Target height | See Tower System above |
| Block complexity | All 5 bricks (`I`/`O`/`L`/`T`/`Z`) available from L1 — no size-unlock ramp; difficulty comes from target height, timer, stability sensitivity, and lane play |
| Inventory capacity | 1 slot @L1, 2 @L2, 3 @L4 |
| Impacts | Every 3 levels |

- Failing a level rolls back to the last completed Impact level.
- Opening hands are generated with solvability constraints — random supply shouldn't make a level impossible before player decisions happen.

## Leaderboard

Highest level reached; MVP scores; optional stats (finisher count, exact-finish rate).

## Design pillars

**Simplicity** (no rotation, limited inventory) · **Tension** (real-time placement, timer pressure) · **Fairness** (no pay-to-win) · **Replayability** (random blocks, skill-based progression).

## Debug menu and live tuning

Purpose: expose selected [Game Config](./backend.md#game-config) variables to designers/QA without code changes or restarts. Server validates and applies every change, then broadcasts `debug_config` to all real clients (validation rules and exact clamp ranges → [backend.md § Lobby Manager](./backend.md#lobby-manager)). Client debug controls live in a tabbed overlay (Bots / Round / UI / Supply / Scoring / Tower / Power tabs) with a Reset action that restores exposed tunables to `Game_Config.js` defaults, and a header Restart action that restarts the active room at its current level (score preserved) and closes the overlay.

### Currently exposed variables

| Variable | Description |
|---|---|
| `debugBotsEnabled` | Enables/disables debug bots globally |
| `debugBotCount` | Bot slots allowed per room (0–2) |
| `debugBotStrategy` | `cooperative` or `mvp_greedy` |
| `debugStartLevel` | Starts new rooms at a selected level; restarts active debug rooms at that level |
| `debugBotDelayMin` / `debugBotDelayMax` | Bot action delay range (ms); max never less than min |
| `placementCooldown` | Anti-spam delay between placements (ms) |
| `levelTimeLimitMs` | Level timer duration (ms) |
| `startDelayMs` | Countdown before level becomes playable (ms) |
| `placementScorePopupDurationMs` | Placement popup lifetime incl. fade-out (500–10000 ms, default 3000) |
| `finishScorePopupDurationMs` | MVP/Perfect-Fit/bonus popup lifetime incl. fade-out (500–10000 ms, default 3000) |
| `levelSummaryDelayMs` | Level summary visible duration before next level/rollback (1000–10000 ms, default 3000) |
| `impactMinContributionShare` | Required per-player expected-score share for the Impact band; default 30%, `0` disables |
| `targetHeightMultiplier` | Debug scale on the target-height curve; default 3 = unchanged |
| `levelSupplyMinSurplus` / `levelSupplyMaxSurplus` | Generated total-height surplus bounds above target |
| `minPrecisionBlocksPerLevel` | Minimum height-1/2 blocks required in solvable supply |
| `maxTeamCarryOverBlocks` | Max unused team blocks carried into next completed level |
| `refreshMinUsefulBlockHeight` | Minimum useful generated refresh height when remaining height allows it |
| `towerOverhangWeight` | Weight of one unsupported cell in the just-placed block vs. a full column-width of CoM drift — tune before `towerCollapseTiltScore` |
| `towerMaxTiltAngleDeg` | Visual lean cap in degrees, reached when tilt score hits ±1.0 |
| `towerCollapseTiltScore` | `|tiltScore|` at/above which the tower collapses (`1.0` = physical "CoM left the base") |
| `towerStabilityWarningThreshold` / `towerStabilityCriticalThreshold` | Stability % (0–100) gating warning/critical feedback; critical clamped to never exceed warning |
| `powerUnlockLevel` | Level the Power system unlocks |
| `powerMaxSlots` | Per-player Power inventory cap |
| `powerActivationCooldownMs` | Cooldown between a player's Power activations |
| `placementScorePerHeight` | Placement score scale (effective height × level × this) |
| `finisherBonusPerLevel` / `precisionBonusPerLevel` / `teamExactBonusPerLevel` / `assistBonusPerLevel` | Bonus multipliers per level; `0` disables that bonus |
| `assistContributionThreshold` | Minimum contribution share required for assist bonus when enabled |

### Bot behavior

Bots are QA/local-test helpers only — not production AI. They fill rooms only when at least one real player is waiting, stop when `debugBotsEnabled` is false, and never hold or activate Power items (no bot refresh behavior; they always just place).

| Strategy | Behavior |
|---|---|
| **Cooperative** | Exact-finishing block when available; near target, smallest block that doesn't overbuild; otherwise the highest useful block |
| **MVP-greedy** | Exact-finishing block when available; otherwise highest effective-height contribution, even if it overbuilds |

Scheduling/lifecycle mechanics → [backend.md § Bot Manager](./backend.md#bot-manager).

### Future debug variables (planned)

`blockWeights`, `blockUnlockLevels`, `inventoryScaling`, `impactInterval`, target-height curve bands, per-shape generation pools. Recalibration candidates: per-level shape pools, guaranteed minimum available height, target curve by level band, fail-condition pressure. Context → [decisions.md § Shape-block system invalidated old balance assumptions](./decisions.md#shape-block-system-invalidated-old-balance-assumptions).

### Shipping requirement

Debug Menu must be disabled behind a build flag, QA account permission, or server-side admin authorization before public release — currently **not** gated. See [decisions.md](./decisions.md#debug-menu--debug-config-not-yet-gated).
