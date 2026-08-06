# Gameplay

Source of truth for game design: rules, scoring, balance, progression. Technical implementation → [backend.md](./backend.md). Wire contract → [networking.md](./networking.md). Doc ownership: update this file for design/rules/scoring/balance/progression/debug-tuning-semantics/bot-behavior changes; see [coding-conventions.md](./coding-conventions.md).

> ⚠️ **Live tuning in progress.** Numbers below are the design's reference values. `Game_Config.js` currently carries hand-tuned playtest values that deliberately differ (a more forgiving stability set, a long `levelTimeLimitMs`, short cooldowns). **This doc is what each knob means; `Game_Config.js` is its current value.**

## Core concept

3-player real-time **selfish-cooperation** puzzle. Players build one shared tower from server-assigned bricks (random shape and rotation) while competing individually for level score / MVP. The team must reach target height together; individuals are scored separately.

**The tension in one line:** the scorable height per level is exactly `targetHeight` — a finite pool you race teammates for — but every player must personally clear a minimum share of it or the whole team rolls back.

## Core game loop

Queue 3 players → assign bricks → start after `startDelayMs` → players place in real time (order = input timing; each placement refills that player's hand from the shared pile and starts their `placementCooldown`) → level ends on target height or a failure condition → score, bank, carry unused bricks forward, advance. Placement itself: drag a brick from an inventory card onto the tower; its nearest corner snaps to the nearest snap point within the level's [placeable site](#placement-columns), and release sends the resolved column and release row. An accessibility option ([ui.md](./ui.md#main-ui-controller)) swaps the drag for tap-select → tap-aim → tap-confirm. First-time players are onboarded separately, offline, through the client-only Tutorial (coach-marks over the real HUD, no server involvement) → [ui.md § Tutorial](./ui.md#tutorial).

## Reconnect and shared room continuity (design rule)

Each player gets a persistent server-issued player id + reconnect token. Reconnecting within the TTL (**default 60s**, `RECONNECT_TTL_SECONDS`) resumes the same slot in the same room, and any healthy worker can recover the session from shared Redis state. If the TTL expires with no real players connected, the room is destroyed — never continued with bots.

Wire contract → [networking.md](./networking.md#reconnect). Implementation → [backend.md § Lobby Manager](./backend.md#lobby-manager).

## Block system

- **Five fixed brick types:** `I`, `O`, `L`, `T`, `Z` — all 4-cell tetrominoes, **all available from level 1** (no unlock ramp). Defined in `Game_Config.brickShapes` (canonical/unrotated cells); drawn by `brickWeights`.
- **Random rotation at generation**, not player-rotatable once dealt. Effective height/width therefore varies by draw, not by shape: `I` is height 4 vertical or height 1 horizontal.
- **Effective height** = the drawn rotation's vertical footprint, not cell count. **Precision brick** = height ≤ 2.
- Server sends `{ id, shapeId, cells, height }`; `cells` reflects the rotation drawn. No per-block anchor cell — the brick's own geometry determines where it lands.
- **Inventory:** **2** active hand slots at levels 1–2, **3** from level 3 (`maxActiveBlocks`). Empty slots refill from the shared pile after placement; the next shared draw brick is visible to all and goes to whoever places next.

### Draw pile & team carry-over

Each level gets a fresh shared pile = **team carry-over** + a **generated reserve**, shuffled before start. The reserve is **derived, not tabled**, so it self-corrects when `brickWeights`, target height, or site width change:

```
requiredBrickHeight = ceil(targetHeight / packingEfficiency) × (1 − levelSupplyPowerReserveShare)
reserve = ceil((requiredBrickHeight + bandCentre − openingHandHeight − carryOverHeight) / avgBrickHeight)
```

**The pile deliberately covers only `1 − levelSupplyPowerReserveShare` of the requirement** (default **10%** uncovered). One Replenish adds `powerReplenishPileShare` (25%) of the starting pile, so most levels finish unaided and Power is insurance against a bad draw rather than a mandatory cast. `maxGeneratedDrawPileBlocks` is a sanity ceiling against a bad config, **not a balance knob** — target height is uncapped, so a value that binds starves the level outright.

Opening-hand bricks fill slots directly without passing through the pile. On completion, unused hand + pile bricks become the next carry-over (up to `maxTeamCarryOverBlocks`, precision-first). **On failure, carry-over is discarded.**

## Power system

- Unlocks at **level 1** (`powerUnlockLevel`) — Power and the side quest are both live from the opening level. Up to `powerMaxSlots` per player.
- One shared side quest per level, currently fixed to "first to make the exact-finishing placement". A block-size variant exists in code but is never generated.
- Items persist across levels within a match, snapshotted at each completed Impact and restored on rollback so they can't be farmed by repeated failed attempts (`powerLifetime: impact`).

### Acquisition paths

**Replenish is quest-only.** Two flags gate the other paths and both default **off**; flipping either on restores that path with no code change. With Impacts every level, the Impact-MVP path would grant one *every* level — which is why it is off rather than merely rare.

| Path | Gate | Grants |
|---|---|---|
| Side quest completion | always on | Replenish, to the first eligible player |
| Guaranteed baseline | `powerGuaranteedBaseline` (**false**) | Replenish at every level start |
| Impact-MVP reward | `powerImpactMvpReward` (**false**) | Random `active` catalog entry to the top scorer |

### Activation and effects

Tap the Power icon → tap a held item. Instant, **no target selection**; every activation affects all players including the caster. `powerActivationCooldownMs` between activations, blocked in the final 3s of a level. A toast naming the effect is the only feedback. Each `powerCatalog` entry carries an `active` flag gating whether `awardImpactPower()` can grant it — only **Replenish** is active, the other three stay fully defined so re-enabling is a one-line flip ([decisions.md](./decisions.md#inactive-powers-stay-defined-behind-the-powercatalog-active-flag)).

| Effect | Category | What it does | Active |
|---|---|---|---|
| **Replenish** | Utility | Adds `max(1, round(powerReplenishPileShare × the level's starting draw-pile size))` fresh bricks to the shared pile — so it scales with target height, site width and brick weights instead of being a flat number. Appended, never shuffled in, so the "Next Draw" preview all three players read stays put. **The only power that can rescue a level short on supply:** holding one defers the not-enough-height failure | **Yes** |
| **Refresh** | Utility | Rerolls every player's hand. Bricks below size 3 reroll into size-3+ where possible; larger bricks keep size but reroll shape/orientation, targeting each player's remaining height | No |
| **Score Cap** | Offensive | Sets every player's total to their own next Impact requirement, up or down | No |
| **Copy Score** | Defensive | Sets every player's total to the caster's, updating their Impact baseline | No |

## Tower system

Target height grows by a step that itself grows, scaled by `targetHeightMultiplier` (default 3 = unchanged): `target(n) = target(n−1) + targetHeightStepBase + targetHeightStepGrowth × floor((n − 2) / targetHeightStepGrowthEvery)`, from `targetHeightBase`. At the defaults (base **30**, step **10**, growth **+5** every **3** levels): L1 30 · L5 75 · L10 165 · L15 300 · L20 475 · L25 690.

**The curve is uncapped, and the level clock follows it** ([Timer](#timer-quick-chat-failure-conditions)) — height never flattens, so nothing bounds round length but the curve itself. Stability at that height is carried by players placing into gaps rather than by a height ceiling, and supply by the pile scaling with the target. **Rejected:** capping height at the timer ceiling (~84) → the cap lands near L30 and every later level is identical, trading the old curve's invisible progression (it decayed to +0.1/level and repeated its own target on half the levels past L7) for another. **Consequence:** a level can outlast `RECONNECT_TTL_SECONDS` (60s), so a dropped player no longer has the whole level to return. **No level fits the tower viewport**, whose flush capacity is 16 brick rows, so every level scrolls ([ui.md](./ui.md#leaf-components)); by L25 the tower is ~43 screens, well past what the scroll, Impact Beat zoom floor and collapse animation were authored for.

Overbuilding is allowed but wastes the excess and forfeits the exact-finish bonuses. The client renders from authoritative `towerBlocks`.

### Placement columns

The tower is a grid `towerGridWidth` columns wide. The **placeable site is derived per level from target height**, so taller targets get a proportionally wider base and the height curve and footprint cannot drift apart:

```
siteWidth = evenRoundUp(targetHeight / towerSiteSlendernessTarget)
            clamped to towerSiteWidthMin .. towerSiteWidthMax
min = round((towerGridWidth − siteWidth) / 2)      # always centred
max = min + siteWidth − 1
```

- Width is forced **even** so the site stays exactly centred. `placeableColumnMin`/`Max` in `Game_Config` are only the fallback used before a target height exists; the resolved pair is broadcast every tick.
- **`towerSiteWidthMax` has a hard ceiling of 8 set by the viewport, not by taste** — only 8 grid columns are ever on screen, so a wider site places bricks the player can never see ([decisions.md](./decisions.md#buildable-site-width-scales-with-target-height)).
- Placement is a **hard exclusion**: a brick's entire footprint must fit the site, with no overflow.
- **Point-based snapping.** Snap points are the platform's column boundaries (`siteWidth + 1`) plus every true outline corner of every placed brick, so the tower grows its own docking targets. Each corner of the held brick is paired against each point and the closest valid pair wins; past `snap_radius_units` it falls back to nearest-column aiming so a drag over open sky still resolves.
- **Snapping picks the whole origin, and the brick is *released* there rather than dropped from above the tower** — so a gap inside the tower is reachable. **Gravity still applies from that row down:** a brick aimed with nothing under it falls, so mis-aiming wastes a placement rather than hanging a brick in mid-air. Overhangs survive (a `T` balancing on its stem is the intended stability hook). The client previews where the brick comes to rest by mirroring the server's gravity. Drag feedback, the docked landing ghost, and the drop animation are client presentation → [ui.md § Leaf components](./ui.md#leaf-components).

### Tower stability (design view)

Stability has **two independent axes**; reported `towerStability` is the lower of the two, so either can fail a level alone. Lean measures only *asymmetry* normalised by the tower's own base, so Integrity is what makes a spire unstable ([decisions.md](./decisions.md#two-axis-stability-lean--integrity-replaces-the-single-tilt-scalar)).

| Axis | Measures | Drives |
|---|---|---|
| **Lean** (signed) | CoM drift + column-height imbalance + the just-placed brick's overhang | Visual tilt; collapses at the resolved collapse-tilt score |
| **Integrity** (0–100) | **Site usage** (base span vs. the buildable site) + **support deficit** (unsupported cells across the whole tower) | Collapses at 0 |

```
siteUsage          = siteWidth / groundWidth        # 1.0 = whole site used, 2.0 = half of it
slendernessPenalty = clamp01((siteUsage − Safe) / (Max − Safe))
supportPenalty     = clamp01((unsupported cells / all cells) / supportDeficitMax)
integrity          = round(100 × (1 − clamp01(slendernessPenalty + supportPenalty)))

pressure           = (towerStabilityDifficulty / 100) × (floor + (1 − floor) × min(1, level / fullPressureLevel))
```

**`towerStabilityDifficulty` (0–100) is the only stability tunable.** `pressure` interpolates every constant above between the **forgiving** and **harsh** anchor sets in `towerStabilityAnchors`, so threat also ramps with level ([decisions.md](./decisions.md#tower-stability-is-one-derived-dial-scaled-by-level)). `0` leaves stability inert — score multiplier only, no collapse; the default **90** holds levels 1–5 to score pressure alone and makes collapse a genuine threat past level ~25.

- **Maturity ramp.** Every penalty scales by `min(1, height / towerStabilityMinHeight)`, itself derived from pressure. Without it the opening brick is lethal — a single narrow brick on the ground is the worst site usage a tower can register.
- **Every term is repairable at its source.** Widening the base or straightening a lean improves Integrity directly, and support deficit is fixable too: a brick released into a void puts the cells above it back on solid ground instead of only diluting the ratio. This is what [Reinforce](#scoring-system) pays for.
- Warning/critical feedback fires at tuned thresholds; stability hitting 0 collapses the tower and fails the level **before** a height completion can count.

Algorithm → [backend.md § Tower Stability](./backend.md#tower-stability).

## Timer, quick chat, failure conditions

**The level clock is derived from target height, not flat** — a curve growing in tens per level would outrun the time to build it. `limit = ceil(targetHeight / (avgBrickHeight × levelTimePlannedEfficiency) / players) × placementCooldown × levelTimeSlack`, floored at `levelTimeLimitMs` (30s). `levelTimePlannedEfficiency` (**0.55**) is what a human filling the site achieves — deliberately not the bots' ~0.9 spire rate, which is why bots never time out in the [Balance Simulator](./testing.md#balance-simulator); `levelTimeSlack` (**2.0**) covers think time. Rounds grow without bound (~30s at L1, ~86s at L10, ~356s at L25); `placementCooldown` is the dial to move if they run long, since throughput is `players / cooldown`.

Quick chat is 3 fixed slots per player (`Place Block!`, `Sorry!`, `Hello!`), server-authoritative per-player cooldown, config-driven so text can change without touching gameplay contracts. A level fails when: time runs out; hands + pile are exhausted below target; remaining possible height can't reach target **and** nobody holds a Replenish that could rescue it; or any player is below their contribution requirement at an Impact.

## Scoring system

**The selfish-cooperation engine.** The scorable height per level is exactly `targetHeight` — finite and contested, which is the selfish pressure. Two mechanisms make cooperating individually rational at the right moments: your placement pays less on a wobbling tower, and fixing the tower pays directly ([decisions.md](./decisions.md#scoring-carries-the-selfish-cooperation-tension)).

| Component | Formula |
|---|---|
| Contribution (per placement) | `effective_height × level × placementScorePerHeight` (default `10`) **× stability multiplier** — the core earner, and what the Impact gate measures |
| Stability multiplier | `placementStabilityFloor + (1 − floor) × stabilityBefore/100` (floor `0.5`). Uses the stability the placer **inherited**, so it rewards fixing-then-claiming instead of paying you for your own overhang |
| Reinforce (per placement) | `min(cap, round((integrity_gain × reinforceScorePerIntegrity + lean_correction × reinforceScorePerLean + supported_cells × reinforceScorePerSupportedCell) × level))`, `lean_correction = max(0, |lean_before| − |lean_after|)`, `supported_cells` = tower cells that were hanging and now rest on the placed brick |
| Repair ceiling | `cap = reinforceScoreCapShare × avgBrickHeight × placementScorePerHeight × level`. **Repair and height are priced against each other, not independently:** at `1` a maximal repair equals an average height claim — worth choosing when the tower is hurt, never able to out-earn a good claim — and it re-prices itself when the brick mix or `placementScorePerHeight` changes. `0` removes the ceiling |
| Precision Bonus (exact finish, finisher) | `level × precisionBonusPerLevel` (default `20`) |
| Team Exact Bonus (exact finish, everyone) | `level × teamExactBonusPerLevel` (default `15`) |
| Finisher Bonus | `0` — overbuild finishing earns nothing beyond banked contribution |
| Assist Bonus | `0` (disabled) |

- **Reinforce counts toward the Impact gate** — helping means building *or* stabilising.
- The pool is **front-loaded**: `effective_height` is capped by the height still missing, so late placements are worth little and a slow start may be uncatchable. Deliberate urgency.
- MVP = highest level score that level (display-only). Leaderboard score is snapshotted at each Impact and restored on rollback.

**The Impact gate.** `required = impactMinContributionShare × targetHeight × level × placementScorePerHeight`, per player, with `impactScoreRequirement` as an optional flat floor (`max` of the two). Default share **30%**; `0` disables. The share is bounded by arithmetic, not taste — three players × the share is how much of the pool must split near-evenly, and above ~30% no natural distribution reaches it, so the default now sits right at that ceiling ([decisions.md](./decisions.md#impact-every-level-and-the-share-is-bounded-by-arithmetic)).

**Feedback UX.** `+points` popup per placement in the player's colour, with `REINFORCE +n` alongside it, then precision/team bonus popups. Exact-finish/overbuild state has no popup or level-end score-event callout of its own — the Top Indicator ([ui.md](./ui.md#main-ui-controller)) already shows it live during play. The level summary appears once the popup batch fades (result, team score, MVP, finisher, per-player score, contributed height). Failed summaries show level score but never bank it.

## Progression

| System | Curve |
|---|---|
| Target height | See [Tower system](#tower-system) |
| Site width | Derived from target height — see [Placement columns](#placement-columns) |
| Brick complexity | All 5 bricks from L1; difficulty comes from height, timer, stability and site width — not unlocks |
| Inventory | 2 slots @L1, 3 @L3 |
| Power / side quest | Unlocked from L1 |
| Impacts | **Every level** (`impactInterval` = 1) |

**Every level is an Impact.** Each player must clear their share to advance, so filling the Impact bar *is* the per-level objective. Rollback correspondingly returns to the level just played — that gentler failure is what makes a per-level gate viable at all. Opening hands carry solvability constraints, so random supply can't make a level impossible before player decisions happen.

**Leaderboard:** highest level reached, MVP scores, optional stats. No durable storage yet — see [decisions.md](./decisions.md#no-persistent-leaderboard-yet). **Design pillars:** Simplicity (no rotation, limited inventory) · Tension (real-time placement, timer pressure) · Fairness (no pay-to-win) · Replayability (random bricks, skill-based progression).

## Debug menu and live tuning

Exposes [Game Config](./backend.md#game-config) variables to designers/QA without code changes or restarts. The server validates and clamps every change then broadcasts `debug_config` (rules → [backend.md § Lobby Manager](./backend.md#lobby-manager)). The overlay is dropdown-navigated (Bots / Round / UI / Supply / Scoring / Impact / Tower / Power / Parallax / Placement / Hooks), with Reset (restore `Game_Config.js` defaults) and Restart (restart the room at its current level, score preserved).

**Shipping requirement:** the Debug Menu is gated by a client build flag (`EndpointConfig.DEBUG_UI_ENABLED`), but the server still accepts `update_config`/`resetDebugConfig` from any client — full gating needs server-side admin auth too, before public release. See [decisions.md](./decisions.md#debug-menu-build-flag).

### Currently exposed variables

Every row below is tunable live, and **each carries its own in-app explainer with its formula** — tap the row's name button (Supply, Scoring, Impact, Tower, Parallax and Placement rows). This list is the *surface*; the tooltips and `Game_Config.js` are the detail. Implementation → [ui.md](./ui.md#main-ui-controller).

| Group | Keys |
|---|---|
| **Bots** | `debugBotsEnabled`, `debugBotCount` (0–2), `debugBotStrategy`, `debugBotDelayMin`/`Max`, `debugStartLevel` |
| **Round** | `placementCooldown`, `levelTimeLimitMs`, `startDelayMs`, `targetHeightMultiplier` |
| **UI** | `placementScorePopupDurationMs`, `finishScorePopupDurationMs`, `levelSummaryDelayMs`; plus the Parallel Placement toggle, which is a **client-local per-player override** of `accessibility.parallelPlacement`, not a server round-trip |
| **Impact** | `impactInterval`, `impactMinContributionShare`, `impactScoreRequirement` |
| **Supply** | `levelSupplyMinSurplus`/`MaxSurplus`, `supplyEffectiveWidthRatio`, `minPrecisionBlocksPerLevel`, `maxTeamCarryOverBlocks`, `refreshMinUsefulBlockHeight` |
| **Tower — stability** | `towerStabilityDifficulty` (the single dial; the physics constants are derived, not exposed), `towerMaxTiltAngleDeg` (visual only) |
| **Tower — site** | `towerSiteSlendernessTarget`, `towerSiteWidthMin`/`Max` (max hard-capped at 8 by the viewport) |
| **Tower — feedback** | `towerStabilityWarningThreshold`/`CriticalThreshold` (display only; critical clamped below warning), `towerStabilityMoodThreshold` (display only; 1–50, default 2 — the brick-face band, see [ui.md](./ui.md#leaf-components)) |
| **Power** | `powerUnlockLevel`, `powerMaxSlots`, `powerActivationCooldownMs`, `powerReplenishPileShare` (0–1, shown as a %) |
| **Scoring** | `placementScorePerHeight`, `placementStabilityFloor`, `reinforceScorePerIntegrity`/`PerLean`, `precisionBonusPerLevel`, `teamExactBonusPerLevel`, `finisherBonusPerLevel`, `assistBonusPerLevel`, `assistContributionThreshold` |
| **Parallax / Placement** | Client-local rendering and snap-feel values — no server round-trip. See [ui.md](./ui.md#main-ui-controller) |
| **Hooks** | `visualHookImpactBeat`, `visualHookScreenShake` — the two kill switches; `visualHookZoomOutMs`/`WaveMs`/`HoldMs` and `visualHookShakeMs` tune the [Impact Beat](./ui.md#leaf-components)'s reveal/hold durations and the failure-shake length, all round-tripping through `Game_Config.visualHooks` |

The three most load-bearing knobs, if you only touch a few: `towerStabilityDifficulty` (all of stability), `impactMinContributionShare` (the per-level gate), and `towerSiteSlendernessTarget` (reshapes the whole aspect ratio, and with it the site usage stability is measured against).

### Bot behavior

QA/local-test helpers only — not production AI. They fill rooms only when a real player is waiting, stop when `debugBotsEnabled` is false, and never hold or activate Power items. `debugBotsEnabled` defaults to `false` but is overridable at process start via `CORP_TOWER_BOTS_ENABLED` — the physical backup's public demo instance sets it, since that build ships without the debug menu (see [deployment.md § Backup](./deployment.md#backup-physical-machine)). Scheduling → [backend.md § Bot Manager](./backend.md#bot-manager); why the two strategies are shaped this way → [decisions.md](./decisions.md#bot-strategies-differ-by-risk-appetite-not-competence).

**Brick and placement are chosen together** — under gap targeting a 1-high brick can out-earn a 4-high one as a repair, so the two can't be picked independently. Candidates are ranked by the score the engine would actually pay (placement + Reinforce), never by height gain alone.

| Strategy | Brick + placement choice | Yields? |
|---|---|---|
| **Cooperative** | Exact-finisher first; otherwise the highest-scoring pair among placements within `debugBotStabilityTolerance` of the **best available** stability | **Yes** |
| **MVP-greedy** | Exact-finisher first; otherwise the highest-scoring pair among any non-collapsing placement | No |

- **The stability gate is relative, not absolute** — measured against the best placement for that brick, so it keeps discriminating however forgiving the stability config is tuned.
- **Yielding is the cooperative act that matters under a per-level Impact.** A bot that has banked its own share prefers a **zero-height repair**, leaving every point of contested height to a teammate whose shortfall would fail everyone while still earning Reinforce (which counts toward the gate); it returns `wait` only when no repair exists. A bot that is short can never take that branch, so a room can't deadlock.

### Future debug variables and open tuning questions

Not yet exposed: `brickWeights`, `inventoryScaling`, the `targetHeightBase`/`Step*` curve knobs and the `levelTimePlannedEfficiency`/`levelTimeSlack` clock pair, per-shape generation pools, `debugBotStabilityTolerance`/`debugBotGapCandidates`, `reinforceScorePerSupportedCell`/`reinforceScoreCapShare`, and the `towerStabilityAnchors`/`towerStabilityPressure` sets the stability dial interpolates.

- **Exact-finish runs high** (~55–80% simulated), so "PERFECT BUILD" fires often. Lower via supply surplus or `minPrecisionBlocksPerLevel` if it should feel rarer.
- **The front-loaded pool** can make a slow start mathematically uncatchable; worth confirming that reads as urgency, not unfairness. **Per-shape pools and fail-condition pressure** remain untouched levers for later difficulty shaping.
