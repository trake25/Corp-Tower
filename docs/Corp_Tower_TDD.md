# Corp Tower TDD
> Current technical snapshot for the EC2 gateway/workers staging learning lab.

## System Overview
- 3-player real-time selfish-cooperation puzzle game.
- Godot `4.6.2.stable` Android client connects by secure WebSocket to `wss://corp-tower.duckdns.org`.
- EC2-1 simulates ALB/Redis for learning: Caddy reverse proxy and Docker Redis.
- EC2-2/EC2-3 run horizontally scaled Docker server workers.
- EC2 gateway/workers are pinned to one subnet so private gateway-to-worker routing is predictable.
- Server remains authoritative for matchmaking, room state, timers, shape block assignment, tower history, scoring, refresh tokens, debug tuning, bots, reconnect, and room cleanup.
- Managed AWS ALB/NLB, ElastiCache, and EKS are intentionally avoided to reduce learning-lab credit usage.
- K3s is tracked as a manual learning path in [[K3s Manual Learning Plan]], not as the active staging deployment path.

## Repository Layout
- `src/Server/Server.js`: WebSocket entry point and message router. -> [[Server Entry]]
- `src/Server/Lobby_Manager.js`: Redis-backed matchmaking, rooms, reconnect, debug config, and room lifecycle. -> [[Lobby Manager]]
- `src/Server/Redis_State.js`: Redis adapter for sessions, queue, room snapshots, locks, and room events. -> [[Redis State]]
- `src/Server/Game_Engine.js`: authoritative level lifecycle, timers, scoring, tokens, carry-over, win/fail, checkpoints. -> [[Game Engine]]
- `src/Server/Game_Config.js`: runtime balance and debug-tuning variables. -> [[Game Config]]
- `src/Server/Bot_Manager.js`: QA bot action loops and placement behavior. -> [[Bot Manager]]
- `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`: Godot WebSocket adapter with reconnect identity persistence. -> [[NetworkManager]]
- `.github/workflows/Staging-Diagnostics.yml`: manual read-only AWS/network/SSH diagnostics. -> [[Staging Diagnostics Workflow]]
- `.github/workflows/Staging-Automated-Master.yml`: automatic/manual queue for normal non-destructive staging server updates. -> [[Staging Automated Master Workflow]]
- `.github/workflows/Staging-Infra-Plan.yml`: manual Terraform plan for EC2 learning lab. -> [[Terraform Infrastructure]]
- `.github/workflows/Staging-Infra-Apply.yml`: manual Terraform apply after a reviewed plan. -> [[Terraform Infrastructure]]
- `.github/workflows/Server-Staging-Deploy.yml`: Docker/ECR deploy to EC2 gateway/workers. -> [[Server Staging Deploy Workflow]]
- `.github/workflows/Staging-Runtime-Cleanup.yml`: manual runtime cleanup for Docker artifacts created by server update. -> [[Staging Runtime Cleanup Workflow]]
- `.github/workflows/Client-Android-Internal.yml`: Android internal-testing build/upload. -> [[Client Android Internal Workflow]]
- `docs/components/K3s Manual Learning Plan.md`: phase-gated manual K3s lab plan with rollback checks. -> [[K3s Manual Learning Plan]]

## Runtime Architecture
- EC2-1 gateway:
  - public entrypoint `wss://corp-tower.duckdns.org`
  - `caddy:2-alpine` reverse proxy to worker private IPs on port `3000`
  - boot-time DuckDNS updater refreshes `corp-tower.duckdns.org` after EC2 stop/start IP changes
  - generated Caddyfile is persisted at `/etc/corp-tower/caddy/Caddyfile` so Docker restart can recover after reboot
  - external Redis simulation with `redis:7-alpine` on port `6379`
- EC2-2/EC2-3 workers:
  - run `corp-tower-server` Docker containers
- Server workers:
  - connect to Redis via `REDIS_URL=redis://<EC2-1-private-ip>:6379`
  - use `RECONNECT_TTL_SECONDS=10` for staging/debug reconnect testing
  - retry Redis startup connection so workers can boot before the gateway during EC2 stop/start recovery
- Redis stores active session, queue, and room state only; long-term leaderboard/player persistence remains deferred.

## Matchmaking, Rooms, And Reconnect
- Room requires exactly 3 participants.
- Debug bots fill empty slots only when at least 1 real player is waiting.
- Clients send `reconnect` after WebSocket open using stored `playerId` and `reconnectToken`.
- Valid reconnect resumes the same player slot and room.
- Godot auto-reconnects after unintended disconnects only when the last known room had real players only and no bots.
- Manual disconnect and app close do not trigger auto-reconnect.
- Missed reconnect TTL closes rooms with reason `reconnect_ttl_expired` when no connected real players remain.
- Any server pod can recover room/player session from Redis.

