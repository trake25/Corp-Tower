# Architecture

A map of every module in Corp Tower, one line each, with what it depends on
and a link to its own doc. See [[Summary]] for project status/context and
[[Component-Index]] for the same modules grouped as a flat link list.

## System shape

```mermaid
flowchart LR
    subgraph Client["Godot Client (Android)"]
        NM["NetworkManager"]
        MUC["Main UI Controller"]
        Skins["Client UI Skins"]
        NM --> MUC
        MUC --> Skins
    end

    subgraph Server["Node.js Server"]
        SE["Server Entry"]
        LM["Lobby Manager"]
        GE["Game Engine"]
        RS["Redis State"]
        SE --> LM
        LM --> GE
        LM --> RS
    end

    Client -- "WebSocket (wss)" --> Server
    Server -. "Redis (shared workers)" .-> Redis[("Redis")]
    RS --> Redis
```

## Server (`src/Server`)

| Module | One-line | Depends on |
|---|---|---|
| [[Server Entry]] | WebSocket process entry point; routes messages | [[Lobby Manager]] |
| [[Lobby Manager]] | Matchmaking, room lifecycle, debug-config coordinator | [[Game Engine]], [[Game Config]], [[Bot Manager]] (indirect), [[Redis State]] |
| [[Game Engine]] | Authoritative per-room gameplay rules and level lifecycle; delegates block supply/scoring/checkpoints to `engine/` modules | [[Game Config]], [[Tower Stability]], [[Bot Manager]], [[Lobby Manager]] (notify-only), [[Block Supply]], [[Scoring]], [[Checkpoints]] |
| [[Block Supply]] | Block creation, draw pile, opening hands, refresh generation (`engine/` module) | [[Game Config]] |
| [[Scoring]] | Score events, bonuses, leaderboard banking, MVP, level summaries (`engine/` module) | [[Game Config]], [[Block Supply]] (indirect) |
| [[Checkpoints]] | Checkpoint snapshots, rollback, score gate (`engine/` module) | [[Game Config]], [[Game Engine]] (lifecycle callback), [[Scoring]] (indirect) |
| [[Tower Stability]] | Pure grid-settling and stability scoring | none |
| [[Bot Manager]] | Debug bot action scheduler | [[Game Config]], [[Game Engine]] |
| [[Game Config]] | Central tuning/config data object | none |
| [[Redis State]] | Shared-state adapter for multi-worker deploys, with in-memory fallback | `redis` (npm) |
| [[Balance Simulator]] | Offline balance-sampling CLI tool | [[Game Engine]], [[Game Config]], [[Tower Stability]] |
| [[Server Score Events Tests]] | Test coverage for scoring/summary contracts | [[Game Engine]], [[Game Config]], [[Lobby Manager]] |
| [[Server Docker Image]] | Container image for the server | — (see its own doc) |

## Client (`src/Client/App/corp-tower`)

| Module | One-line | Depends on |
|---|---|---|
| [[Godot Client App]] | The Godot project as a whole | [[NetworkManager]], [[Main UI Controller]] |
| [[NetworkManager]] | WebSocket adapter and signal bridge, autoloaded singleton | Godot `WebSocketPeer` |
| [[Main UI Controller]] | Main-screen UI controller: input, rendering, debug tuning | [[NetworkManager]], [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]], [[Debug Overlay]], [[Player Colors]] |
| [[Client UI Skins]] | Two swappable UI skin scenes + themes | [[Block Preview]], [[Tower Stack]], [[Cooldown Overlay]], [[Debug Overlay]] |
| [[Block Preview]] | Draws fixed-orientation block shape previews | none |
| [[Tower Stack]] | Draws the placed-block tower and its tilt animation | [[Player Colors]] |
| [[Cooldown Overlay]] | Radial per-card cooldown indicator | none |
| [[Debug Overlay]] | Debug panel show/hide shell | none |
| [[Player Colors]] | Shared player-id → color utility | none |
| [[Godot Client Tests]] | Smoke test + GUT coverage | [[Godot Client App]], [[NetworkManager]], [[Main UI Controller]], [[Client UI Skins]], [[Player Colors]] |

## Infrastructure & CI/CD

| Module | One-line | Depends on |
|---|---|---|
| [[Client Android Internal Workflow]] | Builds/tests the Godot client, signs an internal Android build | [[Godot Client App]] |
| [[Client HTML5 Pages]] | Builds/exports the Godot client and deploys it to GitHub Pages | [[Godot Client App]] |
| [[Terraform Infrastructure]] | Terraform root map for the active K3s and plan-only EKS stacks | — |
| [[Server K3s Stack]] | Active self-hosted K3s-on-EC2 server infrastructure | [[Terraform Infrastructure]] |
| [[Server K3s Workflows]] | CI workflows that deploy/diagnose/clean up the K3s stack | [[Server K3s Stack]] |
| [[Server K3s Automated Master Workflow]] | Orchestrates the individual K3s workflows | [[Server K3s Workflows]] |
| [[Server EKS Stack]] | Parallel, plan-only AWS EKS infrastructure (not yet applied) | [[Terraform Infrastructure]] |
| [[Server EKS Workflow]] | CI workflow for the EKS plan-only path | [[Server EKS Stack]] |

## Global

- [[Summary]] — project status, game systems index, component map, "fast start" pointers
- [[Corp_Tower_GDD]] — game design document
- [[Corp_Tower_TDD]] — technical design document (system architecture,
  message contracts, testing strategy, future technical work)
- `Changelog` — referenced by [[Component-Index]]; no file exists yet.
