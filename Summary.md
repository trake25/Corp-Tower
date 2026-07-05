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
- State: Redis is used in staging for active matchmaking, room/session snapshots, reconnect, and worker recovery.
- Staging: EC2-1 gateway runs Caddy plus Docker Redis; EC2-2/EC2-3 run Docker `corp-tower-server` workers.
- CI/CD: GitHub Actions handles server tests/builds, Ansible-driven staging deploys, diagnostics, infra plan/apply, cleanup, and Android internal AAB workflow.
- K3s: manual learning plan only; Docker gateway/workers remain the active staging path.

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
- Staging/infra: [[Staging Automated Master Workflow]], [[Server Staging Deploy Workflow]], [[Staging Diagnostics Workflow]], [[Staging Runtime Cleanup Workflow]], [[Terraform Infrastructure]], [[Staging Deploy Guide]]
- Android release: [[Client Android Internal Workflow]]
- K3s learning: [[K3s Manual Learning Plan]]

## Runtime Flow
- Godot connects to `wss://corp-tower.duckdns.org` through [[NetworkManager]].
- EC2-1 Caddy terminates WSS and routes WebSockets to worker containers; workers share active state through Redis on EC2-1.
- [[Lobby Manager]] handles queueing, room creation, reconnect, debug config, and room close.
- [[Game Engine]] owns authoritative gameplay and broadcasts `game_state`.
- Client actions are `place_block`, `refresh_blocks`, and debug `update_config`; server validates all of them.

## Constraints
- Android is the only current release target; iOS, Windows, HTML5, and Linux are deferred.
- Redis stores active staging state only; long-term leaderboard/player persistence is deferred.
- Bots are QA helpers, not production AI.
- Debug controls must be gated before public release.
- Staging region: `ap-southeast-1`.
- Server CI target: Node `24.14.1`.
- User prefers GitHub Actions/staging validation over local manual Terraform, Docker, or Redis runs.
- Infra Apply, EC2 Rebuild, cleanup, and K3s remain manual-only.

## Fast Start For Agent AIs
- Read this first.
- Read only the linked component docs needed for the task.
- Use [[Corp_Tower_GDD]] for player-facing rule/balance changes.
- Use [[Corp_Tower_TDD]] for architecture, contracts, persistence, CI/CD, and deploy changes.
- Update affected component `.md` files when behavior changes.
- Keep `Summary.md` brief; link to details instead of duplicating them.
