# Corp Tower TDD
> Current technical snapshot for the Corp Tower staging learning lab.

## System Overview
- 3-player real-time selfish-cooperation puzzle game.
- Godot `4.6.2.stable` Android client connects by secure WebSocket to `wss://corp-tower.duckdns.org`.
- Live staging currently runs on the Server K3s stack behind EC2-GW Caddy.
- Docker EC2-1/EC2-2/EC2-3 staging workflows are deprecated and removed.
- Server remains authoritative for matchmaking, room state, timers, shape block assignment, tower history, scoring, refresh tokens, debug tuning, bots, reconnect, and room cleanup.
- K3s is tracked in [[Server K3s Stack]] and [[Server K3s Workflows]].
- EKS, NLB with Elastic IPs, and ElastiCache Redis are tracked as a parallel plan-only path in [[Server EKS Stack]] and [[Server EKS Workflow]].

## Repository Layout
- `src/Server/Server.js`: WebSocket entry point and message router. -> [[Server Entry]]
- `src/Server/Lobby_Manager.js`: Redis-backed matchmaking, rooms, reconnect, debug config, and room lifecycle. -> [[Lobby Manager]]
- `src/Server/Redis_State.js`: Redis adapter for sessions, queue, room snapshots, locks, and room events. -> [[Redis State]]
- `src/Server/Game_Engine.js`: authoritative level lifecycle, timers, scoring, tokens, carry-over, win/fail, checkpoints. -> [[Game Engine]]
- `src/Server/Game_Config.js`: runtime balance and debug-tuning variables. -> [[Game Config]]
- `src/Server/Bot_Manager.js`: QA bot action loops and placement behavior. -> [[Bot Manager]]
- `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd`: Godot WebSocket adapter with reconnect identity persistence. -> [[NetworkManager]]
- `.github/workflows/Client-Android-Internal.yml`: Android internal-testing build/upload. -> [[Client Android Internal Workflow]]
- `docs/components/K3s Manual Learning Plan.md`: phase-gated manual Server K3s plan with rollback checks. -> [[K3s Manual Learning Plan]]
- `.github/workflows/Server-K3s-Deploy.yml`: Server K3s deploy and public WebSocket smoke test. -> [[Server K3s Workflows]]
- `.github/workflows/Server-K3s-Automated-Master.yml`: automatic/manual Server K3s deploy queue. -> [[Server K3s Automated Master Workflow]]
- `.github/workflows/Server-EKS-Infra-Plan.yml`: plan-only managed AWS Server EKS path. -> [[Server EKS Workflow]]
- `infra/k3s`: isolated K3s Terraform, Ansible, Kustomize, and Argo bootstrap assets. -> [[Server K3s Stack]]
- `infra/eks`: plan-only EKS, NLB/EIP, and ElastiCache Terraform assets. -> [[Server EKS Stack]]

## Deprecated Docker Runtime Architecture
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

## Active Server K3s Architecture
- Server K3s uses separate Terraform state key `k3s-lab/terraform.tfstate` and AWS resources tagged `Environment=k3s-lab`.
- EC2-GW is public and acts as Caddy gateway, SSH bastion, DuckDNS updater, and NAT instance.
- K3s control plane and agents are private EC2 instances in the lab VPC private subnet.
- K3s disables Traefik and ServiceLB; public traffic stays on EC2-GW Caddy.
- Corp Tower runs in namespace `corp-tower` with in-cluster Redis service `redis:6379`, two server replicas, and fixed NodePort `30300/tcp`.
- K3s deploys use the same ECR repository secret as Docker staging and refresh namespace secret `ecr-pull`.
- Argo CD manifests are present but not applied in the first rollout. Later Argo CD access is bastion plus port-forward only.

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
| `send_quick_chat` | Valid active room, template slot `0..2`, and server-authoritative per-player cooldown. |
| `update_config` | Key allowlist, value ranges, bot delay min/max, debug bot count clamp, bot strategy allowlist, and `resetDebugConfig` default restore action. |

