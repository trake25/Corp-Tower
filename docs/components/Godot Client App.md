# Godot Client App

## Purpose
- Android-first game client for Corp Tower.
- Project: `src/Client/App/corp-tower`.

## Responsibilities
- Connect to the EC2-1 gateway, which routes to authoritative server workers.
- Render room, level, timer, tower height/progress, placed-block tower stack, score, shape inventory, and refresh UI.
- Send player actions.
- Reflect server state rather than calculating final gameplay locally.

## Key Logic
- `project.godot` autoloads [[NetworkManager]].
- Main scene uses [[Main UI Controller]].
- Shape inventory previews use fixed cells from server block payloads.
- Tower stack rendering uses `towerBlocks` when available and falls back to aggregate `currentHeight` for legacy server payloads.
- Android export is configured locally through ignored `export_presets.cfg`.
- CI uses [[Client Android Internal Workflow]] and a non-secret preset.

## Inputs/Outputs
- Input: WebSocket messages from [[Server Entry]].
- Output: WebSocket messages for reconnect, block placement, and refresh.

## Dependencies
- Godot `4.6.2.stable`.
- [[NetworkManager]]
- [[Main UI Controller]]

## Notes
- Current release target is Android only.
- Staging client should point to `ws://<EC2-1-public-ip>:3000`.
- Web/Windows/iOS are future platform targets.
- Gameplay balancing is expected to change after shape-block testing.
