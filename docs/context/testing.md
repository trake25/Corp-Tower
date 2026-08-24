# Testing

Scope: server contract tests, balance CLIs, client smoke and unit tests, CI gates.
Logic under test → [backend.md](./backend.md) · [ui.md](./ui.md) ·
[ui-hud.md](./ui-hud.md) · [ui-tutorial.md](./ui-tutorial.md).

## Local selection matrix

Scope selection to files changed for the current task; unrelated dirty files do
not widen the gate. A changed test runs itself. Unknown/shared runtime paths fall
back to the full affected-domain suite. CI keeps its full domain gates.

| Task-owned source | Local tests |
|---|---|
| Server `Auth_Verifier.js` | `Auth_Verifier.test.js` |
| Server `Profile_Store.js` | `Profile_Store.test.js` |
| Server `Redis_State.js` | `Matchmaking_Queue.test.js` |
| Server `Tower_Stability.js` | `Stability_Scoring.test.js` |
| Server `Block_Supply.js` or `Impacts.js` | `Gameplay_Events.test.js` |
| Server `Scoring.js` | placement, stability/scoring and gameplay event suites |
| Server `Game_Engine.js`, `Game_Config.js`, `Lobby_Manager.js`, `Server.js`, Bot Manager or the shared test fixture | full `npm test` |
| Server settle/range mirror | server placement plus client `test_snap_grid.gd` |
| Client `SnapGrid`, Inventory, BlockData/orientation, emoji, CollapseSim, VisualHooks/TowerStack, Tutorial, DebugPanel, summary, roster or player context | the correspondingly named GUT file/group |
| Client Auth Manager or shared auth config | all `test_auth_*.gd`; a provider addon alone runs its provider file |
| Client `Main.gd`, `GameUI.tscn`, project/autoload config, `UiNodeBinder` or `GameUiHarness` | smoke plus full GUT |
| Any other client runtime file | smoke plus nearest mapped GUT; full GUT if no mapping is defensible |
| Infra, docs, site or non-runtime assets only | no game suite unless the change creates a client runtime risk Godot can exercise |

Every client runtime gate includes `CiSmokeTest.gd`. New/changed assets get a
headless `--import` first. Complex UI, screens, scene/autoload and asset
integration require smoke plus related GUT, then a live rendered comparison;
headless mode cannot prove visual fidelity.

`node scripts/qa-gate.mjs --changed <task-owned-path>...` applies this matrix
without reading the working-tree diff, prints only a compact successful summary,
and prints captured test output only on failure. Pass every task-owned changed
path explicitly; the command widens unknown or shared runtime changes to the
full affected-domain suite.

## Server tests

Nothing under `tests/` or `tools/` ships in the image. `npm test` runs syntax
checks and every Node test; targeted local runs use the files above.

The engine contracts are split by failure signal: `Block_Geometry.test.js`,
`Placement_Geometry.test.js`, `Stability_Scoring.test.js`, `Gameplay_Events.test.js` and
`Debug_State_Contracts.test.js`. `helpers/Game_Engine_Fixture.js` owns pinned
configuration, engine construction and cleanup. Geometry/stability cases must
use `useFixedGrid()`/`fixedStabilityConfig()` instead of live tunables.

Keep these paired signals: centred `balanceDelta === 0` while raw stability sags;
a symmetric slender spire collapses with zero tilt; the first brick earns no
phantom Reinforce; unknown derived/debug keys are positively rejected. An
off-centre scoring case that asserts exact event types must zero live stability
difficulty in `try`/`finally` or an unrelated warning joins the event list.

`Matchmaking_Queue.test.js` covers the Redis-locked multi-pod seating race.
`Profile_Store.test.js` covers offline PostgREST fallback, racing insert and
header-only credentials. `Auth_Verifier.test.js` verifies JWT/Meta identity and
rejections offline. Bot Manager, balance tools and Server Entry still have no
dedicated behavioural tests.

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
  difficulty 0/5/25/50/75/100 and prints `avgStability`, `minStability`,
  `avgBalance`, `avgIntegrity`, critical carried-load share, path concentration,
  weakest-interface height, and evaluator time. Sampled at **every placement**,
  not just level end.

`gatePassed` is the number that matters most under a per-level Impact rule — a
level can complete and still roll the team back. It routes through the engine's
real `hasMetImpactScoreRequirement` rather than a simplified formula, so it reads
the gate the server enforces. The intended shape is cooperative winning on
completion and gate while greedy wins on MVP score; if greedy wins both, stability
is tuned too forgiving for collapse to punish it.

**Landmine — the cooldown model is not just pacing.** Drop it and one player
places unboundedly in a row, which makes contribution read lopsided and the Impact
gate read impossible — an artifact that swings the measured pass
rate by an order of magnitude.

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
blind spot with narrow bottlenecks, wide crowns, redundant supports, disconnected
stacks, and gap-repair geometry across heights and levels through
`resolveStabilityConfig(level)` at every sweep difficulty. It asserts a single
opening brick never collapses at any sampled level or difficulty.

Both are tuning aids, not gameplay authorities.

## Godot client tests

The smoke test loads every `Cor`/`Sys` script, main scene, autoload and required
GameUI node. GUT covers placement mirrors, inventory, block visuals, fixed-seed
collapse, hooks, auth, tutorial gates/targets, summaries, roster/context, layout
baselines and debug wiring. Auth remains offline; native/browser/device flows are
manual release coverage.

`test_snap_grid.gd` must move with server settle/range semantics. Its legality
contract accepts unsupported release rows because gravity resolves them, while
rejecting overlap/below-platform and any origin that lets a footprint escape.
`test_block_emoji.gd` pins the server `balanceDelta` key. Tutorial target tests
mount the scene so renamed or hidden controls fail.

Synthetic inventory taps reset `last_tap_ms` or the 60 ms de-dupe window swallows
them.

Gameplay HUD coverage pins the two-state quest art, legacy-ID avatar mapping,
visible Impact fills and progress-only avatar markers, shared glass popovers,
the compact Impact cadence and 20%-reduced marker, overlay ordering, power-toast
text and size, Android responsive anchors with fixed artwork proportions, startup
splash continuity, Android covered-background ground alignment, Hook Zoom platform
aspect/ground/tower contact, and the summary countdown/quest rows.

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
- Most client UI is **structural coverage only**: Main UI Controller,
  NetworkManager, Block Preview, Cooldown and Debug Overlay have no behavioural
  tests. The exceptions are placement, face maths, block orientation, the Impact
  Beat, the collapse sim, the Tutorial and the auth session.
- **`TowerStack`'s drawing and drag-state handling remain untested**, and the suite
  has already passed a drag bug that only a rendered frame caught. **Verify
  placement visuals by running the client, not by the suite alone.**
