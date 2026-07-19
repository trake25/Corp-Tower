# Corp Tower Summary

## Purpose
- 3-player real-time selfish-cooperation tower puzzle game.
- Players build one shared tower with server-assigned fixed-orientation blocks while competing for level score/MVP.
- Active client target: Godot Android app.
- Future platform targets are deferred until staging gameplay and Android/HTML5 pipeline are stable.

## Current Snapshot
- Gameplay: server-authoritative rooms, shape blocks, score events, level summaries, Impacts (score-gated checkpoints), Power items (including refresh), debug bots, and live tuning.
- Client Android: Godot `4.6.2.stable` Android HUD with shape inventory, tower stack, score feedback, level summaries, and a tabbed debug overlay, all on a single UI scene (no runtime skin switching).
- Client HTML5: Deploys via GitHub Pages, with a paired manual undeploy (soft/hard) workflow. Cloudflare Pages was evaluated and rejected — its 25 MiB per-file cap cannot host the 35.95 MiB `index.wasm`.
- Production art: kept out of the public repo entirely and injected at build time from a private Cloudflare R2 bucket, version-pinned per commit ([[Private Asset Pipeline]]).
- Server: Node WebSocket workers own matchmaking, room state, reconnect, scoring, timers, bots, and debug config.
- State: Redis is used for active matchmaking, room/session snapshots, reconnect, and worker recovery.
- Server K3s: active AWS/K3s stack under `infra/k3s`, with private K3s nodes behind EC2-GW and Argo CD-ready manifests that are not applied by default.
- Server EKS: new parallel plan-only Terraform path under `infra/eks` for EKS, NLB with Elastic IPs, and ElastiCache Redis.
- CI/CD: GitHub Actions handles server tests/builds, Server K3s deploys, diagnostics, infra plan/apply, cleanup, Server EKS infra planning, Android internal AAB workflow, and HTML5 Pages deploy/undeploy. Every client build workflow fetches private art from R2 first and fails closed if it cannot be verified.

## Source Of Truth & Fast Start
- Read this file first, then only the linked docs/sections needed for the task.
- Read relevant component source code only when the `.md` files don't provide enough context (refactors, redesigns) or when actually implementing. Read only the relevant sections/functions, not whole files, unless a full-file read is required to be correct.
- [[Corp_Tower_GDD]] — design, rules, scoring, balance, progression (see Game Systems below for which section).
- [[Corp_Tower_TDD]] — architecture, deploy, message contracts, persistence, testing, CI/CD (see Contracts & Testing below).
- [[Component-Index]] — full component list; the Component Map below omits plan-only/not-yet-applied work (e.g. Server EKS).
- Docs are only updated when the user runs `/update-docs`, after confirming the goal is fully reached.
- Do not commit, push, pull, compare with remote git repo unless instructed.
- Do not put comments on the source code, instead any context helping info should be in its corresponding .md docs.
  - Sole exception: comments that prevent a future edit from leaking credentials or otherwise creating a security hole, where the risk is not visible from the code itself. These are marked `SAFETY EXCEPTION` with the reason inline, since moving them to a doc would put the warning where nobody editing that line will read it. Currently three: two in `.github/actions/fetch-private-assets/action.yml`, one in `scripts/art-common.sh`.
- Keep `Summary.md` brief; link to details instead of duplicating them.

## Game Systems
- Core loop, matchmaking, reconnect: GDD `Core Game Loop`, `Reconnect and Shared Room Continuity`.
- Blocks, inventory, draw pile/carry-over: GDD `Block System`.
- Power (quest items, refresh, Impact rollback): GDD `Power System`.
- Tower height/stability: GDD `Tower System` (engine: [[Tower Stability]]).
- Scoring formulas, feedback UX: GDD `Scoring System`.
- Level/progression curve, Impacts: GDD `Progression`.
- Debug menu / live-tuning variables: GDD `Debug Menu and Live Tuning`, [[Game Config]].

## Component Map
- Navigation: [[Component-Index]]
- Server: [[Server Entry]], [[Lobby Manager]], [[Game Engine]], [[Block Supply]], [[Scoring]], [[Impacts]], [[Tower Stability]], [[Redis State]], [[Bot Manager]], [[Game Config]], [[Server Docker Image]]
- Server CI/tooling: [[Server Score Events Tests]], [[Balance Simulator]]
- Client runtime: [[Godot Client App]], [[NetworkManager]], [[Screen Manager]], [[Main UI Controller]], [[Game UI Scene]], [[Block Preview]], [[Tower Stack]], [[Popover Panel]], [[Impact Bar]], [[Cooldown Overlay]], [[Debug Overlay]], [[Player Colors]]
- Client tests: [[Godot Client Tests]]
- Server infra & IaC: [[Terraform Infrastructure]], [[Server K3s Stack]], [[Server K3s Workflows]], [[Server K3s Automated Master Workflow]]
- Android release: [[Client Android Internal Workflow]]
- WebGL HTML5 release: [[Client HTML5 Pages]]
- Private production art: [[Private Asset Pipeline]]

## Runtime Flow
- Godot connects to `wss://ws.tod.galaxxigames.com` through [[NetworkManager]].
- In Server K3s, EC2-GW Caddy terminates WSS and routes to private K3s node IPs on NodePort `30300`.
- In the planned Server EKS path, an internet-facing NLB with Elastic IPs replaces EC2-GW Caddy and ElastiCache replaces Docker/in-cluster Redis.
- [[Lobby Manager]] handles queueing, room creation, reconnect, debug config, and room close.
- [[Game Engine]] owns authoritative gameplay and broadcasts `game_state`.
- Client actions are server-validated; full message list and payload shapes: see Contracts & Testing below.

## Contracts & Testing
- Server→client: `room_created`, `room_resumed`, `game_state`, `debug_config`, `room_closed`.
- Client→server: `reconnect`, `place_block`, `activate_power`, `send_quick_chat`, `update_config`.
- Full payload shapes: TDD `Message Contracts`.
- Tests: `node --test tests/Score_Events.test.js` (server); `npm run balance:simulate -- <levels> <runs>` from `src/Server` (balance); Godot smoke test + GUT (client) — TDD `Testing Strategy`.
