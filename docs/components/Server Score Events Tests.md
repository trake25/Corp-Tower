# Server Score Events Tests

## Purpose
Server test coverage for score-event and level-summary contracts. File:
`src/Server/Score_Events.test.js`. CI/test-only — not required by the running
game server or client; runs via `npm test`, which [[Server K3s Workflows]]
calls before a server image build/deploy.

## Responsibilities
- Verify placement score events.
- Verify exact-finish and overbuild event behavior.
- Verify level-summary banking behavior for failed levels.
- Verify debug-config clamping for popup and summary durations.
- Verify quick-chat event and cooldown contracts.

## Public interface
Run via `npm test` (or `node --test Score_Events.test.js`) from
`src/Server`. Node's built-in test runner; no separate test framework.
Currently 11 tests, all passing.

## Depends on
- Internal: [[Game Engine]], [[Game Config]], [[Lobby Manager]]
- External: `node:test`, `node:assert/strict` (both Node built-ins)

## Notes
- These tests protect the UI-facing server payload contracts that
  [[Main UI Controller]] renders directly, so a passing suite is a
  reasonable signal that client-visible scoring/summary behavior hasn't
  shifted.
- Coverage is concentrated on [[Game Engine]]'s scoring/summary paths;
  [[Bot Manager]], [[Redis State]], [[Balance Simulator]], and
  [[Server Entry]] have no dedicated tests here.
