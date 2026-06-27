# Corp Tower Summary

## Project Purpose
- Cloud Infrastructure based 3-player multiplayer puzzle game.
- Players cooperate to build a shared tower while competing for MVP score.
- Current phase: shape-block gameplay UI, live balance tuning, server deploy, and Android pipeline testing.
- Staging Client: Godot Android app
- Production Client target:  Multiple Platforms (Android, iOS, Windows, HTML5, Linux, etc.)
- HTML client is a legacy local logic test harness only.

## Core Concepts
- Shared tower: all players contribute fixed-orientation shape blocks toward one target height.
- Selfish cooperation: players need team success but compete for level score/MVP.
- Server authority: Node WebSocket server owns matchmaking, room state, timers, shape block assignment, scoring, tower history, bots, and debug config.
- Debug tuning: designers/QA can update selected `Game_Config` values at runtime; server broadcasts authoritative config to all clients.
- Staging reconnect: clients keep a server-issued player id/reconnect token and can resume the same room within the debug TTL; real-player-only rooms can auto-reconnect after unintended disconnects.

## System Design High-Level
- [[Godot Client App]] connects to the server through [[NetworkManager]].
- [[Server Entry]] accepts WebSocket clients and routes messages.
- [[Lobby Manager]] coordinates Redis-backed matchmaking, reconnect, room lifecycle, debug bots, and room teardown.
- [[Game Engine]] runs the authoritative level lifecycle and scoring.
- [[Redis State]] stores shared matchmaking/session/room snapshots when `REDIS_URL` is enabled.
- [[Bot Manager]] schedules QA bot actions and cancels bot timers when rooms close.
- [[Game Config]] stores balance and debug-tunable variables.
- [[Server Staging Deploy Workflow]] builds/pushes Docker images to ECR and deploys the Docker-worker EC2 gateway/workers lab.
- [[Staging Automated Master Workflow]] automatically classifies staging changes; server-only pushes run the fast guarded server update, while workflow/infra changes keep diagnostics and/or infra plan gates.
- [[Staging Diagnostics Workflow]] manually verifies AWS topology, networking, EC2 status, and SSH reachability without changing staging.
- [[Staging Runtime Cleanup Workflow]] manually removes only the Docker runtime artifacts managed by server update, while leaving EC2 prerequisites installed.
- [[Terraform Infrastructure]] creates/adopts AWS staging resources for the free-tier learning lab.
- [[K3s Manual Learning Plan]] defines a manual, reversible learning path for K3s without replacing the active Docker staging path.
- [[Client Android Internal Workflow]] builds signed Android AABs and can upload to Google Play internal testing.
- [[AI_Agent_Organization]] defines AI assistant roles, prompt handoff behavior, and human review ownership.

## Architecture Tree
- `src/Server`
  - [[Server Entry]]: WebSocket listener and message router.
  - [[Lobby Manager]]: matchmaking, room lifecycle, debug config broadcast.
  - [[Redis State]]: Redis adapter, session tokens, shared queue/room snapshots, and tower history snapshots.
  - [[Game Engine]]: level rules, shape blocks, tower history, timers, scoring, tokens, room close.
  - [[Bot Manager]]: bot action loop and timer cancellation.
  - [[Game Config]]: runtime rules, shape variants, and tuning values.
  - [[Server Docker Image]]: container packaging for staging.
- `src/Client/App/corp-tower`
  - [[Godot Client App]]: Android-first game client.
  - [[NetworkManager]]: Godot WebSocket adapter.
  - [[Main UI Controller]]: gameplay HUD, shape inventory, tower stack, refresh controls.
- `.github/workflows`
  - [[Server Staging Deploy Workflow]]
  - [[Staging Automated Master Workflow]]
  - [[Staging Diagnostics Workflow]]
  - [[Staging Runtime Cleanup Workflow]]
  - [[Client Android Internal Workflow]]
- `infra`
  - [[Terraform Infrastructure]]
- `docs`
  - [[Staging Deploy Guide]]
  - [[Component-Index]]
  - [[Corp_Tower_GDD]]: Game rules, scoring, mechanics, debug tuning, progression.
  - [[Corp_Tower_TDD]]: Technical architecture, deployment, CI/CD, message contracts, testing.

