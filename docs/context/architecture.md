# Architecture

Scope: system shape, tech stack, runtime/message flow, repo layout. Per-module detail → [module-index.md](./module-index.md). Design rationale → [decisions.md](./decisions.md).

## System

3-player real-time multiplayer puzzle game. Godot Android client, authoritative Node.js WebSocket server, Redis shared state. Server is authoritative for all gameplay; client renders server state and never computes final outcomes locally.

| Layer | Stack |
|---|---|
| Client | Godot `4.6.2.stable`, GDScript, `WebSocketPeer` |
| Server | Node.js, `ws`, Redis (`redis` npm package, optional) |
| Shared state | Redis (multi-worker matchmaking/room/reconnect state) |
| Infra (production-grade target, deploy-on-demand) | Terraform, EKS, ALB, ElastiCache |
| Infra (lab) | Terraform, K3s on EC2, Docker, Caddy |
| CI/CD | GitHub Actions |
| Public endpoints | Prod `wsplaytod`/test `wstodtest` on K3s (Cloudflare DNS); dev `devwstod1`/`devwstod2` and the always-on public demo `wstoddemo` on the physical backup (Cloudflare Tunnel) — build-time injected, see [networking.md](./networking.md#connection) |

```mermaid
flowchart LR
    subgraph Client["Godot Client (Android)"]
        NM["NetworkManager"]
        MUC["Main UI Controller\n+ GameUi module family"]
        NM --> MUC
    end

    subgraph Server["Node.js Server (per worker)"]
        SE["Server Entry"]
        LM["Lobby Manager"]
        GE["Game Engine"]
        subgraph Engine["engine/ modules"]
            BS["Block Supply"]
            SC["Scoring"]
            IM["Impacts"]
        end
        TS["Tower Stability (pure)"]
        BM["Bot Manager"]
        GC["Game Config"]
        RS["Redis State"]
        SE --> LM --> GE
        GE --> BS & SC & IM
        GE --> TS
        GE --> BM
        LM --> RS
        GE -. reads .-> GC
    end

    Client -- "WebSocket (wss)" --> Server
    RS -. "shared state, multi-worker" .-> Redis[("Redis")]
```

## Runtime flow

1. Client connects to its build-configured endpoint (prod `wsplaytod`/test `wstodtest` on K3s, or a dev instance on the physical backup — see [networking.md § Connection](./networking.md#connection)). On K3s, EC2-GW Caddy terminates WSS/HTTPS for every hostname in `infra/k3s/gateway_sites.yml` and reverse-proxies each to private K3s node IPs on that hostname's own NodePort. On the session-scoped EKS stack (own hostnames `wstodplay`/`todplay`, brought up on demand), an ALB with ACM TLS and host-based routing replaces EC2-GW Caddy.
2. **Server Entry** accepts the connection and the first `reconnect` message, then hands the player to **Lobby Manager**.
3. **Lobby Manager** queues the player, creates/resumes a 3-participant room (filling with debug bots if enabled), and starts a **Game Engine** instance for that room.
4. **Game Engine** owns authoritative per-room gameplay — level lifecycle, timers, placement validation, Power system — delegating block supply, scoring, and Impact (checkpoint) logic to its `engine/` submodules, and grid/tilt physics to **Tower Stability** (a pure function).
5. **Redis State** (when `REDIS_URL` is set) backs the shared matchmaking queue and room snapshots so any worker can recover a room/player session; falls back to in-memory maps for single-worker/local runs.
6. Engine broadcasts `game_state` on every tick/change; client reflects it. Full contract → [networking.md](./networking.md).

## Repository layout

| Path | Contents | Detail doc |
|---|---|---|
| `src/Server/app/` | Everything the Docker image ships (deployed runtime) | [backend.md](./backend.md) |
| `src/Server/app/Server.js` | WebSocket entry point / message router | [networking.md](./networking.md#server-entry) |
| `src/Server/app/Lobby_Manager.js` | Matchmaking, rooms, reconnect, debug-config coordinator | [backend.md](./backend.md#lobby-manager) |
| `src/Server/app/Game_Engine.js` | Authoritative level lifecycle, timers, Power system | [backend.md](./backend.md#game-engine) |
| `src/Server/app/engine/Block_Supply.js` | Block gen, draw pile, opening hands, refresh | [backend.md](./backend.md#block-supply) |
| `src/Server/app/engine/Scoring.js` | Score events, bonuses, leaderboard, MVP, summaries | [backend.md](./backend.md#scoring) |
| `src/Server/app/engine/Impacts.js` | Impact snapshots, rollback, score gate | [backend.md](./backend.md#impacts) |
| `src/Server/app/Tower_Stability.js` | Pure grid-settling + stability scoring | [backend.md](./backend.md#tower-stability) |
| `src/Server/app/Bot_Manager.js` | QA bot action loops | [backend.md](./backend.md#bot-manager) |
| `src/Server/app/Game_Config.js` | Central tuning/config object | [backend.md](./backend.md#game-config), full variable table in [gameplay.md](./gameplay.md#debug-menu-and-live-tuning) |
| `src/Server/app/Redis_State.js` | Shared-state adapter, in-memory fallback | [backend.md](./backend.md#redis-state) |
| `src/Server/tools/Balance_Simulator.js` | Offline balance-sampling CLI (not shipped) | [testing.md](./testing.md#balance-simulator) |
| `src/Server/tests/Score_Events.test.js` | Score/summary contract tests (not shipped) | [testing.md](./testing.md#server-score-events-tests) |
| `src/Server/Dockerfile` | Server container image | [build.md](./build.md#server-container-image) |
| `src/Client/App/corp-tower/` | Godot project root | [ui.md](./ui.md) |
| `src/Client/App/corp-tower/Sys/NetMan/NetworkManager.gd` | WebSocket adapter, autoload singleton | [networking.md](./networking.md#networkmanager) |
| `src/Client/App/corp-tower/Cor/Scripts/Main.gd` | Main UI orchestrator | [ui.md](./ui.md#main-ui-controller) |
| `src/Client/App/corp-tower/Cor/Scripts/GameUi/` | UI module family (services + view controllers) | [ui.md](./ui.md#main-ui-controller) |
| `src/Client/App/corp-tower/Cor/Scenes/GameUI.tscn` | The one gameplay UI scene | [ui.md](./ui.md#game-ui-scene) |
| `.github/workflows/Android-Deploy-wsplaytod.yml` | Android internal build/upload, endpoint wsplaytod | [build.md](./build.md#android-deploy-wsplaytod-workflow) |
| `.github/actions/fetch-private-assets/` | Pulls production art from R2 | [build.md](./build.md#private-asset-pipeline) |
| `.github/workflows/K3s-*.yml` | K3s deploy/cleanup/infra for prod (wsplaytod/playtod) + test (wstodtest/todtest) | [deployment.md](./deployment.md#k3s-workflows) |
| `.github/workflows/Backup-*.yml` / `Demo-*.yml` | Physical-backup deploy/cleanup/diagnose for 2 dev instances plus the always-on public demo (instance 3) | [deployment.md](./deployment.md#backup-physical-machine) |
| `.github/workflows/EKS-*.yml` | Production-grade EKS path (infra plan/apply/destroy, deploy, cleanup, diagnose) | [deployment.md](./deployment.md#eks-production-grade-target) |
| `infra/k3s/` | Active K3s Terraform, Ansible, Kustomize, Argo bootstrap | [deployment.md](./deployment.md#k3s-topology) |
| `infra/eks/` | Production-grade EKS Terraform + Kustomize apps | [deployment.md](./deployment.md#eks-production-grade-target) |
| `README.md` | Repo-front project pitch for human readers — design intent in plain language, no contracts or numbers; not a KB doc and never a source of truth for one | — |
| `site/` | Astro portfolio site, deployed to its own Cloudflare Worker (own CI, own conventions) — no game code, out of this KB's scope | [site/README.md](../../site/README.md) |
| `site-root/` | Zone-apex placeholder page, separate Worker (own CI) | [site-root/README.md](../../site-root/README.md) |

## Subsystem boundaries

- **Client** talks only to **Server Entry**, over the WebSocket contract in [networking.md](./networking.md). It never computes gameplay outcomes — only renders `game_state` and sends intents.
- **Game Engine** never talks to Redis directly; **Lobby Manager** persists room snapshots through **Redis State** after the engine notifies it of a change.
- **Tower Stability** has zero internal or external dependencies — it's pure grid math, deliberately kept deterministic (see [decisions.md](./decisions.md)).
- **Balance Simulator** instantiates **Game Engine** directly, bypassing **Lobby Manager**/Redis/WebSocket entirely — it's a standalone tuning tool, not part of the runtime path.

## Current environment status

- **EKS** (`infra/eks`): the production-grade target — fully implemented, deployed on demand and torn down after (cost control, not incompleteness). See [deployment.md](./deployment.md#eks-production-grade-target).
- **K3s** (`infra/k3s`): the lab — where infra changes are tried and learned before they reach EKS.
- The physical backup machine ([deployment.md § Backup](./deployment.md#backup-physical-machine)) is the development environment — dev instances plus the always-on public demo.
- Docker EC2 staging (EC2-1/2/3 + Ansible) has been fully removed; K3s superseded it.