### Client Placement UI
- Inventory cards use drag-and-drop instead of tap-to-place.
- Drag starts only on active slots with blocks while match state is `playing` and local placement cooldown has elapsed; locked/empty slots and blocked server states do not start drags.
- Release inside skin node `TowerDropZone` sends the existing index-only `place_block` request; release elsewhere cancels locally with no server message.
- Drag pointer position is visual only and does not change placement geometry or the server contract.
- `game_state` and `debug_config` remain backward-compatible; drag behavior uses existing authoritative fields plus local cooldown timing from `placementCooldown`.

### Block And Tower Payloads
- Inventory `blocks[]`: server-assigned fixed-orientation block objects `{ id, shapeId, cells, height }`.
- `activeInventorySlots`: number of currently unlocked active hand slots.
- `maxActiveBlocks`: maximum active hand slots supported by the UI/rules.
- `nextDrawBlock`: the first block in the shared draw pile, or `null` when empty.
- `drawPileCount`: remaining shared pile size including `nextDrawBlock`.
- `cells`: array of `[x, y]` unit coordinates used by the Godot client for shape previews and tower rendering.
- `height`: vertical footprint derived from `cells`; it is not necessarily equal to cell count.
- `towerBlocks[]`: ordered placement history with `{ playerId, block, height, effectiveHeight, baseHeight }` so clients can redraw the current tower after broadcasts or reconnect.
- Stability-enabled entries also include resolved `originX` and `originY`; `game_state` includes `towerStability` and diagnostic data. Redis persists these fields so recovered rooms reproduce the same structure.
- `checkpointScoreStatus`: right-panel UI helper with next checkpoint level, ready count inputs, and per-player leaderboard score goals.
- Legacy numeric block values are still tolerated by the Godot client as vertical fallback blocks.

### Score UI Payloads
- `scoreEvents[]` is transient and broadcast-only; each event has stable `id`, `type`, `level`, optional `playerId`, optional `points`, `label`, `displayOnly`, and `meta`.
- `quickChatEvents[]` is transient and broadcast-only. Each event has stable `id`, `playerId`, template `slot`, display `text`, and `createdAt`; it is never persisted or replayed after reconnect.
- Event types: `placement`, `finisher_bonus`, `precision_bonus`, `team_exact_bonus`, `assist_bonus` when enabled, `exact_finish`, `overbuild_finish`, and `mvp`.
- Clients track seen event ids per level and never infer event UI from score diffs.
- Placement events use `placementScorePopupDurationMs`; MVP, Perfect Fit, checkpoint, and bonus-style events use `finishScorePopupDurationMs`. Both popup durations represent total popup lifetime, including fade-out.
- Level score summaries are queued until the current score popup batch has faded, then remain visible for `levelSummaryDelayMs`.
- `lastLevelSummary` includes `result`, `reason`, `teamLevelScore`, `mvpId`, `mvpScore`, `exactFinish`, `overbuildHeight`, `finisherId`, `finishingBlock`, `carriedBlockCount`, and `players[]`; checkpoint failures also include `checkpointScoreStatus`.
- `lastLevelSummary.players[]` includes player id, bot flag, level score, previous total score, final total score, contributed height, MVP flag, and bonus breakdown.
- Completed summaries bank level score into final totals; failed summaries keep previous and final totals equal.

### Persisted Room Gameplay State
- Redis room snapshots include `checkpointScores`, `checkpointPolitics`, `drawPile`, `teamCarryOverBlocks`, `towerBlocks`, timers, level state, and serializable player inventory/score/token fields.
- `checkpointScores` restores leaderboard totals during rollback so reconnect and multi-worker recovery do not reintroduce score farming.
- `checkpointPolitics` restores politics inventory during rollback when `politicsLifetime` is `checkpoint`, preventing failed checkpoint-band attempts from farming Politics items.
- `drawPile` and `nextDrawBlock` are persisted so reconnecting clients see the same shared refill queue.

