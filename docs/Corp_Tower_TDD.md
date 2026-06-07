# Corp Tower TDD
> Current technical snapshot for the EC2 gateway/workers staging learning lab.

## System Overview
- 3-player real-time selfish-cooperation puzzle game.
- Godot `4.6.2.stable` Android client connects by WebSocket to EC2-1 gateway on port `3000`.
- EC2-1 simulates ALB/Redis/k3s for learning: nginx reverse proxy, Docker Redis, and k3s control plane.
- EC2-2/EC2-3 are k3s worker nodes that run horizontally scaled server pods.
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
- `infra/k3s/corp-tower-server.yaml`: live k3s manifests for server Deployment/Service. -> [[K3s Staging Manifests]]
- `.github/workflows/Infra-Staging-Terraform.yml`: manual Terraform workflow for EC2 learning lab. -> [[Terraform Infrastructure]]
- `.github/workflows/Server-Staging-Deploy.yml`: Docker/ECR deploy to EC2 gateway/workers. -> [[Server Staging Deploy Workflow]]
- `.github/workflows/Client-Android-Internal.yml`: Android internal-testing build/upload. -> [[Client Android Internal Workflow]]

## Runtime Architecture
- EC2-1 gateway:
  - public entrypoint `ws://<EC2-1-public-ip>:3000`
  - k3s control plane
  - `nginx:1.27-alpine` reverse proxy to k3s NodePort `30080`
  - external Redis simulation with `redis:7-alpine` on port `6379`
- EC2-2/EC2-3 workers:
  - join EC2-1 as k3s agents
  - run two `corp-tower-server` pods through Kubernetes Deployment
- Server pods:
  - connect to Redis via `REDIS_URL=redis://<EC2-1-private-ip>:6379`
  - use `RECONNECT_TTL_SECONDS=10` for staging/debug reconnect testing
- Redis stores active session, queue, and room state only; long-term leaderboard/player persistence remains deferred.

## Matchmaking, Rooms, And Reconnect
- Room requires exactly 3 participants.
- Debug bots fill empty slots only when at least 1 real player is waiting.
- Clients send `reconnect` after WebSocket open using stored `playerId` and `reconnectToken`.
- Valid reconnect resumes the same player slot and room.
- Missed reconnect TTL closes rooms with reason `reconnect_ttl_expired` when no connected real players remain.
- Any server pod can recover room/player session from Redis.

## Message Contracts
### Server To Client
| Message | Description |
|---|---|
| `room_created` | New room/session assignment with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, and initial `blocks`. |
| `room_resumed` | Existing room/session resumed with `playerId`, `reconnectToken`, `roomId`, `level`, `targetHeight`, and blocks. |
| `game_state` | Authoritative live state: level, timer, height, summary, refresh caps, and per-player score/inventory/token fields. |
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
- Infra workflow is manual-only because creating EC2 instances is an AWS side effect.
- `Infra-Staging-Terraform.yml`:
  - creates S3 backend bucket if missing
  - imports existing staging resources into Terraform state
  - provisions EC2-1 gateway and EC2-2/EC2-3 workers
- `Server-Staging-Deploy.yml`:
  - tests server on GitHub VM
  - builds/pushes Docker image to ECR
  - starts gateway Redis and waits for `PONG`
  - installs/verifies k3s control plane and worker agents
  - labels EC2-2/EC2-3 as Kubernetes worker nodes
  - creates ECR image pull secret
  - applies [[K3s Staging Manifests]]
  - generates and validates nginx config with `nginx -t`
  - starts gateway nginx proxy to k3s NodePort `30080`

## Required GitHub Secrets
- Server/infra: `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `EC2_STAGING_HOST`, `EC2_STAGING_USER`, `EC2_STAGING_SSH_KEY`, `EC2_STAGING_SSH_PUBLIC_KEY`
- Optional: `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR`
- Android: `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

## Testing Strategy
- Current server test: Node syntax checks for server modules including `Redis_State.js`.
- Current client pipeline: Godot import/parse and Android export; GUT tests are skipped until installed.
- Staging debug checks:
  - EC2-1: `corp-tower-gateway`, `corp-tower-redis`
  - EC2-1: `sudo k3s kubectl get nodes`
  - EC2-1: `sudo k3s kubectl get pods -n corp-tower-staging -o wide`
  - Redis: `docker exec corp-tower-redis redis-cli ping`
  - client: connect to `ws://<EC2-1-public-ip>:3000`

## Future Technical Work
- Production-grade persistence for leaderboards and player stats.
- Structured logging and integration tests for multi-worker Redis reconnect.
- Admin authorization for debug config before public release.
- Improve k3s rollout/rollback observability and add integration tests.
- DNS or Elastic IP for stable gateway address.

## TDD Maintenance Policy
- TDD is the source of truth for server/client architecture, deployment, CI/CD, runtime operations, message contracts, persistence, testing strategy, and tooling.
- Player-facing or designer-facing behavior changes go in [[Corp_Tower_GDD]].
