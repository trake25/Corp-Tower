# Testing

Scope: everything that verifies or tunes behavior — server contract tests, the balance-tuning CLI, client smoke/unit tests, and which CI workflow gates on what. Server logic under test → [backend.md](./backend.md). UI under test → [ui.md](./ui.md).

## Server Score Events Tests

`src/Server/tests/Score_Events.test.js` — CI/test-only, **not** shipped in the Docker image. Runs via `npm test` (Node's built-in test runner, no separate framework), or directly: `node --test tests/Score_Events.test.js` from `src/Server`. **14 tests, all passing.** Called by [Server K3s Deploy](./deployment.md#k3s-workflows) before a server image build/deploy.

**Covers:** placement score events; exact-finish and overbuild event behavior; level-summary banking for failed levels (score not counted toward final total); debug-config clamping (popup/summary durations, tower-stability thresholds); quick-chat event/cooldown contracts; block refresh generation (size 1–2 → unlocked size 3+, size 3+ reroll without changing size); activating a held `refresh` item rerolls the target's blocks, and holding one defers the not-enough-height fail check; Impact Power-inventory snapshot/rollback behavior.

**Depends on:** Game Engine, Game Config, Lobby Manager, Tower Stability (directly required; exercised by a block-settling test). External: `node:test`, `node:assert/strict`.

**Notes:** protects the UI-facing payload contracts [Main UI Controller](./ui.md#main-ui-controller) renders directly — a passing suite is a reasonable signal client-visible scoring/summary behavior hasn't shifted. Coverage concentrates on Game Engine's scoring/summary paths; Bot Manager, Balance Simulator, and Server Entry have **no dedicated tests here** — Redis State's matchmaking-queue path now has coverage via [Server Matchmaking Queue Tests](#server-matchmaking-queue-tests) below.

## Server Matchmaking Queue Tests

`src/Server/tests/Matchmaking_Queue.test.js` — CI/test-only, **not** shipped in the Docker image. Runs via `npm test`, or directly: `node --test tests/Matchmaking_Queue.test.js` from `src/Server`. **1 test, passing.**

**Covers:** the multi-pod matchmaking race fixed in [decisions.md](./decisions.md#matchmaking-queue-lost-update-and-cross-pod-room-delivery-gap) — two `LobbyManager` instances (simulating two server pods) share one fake Redis-backed state store with artificial async gaps (`setImmediate` ticks) between read/write steps, so concurrent joins actually get a chance to interleave the way real network I/O would. Three players join near-simultaneously, two via one "pod" and one via the other; the test asserts all three end up assigned to the same room and each player's own socket receives a `room_created`/`room_resumed` message.

**Depends on:** Lobby Manager, Redis State (only for `stripRuntimeRoom`, reused so the fake store's `saveRoom`/`getRoom` produce the same snapshot shape `hydrateRoom()` expects). External: `node:test`, `node:assert/strict`.

**Notes:** the fake state store's `withMatchmakingLock` chains onto one shared promise across both simulated pods, faithfully serializing the matchmaking decision the way Redis's `SET NX` lock does — only `enqueuePlayer` is deliberately left unlocked, matching production, since that's the actual race window. Confirmed as a meaningful regression test by running it against the pre-fix queue logic (restored a `replaceQueue`-shaped fake store method matching the removed `Redis_State.js` method): it failed reliably there and passes against the fix.

## Balance Simulator

`src/Server/tools/Balance_Simulator.js` — offline balance-sampling tool. Tooling only: not required by the running server/client, not copied into the Docker image, not `require()`d by anything else (CI only syntax-checks it via `node --check` in `npm test`; it never actually runs in CI).

- Instantiates [Game Engine](./backend.md#game-engine) directly at a chosen level — no Lobby Manager, no Redis, no WebSocket, no room-of-real-players setup.
- Deals opening hands/draw piles through that engine, runs simple smart-play placement logic to simulate a level, prints CSV metrics: completion rate, exact-finish rate, overbuild, placement count, score spread.
- Run: `npm run balance:simulate -- <levels> <runs>` from `src/Server`.

**Depends on:** Game Engine, Game Config, Tower Stability (used directly for a standalone stability check on the simulated result, not just transitively through the engine).

**Notes:** a tuning aid, not a gameplay authority — the real server's Game Engine is still the source of truth. Temporarily silences `console.log` (not `console.error`) during a run, then restores it, so large `<runs>` counts don't flood the terminal. Design interpretation of the output → [gameplay.md](./gameplay.md).

## Godot Client Tests

Files: `src/Client/App/corp-tower/Tests/CiSmokeTest.gd`, `Tests/Gut/test_player_colors.gd`. Run headlessly through vendored GUT (`addons/gut`), invoked by [Client Android Internal Workflow](./build.md#client-android-internal-workflow) before a signed export.

**Covers:** loads application scripts under `Cor`/`Sys` (catches load-time/syntax errors before CI's build step); verifies the main scene + `NetworkManager` autoload wiring; verifies [Game UI Scene](./ui.md#game-ui-scene) loads/instantiates with every node Main UI Controller requires present; verifies [Player Colors](./ui.md#leaf-components) behavior through GUT.

**Depends on:** Godot Client App, NetworkManager, Main UI Controller, Game UI Scene, Player Colors. External: GUT, vendored under `addons/gut`.

**Notes:** coverage is **structural, not behavioral**, for almost everything except Player Colors — `CiSmokeTest.gd` confirms scripts/scenes load without error but doesn't exercise gameplay logic. Main UI Controller, NetworkManager, Block Preview, Tower Stack, Cooldown Overlay, and Debug Overlay have **no behavioral test coverage today** — worth keeping in mind before larger refactors there. (Main UI Controller does have *characterization* coverage under `Tests/Gut/GameUi/` from its decomposition — see [ui.md](./ui.md#main-ui-controller) — which is narrower than full behavioral coverage.)

## CI test gates

| Workflow | Runs | Blocking? |
|---|---|---|
| Client Android Internal | `CiSmokeTest.gd`, required GUT tests | Yes — before signed export |
| Client HTML5 Pages | (build/export only — no test gate beyond the build itself) | — |
| Server K3s Deploy | `npm test` (syntax checks + `Score_Events.test.js` + `Matchmaking_Queue.test.js`) | Yes — before image build/push |

## Known coverage gaps

- `checkFailCondition()`'s `all_blocks_used` branch and `setupSideQuest()`/quest completion have no direct test — worth adding before a larger refactor of the Power side-quest flow.
- Multi-worker matchmaking (queue draining + cross-pod room handoff) now has regression coverage — see [Server Matchmaking Queue Tests](#server-matchmaking-queue-tests). Reconnect and gateway routing across pods more broadly still have no integration tests — planned future work (see [decisions.md](./decisions.md#no-persistent-leaderboard-yet)).
- Most client UI components (Main UI Controller, NetworkManager, Block Preview, Tower Stack, Cooldown Overlay, Debug Overlay) have structural coverage only, not behavioral.