## CI/CD
- Normal server-only pushes run the Server K3s fast deploy path through `Server-K3s-Automated-Master.yml`.
- Server K3s workflow changes run `Diagnostics -> Infra Plan` before deploy when deployment is needed; K3s infra-only changes run `Infra Plan` without deploying.
- Manual Server K3s master runs default to `Diagnostics -> Infra Plan -> K3s Deploy`, with explicit fast server deploy and infra-plan-only options.
- Server K3s cleanup is manual-only. Runtime cleanup removes K3s/Caddy artifacts; `terraform_destroy` removes all AWS resources managed by `infra/k3s/terraform`.
- Server K3s infra apply is manual-only because it creates or changes EC2, VPC, IAM, route, security group, and key pair resources.
- `Server-K3s-Infra-Plan.yml` plans all K3s Terraform resources without applying them and allows create/delete actions to be reviewed for weekend recreate or weekday cleanup checks.
- `Server-K3s-Infra-Apply.yml` applies the reviewed K3s Terraform plan only after manual `APPLY_SERVER_K3S` confirmation.
- `Server-K3s-Cleanup.yml` destroys the K3s AWS stack only after manual `DESTROY_SERVER_K3S` confirmation.
- `Server-K3s-Deploy.yml`:
  - tests server code and builds/pushes the server image to ECR
  - installs/configures K3s through EC2-GW bastion/NAT
  - refreshes the `ecr-pull` Kubernetes image pull secret
  - applies the Kustomize overlay that Argo CD will later watch
  - validates K3s nodes, Redis, server replicas, Caddy, and public WSS
- `Server-K3s-Automated-Master.yml`:
  - runs watched server and K3s path pushes automatically
  - manual `full_preflight` runs `Diagnostics -> Infra Plan -> K3s Deploy`
  - manual `fast_server_deploy` runs K3s deploy directly
- `Server-EKS-Infra-Plan.yml`:
  - plans the parallel managed AWS path under `infra/eks/terraform`
  - includes EKS, private managed nodes, internet-facing NLB, Elastic IPs, and ElastiCache Redis
  - does not apply infrastructure

## Required GitHub Secrets
- Server/infra: `AWS_ROLE_ARN`, `ECR_REPOSITORY`, `EC2_STAGING_HOST`, `EC2_STAGING_USER`, `EC2_STAGING_SSH_KEY`, `EC2_STAGING_SSH_PUBLIC_KEY`
- Staging environment: `DUCKDNS_TOKEN`
- Optional: `EC2_STAGING_PORT`, `STAGING_SSH_CIDR`, `STAGING_GAME_PORT_CIDR`
- Android: `ANDROID_RELEASE_KEYSTORE_BASE64`, `ANDROID_RELEASE_KEYSTORE_ALIAS`, `ANDROID_RELEASE_KEYSTORE_PASSWORD`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`

## Testing Strategy
- Current server test: Node syntax checks for server modules including `Redis_State.js`, plus `node --test Score_Events.test.js` for score event and summary contracts.
- Balance simulator: `npm run balance:simulate -- <levels> <runs>` from `src/Server` estimates generated pile reachability, exact possibility, smart-play completion, overbuild, placement counts, and level score distribution.
- Current client pipeline: Godot import/parse, required client compile/startup smoke test, required GUT tests, signed Android AAB export, deployment artifact validation, optional Google Play internal upload, and post-upload internal-track version-code verification.
- Server K3s checks:
  - all K3s nodes Ready
  - Redis deployment Ready
  - two server replicas Ready
  - `ecr-pull` secret exists in namespace `corp-tower`
  - EC2-GW Caddy validates and proxies to NodePort `30300`
  - client: connect to `wss://corp-tower.duckdns.org`
- Godot client import/parse check: run Godot headless against `src/Client/App/corp-tower`.

## Future Technical Work
- Production-grade persistence for leaderboards and player stats.
- Structured logging and integration tests for multi-worker Redis reconnect.
- Admin authorization for debug config before public release.
- Add integration tests for multi-worker Redis reconnect and gateway routing.
- Review Server EKS plan output and cost impact before adding apply/deploy workflows.

## TDD Maintenance Policy
- TDD is the source of truth for server/client architecture, deployment, CI/CD, runtime operations, message contracts, persistence, testing strategy, and tooling.
- Player-facing or designer-facing behavior changes go in [[Corp_Tower_GDD]].
