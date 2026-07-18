# Godot Client App

## Purpose
Android-first game client for Corp Tower. Project root:
`src/Client/App/corp-tower`.

## Responsibilities
- Connect to the server gateway, which routes to authoritative server
  workers.
- Render room, level, timer, tower height/progress, placed-block tower
  stack, score, shape inventory, refresh UI, score popups, and level
  summaries.
- Send player actions.
- Reflect server state rather than calculating final gameplay locally.

## Public interface
Not a single script — this is the project as a whole. The pieces that matter
externally:

- `project.godot` autoloads [[NetworkManager]] as a singleton.
- `Main.tscn` is a thin controller shell (owns [[Main UI Controller]]) that
  loads a skin scene into `SkinRoot`.
- Android export config lives in the gitignored local `export_presets.cfg`;
  CI uses [[Client Android Internal Workflow]] with a non-secret preset.

## Depends on
- Internal: [[NetworkManager]], [[Main UI Controller]]
- External: Godot `4.6.2.stable`

## Notes
- Current release target is Android only; web/Windows/iOS are future
  platform targets, not active work.
- `DefaultSkin` is the stable default UI; `Figma_SkinV1` is a Figma-inspired
  reskin, selectable through `corp_tower/ui_skin` or a runtime bottom-right
  overlay that swaps skins while preserving the latest displayed room/game
  state (see [[Client UI Skins]]).
- Shape inventory previews use fixed cells from server block payloads
  ([[Block Preview]]); tower rendering uses `towerBlocks` when available and
  falls back to aggregate `currentHeight` for legacy server payloads
  ([[Tower Stack]]).
- Score feedback uses server `scoreEvents`; level-end results use server
  `lastLevelSummary` after score popups fade.
- Debug tuning is exposed through a floating tabbed overlay when enabled for
  staging/debug builds ([[Debug Overlay]]).
- Gameplay balancing is expected to change after further shape-block testing
  (see [[Balance Simulator]]).
