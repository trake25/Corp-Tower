# Corp Tower TDD
> Current technical snapshot for the EC2 gateway/workers staging learning lab.

## System Overview
- 3-player real-time selfish-cooperation puzzle game.
- Godot `4.6.2.stable` Android client connects by WebSocket to EC2-1 gateway on port `3000`.
- EC2-1 simulates ALB/Redis for learning: nginx reverse proxy and Docker Redis.
- EC2-2/EC2-3 run horizontally scaled Docker server workers.
- EC2 gateway/workers are pinned to one subnet so private gateway-to-worker routing is predictable.
- Server remains authoritative for matchmaking, room state, timers, block assignment, scoring, refresh tokens, debug tuning, bots, reconnect, and room cleanup.
- Managed AWS ALB/NLB, ElastiCache, and EKS are intentionally avoided to reduce learning-lab credit usage.

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

## Runtime Architecture
- EC2-1 gateway:
  - public entrypoint `ws://<EC2-1-public-ip>:3000`
  - `nginx:1.27-alpine` reverse proxy to worker private IPs on port `3000`
  - external Redis simulation with `redis:7-alpine` on port `6379`
- EC2-2/EC2-3 workers:
  - run `corp-tower-server` Docker containers
- Server workers:
  - connect to Redis via `REDIS_URL=redis://<EC2-1-private-ip>:6379`
  - use `RECONNECT_TTL_SECONDS=10` for staging/debug reconnect testing
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
| `room_created` | New room/session assignment with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, and initial `blocks`. |
| `room_resumed` | Existing room/session resumed with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, and blocks. |
| `game_state` | Authoritative live state: level, timer, height, tower block history, summary, refresh caps, and per-player score/inventory/token fields including `isBot`. Inventory `blocks` are shape objects `{ id, shapeId, cells, height }`; legacy numeric blocks are tolerated by the client. |
| `debug_config` | Authoritative debug menu state. |
| `room_closed` | Room teardown reason for connected real players. |

### Client To Server
| Message | Validation |
|---|---|
| `reconnect` | Token/player id may resume room; otherwise server creates a new session and queues player. |
| `place_block` | Valid room, player, state, cooldown, inventory, and block index. |
| `refresh_blocks` | Token count, per-level usage cap, active state, final lockout. |
| `update_config` | Key allowlist, value ranges, bot delay min/max, debug bot count clamp. |

## CI/CD
- Normal automated staging path is `Diagnostics -> Infra Plan -> Server Update`.
- Server-side pushes to `main`/`master` trigger the automated master workflow; client-only pushes do not.
- Cleanup is manual-only and used when an implementation fails or a revert needs to remove stale Docker runtime artifacts.
- Infra Apply and EC2 Rebuild are manual-only because they can intentionally change infrastructure.
- Infra plan/apply workflows are manual-only because creating or changing EC2 instances is an AWS side effect.
- `Staging-Automated-Master.yml`:
  - calls diagnostics, infra plan, then server update in queue order
  - triggers on server-side pushes and manual dispatch
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
  - generates and validates nginx config with `nginx -t`
  - drains one worker from nginx, updates that worker, and restores all healthy workers in nginx
  - starts/reloads gateway nginx proxy to worker private IPs on port `3000`
- `Staging-Runtime-Cleanup.yml`:
  - manually removes stale Corp Tower containers, temp files, Docker network, and optional server/nginx/redis images
  - leaves Docker and AWS CLI installed because server update uses them as EC2 prerequisites

## Required GitHub Secrets
- Server/infra: `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `EC2_STAGING_HOST`, `EC2_STAGING_USER`, `EC2_STAGING_SSH_KEY`, `EC2_STAGING_SSH_PUBLIC_KEY`
- Optional: `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR`
- Android: `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

## Testing Strategy
- Current server test: Node syntax checks for server modules including `Redis_State.js`.
- Current client pipeline: Godot import/parse and Android export; GUT tests are skipped until installed.
- Staging debug checks:
  - EC2-1: `corp-tower-gateway`, `corp-tower-redis`
  - EC2-2/EC2-3: `corp-tower-server`
  - Redis: `docker exec corp-tower-redis redis-cli ping`
  - client: connect to `ws://<EC2-1-public-ip>:3000`
- Godot client import/parse check: run Godot headless against `src/Client/App/corp-tower`.

## Future Technical Work
- Production-grade persistence for leaderboards and player stats.
- Structured logging and integration tests for multi-worker Redis reconnect.
- Admin authorization for debug config before public release.
- Add integration tests for multi-worker Redis reconnect and gateway routing.
- DNS or Elastic IP for stable gateway address.

## TDD Maintenance Policy
- TDD is the source of truth for server/client architecture, deployment, CI/CD, runtime operations, message contracts, persistence, testing strategy, and tooling.
- Player-facing or designer-facing behavior changes go in [[Corp_Tower_GDD]].