## Key Data Flow
- Client connects: [[NetworkManager]] opens `ws://<gateway>:3000` and sends `reconnect` with stored identity if available.
- Gateway routing: EC2-1 nginx reverse proxy forwards WebSocket traffic to Docker workers on EC2-2/EC2-3.
- Worker runtime: EC2-2/EC2-3 each run a `corp-tower-server` Docker container.
- Subnet rule: gateway and workers must run in one shared subnet.
- Matchmaking: [[Lobby Manager]] queues players through [[Redis State]]; debug bots can fill missing slots.
- Room start: [[Game Engine]] assigns fixed-orientation shape blocks, starts countdown, then enters `playing`.
- Player action: client sends `place_block`; server validates cooldown/index/state, appends tower history, and broadcasts `game_state`.
- Debug update: an authorized/debug client may send `update_config`; [[Lobby Manager]] validates value and broadcasts `debug_config`.
- Disconnect: WebSocket `close` starts reconnect TTL; missed TTL destroys rooms with no connected real players.
- Staging deploy: GitHub VM tests server, builds Docker image, pushes ECR, starts external Redis on EC2-1, drains one worker from nginx, updates that worker, then restores nginx routing after workers are healthy.
- Staging diagnostics: manual workflow verifies tagged EC2 discovery, status checks, security group rules, route tables, NACLs, and GitHub-runner SSH.
- Staging cleanup: manual workflow can wipe stale Corp Tower Docker containers, images, temp files, and networks before redeploy; it intentionally leaves Docker/AWS CLI prerequisites installed.
- Staging automated master: server-only pushes run `Server Update`; workflow changes run full preflight before deploy, infra-only changes run `Infra Plan`, and manual runs default to `Diagnostics -> Infra Plan -> Server Update`; it does not run Cleanup, Infra Apply, or EC2 Rebuild.

## Constraints And Assumptions
- Shared active room/session state uses Redis in staging; long-term leaderboard persistence is still deferred.
- Debug reconnect TTL is 10 seconds in staging deploy.
- Client auto-reconnect is enabled only for real-player-only rooms; bot-filled debug rooms still require manual reconnect.
- Bots are QA helpers, not production-grade AI.
- Shape-block scoring has a first recalibrated score scale, explicit score UI events, level summaries, and live tuning UI; deeper target, block-weight, unlock, inventory, and failure-pressure tuning remains iterative.
- Android is the only current client release target during staging.
- Godot version target: `4.6.2.stable`.
- Server runtime target for legacy/VM parity: Node `24.14.1`, npm `11.11.0`.
- Staging region: `ap-southeast-1`.

## Out Of Scope (Testing Phase)
- iOS, Windows, HTML5, Linux client builds: deferred, do not target.

## Current Focus (Summarized Title only)
- Active: Interactive score UI, level summaries, and tabbed debug tuning implemented
- Previous: Docker worker staging path verified from Godot client
- Blocked: _(none)_
- Next: Playtest shape-block progression and failure pressure with simulator/live tuning data

## Fast Start For AI
- Read this file first.
- Use [[Component-Index]] for focused component notes.
- Read .md files first and treat as source of truth
- For game rules, scoring, and mechanics: read [[Corp_Tower_GDD]].
- For architecture, deployment, and message contracts: read [[Corp_Tower_TDD]].
- For server behavior, prioritize [[Game Engine]], [[Lobby Manager]], and [[Server Entry]].
- For client behavior, prioritize [[NetworkManager]] and [[Main UI Controller]].
- For deployment, prioritize [[Server Staging Deploy Workflow]] and [[Staging Deploy Guide]].
- For manual K3s learning, use [[K3s Manual Learning Plan]] and keep Docker staging as the known-good fallback until a productization decision is made.
- For AI collaboration rules, read [[AI_Agent_Organization]]. Sub AIs prepare prompts; Main AIs execute; Human Orchestrator owns final review.
- Human prefer not to run manually & locally terraform, docker, or redis. Everything is tested in github action thru deployment.
- This repository is intentionally structured as an Obsidian vault; use `[[links]]` for navigation.

## Human Project Workflow
- [[Project Workflow]].
