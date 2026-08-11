# Testing

Scope: server contract tests, balance CLIs, client smoke and unit tests, CI gates.
Logic under test → [backend.md](./backend.md) · [ui.md](./ui.md).

## Server tests

Nothing under `tests/` or `tools/` ships in the Docker image. `npm test` from
`src/Server` runs Node's built-in test runner — no separate framework — plus
`node --check` over the tooling.

### `tests/Score_Events.test.js`

The main contract suite: score events, exact-finish and overbuild, column→`originX`
clamping and placeable-range narrowing, per-level site width, the stability dial
and multiplier, reinforce cap, round-clock slack, supply coverage, quick chat,
refresh generation, Impact snapshot and rollback.

Four cases carry a reason worth knowing before editing them:

- **`balanceDelta` is asserted as a pair** — a centred brick scores exactly 0 at
  every height and pressure level **while the raw stability score is asserted to
  sag over the same stack**. Either half alone passes a broken implementation.
- **The slenderness regression** — a symmetric 2-wide spire must reach
  `integrity 0`/`collapsed` with `tiltScore` still exactly 0, which a single tilt
  scalar cannot detect. A wide-base/narrow-spire tower must read slender too.
- **An empty tower's first brick earns no phantom Reinforce.**
- **Unknown-key rejection is asserted positively** — derived physics keys and a
  `visualHooks` **duration** key must both be refused by debug-config clamping.

**Geometry and stability tests must pin their own config.** `useFixedGrid()` sets
the grid and site keys; `fixedStabilityConfig(overrides)` returns a resolved
stability set to hand `evaluate()` directly. Both exist because those values are
designer-tunable **and because the stability constants are derived** — a test that
passes raw `GameConfig` asserts on defaults rather than on live behaviour. Pin both
in any new test asserting concrete columns or stability numbers.

**Landmine — even a plain scoring test can trip a live-tuned stability warning.** A
single off-centre block against the current tilt tuning emits an unexpected
`tower_warning` event, so a test asserting an exact `scoreEvents` type list should
zero `towerStabilityDifficulty` around the placement in a `try`/`finally`, unless
it is deliberately exercising stability.

Coverage concentrates on the engine's scoring and summary paths. **Bot Manager,
Balance Simulator and Server Entry have no dedicated tests here.**

### `tests/Matchmaking_Queue.test.js`

The multi-pod matchmaking race. Two `LobbyManager` instances sharing one fake
Redis-backed store with artificial `setImmediate` gaps between read and write
steps, so concurrent joins actually interleave the way real network I/O would.
Three players join near-simultaneously, two via one "pod" and one via the other;
all three must land in the same room and each socket must receive its
`room_created`/`room_resumed`.

The fake store's `withMatchmakingLock` chains onto one shared promise across both
pods, faithfully serialising the decision the way Redis's `SET NX` lock does.
**Only `enqueuePlayer` is deliberately left unlocked, matching production, since
that is the actual race window.**

Confirmed as a meaningful regression test by running it against the pre-fix queue
logic: it failed reliably there and passes against the fix. **A regression test
that was never seen to fail is not yet known to be one.**

## Balance CLIs

`src/Server/tools/Balance_Simulator.js` — offline balance sampling, CI
syntax-checked only. Run `npm run balance:simulate -- <levels> <runs>`.

