# Module Index

Scope: one row per module — file path, purpose, dependencies, where the full detail lives. Use this to find *which file to open*; open the linked doc for actual behavior.

## Server

| Module | File | Purpose | Depends on | Full detail |
|---|---|---|---|---|
| Server Entry | `src/Server/app/Server.js` | WebSocket entry point, message router | Lobby Manager | [networking.md](./networking.md#server-entry) |
| Lobby Manager | `src/Server/app/Lobby_Manager.js` | Matchmaking, room lifecycle, debug-config coordinator | Game Engine, Game Config, Bot Manager (indirect), Redis State | [backend.md](./backend.md#lobby-manager) |
| Game Engine | `src/Server/app/Game_Engine.js` | Authoritative per-room gameplay + level lifecycle | Game Config, Tower Stability, Bot Manager, Lobby Manager (notify-only), Block Supply, Scoring, Impacts | [backend.md](./backend.md#game-engine) |
| Block Supply | `src/Server/app/engine/Block_Supply.js` | Block creation, draw pile, opening hands, refresh generation | Game Config, Game Engine (facade) | [backend.md](./backend.md#block-supply) |
| Scoring | `src/Server/app/engine/Scoring.js` | Score events, bonuses, leaderboard banking, MVP, summaries | Game Config, Block Supply (indirect) | [backend.md](./backend.md#scoring) |
| Impacts | `src/Server/app/engine/Impacts.js` | Impact snapshots, rollback, score gate | Game Config, Game Engine (facade), Scoring (facade) | [backend.md](./backend.md#impacts) |
| Tower Stability | `src/Server/app/Tower_Stability.js` | Pure grid-settling and stability scoring | none | [backend.md](./backend.md#tower-stability) |
| Bot Manager | `src/Server/app/Bot_Manager.js` | Debug bot action scheduler | Game Config, Game Engine | [backend.md](./backend.md#bot-manager) |
| Game Config | `src/Server/app/Game_Config.js` | Central tuning/config object | none | [backend.md](./backend.md#game-config) |
| Redis State | `src/Server/app/Redis_State.js` | Shared-state adapter, in-memory fallback | `redis` (npm) | [backend.md](./backend.md#redis-state) |
| Balance Simulator | `src/Server/tools/Balance_Simulator.js` | Offline balance-sampling CLI (not shipped) | Game Engine, Game Config, Tower Stability | [testing.md](./testing.md#balance-simulator) |
| Server Score Events Tests | `src/Server/tests/Score_Events.test.js` | Score/summary contract tests (not shipped) | Game Engine, Game Config, Lobby Manager, Tower Stability | [testing.md](./testing.md#server-score-events-tests) |
| Server Matchmaking Queue Tests | `src/Server/tests/Matchmaking_Queue.test.js` | Multi-pod matchmaking race/handoff regression test (not shipped) | Lobby Manager, Redis State (via a fake shared-cluster stateStore double) | [testing.md](./testing.md#server-matchmaking-queue-tests) |
| Server Container Image | `src/Server/Dockerfile` | Packages `src/Server/app` for deploy | Server Entry (runtime) | [build.md](./build.md#server-container-image) |

## Client (`src/Client/App/corp-tower`)

| Module | File | Purpose | Depends on | Full detail |
|---|---|---|---|---|
| Godot Client App | project root | Shell: autoloads, display/stretch config, screen swap | NetworkManager, Screen Manager, Main UI Controller | [ui.md](./ui.md#godot-client-app-shell) |
| NetworkManager | `Sys/NetMan/NetworkManager.gd` | WebSocket adapter, signal bridge, autoload singleton | Godot `WebSocketPeer` | [networking.md](./networking.md#networkmanager) |
| Screen Manager | `Cor/Scripts/ScreenManager.gd` | Screen flow + global debug toggle button | NetworkManager, Main UI Controller (duck-typed) | [ui.md](./ui.md#screen-manager) |
| Main UI Controller | `Cor/Scripts/Main.gd` | Slim orchestrator over the `GameUi/` module family | NetworkManager, Game UI Scene, and every leaf UI component | [ui.md](./ui.md#main-ui-controller) |
| Game UI Scene | `Cor/Scenes/GameUI.tscn` | The one gameplay UI scene; node contract Main binds against | Block Preview, Tower Stack, Cooldown Overlay, Debug Overlay | [ui.md](./ui.md#game-ui-scene) |
| Block Preview | `Cor/Scripts/BlockPreview.gd` | Draws fixed-orientation block previews | none | [ui.md](./ui.md#leaf-components) |
| Tower Stack | `Cor/Scripts/TowerStack.gd` | Draws placed-block tower (fixed brick size, unlimited scroll/clip) + tilt animation | Player Colors | [ui.md](./ui.md#leaf-components) |
| Background Parallax | `Cor/Scripts/BackgroundParallax.gd` | Pans `BgArt` (sky) and `PlatformArt` (ground) at independent rates in response to Tower Stack's scroll to simulate a camera pan up the tower | Tower Stack (via Main UI Controller) | [ui.md](./ui.md#leaf-components) |
| Popover Panel | `Cor/Scripts/PopoverPanel.gd` | Reusable anchored card for tap-triggered popovers | none | [ui.md](./ui.md#popover-panel) |
| Impact Bar | `Cor/Scripts/ImpactBar.gd` | Per-player Impact-progress fill bar | none | [ui.md](./ui.md#leaf-components) |
| Cooldown Overlay | `Cor/Scripts/CooldownOverlay.gd` | Radial per-card cooldown indicator | none | [ui.md](./ui.md#leaf-components) |
| Debug Overlay | `Cor/Scripts/DebugOverlay.gd` | Debug panel show/hide shell | none | [ui.md](./ui.md#leaf-components) |
| Player Colors | `Cor/Scripts/PlayerColors.gd` | player_id → color utility | none | [ui.md](./ui.md#leaf-components) |
| Godot Client Tests | `Tests/CiSmokeTest.gd`, `Tests/Gut/*` | Smoke test + GUT coverage | Godot Client App, NetworkManager, Main UI Controller, Player Colors | [testing.md](./testing.md#godot-client-tests) |

## Infrastructure & CI/CD

| Module | File | Purpose | Depends on | Full detail |
|---|---|---|---|---|
| Client Android Internal Workflow | `.github/workflows/Client-Android-Internal.yml` | Build/test/sign internal Android build | Godot Client App, Private Asset Pipeline | [build.md](./build.md#client-android-internal-workflow) |
| Client HTML5 Pages | `.github/workflows/Client-HTML5-Pages.yml` (+`-Undeploy.yml`) | Build/export/deploy Web build to GitHub Pages | Godot Client App, Private Asset Pipeline | [build.md](./build.md#client-html5-pages) |
| Private Asset Pipeline | `.github/actions/fetch-private-assets/`, `scripts/art-*.sh` | Injects production art from private R2 at build time | R2 bucket `corp-tower-assets` | [build.md](./build.md#private-asset-pipeline) |
| Terraform Infrastructure | `infra/k3s/terraform`, `infra/eks/terraform` | Terraform roots | — | [deployment.md](./deployment.md#terraform-roots) |
| Server K3s Stack | `infra/k3s/` | Active self-hosted K3s-on-EC2 infra | Terraform Infrastructure | [deployment.md](./deployment.md#k3s-topology) |
| Server K3s Workflows | `.github/workflows/Server-K3s-*.yml` | Deploy/diagnose/clean up the K3s stack | Server K3s Stack | [deployment.md](./deployment.md#k3s-workflows) |
| Server K3s Automated Master Workflow | `.github/workflows/Server-K3s-Automated-Master.yml` | Orchestrates the individual K3s workflows | Server K3s Workflows | [deployment.md](./deployment.md#k3s-workflows) |
| Server EKS Stack | `infra/eks/` | Plan-only parallel managed-AWS infra | Terraform Infrastructure | [deployment.md](./deployment.md#eks-plan-only) |
| Server EKS Workflow | `.github/workflows/Server-EKS-Infra-Plan.yml` | CI plan-only path for EKS | Server EKS Stack | [deployment.md](./deployment.md#eks-plan-only) |
| Server Backup Workflows | `.github/workflows/Server-Backup-*.yml` | Deploy/clean up the manual physical backup server via a self-hosted runner | `~/corp-tower-server-backup/` (outside repo, on the physical machine) | [deployment.md](./deployment.md#backup-server-manual-physical-machine) |

## Global / cross-cutting docs

| Doc | Covers |
|---|---|
| [index.md](./index.md) | **Entry point** — system overview, working rules, task router, retrieval tiers, ignore map |
| [architecture.md](./architecture.md) | System shape, tech stack, runtime flow, repo layout |
| [gameplay.md](./gameplay.md) | Game design: rules, scoring, balance, progression, debug tuning |
| [networking.md](./networking.md) | WebSocket wire protocol: message contracts, payloads, adapters |
| [backend.md](./backend.md) | Server module behavior (engine facade + delegation pattern) |
| [ui.md](./ui.md) | Godot client: Main orchestrator, GameUi family, scenes, popovers |
| [deployment.md](./deployment.md) | K3s (active) + EKS (plan-only) infra, runbook, secrets |
| [build.md](./build.md) | Android/HTML5 build workflows, private R2 art pipeline |
| [testing.md](./testing.md) | Server/client tests, balance simulator, CI gates, coverage gaps |
| [decisions.md](./decisions.md) | Why things are built the way they are; rejected alternatives; known gaps |
| [coding-conventions.md](./coding-conventions.md) | Patterns for writing code/docs; the doc-maintenance workflow |
| [glossary.md](./glossary.md) | Project-specific terms and renamed systems |
