# Corp Tower TDD
> ⚠️ Snapshot as of 2026-05-27. Verify against current files before trusting deployment steps and runtime versions.

## System Overview
- 3-player real-time selfish-cooperation puzzle game.
- Godot `4.6.2.stable` Android client over WebSocket to Node.js server on AWS EC2.
- Server is authoritative for: matchmaking, room state, timers, block assignment, scoring, refresh tokens, debug tuning, bots.
- HTML client is a legacy local test artifact only; not the production path.

## Repository Layout
- `src/Server/Server.js`: WebSocket entry point, player connection lifecycle, message routing. → [[Server Entry]]
- `src/Server/Lobby_Manager.js`: matchmaking, room creation, debug config validation, bot queue filling. → [[Lobby Manager]]
- `src/Server/Game_Engine.js`: authoritative game loop, level lifecycle, timers, scoring, tokens, carry-over, win/fail, checkpoints. → [[Game Engine]]
- `src/Server/Game_Config.js`: runtime balance and debug-tuning variables. → [[Game Config]]
- `src/Server/Bot_Manager.js`: QA bot action loops and placement behavior. → [[Bot Manager]]
- `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`: Godot WebSocket autoload and protocol adapter. → [[NetworkManager]]
- `src/Client/App/corp-tower/Cor/Scripts/Main.gd`: Godot UI controller — connection, inventory, scoring, tokens, debug menu. → [[Main UI Controller]]
- `.github/workflows/Server-Update.yml`: legacy server CI/CD. → [[Legacy Server Update Workflow]]
- `.github/workflows/Client-Android-Internal.yml`: manual Android internal-testing build/upload. → [[Client Android Internal Workflow]]
- `.github/godot/export_presets.android.ci.cfg`: non-secret Android export preset for CI.

## Server Runtime Architecture
- WebSocket port: `3000`.
- Player IDs: `P1`, `P2`, `P3` from available pool per connection.
- [[Lobby Manager]] queues real players; fills empty room slots with `BOT` players when debug bots are enabled.
- Rooms are in-memory objects: player list + one [[Game Engine]] instance.
- No persistence for MVP: scores, rooms, and progress are in-memory only.

## Matchmaking and Rooms
- Room requires exactly 3 participants.
- Debug bots fill empty slots only when ≥ 1 real player is waiting.
- `debugBotCount` clamped to `0–2`.
- When `debugBotsEnabled` is false: waiting bots removed, active bot loops stop.

## Game Loop
1. Room created → level 1 initialized.
2. Level enters `starting` → blocks assigned → waits `startDelayMs` → enters `playing`.
3. During `playing`: server accepts placements, tracks timer, broadcasts `game_state` ~every second.
4. Level ends on target reached or failure condition.

### On Success
- Award bonuses → store carry-over blocks → reward refresh tokens → broadcast result → wait `nextLevelDelayMs` → start next level.

### On Failure
- Broadcast result → wait `failRestartDelayMs` → roll back to `checkpointLevel` → clear carry-over blocks → restart from checkpoint.

## Gameplay State Model
### Player State
`id`, `ws`, `score`, `levelScore`, `contributedHeight`, `refreshTokens`, `refreshUsesThisLevel`, `blocks`, `carryOverBlocks`, `lastPlacementTime`, `isBot`, `botLoopLevel`

### Room State
`players`, `level`, `checkpointLevel`, `targetHeight`, `currentHeight`, `state`, `startsAt`, `endsAt`, `lastLevelSummary`

## Server-to-Client Messages
| Message | Description |
|---|---|
| `room_created` | Sent to each real player on room creation. Includes: `playerId`, `roomId`, `level`, `targetHeight`, initial `blocks`. |
| `game_state` | Authoritative live state broadcast. Includes: `state`, `level`, `checkpointLevel`, `currentHeight`, `targetHeight`, `secondsRemaining`, `lastLevelSummary`, per-player: `score`, `levelScore`, `contributedHeight`, `refreshTokens`, `refreshUsesRemaining`, `blocks`. |
| `debug_config` | Authoritative debug menu state broadcast. Includes all exposed [[Game Config]] values. |