- Instantiates [Game Engine](./backend.md#game-engine) directly — no lobby, no
  Redis, no socket.
- **Delegates every decision to the shipped Bot Manager** rather than keeping a
  parallel copy of the heuristics, so what it measures is what a real room plays.
  It honours the `wait` action by burning that player's turn.
- **Models the per-player placement cooldown on a clock.** Each player has a
  `simReadyAt`; the simulator picks the earliest-ready player with blocks and
  advances a millisecond clock, failing the run as `timedOut` once it passes the
  level's **derived** limit — reading the flat config value instead would report
  every level past the earliest as a false timeout.
- Runs **both strategies** per level so the comparison is directly readable.
- **Stability sweep:** `npm run balance:stability` re-runs every level at
  difficulty 0/50/75/95/100 and prints `avgStability`, `minStability`,
  `avgIntegrity`, `avgLean`, `avgSiteUsage`, `avgSupportDeficit`, and
  `integrityBinding` — the share of placements where integrity, not lean, is the
  lower axis, which is what names the anchor to move. Sampled at **every
  placement**, not just level end.

`gatePassed` is the number that matters most under a per-level Impact rule — a
level can complete and still roll the team back. It routes through the engine's
real `hasMetImpactScoreRequirement` rather than a simplified formula, so it reads
the gate the server enforces. The intended shape is cooperative winning on
completion and gate while greedy wins on MVP score; if greedy wins both, stability
is tuned too forgiving for collapse to punish it.

**Landmine — the cooldown model is not just pacing.** Drop it and one player
places unboundedly in a row, which makes contribution read lopsided and the Impact
gate read impossible — an artifact that swings the measured pass rate by an order
of magnitude. **Never trust a tuning number from a simulator that omits a real
constraint.**

**Landmine — do not calibrate against `collapse`.** `chooseBotPlacement` skips any
placement that collapses, so bots almost never die and the rate reads ~0% across
wildly different configs. Tune against `avgStability` and the spread of
per-placement outcomes.

**Two things the bots structurally cannot measure**, so neither is evidence of a
balance problem:

- **`timeout` and completion.** The derived clock is sized for a human's 0.55
  packing efficiency while bots spire-build at ~0.9, so they finish in a fraction
  of the budget and read a flat 100% completion at every level.
- **`gapPlacements`.** Bots pick a max-stability placement every turn, so they
  build clean towers with nothing to repair. Gap-filling is a mechanic for players
  who create messes under time pressure; validating it needs playtests.

`src/Server/tools/Stability_Probe.js` (`npm run balance:probe`) covers that second
blind spot: because bots always pick a max-stability placement, they never build
the wide-base/narrow-spire or overhang shapes needed to see whether a genuinely bad
tower degrades. It hand-builds five archetypes at several heights and levels,
evaluates each through `resolveStabilityConfig(level)` directly, and **asserts a
single opening brick never collapses at any sampled level** — the guard for the
site-usage-worst-at-the-first-brick landmine.

Both are tuning aids, not gameplay authorities.

## Godot client tests

`Tests/CiSmokeTest.gd` plus GUT suites under `Tests/Gut/`, run headlessly through
vendored GUT and invoked by the Android deploy workflow before a signed export.

The smoke test loads every script under `Cor`/`Sys` (catching load-time and syntax
errors before the build step), verifies the main scene and `NetworkManager`
autoload wiring, and verifies Game UI Scene instantiates **with every node Main UI
Controller requires present** — that last one is the node-contract guard.

The node-free behavioural suites carry the real coverage — a `RefCounted` service
needs no scene mount:

**`test_snap_grid.gd`** — gravity settle from **both** release rows against
hand-computed stacking and cantilever cases. It mirrors server `settleBlock`, so
**a change to that server function should break this suite**. Also the legality
table (overlap and below-platform rejected; unsupported open air *accepted*,
because gravity resolves it), snap-point set, origin-range clamping,
true-outline-vertex selection, snap-vs-fallback threshold, and the invariant that
**no resolved column lets a footprint leave the site**.

**`test_block_emoji.gd`** — face anchor per shape against the art guide, anchor
stays on brick mass under all 4 rotations, delta reclassifies as the threshold
moves, and `BALANCE_DELTA_KEY` matches the server's field name: **a mismatch
silently removes every face.**

**`test_block_orientation.gd`** — `BlockData` rotate-and-mirror across all 19
reachable orientations, **independently re-derived rather than assumed**:
`detect_orientation` reproduces each, the rendered bounding box matches the real
footprint, and a higher-on-screen vertex shades brighter every combination.

**`test_visual_hooks.gd`** — Impact Beat config, verdict mapping, de-dupe key,
and `TowerStack` behaviour: skipped when empty, disabled or collapsing; derived
zoom respecting its floor; faces flipping only as the wave reaches them;
**`BEAT_HOLD` never auto-advancing** once its nominal duration elapses.

**`test_collapse_sim.gd`** — fixed-seed physics: no piece starts upward or
settles below the platform or outside its span, every piece ends flat, the sim
settles within a bounded step count, one seed reproduces an identical collapse
while another diverges.

**`test_tutorial_*.gd`** — lesson ids unique, every gate in the closed set, the
gate truth table, progress degrading to nothing-completed on a corrupt file, an
incidental action never silently advancing an `info` step, and **every step's
`target` resolving and visible in the mounted scene** — which catches a rename or
a control moved under a hidden container.

`test_inventory_controller.gd` asserts the column handed to `place_block` lands in
range and covers parallel placement end to end: select → aim → confirm sends
exactly one placement carrying the armed row, a tap elsewhere re-aims without
sending, deselect sends nothing, a card tap never starts a drag.
**Its taps reset `last_tap_ms` between steps** — the 60 ms de-dupe window that
protects a real tap from its emulated partner would otherwise swallow back-to-back
synthetic events.

`test_debug_panel.gd` covers a knob's whole path: the row syncs from
`debug_config`, its nodes really do parent under their own category, and the value
reaches its target.

**Landmine — `SnapGrid`'s range is `static var` state**, so `before_each` and
`after_all` must call `reset_placeable_range()`. Omit it and tests leak grid state
into each other.

**Landmine — the face PNGs live in the gitignored private-art folder**, so
`test_block_emoji.gd::test_each_mood_resolves_its_own_texture` fails with
`ERR_CANT_OPEN` on any machine that has not imported the art. CI imports assets
before running GUT, so **a local run with only that one case red is the expected
state, not a regression.**

## CI gates

| Workflow | Runs | Blocking |
|---|---|---|
| Android Deploy wstodplay | `CiSmokeTest.gd` + required GUT suites | Yes — before signed export |
| EKS Deploy (game server) | `npm test` | Yes — before image build/push |

## Known coverage gaps

- `checkFailCondition()`'s all-blocks-used branch and the Power side-quest flow
  have no direct test.
- Multi-worker matchmaking has regression coverage; **reconnect and gateway
  routing across pods more broadly do not.**
- Most client UI is **structural coverage only** — Main UI Controller,
  NetworkManager, Block Preview, Cooldown Overlay and Debug Overlay have no
  behavioural tests. Placement, the face maths, block orientation, the Impact Beat,
  the collapse sim and the Tutorial are the exceptions.
- **`TowerStack`'s drawing and drag-state handling remain untested, and that gap is
  not theoretical.** The bug where `clear_snap_preview()` wiped drag state on the
  first move — leaving no ghost at all — passed every unit test and was only caught
  by rendering the play field to PNG. **Verify placement visuals by running the
  client, not by the suite alone.**