## Message Contracts
### Server To Client
| Message | Description |
|---|---|
| `room_created` | New room/session assignment with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, initial `blocks`, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, and `nextDrawBlock`. |
| `room_resumed` | Existing room/session resumed with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, blocks, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, and `nextDrawBlock`. |
| `game_state` | Authoritative live state: level, timer, height, `towerBlocks`, `scoreEvents`, `checkpointScoreStatus`, `placementScorePopupDurationMs`, `finishScorePopupDurationMs`, legacy max `scorePopupDurationMs`, `levelSummaryDelayMs`, `activeInventorySlots`, `maxActiveBlocks`, `drawPileCount`, `nextDrawBlock`, `lastLevelSummary`, refresh caps, and per-player score/inventory/token fields including `isBot`. Inventory `blocks` are shape objects `{ id, shapeId, cells, height }`; legacy numeric blocks are tolerated by the client. |
| `debug_config` | Authoritative debug menu state, including bot enable/count/strategy, `debugStartLevel`, timing/target tuning, UI popup/summary durations, supply/refresh pressure, `checkpointMinContributionShare`, and scoring multipliers. |
| `room_closed` | Room teardown reason for connected real players. |

### Client To Server
| Message | Validation |
|---|---|
| `reconnect` | Token/player id may resume room; otherwise server creates a new session and queues player. |
| `place_block` | Valid room, player, state, cooldown, inventory, and block index. |
| `refresh_blocks` | Token count, per-level usage cap, active state, final lockout. |
| `update_config` | Key allowlist, value ranges, bot delay min/max, debug bot count clamp, bot strategy allowlist, and `resetDebugConfig` default restore action. |

### Block And Tower Payloads
- Inventory `blocks[]`: server-assigned fixed-orientation block objects `{ id, shapeId, cells, height }`.
- `activeInventorySlots`: number of currently unlocked active hand slots.
- `maxActiveBlocks`: maximum active hand slots supported by the UI/rules.
- `nextDrawBlock`: the first block in the shared draw pile, or `null` when empty.
- `drawPileCount`: remaining shared pile size including `nextDrawBlock`.
- `cells`: array of `[x, y]` unit coordinates used by the Godot client for shape previews and tower rendering.
- `height`: vertical footprint derived from `cells`; it is not necessarily equal to cell count.
- `towerBlocks[]`: ordered placement history with `{ playerId, block, height, effectiveHeight, baseHeight }` so clients can redraw the current tower after broadcasts or reconnect.
- `checkpointScoreStatus`: right-panel UI helper with next checkpoint level, ready count inputs, and per-player leaderboard score goals.
- Legacy numeric block values are still tolerated by the Godot client as vertical fallback blocks.

### Score UI Payloads
- `scoreEvents[]` is transient and broadcast-only; each event has stable `id`, `type`, `level`, optional `playerId`, optional `points`, `label`, `displayOnly`, and `meta`.
- Event types: `placement`, `finisher_bonus`, `precision_bonus`, `team_exact_bonus`, `assist_bonus` when enabled, `exact_finish`, `overbuild_finish`, and `mvp`.
- Clients track seen event ids per level and never infer event UI from score diffs.
- Placement events use `placementScorePopupDurationMs`; MVP, Perfect Fit, checkpoint, and bonus-style events use `finishScorePopupDurationMs`. Both popup durations represent total popup lifetime, including fade-out.
- Level score summaries are queued until the current score popup batch has faded, then remain visible for `levelSummaryDelayMs`.
- `lastLevelSummary` includes `result`, `reason`, `teamLevelScore`, `mvpId`, `mvpScore`, `exactFinish`, `overbuildHeight`, `finisherId`, `finishingBlock`, `carriedBlockCount`, and `players[]`; checkpoint failures also include `checkpointScoreStatus`.
- `lastLevelSummary.players[]` includes player id, bot flag, level score, previous total score, final total score, contributed height, MVP flag, and bonus breakdown.
- Completed summaries bank level score into final totals; failed summaries keep previous and final totals equal.

### Persisted Room Gameplay State
- Redis room snapshots include `checkpointScores`, `drawPile`, `teamCarryOverBlocks`, `towerBlocks`, timers, level state, and serializable player inventory/score/token fields.
- `checkpointScores` restores leaderboard totals during rollback so reconnect and multi-worker recovery do not reintroduce score farming.
- `drawPile` and `nextDrawBlock` are persisted so reconnecting clients see the same shared refill queue.

