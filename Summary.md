# Corp Tower Summary

## Project Purpose
- Cloud Infrastructure based 3-player multiplayer puzzle game.
- Players cooperate to build a shared tower while competing for MVP score.
- Current phase: game logic, bot, debug menu, server deploy, and Android pipeline testing.
- Staging Client: Godot Android app
- Production Client target:  Multiple Platforms (Android, iOS, Windows, HTML5, Linux, etc.)
- HTML client is a legacy local logic test harness only.

## Core Concepts
- Shared tower: all players contribute blocks toward one target height.
- Selfish cooperation: players need team success but compete for level score/MVP.
- Server authority: Node WebSocket server owns matchmaking, room state, timers, scoring, bots, and debug config.
- Debug tuning: designers/QA can update selected `Game_Config` values at runtime; server broadcasts authoritative config to all clients.
- Testing phase rule: reconnect and persistence are deferred; room sessions reset on close/disconnect.

## System Design High-Level
- [[Godot Client App]] connects to the server through [[NetworkManager]].
- [[Server Entry]] accepts WebSocket clients and routes messages.
- [[Lobby Manager]] queues real players, fills rooms with debug bots, and tears rooms down on disconnect.
- [[Game Engine]] runs the authoritative level lifecycle and scoring.
- [[Bot Manager]] schedules QA bot actions and cancels bot timers when rooms close.
- [[Game Config]] stores balance and debug-tunable variables.
- [[Server Staging Deploy Workflow]] builds/pushes Docker images to ECR and deploys staging EC2.
- [[Terraform Infrastructure]] creates AWS staging resources.
- [[Client Android Internal Workflow]] builds signed Android AABs and can upload to Google Play internal testing.
- [[AI_Agent_Organization]] defines AI assistant roles, prompt handoff behavior, and human review ownership.

## Architecture Tree
- `src/Server`
  - [[Server Entry]]: WebSocket listener and message router.
  - [[Lobby Manager]]: matchmaking, room lifecycle, debug config broadcast.
  - [[Game Engine]]: level rules, timers, scoring, tokens, room close.
  - [[Bot Manager]]: bot action loop and timer cancellation.
  - [[Game Config]]: runtime rules and tuning values.
  - [[Server Docker Image]]: container packaging for staging.
- `src/Client/App/corp-tower`
  - [[Godot Client App]]: Android-first game client.
  - [[NetworkManager]]: Godot WebSocket adapter.
  - [[Main UI Controller]]: UI, inventory, debug menu.
- `.github/workflows`
  - [[Server Staging Deploy Workflow]]
  - [[Client Android Internal Workflow]]
  - [[Legacy Server Update Workflow]]
- `infra`
  - [[Terraform Infrastructure]]
- `docs`
  - [[Staging Deploy Guide]]
  - [[Component-Index]]
  - [[Corp_Tower_GDD]]: Game rules, scoring, mechanics, debug tuning, progression.
  - [[Corp_Tower_TDD]]: Technical architecture, deployment, CI/CD, message contracts, testing.

## Key Data Flow
- Client connects: [[NetworkManager]] opens `ws://<server>:3000`; [[Server Entry]] assigns `P1`/`P2`/`P3`.
- Matchmaking: [[Lobby Manager]] queues players; debug bots can fill missing slots.
- Room start: [[Game Engine]] assigns blocks, starts countdown, then enters `playing`.
- Player action: client sends `place_block`; server validates cooldown/index/state and broadcasts `game_state`.
- Debug update: client sends `update_config`; [[Lobby Manager]] validates value and broadcasts `debug_config`.
- Disconnect: WebSocket `close` calls [[Lobby Manager]] room teardown; timers/bots stop, scores reset, remaining real clients get `room_closed`.
- Staging deploy: GitHub VM tests server, builds Docker image, pushes ECR, then EC2 pulls and runs container.

## Constraints And Assumptions
- No persistence yet: scores, rooms, and player progress are in-memory only.
- No reconnect yet: disconnect closes the active room during test phase.
- Bots are QA helpers, not production-grade AI.
- Android is the only current client release target during staging.
- Godot version target: `4.6.2.stable`.
- Server runtime target for legacy/VM parity: Node `24.14.1`, npm `11.11.0`.
- Staging region: `ap-southeast-1`.

## Out Of Scope (Testing Phase)
- iOS, Windows, HTML5, Linux client builds: deferred, do not target.

## Current Focus (Summarized Title only)
- Active: Free-tier EC2 gateway/workers lab
- Previous: Destroy room after reconnect TTL
- Blocked: Managed AWS Redis/ALB/EKS removed for cost safety; use EC2-1 as simulated ALB/Redis/k3s learning gateway.
- Next: Terraform/GitHub Actions provision EC2-1 gateway plus EC2-2/3 workers; gateway runs Docker Redis + reverse proxy, workers run server Docker image sharing gateway Redis.

## Fast Start For AI
- Read this file first.
- Use [[Component-Index]] for focused component notes.
- Read .md files first and treat as source of truth
- For game rules, scoring, and mechanics: read [[Corp_Tower_GDD]].
- For architecture, deployment, and message contracts: read [[Corp_Tower_TDD]].
- For server behavior, prioritize [[Game Engine]], [[Lobby Manager]], and [[Server Entry]].
- For client behavior, prioritize [[NetworkManager]] and [[Main UI Controller]].
- For deployment, prioritize [[Server Staging Deploy Workflow]] and [[Staging Deploy Guide]].
- For AI collaboration rules, read [[AI_Agent_Organization]]. Sub AIs prepare prompts; Main AIs execute; Human Orchestrator owns final review.
- Human prefer not to run manually & locally terraform, docker, redis, kubernetes. Everything is tested in github action thru deployment.
- This repository is intentionally structured as an Obsidian vault; use `[[links]]` for navigation.

## Human Project Workflow
- [[Project Workflow]].
