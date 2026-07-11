# Corp Tower Summary

## Purpose
- 3-player real-time selfish-cooperation tower puzzle game.
- Players build one shared tower with server-assigned fixed-orientation blocks while competing for level score/MVP.
- Active client target: Godot Android app.
- Future platform targets are deferred until staging gameplay and Android pipeline are stable.

## Current Snapshot
- Gameplay: server-authoritative rooms, shape blocks, refresh, score events, level summaries, checkpoints, debug bots, and live tuning.
- Client: Godot `4.6.2.stable` Android HUD with shape inventory, tower stack, refresh UI, score feedback, level summaries, skin switching, and tabbed debug overlay.
- Server: Node WebSocket workers own matchmaking, room state, reconnect, scoring, timers, bots, and debug config.
- State: Redis is used for active matchmaking, room/session snapshots, reconnect, and worker recovery.
- Server K3s: active AWS/K3s stack under `infra/k3s`, with private K3s nodes behind EC2-GW and Argo CD-ready manifests that are not applied by default.
- Server EKS: new parallel plan-only Terraform path under `infra/eks` for EKS, NLB with Elastic IPs, and ElastiCache Redis.
- CI/CD: GitHub Actions handles server tests/builds, Server K3s deploys, diagnostics, infra plan/apply, cleanup, Server EKS infra planning, and Android internal AAB workflow.

## Current Focus
- Active: shape-block progression/failure-pressure playtesting and score popup/level summary validation.
- Previous: Docker worker staging path verified from Godot client; tabbed debug tuning and score event/summary UX implemented.
- Blocked: _(none)_
- Next: Tune target curve, block supply, refresh, scoring, and checkpoint pressure using simulator/staging data.

## Source Of Truth
- Game design, rules, scoring, balance, progression: [[Corp_Tower_GDD]]
- Technical architecture, deploy, message contracts, persistence, testing: [[Corp_Tower_TDD]]
- Component navigation: [[Component-Index]]
- Human/AI workflow: [[Project Workflow]]
- AI roles and handoff rules: [[AI_Agent_Organization]]
- Recent changes: [[Changelog]]

## Component Map
- Navigation: [[Component-Index]]
- Server runtime/deploy: [[Server Entry]], [[Lobby Manager]], [[Game Engine]], [[Redis State]], [[Bot Manager]], [[Game Config]], [[Server Docker Image]]
- Server CI/tooling: [[Server Score Events Tests]], [[Balance Simulator]]
- Client runtime: [[Godot Client App]], [[NetworkManager]], [[Main UI Controller]], [[Client UI Skins]], [[Block Preview]], [[Tower Stack]], [[Debug Overlay]], [[Player Colors]]
- Client tests: [[Godot Client Tests]]
- Server infra: [[Server K3s Stack]], [[Server K3s Workflows]], [[Server K3s Automated Master Workflow]], [[Server EKS Stack]], [[Server EKS Workflow]]
- Android release: [[Client Android Internal Workflow]]
- K3s learning: [[K3s Manual Learning Plan]], [[Server K3s Stack]], [[Server K3s Workflows]]

## Runtime Flow
- Godot connects to `wss://corp-tower.duckdns.org` through [[NetworkManager]].
- In Server K3s, EC2-GW Caddy terminates WSS and routes to private K3s node IPs on NodePort `30300`.
- In the planned Server EKS path, an internet-facing NLB with Elastic IPs replaces EC2-GW Caddy and ElastiCache replaces Docker/in-cluster Redis.
- [[Lobby Manager]] handles queueing, room creation, reconnect, debug config, and room close.
- [[Game Engine]] owns authoritative gameplay and broadcasts `game_state`.
- Client actions are `place_block`, `refresh_blocks`, and debug `update_config`; server validates all of them.

## Constraints
- Android is the only current release target; iOS, Windows, HTML5, and Linux are deferred.
- Redis stores active staging state only; long-term leaderboard/player persistence is deferred.
- Bots are QA helpers, not production AI.
- Debug controls must be gated before public release.
- AWS region: `ap-southeast-1`.
- Server CI target: Node `24.14.1`.
- User prefers GitHub Actions validation over local manual Terraform, Docker, or Redis runs.
- Server K3s infra apply/cleanup remain manual-only; Server EKS is plan-only until the managed AWS architecture is reviewed.

## Fast Start For Agent AIs
- Read this first.
- Read only the linked component docs needed for the task.
- Use [[Corp_Tower_GDD]] for player-facing rule/balance changes.
- Use [[Corp_Tower_TDD]] for architecture, contracts, persistence, CI/CD, and deploy changes.
- Update affected component `.md` files when behavior changes.
- Keep `Summary.md` brief; link to details instead of duplicating them.
