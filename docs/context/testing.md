# Testing

Scope: everything that verifies or tunes behavior — server contract tests, the balance-tuning CLI, client smoke/unit tests, and which CI workflow gates on what. Server logic under test → [backend.md](./backend.md). UI under test → [ui.md](./ui.md).

## Server Score Events Tests

`src/Server/tests/Score_Events.test.js` — CI/test-only, **not** shipped in the Docker image. Runs via `npm test` (Node's built-in test runner, no separate framework), or directly: `node --test tests/Score_Events.test.js` from `src/Server`. **33 tests, all passing.** Called by the [K3s Deploy workflows](./deployment.md#k3s-workflows) before a server image build/deploy.

**Covers:** `balanceDelta` — that a centred brick scores exactly 0 at every height *while* the raw stability score is asserted to sag over the same stack (the pair is the regression guard; see [decisions.md](./decisions.md#brick-faces-read-a-lean-only-balance-delta-not-the-stability-score)), that the sign follows the correction in both lean directions, and its ±100 clamp; placement score events; exact-finish (precision + team bonus) and overbuild (no finish bonus) behavior; **column→`originX` clamping** and **placeable-range narrowing by width**; **per-level site width** (scales with target height, stays centred on the grid at every width, clamps at `towerSiteWidthMax`) and that a brick's origin range follows the level's site rather than a fixed span; **the slenderness regression** — a symmetric 2-wide spire must reach `integrity 0`/`collapsed` with `tiltScore` still exactly 0, which a single tilt scalar cannot detect; **the stability dial** — the same tower scores lower at level 40 than at level 1, difficulty `0` leaves it uncollapsed, difficulty is clamped 0–100, and the derived physics keys are rejected as unknown; **stability multiplier** on placement score; **Reinforce** payout for integrity/lean gains, that a worsening placement pays 0, and that an empty tower's first brick earns no phantom Reinforce; confirms `createBlock` no longer assigns an `anchorX` field; level-summary banking for failed levels; debug-config clamping; quick-chat event/cooldown contracts; refresh generation; activating a held `refresh` item, and holding one defers the not-enough-height fail check; Impact Power-inventory snapshot/rollback behavior.

**Geometry and stability tests pin their own config.** `useFixedGrid()` sets `towerGridWidth`/`towerSiteWidthMin`/`Max`/`towerSiteSlendernessTarget`; `fixedStabilityConfig(overrides)` returns a resolved stability set to hand `evaluate()` directly. Both exist because those values are designer-tunable — and because the stability constants are now *derived* from `towerStabilityDifficulty` and the level, so a test that passes raw `GameConfig` asserts on defaults rather than on live behavior. Pin both in any new test asserting concrete columns or stability numbers. **Even plain scoring tests can trip a live-tuned stability warning** — a single off-center block against the current tilt tuning is enough to emit an unexpected `tower_warning` event — so a test asserting an exact `scoreEvents` type list should also zero `towerStabilityDifficulty` around the placement (save/restore in a `try`/`finally`) unless it's deliberately exercising stability.

**Depends on:** Game Engine, Game Config, Lobby Manager, Tower Stability (directly required; exercised by a block-settling test). External: `node:test`, `node:assert/strict`.

**Notes:** protects the UI-facing payload contracts [Main UI Controller](./ui.md#main-ui-controller) renders directly — a passing suite is a reasonable signal client-visible scoring/summary behavior hasn't shifted. Coverage concentrates on Game Engine's scoring/summary paths; Bot Manager, Balance Simulator, and Server Entry have **no dedicated tests here** — Redis State's matchmaking-queue path now has coverage via [Server Matchmaking Queue Tests](#server-matchmaking-queue-tests) below.

## Server Matchmaking Queue Tests

`src/Server/tests/Matchmaking_Queue.test.js` — CI/test-only, **not** shipped in the Docker image. Runs via `npm test`, or directly: `node --test tests/Matchmaking_Queue.test.js` from `src/Server`. **1 test, passing.**

**Covers:** the multi-pod matchmaking race fixed in [decisions.md](./decisions.md#matchmaking-queue-lost-update-and-cross-pod-room-gaps) — two `LobbyManager` instances (simulating two server pods) share one fake Redis-backed state store with artificial async gaps (`setImmediate` ticks) between read/write steps, so concurrent joins actually get a chance to interleave the way real network I/O would. Three players join near-simultaneously, two via one "pod" and one via the other; the test asserts all three end up assigned to the same room and each player's own socket receives a `room_created`/`room_resumed` message.

**Depends on:** Lobby Manager, Redis State (only for `stripRuntimeRoom`, reused so the fake store's `saveRoom`/`getRoom` produce the same snapshot shape `hydrateRoom()` expects). External: `node:test`, `node:assert/strict`.

**Notes:** the fake state store's `withMatchmakingLock` chains onto one shared promise across both simulated pods, faithfully serializing the matchmaking decision the way Redis's `SET NX` lock does — only `enqueuePlayer` is deliberately left unlocked, matching production, since that's the actual race window. Confirmed as a meaningful regression test by running it against the pre-fix queue logic (restored a `replaceQueue`-shaped fake store method matching the removed `Redis_State.js` method): it failed reliably there and passes against the fix.

## Balance Simulator

`src/Server/tools/Balance_Simulator.js` — offline balance-sampling tool. Tooling only: not required by the running server/client, not copied into the Docker image, not `require()`d by anything else (CI only syntax-checks it via `node --check` in `npm test`; it never actually runs in CI).

- Instantiates [Game Engine](./backend.md#game-engine) directly at a chosen level — no Lobby Manager, no Redis, no WebSocket, no room-of-real-players setup.
- **Delegates every decision to the shipped [Bot Manager](./backend.md#bot-manager)** (`chooseBotAction`/`chooseBotColumn`, each given an explicit strategy) rather than keeping a parallel copy of the heuristics, so what it measures is what a real room plays. It honours the `wait` action by burning that player's turn without placing.
- **Models the per-player placement cooldown on a clock.** Each player has a `simReadyAt`; the simulator repeatedly picks the earliest-ready player with blocks and advances a millisecond clock, failing the run as `timedOut` once the clock passes `levelTimeLimitMs`. This is not just pacing: without it one player could place unboundedly in a row, which made contribution look wildly lopsided and the Impact gate look impossible (a ~0–8% pass rate that was pure artifact).
- Runs **both bot strategies** per level and prints a `strategy` column, so the selfish-vs-cooperative comparison is directly readable.
- CSV metrics: site width, achieved packing efficiency, completion rate, exact-finish rate, **collapse rate**, **timeout rate**, **Impact-gate pass rate**, overbuild, placement count, score spread.
- Run: `npm run balance:simulate -- <levels> <runs>` from `src/Server`.
- **Stability sweep:** `npm run balance:stability -- <levels> <runs>` re-runs every level at `towerStabilityDifficulty` 0/25/50/75/100 and prints the calibration view — `avgStability`, `minStability`, `avgIntegrity`, `avgLean`, `avgSiteUsage`, `avgSupportDeficit`, and `integrityBinding` (share of placements where integrity, not lean, is the lower axis, so it names which anchor to move). Sampled at **every placement**, not just level end.

**Reading it:** `gatePassed` is the number that matters most under a per-band Impact rule — a level can complete and still roll the team back. The intended shape is cooperative winning on completion/gate while mvp-greedy wins on MVP score; if greedy wins both, stability is tuned too forgiving for collapse to punish it (see [gameplay.md § Bot behavior](./gameplay.md#bot-behavior)).

**Landmine — do not calibrate against `collapse`.** `chooseBotColumn` evaluates every legal column and skips any that collapses, so bots almost never die and the rate reads ~0% across wildly different configs. Tune against `avgStability` and the spread of per-column outcomes instead; those track what a human under a timer actually experiences.

**Depends on:** Game Engine, Game Config, Bot Manager, Tower Stability (used directly for settle/evaluate on the simulated result, not just transitively through the engine).

**Notes:** a tuning aid, not a gameplay authority — the real server's Game Engine is still the source of truth. Temporarily silences `console.log` (not `console.error`) during a run, then restores it, so large `<runs>` counts don't flood the terminal. Design interpretation of the output → [gameplay.md](./gameplay.md).

## Godot Client Tests

Files: `src/Client/App/corp-tower/Tests/CiSmokeTest.gd`, `Tests/Gut/test_player_colors.gd`, `Tests/Gut/GameUi/*`. Run headlessly through vendored GUT (`addons/gut`), invoked by [Android Deploy wsplaytod Workflow](./build.md#android-deploy-wsplaytod-workflow) before a signed export.

**Covers:** loads application scripts under `Cor`/`Sys` (catches load-time/syntax errors before CI's build step); verifies the main scene + `NetworkManager` autoload wiring; verifies [Game UI Scene](./ui.md#game-ui-scene) loads/instantiates with every node Main UI Controller requires present; verifies [Player Colors](./ui.md#leaf-components) behavior through GUT.

**`Tests/Gut/GameUi/test_snap_grid.gd`** is the one piece of genuinely behavioral placement coverage: `SnapGrid` is node-free, so it is exercised directly with no scene mount. **19 tests.** It pins the gravity settle against hand-computed stacking/cantilever cases (the mirror of server `Tower_Stability.settleBlock` — if that server function changes, this suite is what should fail), the snap-point set (platform points, placed-brick corners deduped, unplaceable columns excluded), `origin_range` clamping, true-outline-vertex selection for `T`, the snap-vs-fallback threshold, and the invariant that **no resolved column ever lets a footprint leave the placeable site**. It also covers the **dynamic site**: a widened range grows the snap-point set and origin range, still confines every footprint, and `set_placeable_range` rejects inverted or off-grid spans. Because the range is `static var` state, `before_each`/`after_all` call `reset_placeable_range()` — omit that and tests leak grid state into each other. `test_inventory_controller.gd` additionally asserts the column actually handed to `place_block` lands in range.

**`Tests/Gut/GameUi/test_block_emoji.gd`** is the other node-free behavioral suite: it pins every shape's [brick-face anchor](./ui.md#leaf-components) against the art guide and asserts the anchor stays on brick mass under all 4 rotations, that `BALANCE_DELTA_KEY` matches the server's field name (a mismatch silently removes every face), and that one delta reclassifies as the threshold moves. `test_debug_panel.gd` covers the knob's whole path — the row syncs from `debug_config`, its nodes really do parent under the `Tower` category, and the value reaches `TowerStack.mood_threshold`.

**`Tests/Gut/GameUi/test_tutorial_*.gd`** covers the [Tutorial](./ui.md#tutorial) layer. `test_tutorial_lessons.gd` is the load-bearing regression guard — lesson ids unique, every step's gate is in `TutorialGates.ALL`, and every step's `target` resolves and is visible in the mounted scene (catches a rename or a control moved under `LegacyHidden`, same as the node-contract check above). `test_tutorial_gates.gd` is `is_satisfied`'s truth table, node-free. `test_tutorial_progress.gd` covers mark/read/reset and that a missing or corrupt save file degrades to nothing completed. `test_tutorial_controller.gd` covers advance/back/skip-step/skip-lesson, that an incidental action never silently advances an `info` step, that tutorial-mode placement never reaches `NetworkManager`, the stability lesson's tilt direction following the actual drop column, and the Refresh/quick-chat simulation.

**Depends on:** Godot Client App, NetworkManager, Main UI Controller, Game UI Scene, Player Colors. External: GUT, vendored under `addons/gut`.

**Notes:** coverage is **structural, not behavioral**, for almost everything except Player Colors — `CiSmokeTest.gd` confirms scripts/scenes load without error but doesn't exercise gameplay logic. Main UI Controller, NetworkManager, Block Preview, Tower Stack, Cooldown Overlay, and Debug Overlay have **no behavioral test coverage today** — worth keeping in mind before larger refactors there. (Main UI Controller does have *characterization* coverage under `Tests/Gut/GameUi/` from its decomposition — see [ui.md](./ui.md#main-ui-controller) — which is narrower than full behavioral coverage.)

## CI test gates

| Workflow | Runs | Blocking? |
|---|---|---|
| Android Deploy wsplaytod | `CiSmokeTest.gd`, required GUT tests | Yes — before signed export |
| Client HTML5 Pages | (build/export only — no test gate beyond the build itself) | — |
| K3s Deploy (game server) | `npm test` (syntax checks + `Score_Events.test.js` + `Matchmaking_Queue.test.js`) | Yes — before image build/push |

## Known coverage gaps

- `checkFailCondition()`'s `all_blocks_used` branch and `setupSideQuest()`/quest completion have no direct test — worth adding before a larger refactor of the Power side-quest flow.
- Multi-worker matchmaking (queue draining + cross-pod room handoff) has regression coverage — see [Server Matchmaking Queue Tests](#server-matchmaking-queue-tests). Reconnect and gateway routing across pods more broadly still have no integration tests — planned future work (see [decisions.md](./decisions.md#no-persistent-leaderboard-yet)).
- Most client UI components (Main UI Controller, NetworkManager, Block Preview, Tower Stack, Cooldown Overlay, Debug Overlay) have structural coverage only, not behavioral. Placement and the brick-face math are the exceptions — both live in node-free helpers (`SnapGrid`, `BlockData`) and are covered by `test_snap_grid.gd` / `test_block_emoji.gd`.
- **`TowerStack`'s drawing and drag-state handling remain untested**, and that gap is not theoretical: the bug where `clear_snap_preview()` wiped the drag state on the first move (leaving no ghost at all) passed every unit test and was only caught by rendering the play field to PNG. Verify placement visuals by running the client, not by the suite alone.
