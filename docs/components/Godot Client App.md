# Godot Client App

## Purpose
Android-first game client for Corp Tower. Project root:
`src/Client/App/corp-tower`.

## Responsibilities
- Connect to the server gateway, which routes to authoritative server
  workers.
- Render room, level, timer, tower height/progress, placed-block tower
  stack, score, shape inventory, score popups, and level summaries.
- Send player actions, including quick-chat messages and Power item
  activation (including refresh, which is now a Power item effect rather
  than its own action).
- Reflect server state rather than calculating final gameplay locally.

## Public interface
Not a single script — this is the project as a whole. The pieces that matter
externally:

- `project.godot` autoloads [[NetworkManager]] as a singleton.
- `Main.tscn` is the app root, owning [[Screen Manager]]. It swaps between
  the join screen, find-match screen, and the [[Game UI Scene]] (instanced
  under `Main UI Controller`) as the player moves through matchmaking; there
  is no single statically-instanced UI root scene anymore.
- Android export config lives in the gitignored local `export_presets.cfg`;
  CI uses [[Client Android Internal Workflow]] with a non-secret preset.

## Depends on
- Internal: [[NetworkManager]], [[Screen Manager]], [[Main UI Controller]]
- External: Godot `4.6.2.stable`

## Notes
- Current release target is Android only; web/Windows/iOS are future
  platform targets, not active work.
- There is a single production-facing gameplay UI ([[Game UI Scene]]) — the
  previous runtime skin-switching system (`DefaultSkin` / `Figma_SkinV1`, a
  bottom-right overlay for swapping between them) was removed ahead of the
  production UI design pass, since both were prototypes and every scene edit
  had to be made twice. The current join/find-match/play screen swap in
  [[Screen Manager]] is a separate, unrelated flow.
- Shape inventory previews use fixed cells from server block payloads
  ([[Block Preview]]); tower rendering uses `towerBlocks` when available and
  falls back to aggregate `currentHeight` for legacy server payloads
  ([[Tower Stack]]).
- Score feedback uses server `scoreEvents`; level-end results use server
  `lastLevelSummary` after score popups fade.
- Debug tuning is exposed through a floating tabbed overlay
  ([[Debug Overlay]]) toggled by a single global draggable button owned by
  [[Screen Manager]], not gated by any build flag — it is present in every
  build and only disabled (not hidden) until a room is connected.
- Gameplay balancing is expected to change after further shape-block testing
  (see [[Balance Simulator]]).
