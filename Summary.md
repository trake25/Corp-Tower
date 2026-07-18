# Corp Tower Summary

## Purpose
- 3-player real-time selfish-cooperation tower puzzle game.
- Players build one shared tower with server-assigned fixed-orientation blocks while competing for level score/MVP.
- Active client target: Godot Android app.
- Future platform targets are deferred until staging gameplay and Android/HTML5 pipeline are stable.

## Current Snapshot
- Gameplay: server-authoritative rooms, shape blocks, refresh, score events, level summaries, checkpoints, debug bots, and live tuning.
- Client Android: Godot `4.6.2.stable` Android HUD with shape inventory, tower stack, refresh UI, score feedback, level summaries, skin switching, and tabbed debug overlay.
- Client HTML5: Deploys via GitHub Pages; Cloudflare planned next.
- Server: Node WebSocket workers own matchmaking, room state, reconnect, scoring, timers, bots, and debug config.
- State: Redis is used for active matchmaking, room/session snapshots, reconnect, and worker recovery.
- Server K3s: active AWS/K3s stack under `infra/k3s`, with private K3s nodes behind EC2-GW and Argo CD-ready manifests that are not applied by default.
- Server EKS: new parallel plan-only Terraform path under `infra/eks` for EKS, NLB with Elastic IPs, and ElastiCache Redis.
- CI/CD: GitHub Actions handles server tests/builds, Server K3s deploys, diagnostics, infra plan/apply, cleanup, Server EKS infra planning, and Android internal AAB workflow.

## Source Of Truth & Fast Start
- Read this file first, then only the linked docs/sections needed for the task.
- [[Corp_Tower_GDD]] — design, rules, scoring, balance, progression (see Game Systems below for which section).
- [[Corp_Tower_TDD]] — architecture, deploy, message contracts, persistence, testing, CI/CD (see Contracts & Testing below).
- [[Component-Index]] — full component list; the Component Map below omits plan-only/not-yet-applied work (e.g. Server EKS).
- Docs are only updated when the user runs `/update-docs`, after confirming the goal is fully reached.
- Keep `Summary.md` brief; link to details instead of duplicating them.

## Game Systems
- Core loop, matchmaking, reconnect: GDD `Core Game Loop`, `Reconnect and Shared Room Continuity`.
- Blocks, inventory, draw pile/carry-over: GDD `Block System`.
- Refresh tokens: GDD `Refresh Token System`.
- Politics (quest items, checkpoint rollback): GDD `Politics System`.
- Tower height/stability: GDD `Tower System` (engine: [[Tower Stability]]).
- Scoring formulas, feedback UX: GDD `Scoring System`.
- Level/progression curve, checkpoints: GDD `Progression`.
- Debug menu / live-tuning variables: GDD `Debug Menu and Live Tuning`, [[Game Config]].

## Component Map
- Navigation: [[Component-Index]]
- Server: [[Server Entry]], [[Lobby Manager]], [[Game Engine]], [[Tower Stability]], [[Redis State]], [[Bot Manager]], [[Game Config]], [[Server Docker Image]]
- Server CI/tooling: [[Server Score Events Tests]], [[Balance Simulator]]
- Client runtime: [[Godot Client App]], [[NetworkManager]], [[Main UI Controller]], [[Client UI Skins]], [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]], [[Debug Overlay]], [[Player Colors]]
- Client tests: [[Godot Client Tests]]
- Server infra & IaC: [[Terraform Infrastructure]], [[Server K3s Stack]], [[Server K3s Workflows]], [[Server K3s Automated Master Workflow]]
- Android release: [[Client Android Internal Workflow]]
- WebGL HTML5 release: [[Client HTML5 Pages]]

## Runtime Flow
- Godot connects to `wss://ws.tod.galaxxigames.com` through [[NetworkManager]].
- In Server K3s, EC2-GW Caddy terminates WSS and routes to private K3s node IPs on NodePort `30300`.
- In the planned Server EKS path, an internet-facing NLB with Elastic IPs replaces EC2-GW Caddy and ElastiCache replaces Docker/in-cluster Redis.
- [[Lobby Manager]] handles queueing, room creation, reconnect, debug config, and room close.
- [[Game Engine]] owns authoritative gameplay and broadcasts `game_state`.
- Client actions are server-validated; full message list and payload shapes: see Contracts & Testing below.

## Contracts & Testing
- Server→client: `room_created`, `room_resumed`, `game_state`, `debug_config`, `room_closed`.
- Client→server: `reconnect`, `place_block`, `refresh_blocks`, `send_quick_chat`, `update_config`.
- Full payload shapes: TDD `Message Contracts`.
- Tests: `node --test Score_Events.test.js` (server); `npm run balance:simulate -- <levels> <runs>` from `src/Server` (balance); Godot smoke test + GUT (client) — TDD `Testing Strategy`.