## Client-to-Server Messages
| Message | Validation |
|---|---|
| `place_block` | Room state, player existence, cooldown, inventory presence, index bounds. |
| `refresh_blocks` | Token count, per-level usage limit, level state, final-10-second lockout. |
| `update_config` | Key allowlist, value ranges, `debugBotDelayMax ≥ debugBotDelayMin`, `debugBotCount` clamp. |

## Debug Config Technical Design
- Server is source of truth; clients request, server validates and applies.
- Every valid update broadcasts full `debug_config` to all real clients.
- Client uses `set_pressed_no_signal` / `set_value_no_signal` on sync to prevent echo loops.
- See [[Corp_Tower_GDD]] § Debug Menu for exposed variables and validation rules.

## Bot Technical Design
- Placement delay: random between `debugBotDelayMin` and `debugBotDelayMax`.
- Loop scoped via `botLoopLevel`; prevents stale delayed actions firing in later levels.
- Bot actions stop when `debugBotsEnabled` is false or room is not in `playing` state.

## CI/CD — Server Deploy
See [[Server Staging Deploy Workflow]] for current Docker/ECR/EC2 staging pipeline.

### Legacy Workflow (`Server-Update.yml`)
- Triggers on push to `main` or `master`.
- GitHub-hosted Ubuntu VM: checkout → install Node `24.14.1` + npm `11.11.0` → install deps → `npm test`.
- Deploy job (`needs: test-server`): SSH to EC2 → fetch branch → reset working tree → install prod deps → rerun server tests → restart server.
- Restart: `pm2 reload corp-tower-server` if PM2 available; otherwise PID-file nohup fallback.
- Sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` for Node 24 ahead of Node 20 deprecation.

### Required GitHub Secrets (Server)
`EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_REPO_PATH` (optional: `EC2_PORT`, default `22`)

## CI/CD — Android Client
See [[Client Android Internal Workflow]].

- Manual trigger via `workflow_dispatch`: inputs `version_code`, `version_name`, `upload_to_play`.
- Steps: download Godot `4.6.2.stable` Linux → install export templates → install Android SDK → restore keystore → import/parse project → run GUT tests (skipped if GUT not installed) → export signed AAB → upload as GitHub artifact → optionally upload to Google Play internal track.
- GUT step: checks for `addons/gut/gut_cmdln.gd`; skips gracefully if absent. Failing GUT tests block export and Play upload once GUT is added.
- Export settings: non-secret from `.github/godot/export_presets.android.ci.cfg`; signing via env vars.
- Android SDK required: Platform 35, Build Tools 35.0.1, OpenJDK 17.
- Keystore env vars: `GODOT_ANDROID_KEYSTORE_RELEASE_PATH`, `GODOT_ANDROID_KEYSTORE_RELEASE_USER`, `GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD`.

### Required GitHub Secrets (Client)
`ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
- Play service account must have access to `com.galaxxigames.corptower` in Play Console.
- App must already exist in Play Console before API uploads work.

## Testing Strategy
### Current Server Tests
- Node syntax checks for: `Server.js`, `Lobby_Manager.js`, `Game_Engine.js`, `Game_Config.js`, `Bot_Manager.js`.
- Next: unit/integration tests for scoring, win/fail paths, refresh token validation, debug config validation, bot queue behavior, WebSocket message contracts.

### Current Client Tests
- Project import/parse + Android export.
- Next: GUT tests for [[NetworkManager]] message handling, `debug_config` UI sync, inventory button state, mocked `game_state` updates.
- Recommended framework: GUT (widely used, script-friendly, straightforward GDScript unit tests).

## Future Technical Work
- `package-lock.json` for reproducible server installs.
- Server integration tests and structured logging.
- Admin authorization for debug config before public release.
- Persistence for leaderboards and player stats.
- Reconnect support and graceful room cleanup on disconnect.
- GUT client tests.
- Production monitoring for server process health.

## TDD Maintenance Policy
- TDD is the source of truth for: server/client architecture, deployment, CI/CD, runtime operations, message contracts, persistence, testing strategy, tooling.
- Update this file whenever: server/client architecture, workflows, secrets, deployment layout, runtime process management, build/export tooling, test strategy, or external service integration changes.
- Player-facing or designer-facing behavior changes go in [[Corp_Tower_GDD]] instead.
