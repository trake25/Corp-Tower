# Debug Overlay

## Purpose
Lightweight show/hide shell for the Godot debug-tuning panel. File:
`src/Client/App/corp-tower/Cor/Scripts/DebugOverlay.gd`.

## Responsibilities
- Toggle debug panel visibility.
- Keep the dim layer and panel visibility in sync.

## Public interface
- `set_open(open: bool)`, `toggle()` — open/close the panel; driven by
  [[Main UI Controller]]'s `toggle_debug_overlay()`/`set_debug_overlay_open()`
  handlers, which [[Screen Manager]]'s global floating debug button calls via
  duck-typed `call()`. This script owns no gameplay or config state itself.

## Depends on
- Internal: none
- External: none

## Notes
- Debug control binding and server sync (the actual sliders/toggles and what
  they send) live in [[Main UI Controller]], not here — this file is purely
  the panel's visibility shell.
- Server-side validation of anything this panel sends lives in
  [[Lobby Manager]] and [[Game Config]].
- Referenced by [[Game UI Scene]], so it's part of the current runtime; core
  gameplay could run without it if the scene/controller were adjusted to
  drop debug tuning entirely.
- Expects two unique-named descendants, `%DebugDimLayer` and `%DebugPanel`,
  within its own node tree (`unique_name_in_owner`) — a future replacement
  scene must replicate these exact unique names or toggling silently does
  nothing for that piece.
