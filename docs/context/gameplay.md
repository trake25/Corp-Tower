# Gameplay

Source of truth for game design: rules, scoring, balance, progression.
Implementation → [backend.md](./backend.md). Wire contract →
[networking.md](./networking.md). Update this file for design, scoring, balance,
progression, debug-tuning semantics and bot behaviour.

> **Live tuning:** this doc defines knob semantics; `Game_Config.js` holds every
> current value.

## Core concept

3-player real-time **selfish-cooperation** puzzle. Players build one shared tower
from server-assigned bricks while competing individually for level score and MVP.

**The tension in one line:** the scorable height per level is exactly
`targetHeight` — a finite pool you race teammates for — but every player must
personally clear a minimum share of it or the whole team rolls back.

## Core loop

Queue 3 players → assign bricks → start after `startDelayMs` → players place in
real time, order set by input timing, each placement refilling that player's hand
from the shared pile and starting their `placementCooldown` → level ends on target
height or a failure condition → score, bank, carry unused bricks forward, advance.

Placement: drag a brick from an inventory card onto the tower; its nearest corner
snaps to the nearest snap point within the level's site, and release sends the
resolved column and release row. An accessibility option swaps the drag for
tap-select → tap-aim → tap-confirm. First-time players are onboarded offline
through the client-only Tutorial → [ui-tutorial.md](./ui-tutorial.md#tutorial).

## Reconnect continuity

Each player gets a persistent server-issued id and reconnect token. Reconnecting
within the TTL (**default 60s**) resumes the same slot in the same room, and any
healthy worker can recover the session from shared Redis state. If the TTL expires
with no real players connected the room is destroyed — **never continued with
bots**.

## Block system

- **Five fixed brick types:** `I`, `O`, `L`, `T`, `Z` — all 4-cell tetrominoes,
  **all available from level 1**, no unlock ramp.
- **Random rotation at generation**, not player-rotatable once dealt. Effective
  height varies by draw, not by shape: `I` is height 4 vertical, height 1
  horizontal.
- **Effective height** is the drawn rotation's vertical footprint, not cell count.
  **Precision brick** = height ≤ 2.
- **No per-block anchor cell** — the brick's own geometry determines where it lands.
- **Inventory:** 2 hand slots at levels 1–2, 3 from level 3. Empty slots refill
  from the shared pile; the next shared draw is visible to all and goes to whoever
  places next.

### Draw pile and team carry-over

Each level gets a fresh shared pile = **team carry-over** + a **generated
reserve**, shuffled before start. The reserve is **derived, not tabled**, so it
self-corrects when brick weights, target height or site width change. Sizing
mechanism → [backend.md](./backend.md#supply-sizing-is-packing-aware).

Coverage lerps from `levelSupplyCoverageStart` down to `levelSupplyCoverageEnd`
by `levelSupplyCoverageFullLevel`: early levels run a **surplus** and the squeeze
arrives gradually, ending **below** full coverage so late levels are not meant to
finish on the dealt pile alone. One Replenish adds `powerReplenishPileShare` of
the starting pile, insuring that uncovered share.

Opening-hand bricks fill slots directly without passing through the pile. On
completion, unused hand and pile bricks become the next carry-over, precision
first. **On failure, carry-over is discarded entirely.**

## Power system

Unlocks at **level 1**, alongside the side quest. One shared side quest per level,
currently fixed to "first to make the exact-finishing placement". Items persist
across levels within a match, snapshotted at each completed Impact and restored on
rollback so they can't be farmed by repeated failed attempts — that is
`powerLifetime: impact`. Its `match` setting keeps earned items across a rollback
and exists for debug only; shipping with it would make failure free.

**Replenish is quest-only.** Two flags gate the other paths and both default
**off**; flipping either on restores that path with no code change. At a low
`impactInterval` the Impact-MVP path grants one every band, which is close enough
to every level to be off rather than merely rare.

| Path | Gate | Grants |
|---|---|---|
| Side quest completion | always on | Replenish, to the first eligible player |
| Guaranteed baseline | `powerGuaranteedBaseline` (**false**) | Replenish every level start |
| Impact-MVP reward | `powerImpactMvpReward` (**false**) | Random active entry to the top scorer |

Activation is instant with **no target selection** — every activation affects all
players including the caster. A cooldown applies between activations, blocked in
the final 3s of a level. A toast is the only feedback.

| Effect | What it does | Active |
|---|---|---|
| **Replenish** | Adds `powerReplenishPileShare` of the level's *starting* pile in fresh bricks, appended rather than shuffled in so the shared "Next Draw" preview stays put | **Yes** |
| **Refresh** | Rerolls every player's hand, targeting each player's remaining height | No |
| **Score Cap** | Sets every player's total to their own next Impact requirement, up or down | No |
| **Copy Score** | Sets every player's total to the caster's, updating their Impact baseline | No |

Replenish scales with target height, site width and brick weights, and is **the
only power that rescues a level short on supply** — holding one defers the
not-enough-height failure.

The inactive three stay fully defined, including their effect branches —
re-enabling any is a one-line flip.

## Tower system

Target height grows by a step that itself grows:

```
target(n) = target(n−1) + stepBase + stepGrowth × floor((n − 2) / stepGrowthEvery)
```

At the defaults (base **30**, step **10**, growth **+5** every **3** levels):
L1 30 · L5 75 · L10 165 · L15 300 · L20 475 · L25 690. `targetHeightMultiplier`
is a debug scalar whose **default of 3 leaves the authored curve unchanged**.

**The curve is uncapped and the level clock follows it** — height never flattens,
so nothing bounds round length but the curve itself. Capping it at the timer
ceiling would make every level past ~L30 identical.

Two consequences worth knowing before tuning the curve:

- **A level can outlast the 60s reconnect TTL**, so a dropped player no longer has
  the whole level to return.
- **No level fits the tower viewport**, whose flush capacity is 16 brick rows, so
  every level scrolls. By L25 the tower is ~43 screens — well past what the scroll
  ramp, the Impact Beat zoom floor and the collapse animation were authored for.

Overbuilding is allowed but wastes the excess and forfeits the exact-finish
bonuses. The client renders from authoritative `towerBlocks`.

### Placement columns

The tower is a grid `towerGridWidth` columns wide. The **placeable site is derived
per level from target height**, so taller targets get a proportionally wider base
and the height curve and footprint cannot drift apart:

```
siteWidth = evenRoundUp(targetHeight / towerSiteSlendernessTarget)
            clamped to towerSiteWidthMin .. towerSiteWidthMax
min = round((towerGridWidth − siteWidth) / 2)      # always centred
max = min + siteWidth − 1
```

The site is **derived, never tabled or fixed**: a fixed column span stands a target
of 40 on the same base as a target of 3, which puts tall levels out of reach, and a
second authored table drifts from the height curve. One knob reshapes both.

- Width is forced **even** so the site stays exactly centred. The `Game_Config`
  column pair is only the fallback used before a target height exists.
- **`towerSiteWidthMax` has a hard ceiling of 8 set by the viewport, not by
  taste.** Only 8 grid columns are ever on screen, so a wider site places bricks
  the player can never see. Widening it means widening the tower viewport or
  shrinking bricks — and fixed brick size is itself a deliberate decision.
- Placement is a **hard exclusion**: a brick's entire footprint must fit the site,
  with no overflow. That rule is what removed the old lane system's overflow-column
  bug class.
- **Snapping picks the whole origin and the brick is *released* there**, not
  dropped from above — so a gap inside the tower is reachable. **Gravity still
  applies from that row down**, so a brick aimed with nothing under it falls and
  mis-aiming wastes a placement rather than hanging a brick in mid-air. Overhangs
  survive; a `T` balancing on its stem is the intended stability hook. Snap-point
  set and resolution → [ui-hud.md](./ui-hud.md#tower-stack--the-rendering-contracts-that-matter).

### Tower stability (design view)

Two independent axes — **Lean** (signed, drives the visual tilt) and **Integrity**
(0–100). Reported `towerStability` is the **lower** of the two, so either fails a
level alone. Axis definitions and the collapse conditions →
[backend.md](./backend.md#two-axes).

**`towerStabilityDifficulty` (0–100) is the only stability tunable.** `pressure`
interpolates the forgiving and harsh anchor sets while its quadratic risk scale
makes 5 extremely forgiving, 25 forgiving, 50 moderate, 75 harsh, and 100
extreme. `0` leaves stability inert — score multiplier only, no collapse. Level,
maturity, and target-height pressure still make weak bottlenecks progressively
dangerous while a full-width tower stays viable.

**Do not re-expose the nine raw constants as individual knobs.** Their units are
not comparable — three cannot reach their thresholds at all — and because the site
is capped per level, no absolute height÷width threshold both fires late enough and
spares a perfectly played tall level.

- **Maturity ramp.** `severity` scales every penalty by
  `min(1, height / towerStabilityMinHeight)`, so the opening brick is always safe
  regardless of how tight the anchors are tuned.
- **Landmine — site usage is worst at the very first brick.** One narrow brick
  alone on the ground is maximal `siteWidth / groundWidth`, so the opening
  placement is the harshest point on the curve, not the calmest. **Any harshening
  must be re-checked against the opening brick, not just steady-state play.**
- **Slenderness is measured as site usage**, so a full-width base is free at every
  level and only the level ramp scales difficulty. Widening the site therefore
  widens the safe zone — **the site knobs and the stability dial are coupled**, and
  `towerSiteSlendernessTarget` is tuned so the site reaches its max around the
  level full pressure arrives, not independently of it.
- **Every term is repairable at its source.** Widening the base or straightening a
  lean improves Integrity directly, and support deficit is fixable too: a brick
  released into a void puts the cells above it back on solid ground instead of only
  diluting the ratio. This is what Reinforce pays for.

## Timer, quick chat, failure conditions

**The level clock is derived from target height, not flat** — a curve growing in
tens per level would outrun the time to build it.

```
limit = ceil(targetHeight / (avgBrickHeight × plannedEfficiency) / players)
        × placementCooldown × slack(level)
```

floored at `levelTimeLimitMs` (**60s**). `levelTimePlannedEfficiency` (**0.55**) is
what a human filling the site achieves — **deliberately not the bots' ~0.9 spire
rate**, which is why bots never time out in the simulator. `slack` lerps from
**3.0** at level 1 down to **1.5** by level 25. Rounds grow without bound but far
slower than target height (60s at L1, 105s at L10, 267s at L25);
`placementCooldown` is the dial to move if they run long, since throughput is
`players / cooldown`.

Quick chat is 3 fixed slots per player with a server-authoritative per-player
cooldown, config-driven so text can change without touching gameplay contracts.

A level fails when: time runs out; hands and pile are exhausted below target;
remaining possible height can't reach target **and** nobody holds a Replenish that
could rescue it; or any player is below their contribution requirement at an
Impact.

## Scoring system

Each settled placement produces one server-authoritative transaction. Useful
height pays from the usable height gained, with an introduced-risk discount;
direct structural repair pays from its normalized utility; a qualifying repair of
a mature critical interface can add a Critical Save. The combined placement award
is capped in action units. Completion and presentation bonuses remain score-only.

The transaction's useful components are the sole eligible Impact contribution:
useful height, reinforcement, and Critical Save count after the cap. Precision,
team-exact, MVP, Power, and other completion bonuses never count. This makes a
support specialist capable of progressing without matching another player's height
claim, while one player's excess cannot cover a teammate's deficit.

**The Impact gate.**

```
expectedBandUsefulScore = sum(expectedNormalUsefulScore(level))
requiredContribution = max(flatFloor,
                           round(expectedBandUsefulScore × personalShare))
```

The normal pool is Scoring's clean useful-height baseline, not an expected
stability-adjusted payout and not a team total. Each player must meet the
requirement using their own banked and live eligible contribution. The server
includes live contribution exactly once in its status; clients and bots do not
recalculate it from score fields.

Leaderboard score and eligible contribution are snapshotted together at each
checkpoint. A recoverable failure restores both; a terminal failure also restores
them before its final state is broadcast. Gate-pass rate is meaningful only from a
simulator that models the per-player placement cooldown →
[testing.md](./testing.md#balance-clis).

## Progression

| System | Curve |
|---|---|
| Target height | See [Tower system](#tower-system) |
| Site width | Derived from target height |
| Brick complexity | All 5 from L1 — difficulty comes from height, timer, stability and site, not unlocks |
| Inventory | 2 slots @L1, 3 @L3 |
| Power / side quest | Unlocked from L1 |
| Impacts | Configured checkpoint bands |

Each Impact band begins at a secured checkpoint and ends before the next one.
Rollback replays the whole active band from its checkpoint, restoring its score,
eligible contribution, and Power snapshot. The retry budget survives that replay;
a secured next checkpoint is its only reset. Opening hands carry solvability
constraints, so random supply cannot make a level impossible before player
decisions happen.

**Design pillars:** Simplicity · Tension · Fairness · Replayability.

## Debug menu and live tuning

Exposes [Game Config](./backend.md#game-config) variables without code changes or
restarts. The server validates and clamps every change then broadcasts
`debug_config` — the authoritative ranges live in
[backend.md](./backend.md#debug_config--the-authoritative-validation). The
overlay is dropdown-navigated with Reset and Restart actions.

**Shipping requirement:** the menu is gated by a client build flag, but the server
still accepts `update_config` from any client. Full gating needs server-side admin
auth before public release.

Every row carries its own in-app explainer with its formula. The categories are
**Bots · Round · UI · Impact · Supply · Tower (stability / site / feedback) ·
Power · Scoring · Parallax · Placement · Hooks**. Read `Game_Config.js` for keys
and current values rather than maintaining a prose copy.

`towerSiteWidthMax` is hard-capped at 8 by the viewport, and the two feedback
warning thresholds are display-only with critical clamped below warning. Which
categories round-trip to the server and which write straight to live nodes →
[ui-hud.md](./ui-hud.md#module-notes-that-are-not-derivable-from-the-source).

The three most load-bearing knobs: `towerStabilityDifficulty` (all of stability),
`impactMinContributionShare` (the per-level gate), and
`towerSiteSlendernessTarget` (reshapes the whole aspect ratio, and with it the
support width the structural rule is measured against).

The Scoring controls tune dangerous useful-height retention, strong direct
structural action value and the normal combined transaction cap. They do not
alter collapse rules or create a second reinforcement reward.

## Bot behaviour

QA and local-test helpers only, not production AI. They fill rooms only when a real
player is waiting and never hold or activate Power items. `debugBotsEnabled`
defaults to `false` but is overridable at process start via
`CORP_TOWER_BOTS_ENABLED` — the public demo instance sets it, since that build
ships without the debug menu.

**Brick and placement are chosen together**, because under gap targeting a 1-high
brick can out-earn a 4-high one as a repair. Candidates are ranked by the score the
engine would actually pay, **never by height gain alone**.

| Strategy | Choice | Yields? |
|---|---|---|
| **Cooperative** | Exact-finisher first; otherwise the highest-scoring pair among placements within `debugBotStabilityTolerance` of the **best available** stability | **Yes** |
| **MVP-greedy** | Exact-finisher first; otherwise the highest-scoring pair among any non-collapsing placement | No |

Cooperative ranks by **score within a stability tolerance**, not by stability
itself — maximising stability outright spreads bricks pointlessly, starves the bot
of supply and loses to greedy on completion.

**The stability gate is relative, not absolute** — an absolute threshold stops
discriminating entirely once stability is tuned forgiving enough that every column
reads healthy, which is exactly the live tuning state.

**Yielding is the cooperative act that matters in an Impact band.** A bot
that has banked its own share prefers a **zero-height repair**, leaving contested
height to a teammate whose shortfall would fail everyone while still earning
Reinforce. It returns `wait` only when no repair exists, and a bot that is short
can never take that branch, so a room can't deadlock.

**The yield check reads `impactScoreStatus`.** Its personal `met` values already
include live eligible contribution, so a cooperative bot never reconstructs a
standing from banked or display-score fields.

**Landmine — bot collapse rate cannot calibrate stability.** `chooseBotPlacement`
skips collapsing placements, so simulated collapse reads ~0% across wildly
different configs. Tune against `avgStability` and per-placement spread instead.

Divergence between the two is contingent on stability being able to punish. With
collapse effectively impossible, greedy wins both completion and gate (96% vs 88%
at level 10); with stability biting, cooperative wins decisively (87% gate / 2%
collapse vs 64% / 28%). Both are correct — with no risk there is nothing to be
risk-averse about.

## Open tuning questions

Not yet exposed: `brickWeights`, `inventoryScaling`, the target-height curve knobs,
the clock group, the supply coverage curve, per-shape generation pools, the bot
tolerance keys, the reinforce cap keys, `placementStabilityFloorAtTarget`,
and the stability anchor and pressure sets.

- **Exact-finish runs high** (~55–80% simulated), so "PERFECT BUILD" fires often.
- **The front-loaded pool** can make a slow start mathematically uncatchable; worth
  confirming that reads as urgency, not unfairness.
- **Deferring a rebalance across a geometry change is what produced two
  unwinnable-game bugs.** A narrowed placeable footprint under untouched stability
  weights and an old target curve is the direct ancestor of both the two-axis
  stability rework and the supply resize. Do not ship a geometry change with
  "no rebalancing" as an explicit non-goal.
