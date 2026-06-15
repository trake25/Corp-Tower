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
- `Main.tscn` is a controller shell that loads a skin scene into `SkinRoot`.
- `DefaultSkin` is the stable default UI; `Figma_SkinV1` is the Figma-inspired reskin selected through `corp_tower/ui_skin`.
- A bottom-right Skin overlay can switch between `DefaultSkin` and `Figma_SkinV1` at runtime while preserving the latest displayed room/game state.
- Shape inventory previews use fixed cells from server block payloads.
- Tower stack rendering uses `towerBlocks` when available and falls back to aggregate `currentHeight` for legacy server payloads.
- Debug tuning is exposed through a floating overlay when enabled for staging/debug builds.
- Android export is configured locally through ignored `export_presets.cfg`.
- CI uses [[Client Android Internal Workflow]] and a non-secret preset.

## Inputs/Outputs
- Input: WebSocket messages from [[Server Entry]].
- Output: WebSocket messages for reconnect, block placement, and refresh.
- Debug overlay output: `update_config` messages.

## Dependencies
- Godot `4.6.2.stable`.
- [[NetworkManager]]
- [[Main UI Controller]]

## Notes
- Current release target is Android only.
- Staging client should point to `ws://<EC2-1-public-ip>:3000`.
- Web/Windows/iOS are future platform targets.
- Gameplay balancing is expected to change after shape-block testing.
