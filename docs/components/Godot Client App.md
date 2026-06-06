# Godot Client App

## Purpose
- Android-first game client for Corp Tower.
- Project: `src/Client/App/corp-tower`.

## Responsibilities
- Connect to the authoritative server.
- Render room, level, height, score, inventory, refresh, and debug UI.
- Send player actions.
- Reflect server state rather than calculating final gameplay locally.

## Key Logic
- `project.godot` autoloads [[NetworkManager]].
- Main scene uses [[Main UI Controller]].
- Android export is configured locally through ignored `export_presets.cfg`.
- CI uses [[Client Android Internal Workflow]] and a non-secret preset.

## Inputs/Outputs
- Input: WebSocket messages from [[Server Entry]].
- Output: WebSocket messages for block placement, refresh, and debug updates.

## Dependencies
- Godot `4.6.2.stable`.
- [[NetworkManager]]
- [[Main UI Controller]]

## Notes
- Current release target is Android only.
- Web/Windows/iOS are future platform targets.
