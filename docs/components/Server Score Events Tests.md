# Server Score Events Tests

## Purpose
- Server test coverage for score event and level summary contracts.
- File: `src/Server/Score_Events.test.js`.

## Runtime Classification
- CI/test-only file.
- Not required by the running game server or client.
- Runs through `npm test`, which is called by [[Server Staging Deploy Workflow]] before Docker build/deploy.

## Responsibilities
- Verify placement score events.
- Verify exact-finish and overbuild event behavior.
- Verify level summary banking behavior for failed levels.
- Verify debug-config clamping for popup and summary durations.

## Inputs/Outputs
- Input: `npm test` from `src/Server`.
- Output: Node test pass/fail result.

## Dependencies
- [[Game Engine]]
- [[Game Config]]
- [[Lobby Manager]]

## Notes
- These tests protect UI-facing server payload contracts used by [[Main UI Controller]].