## CI/CD
- Normal server-only staging pushes run the fast guarded `Server Update` path.
- Workflow changes run `Diagnostics -> Infra Plan` before server update when server files also changed; infra-only changes run `Infra Plan` without deploying.
- Manual automated master runs default to `Diagnostics -> Infra Plan -> Server Update`, with explicit fast server deploy and infra-plan-only options.
- Server-side pushes to `main`/`master` trigger the automated master workflow; client-only pushes do not.
- Cleanup is manual-only and used when an implementation fails or a revert needs to remove stale Docker runtime artifacts.
- K3s work is manual-only until the install, agent join, test workload, Corp Tower workload, exposure, and rollback phases have been verified.
- Infra Apply and EC2 Rebuild are manual-only because they can intentionally change infrastructure.
- Infra plan/apply workflows are manual-only because creating or changing EC2 instances is an AWS side effect.
- `Staging-Automated-Master.yml`:
  - classifies server, workflow, and Terraform path changes before selecting the queue
  - runs server-only pushes through server update directly
  - triggers on watched staging paths and manual dispatch
  - does not call cleanup, infra apply, or EC2 rebuild
- `Staging-Diagnostics.yml`:
  - verifies tagged EC2 topology, status checks, security group rules, routes, NACLs, and SSH reachability
- `Staging-Infra-Plan.yml`:
  - creates S3 backend bucket if missing
  - imports existing staging resources into Terraform state
  - plans EC2-1 gateway and EC2-2/EC2-3 worker changes without applying them
  - fails when Terraform plans create, delete, or replace actions
- `Staging-Infra-Apply.yml`:
  - applies the reviewed Terraform plan path only after manual `APPLY` confirmation
- `Server-Staging-Deploy.yml`:
  - tests server on GitHub VM
  - builds/pushes Docker image to ECR
  - verifies gateway/workers are in one subnet
  - starts gateway Redis and waits for `PONG`
  - deploys Docker server containers on EC2-2/EC2-3 workers
  - updates DuckDNS before gateway reload so `corp-tower.duckdns.org` points at EC2-1
  - generates and validates the Caddyfile with `caddy validate`
  - drains one worker from Caddy, updates that worker, and restores all healthy workers in Caddy
  - starts/reloads gateway Caddy proxy to worker private IPs on port `3000`
- `Staging-Runtime-Cleanup.yml`:
  - manually removes stale Corp Tower containers, temp files, Docker network, DuckDNS boot updater, and optional server/Caddy/legacy nginx/redis images
  - leaves Docker and AWS CLI installed because server update uses them as EC2 prerequisites

## Required GitHub Secrets
- Server/infra: `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `EC2_STAGING_HOST`, `EC2_STAGING_USER`, `EC2_STAGING_SSH_KEY`, `EC2_STAGING_SSH_PUBLIC_KEY`
- Staging environment: `DUCKDNS_TOKEN`
- Optional: `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR`
- Android: `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

## Testing Strategy
- Current server test: Node syntax checks for server modules including `Redis_State.js`, plus `node --test Score_Events.test.js` for score event and summary contracts.
- Balance simulator: `npm run balance:simulate -- <levels> <runs>` from `src/Server` estimates generated pile reachability, exact possibility, smart-play completion, overbuild, placement counts, and level score distribution.
- Current client pipeline: Godot import/parse, required client compile/startup smoke test, required GUT tests, signed Android AAB export, deployment artifact validation, optional Google Play internal upload, and post-upload internal-track version-code verification.
- Staging debug checks:
  - EC2-1: `corp-tower-gateway`, `corp-tower-redis`
  - EC2-2/EC2-3: `corp-tower-server`
  - Redis: `docker exec corp-tower-redis redis-cli ping`
  - client: connect to `wss://corp-tower.duckdns.org`
- Godot client import/parse check: run Godot headless against `src/Client/App/corp-tower`.

## Future Technical Work
- Production-grade persistence for leaderboards and player stats.
- Structured logging and integration tests for multi-worker Redis reconnect.
- Admin authorization for debug config before public release.
- Add integration tests for multi-worker Redis reconnect and gateway routing.
- Owned domain or Elastic IP can replace DuckDNS later when paid production infrastructure is acceptable.

## TDD Maintenance Policy
- TDD is the source of truth for server/client architecture, deployment, CI/CD, runtime operations, message contracts, persistence, testing strategy, and tooling.
- Player-facing or designer-facing behavior changes go in [[Corp_Tower_GDD]].
