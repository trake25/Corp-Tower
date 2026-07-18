# Server Score Events Tests

## Purpose
Server test coverage for score-event and level-summary contracts. File:
`src/Server/tests/Score_Events.test.js`. CI/test-only — not required by the
running game server or client, and not copied into the Docker image (see
[[Server Docker Image]]); runs via `npm test`, which [[Server K3s Workflows]]
calls before a server image build/deploy.

## Responsibilities
- Verify placement score events.
- Verify exact-finish and overbuild event behavior.
- Verify level-summary banking behavior for failed levels.
- Verify debug-config clamping for popup/summary durations and tower
  stability thresholds.
- Verify quick-chat event and cooldown contracts.
- Verify block refresh generation (size 1–2 upgrades to unlocked size 3+,
  size 3+ rerolls without changing size).
- Verify activating a held `refresh` Power item rerolls the target's blocks,
  and that holding one defers the not-enough-height fail check.
- Verify Impact Power-inventory snapshot/rollback behavior.

## Public interface
Run via `npm test` (or `node --test tests/Score_Events.test.js`) from
`src/Server`. Node's built-in test runner; no separate test framework.
Currently 14 tests, all passing.

## Depends on
- Internal: [[Game Engine]], [[Game Config]], [[Lobby Manager]],
  [[Tower Stability]] (directly required; exercised by a block-settling test)
- External: `node:test`, `node:assert/strict` (both Node built-ins)

## Notes
- These tests protect the UI-facing server payload contracts that
  [[Main UI Controller]] renders directly, so a passing suite is a
  reasonable signal that client-visible scoring/summary behavior hasn't
  shifted.
- Coverage is concentrated on [[Game Engine]]'s scoring/summary paths;
  [[Bot Manager]], [[Redis State]], [[Balance Simulator]], and
  [[Server Entry]] have no dedicated tests here.
- No test exercises `checkFailCondition()`'s `all_blocks_used` branch or
  `setupSideQuest()`/quest completion directly — worth adding before a
  larger refactor of the Power side-quest flow.
